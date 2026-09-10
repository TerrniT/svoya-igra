import type { Answer, QuizBank } from '@/lib/types'
import type { ClientMessage, RoomPhase, RoomPlayer, RoomSession, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import { emptyRoomSession } from '@/lib/room-protocol'
import { createId } from '@/lib/ids'

export interface WireClient {
  key: string
  send: (message: ServerMessage) => void
  close?: () => void
}

export interface HostRoomState {
  code: string
  hostPlayerId: string
  bank: QuizBank
  session: RoomSession
  phase: RoomPhase
  currentQuestionId: string | null
  answers: Answer[]
}

interface Client extends WireClient {
  deviceId: string
  playerId: string
  role: 'host' | 'player'
}

interface Room extends HostRoomState {
  clients: Map<string, Client>
}

export class RoomEngine {
  private room: Room | null = null
  private readonly onPersist: (state: HostRoomState | null) => void

  constructor(onPersist: (state: HostRoomState | null) => void = () => {}) {
    this.onPersist = onPersist
  }

  createRoom(code: string, name: string, deviceId: string, bank: QuizBank, host: WireClient): Client {
    if (!name.trim())
      throw new Error('Введите имя ведущего')
    if (!bank.questions.length)
      throw new Error('Сначала добавьте вопросы в админке')

    const room: Room = {
      code,
      hostPlayerId: '',
      bank,
      session: emptyRoomSession(),
      phase: 'lobby',
      currentQuestionId: null,
      answers: [],
      clients: new Map(),
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
    host.send({ type: 'hello', playerId: player.id, role: 'host', snapshot: snapshot(room) })
    this.persist()
    return client
  }

  hydrate(state: HostRoomState, deviceId: string, host: WireClient): Client {
    const room: Room = {
      ...structuredClone(state),
      clients: new Map(),
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
      if (!message.name.trim())
        throw new Error('Введите имя')

      const existingPlayer = room.session.players.find(item => item.deviceId === message.deviceId)
      if (existingPlayer)
        return this.attachClient(wire, room, existingPlayer, message.deviceId)

      const player = addPlayer(room, message.name.trim(), message.deviceId, false)
      const client: Client = {
        ...wire,
        deviceId: message.deviceId,
        playerId: player.id,
        role: 'player',
      }
      room.clients.set(wire.key, client)
      wire.send({ type: 'hello', playerId: player.id, role: 'player', snapshot: snapshot(room) })
      this.broadcastState(room)
      this.persist()
      return client
    }

    if (message.type === 'reconnect') {
      const player = room.session.players.find(item => item.deviceId === message.deviceId)
      if (!player)
        throw new Error('Не удалось переподключиться. Войдите по коду ещё раз.')

      return this.attachClient(wire, room, player, message.deviceId)
    }

    if (!current)
      throw new Error('Сначала войдите в комнату')

    if (message.type === 'leave') {
      room.clients.delete(wire.key)
      if (current.role === 'host') {
        this.closeRoom()
        return undefined
      }
      room.session.players = room.session.players.filter(player => player.id !== current.playerId)
      delete room.session.scores[current.playerId]
      this.broadcastState(room)
      this.persist()
      wire.close?.()
      return undefined
    }

    if (message.type === 'updateBank') {
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий меняет вопросы')
      if (room.phase !== 'lobby')
        throw new Error('Вопросы можно менять до старта')
      room.bank = message.bank
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'start' || message.type === 'playAgain') {
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий начинает игру')
      if (!room.session.players.length)
        throw new Error('Нужен хотя бы один игрок')
      if (!room.bank.questions.length)
        throw new Error('В комнате нет вопросов')

      const scores: Record<string, number> = {}
      for (const player of room.session.players)
        scores[player.id] = 0
      room.session.scores = scores
      room.session.answeredQuestionIds = []
      room.session.startedAt = new Date().toISOString()
      room.phase = 'board'
      room.currentQuestionId = null
      room.answers = []
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'openQuestion') {
      if (!this.requireHost(current, room))
        throw new Error('Карточки открывает ведущий')
      if (room.session.answeredQuestionIds.includes(message.questionId))
        throw new Error('Этот вопрос уже сыгран')
      const question = room.bank.questions.find(item => item.id === message.questionId)
      if (!question)
        throw new Error('Вопрос не найден')

      room.phase = 'question'
      room.currentQuestionId = question.id
      room.answers = shuffle(question.answers)
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'backToBoard') {
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий возвращает поле')
      room.phase = 'board'
      room.currentQuestionId = null
      room.answers = []
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'skip') {
      if (!this.requireHost(current, room))
        throw new Error('Сдать вопрос может только ведущий')
      if (!room.session.answeredQuestionIds.includes(message.questionId))
        room.session.answeredQuestionIds.push(message.questionId)
      this.broadcast(room, { type: 'notice', kind: 'skip' })
      this.finishIfComplete(room)
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'kick') {
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий удаляет игроков')
      if (message.playerId === room.hostPlayerId)
        throw new Error('Ведущего удалить нельзя')

      room.session.players = room.session.players.filter(player => player.id !== message.playerId)
      delete room.session.scores[message.playerId]
      for (const [key, client] of room.clients) {
        if (client.playerId === message.playerId) {
          client.send({ type: 'error', message: 'Вас удалили из комнаты' })
          room.clients.delete(key)
          client.close?.()
        }
      }
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'answer') {
      if (room.phase !== 'question' || room.currentQuestionId !== message.questionId)
        throw new Error('Сейчас нет этого вопроса')
      if (room.session.answeredQuestionIds.includes(message.questionId))
        throw new Error('Вопрос уже закрыт')

      const question = room.bank.questions.find(item => item.id === message.questionId)
      const answer = question?.answers.find(item => item.id === message.answerId)
      if (!question || !answer)
        throw new Error('Ответ не найден')

      const player = room.session.players.find(item => item.id === current.playerId)
      if (!player)
        throw new Error('Игрок не найден')

      if (!answer.isCorrect) {
        current.send({ type: 'notice', kind: 'wrong' })
        return current
      }

      const code = room.code
      const questionId = question.id
      room.session.scores[player.id] = (room.session.scores[player.id] ?? 0) + question.value
      room.session.answeredQuestionIds.push(question.id)
      this.broadcast(room, { type: 'notice', kind: 'correct', playerName: player.name, value: question.value })
      this.broadcastState(room)
      this.persist()

      window.setTimeout(() => {
        const live = this.room
        if (!live || live.code !== code || live.currentQuestionId !== questionId)
          return
        this.finishIfComplete(live)
        this.broadcastState(live)
        this.persist()
      }, 1800)
      return current
    }

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
    wire.send({ type: 'hello', playerId: player.id, role: client.role, snapshot: snapshot(room) })
    this.broadcastState(room)
    this.persist()
    return client
  }

  private requireHost(client: Client | undefined, room: Room) {
    return Boolean(client && client.role === 'host' && client.playerId === room.hostPlayerId)
  }

  private finishIfComplete(room: Room) {
    const ids = room.bank.questions.map(question => question.id)
    if (ids.length > 0 && ids.every(id => room.session.answeredQuestionIds.includes(id)))
      room.phase = 'results'
    else
      room.phase = 'board'

    room.currentQuestionId = null
    room.answers = []
  }

  private broadcast(room: Room, message: ServerMessage) {
    for (const client of room.clients.values())
      client.send(message)
  }

  private broadcastState(room: Room) {
    this.broadcast(room, { type: 'state', snapshot: snapshot(room) })
  }

  private persist() {
    if (!this.room) {
      this.onPersist(null)
      return
    }

    this.onPersist(structuredClone({
      code: this.room.code,
      hostPlayerId: this.room.hostPlayerId,
      bank: this.room.bank,
      session: this.room.session,
      phase: this.room.phase,
      currentQuestionId: this.room.currentQuestionId,
      answers: this.room.answers,
    }))
  }
}

function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    phase: room.phase,
    currentQuestionId: room.currentQuestionId,
    answers: room.answers,
    bank: room.bank,
    session: room.session,
  }
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

function shuffle<T>(items: T[]) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const left = next[index]
    const right = next[swap]
    if (left === undefined || right === undefined)
      continue
    next[index] = right
    next[swap] = left
  }
  return next
}
