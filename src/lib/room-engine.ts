import type { GameDriver } from '@/games/types'
import type { GameId } from '@/games/types'
import type { ClientMessage, RoomPlayer, RoomSession, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import { emptyRoomSession } from '@/lib/room-protocol'
import { createId } from '@/lib/ids'
import { quizMaybeAutoReveal } from '@/games/quiz/driver'
import { isQuizPayload } from '@/games/quiz/types'

export interface WireClient {
  key: string
  send: (message: ServerMessage) => void
  close?: () => void
}

export interface HostRoomState {
  code: string
  gameId: GameId
  themeId: string
  hostPlayerId: string
  session: RoomSession
  phase: string
  payload: unknown
}

interface Client extends WireClient {
  deviceId: string
  playerId: string
  role: 'host' | 'player'
}

interface Room extends HostRoomState {
  clients: Map<string, Client>
  driver: GameDriver
}

const CORE_TYPES = new Set(['join', 'reconnect', 'leave', 'kick'])

export class RoomEngine {
  private room: Room | null = null
  private readonly onPersist: (state: HostRoomState | null) => void
  private readonly resolveDriver: (gameId: GameId) => GameDriver

  constructor(
    onPersist: (state: HostRoomState | null) => void = () => {},
    resolveDriver: (gameId: GameId) => GameDriver,
  ) {
    this.onPersist = onPersist
    this.resolveDriver = resolveDriver
  }

  createRoom(
    code: string,
    name: string,
    deviceId: string,
    options: { gameId: GameId, themeId: string, bank?: unknown },
    host: WireClient,
  ): Client {
    if (!name.trim())
      throw new Error('Введите имя ведущего')

    const driver = this.resolveDriver(options.gameId)
    const room: Room = {
      code,
      gameId: options.gameId,
      themeId: options.themeId,
      hostPlayerId: '',
      session: emptyRoomSession(),
      phase: driver.initialPhase(),
      payload: driver.createPayload({ bank: options.bank }),
      clients: new Map(),
      driver,
    }
    const player = addPlayer(room, name.trim(), deviceId, true)
    room.hostPlayerId = player.id
    this.room = room

    const client: Client = {
      ...host,
      deviceId,
      playerId: player.id,
      role: 'host',
    }
    room.clients.set(host.key, client)
    host.send({ type: 'hello', playerId: player.id, role: 'host', snapshot: this.snapshotFor(room, client) })
    this.persist()
    return client
  }

  hydrate(state: HostRoomState, deviceId: string, host: WireClient): Client {
    const driver = this.resolveDriver(state.gameId)
    const room: Room = {
      ...cloneState(state),
      clients: new Map(),
      driver,
    }
    this.room = room

    for (const player of room.session.players)
      player.connected = player.isHost && player.deviceId === deviceId

    const hostPlayer = room.session.players.find(player => player.isHost)
    if (!hostPlayer)
      throw new Error('Не удалось восстановить комнату')

    return this.attachClient(host, room, hostPlayer, deviceId)
  }

  handle(wire: WireClient, message: ClientMessage): Client | undefined {
    const room = this.room
    if (!room)
      throw new Error('Комната уже закрыта')

    const current = room.clients.get(wire.key)

    if (message.type === 'join') {
      const join = message as Extract<ClientMessage, { type: 'join' }>
      if (!join.name.trim())
        throw new Error('Введите имя')

      const existingPlayer = room.session.players.find(item => item.deviceId === join.deviceId)
      if (existingPlayer)
        return this.attachClient(wire, room, existingPlayer, join.deviceId)

      const player = addPlayer(room, join.name.trim(), join.deviceId, false)
      const client: Client = {
        ...wire,
        deviceId: join.deviceId,
        playerId: player.id,
        role: 'player',
      }
      room.clients.set(wire.key, client)
      wire.send({ type: 'hello', playerId: player.id, role: 'player', snapshot: this.snapshotFor(room, client) })
      this.broadcastState(room)
      this.persist()
      return client
    }

    if (message.type === 'reconnect') {
      const reconnect = message as Extract<ClientMessage, { type: 'reconnect' }>
      const player = room.session.players.find(item => item.deviceId === reconnect.deviceId)
      if (!player)
        throw new Error('Не удалось переподключиться. Войдите по коду ещё раз.')

      return this.attachClient(wire, room, player, reconnect.deviceId)
    }

    if (!current)
      throw new Error('Сначала войдите в комнату')

    if (message.type === 'leave') {
      room.clients.delete(wire.key)
      if (current.role === 'host') {
        this.closeRoom()
        return undefined
      }
      this.removePlayer(room, current.playerId)
      this.broadcastState(room)
      this.persist()
      wire.close?.()
      return undefined
    }

    if (message.type === 'kick') {
      const kick = message as Extract<ClientMessage, { type: 'kick' }>
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий удаляет игроков')
      if (kick.playerId === room.hostPlayerId)
        throw new Error('Ведущего удалить нельзя')

      this.removePlayer(room, kick.playerId)
      for (const [key, client] of room.clients) {
        if (client.playerId === kick.playerId) {
          client.send({ type: 'error', message: 'Вас удалили из комнаты' })
          room.clients.delete(key)
          client.close?.()
        }
      }
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (CORE_TYPES.has(message.type))
      return current

    const result = room.driver.reduce(message, {
      players: room.session.players,
      hostPlayerId: room.hostPlayerId,
      scores: room.session.scores,
      phase: room.phase,
      payload: room.payload,
      clientPlayerId: current.playerId,
      clientRole: current.role,
      isHost: this.requireHost(current, room),
    })

    if (result.phase !== undefined)
      room.phase = result.phase
    if (result.payload !== undefined)
      room.payload = result.payload
    if (result.scores !== undefined)
      room.session.scores = result.scores
    if (result.startedAt !== undefined)
      room.session.startedAt = result.startedAt

    for (const notice of result.notices ?? [])
      this.broadcast(room, { type: 'notice', ...notice })

    this.broadcastState(room)
    if (!result.volatile)
      this.persist()
    return current
  }

  disconnect(key: string) {
    const room = this.room
    if (!room)
      return

    const current = room.clients.get(key)
    if (!current)
      return

    room.clients.delete(key)
    setConnected(room, current.playerId, false)
    this.maybeAutoReveal(room)
    this.broadcastState(room)
    this.persist()
  }

  closeRoom() {
    const room = this.room
    if (!room)
      return

    this.broadcast(room, { type: 'notice', kind: 'closed' })
    for (const client of room.clients.values()) {
      if (client.role !== 'host')
        client.close?.()
    }
    this.room = null
    this.onPersist(null)
  }

  private removePlayer(room: Room, playerId: string) {
    room.session.players = room.session.players.filter(player => player.id !== playerId)
    delete room.session.scores[playerId]
    if (room.driver.onPlayerRemoved)
      room.payload = room.driver.onPlayerRemoved(room.payload, playerId)
    this.maybeAutoReveal(room)
  }

  private maybeAutoReveal(room: Room) {
    if (room.gameId !== 'quiz' || room.phase !== 'question' || !isQuizPayload(room.payload))
      return
    const result = quizMaybeAutoReveal(room.payload, room.session.players, room.session.scores)
    if (!result)
      return
    if (result.payload !== undefined)
      room.payload = result.payload
    if (result.scores !== undefined)
      room.session.scores = result.scores
    for (const notice of result.notices ?? [])
      this.broadcast(room, { type: 'notice', ...notice })
  }

  private attachClient(wire: WireClient, room: Room, player: RoomPlayer, deviceId: string) {
    for (const [key, client] of room.clients) {
      if (client.deviceId === deviceId && key !== wire.key) {
        room.clients.delete(key)
        client.close?.()
      }
    }

    const client: Client = {
      ...wire,
      deviceId,
      playerId: player.id,
      role: player.isHost ? 'host' : 'player',
    }
    room.clients.set(wire.key, client)
    player.connected = true
    wire.send({ type: 'hello', playerId: player.id, role: client.role, snapshot: this.snapshotFor(room, client) })
    this.broadcastState(room)
    this.persist()
    return client
  }

  private requireHost(client: Client | undefined, room: Room) {
    return Boolean(client && client.role === 'host' && client.playerId === room.hostPlayerId)
  }

  private broadcast(room: Room, message: ServerMessage) {
    for (const client of room.clients.values())
      client.send(message)
  }

  private broadcastState(room: Room) {
    for (const client of room.clients.values())
      client.send({ type: 'state', snapshot: this.snapshotFor(room, client) })
  }

  private snapshotFor(room: Room, client: Client): RoomSnapshot {
    return cloneState({
      code: room.code,
      gameId: room.gameId,
      themeId: room.themeId,
      phase: room.phase,
      session: room.session,
      payload: room.driver.toClientPayload(room.payload, room.phase, {
        playerId: client.playerId,
        isHost: client.role === 'host',
      }),
    })
  }

  private persist() {
    if (!this.room) {
      this.onPersist(null)
      return
    }

    this.onPersist(cloneState({
      code: this.room.code,
      gameId: this.room.gameId,
      themeId: this.room.themeId,
      hostPlayerId: this.room.hostPlayerId,
      session: this.room.session,
      phase: this.room.phase,
      payload: this.room.payload,
    }))
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function setConnected(room: Room, playerId: string, connected: boolean) {
  const player = room.session.players.find(item => item.id === playerId)
  if (player)
    player.connected = connected
}

function addPlayer(room: Room, name: string, deviceId: string, isHost: boolean) {
  const player: RoomPlayer = {
    id: createId('player'),
    name,
    deviceId,
    connected: true,
    isHost,
  }
  room.session.players.push(player)
  room.session.scores[player.id] = 0
  return player
}
