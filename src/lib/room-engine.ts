import type { Answer, QuizBank } from '@/lib/types'
import type { ClientMessage, PlayerSubmission, RoomPhase, RoomPlayer, RoomSession, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import { emptyRoomSession } from '@/lib/room-protocol'
import { nextChooserId, playingPlayers, requireChooser } from '@/lib/chooser'
import { createId } from '@/lib/ids'
import { everyoneSubmitted, questionKind, scoreSubmission, selectedAllAnswers } from '@/lib/question-round'

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
  submissions: PlayerSubmission[]
  revealed: boolean
  awarded: boolean
  roundScores: Record<string, number>
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
      bank: cloneState(bank),
      session: emptyRoomSession(),
      phase: 'lobby',
      currentQuestionId: null,
      answers: [],
      submissions: [],
      revealed: false,
      awarded: false,
      roundScores: {},
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
      ...cloneState(state),
      submissions: state.submissions ?? [],
      revealed: state.revealed ?? false,
      awarded: state.awarded ?? false,
      roundScores: state.roundScores ?? {},
      clients: new Map(),
    }
    room.session.chooserId ??= null
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
      this.reassignChooser(room)
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
      if (!playingPlayers(room.session.players).length)
        throw new Error('Нужен хотя бы один игрок')
      if (!room.bank.questions.length)
        throw new Error('В комнате нет вопросов')

      const scores: Record<string, number> = {}
      for (const player of room.session.players)
        scores[player.id] = 0
      room.session.scores = scores
      room.session.answeredQuestionIds = []
      room.session.startedAt = new Date().toISOString()
      room.session.chooserId = requireChooser(room.session.players, message.firstChooserId)
      room.phase = 'board'
      room.currentQuestionId = null
      room.answers = []
      this.resetRound(room)
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'setChooser') {
      if (!this.requireHost(current, room))
        throw new Error('Первого игрока выбирает ведущий')
      if (room.phase !== 'board' && room.phase !== 'lobby')
        throw new Error('Сейчас нельзя сменить того, кто выбирает')
      room.session.chooserId = requireChooser(room.session.players, message.playerId)
      room.phase = 'board'
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'openQuestion') {
      if (!room.session.chooserId)
        throw new Error('Сначала ведущий выбирает, кто ходит первым')
      if (!this.requireHost(current, room) && current.playerId !== room.session.chooserId)
        throw new Error('Сейчас выбирает другой игрок')
      if (room.session.answeredQuestionIds.includes(message.questionId))
        throw new Error('Этот вопрос уже сыгран')
      const question = room.bank.questions.find(item => item.id === message.questionId)
      if (!question)
        throw new Error('Вопрос не найден')

      room.phase = 'question'
      room.currentQuestionId = question.id
      room.answers = questionKind(question) === 'free' ? [] : shuffle(question.answers)
      this.resetRound(room)
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'backToBoard') {
      if (!this.requireHost(current, room))
        throw new Error('Только ведущий возвращает поле')
      this.finishIfComplete(room)
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
      this.reassignChooser(room)
      room.submissions = room.submissions.filter(item => item.playerId !== message.playerId)
      this.maybeAutoReveal(room)
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
      if (room.revealed)
        throw new Error('Ответы уже вскрыты')

      const question = room.bank.questions.find(item => item.id === message.questionId)
      if (!question)
        throw new Error('Вопрос не найден')

      const player = room.session.players.find(item => item.id === current.playerId)
      if (!player)
        throw new Error('Игрок не найден')
      if (player.isHost)
        throw new Error('Ведущий не отвечает на вопросы')
      if (room.submissions.some(item => item.playerId === player.id))
        throw new Error('Вы уже ответили')

      if (message.skipped) {
        room.submissions.push({
          playerId: player.id,
          answerIds: [],
          text: '',
          skipped: true,
        })
        if (everyoneSubmitted(question, room.session.players, room.submissions))
          this.revealRound(room)
        this.broadcastState(room)
        this.persist()
        return current
      }

      const kind = questionKind(question)
      const answerIds = [...new Set(message.answerIds ?? [])]
      const text = message.text?.trim() ?? ''

      if (kind === 'free') {
        if (!text)
          throw new Error('Введите ответ')
      }
      else {
        if (!answerIds.length)
          throw new Error('Выберите вариант')
        if (kind === 'single' && answerIds.length !== 1)
          throw new Error('Выберите один вариант')
        if (selectedAllAnswers(question, answerIds))
          throw new Error('Все варианты выбрать нельзя')
        if (answerIds.some(id => !question.answers.some(answer => answer.id === id)))
          throw new Error('Ответ не найден')
      }

      room.submissions.push({
        playerId: player.id,
        answerIds: kind === 'free' ? [] : answerIds,
        text: kind === 'free' ? text : '',
      })

      if (everyoneSubmitted(question, room.session.players, room.submissions))
        this.revealRound(room)

      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'reveal') {
      if (!this.requireHost(current, room))
        throw new Error('Вскрыть ответы может только ведущий')
      if (room.phase !== 'question' || !room.currentQuestionId)
        throw new Error('Сейчас нет открытого вопроса')
      if (!room.revealed)
        this.revealRound(room)
      this.broadcastState(room)
      this.persist()
      return current
    }

    if (message.type === 'awardFree') {
      if (!this.requireHost(current, room))
        throw new Error('Очки начисляет ведущий')
      if (room.phase !== 'question' || room.currentQuestionId !== message.questionId)
        throw new Error('Сейчас нет этого вопроса')
      if (!room.revealed)
        throw new Error('Сначала дождитесь всех ответов')
      if (room.awarded)
        throw new Error('Очки уже начислены')

      const question = room.bank.questions.find(item => item.id === message.questionId)
      if (!question || questionKind(question) !== 'free')
        throw new Error('Это не свободный вопрос')

      const chosen = new Set(message.playerIds.filter((playerId) => {
        const winner = room.session.players.find(item => item.id === playerId)
        return Boolean(winner && !winner.isHost)
      }))
      const scores: Record<string, number> = {}
      for (const submission of room.submissions) {
        if (!chosen.has(submission.playerId))
          continue
        scores[submission.playerId] = question.value
        room.session.scores[submission.playerId] = (room.session.scores[submission.playerId] ?? 0) + question.value
      }
      room.roundScores = scores
      room.awarded = true
      this.broadcast(room, { type: 'notice', kind: 'awarded', value: question.value })
      this.broadcastState(room)
      this.persist()
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

  private resetRound(room: Room) {
    room.submissions = []
    room.revealed = false
    room.awarded = false
    room.roundScores = {}
  }

  private maybeAutoReveal(room: Room) {
    if (room.phase !== 'question' || room.revealed || !room.currentQuestionId)
      return
    const question = room.bank.questions.find(item => item.id === room.currentQuestionId)
    if (question && everyoneSubmitted(question, room.session.players, room.submissions))
      this.revealRound(room)
  }

  private revealRound(room: Room) {
    if (room.revealed)
      return

    const question = room.bank.questions.find(item => item.id === room.currentQuestionId)
    room.revealed = true
    if (!question)
      return

    if (!room.session.answeredQuestionIds.includes(question.id))
      room.session.answeredQuestionIds.push(question.id)

    if (questionKind(question) !== 'free') {
      const scores: Record<string, number> = {}
      for (const submission of room.submissions) {
        const respondent = room.session.players.find(item => item.id === submission.playerId)
        if (respondent?.isHost)
          continue
        const points = scoreSubmission(question, submission)
        scores[submission.playerId] = points
        if (points)
          room.session.scores[submission.playerId] = (room.session.scores[submission.playerId] ?? 0) + points
      }
      room.roundScores = scores
      room.awarded = true
    }

    this.broadcast(room, { type: 'notice', kind: 'revealed' })
  }

  private finishIfComplete(room: Room) {
    const ids = room.bank.questions.map(question => question.id)
    if (ids.length > 0 && ids.every(id => room.session.answeredQuestionIds.includes(id)))
      room.phase = 'results'
    else
      room.phase = 'board'

    const played = Boolean(room.currentQuestionId && room.session.answeredQuestionIds.includes(room.currentQuestionId))
    if (played)
      room.session.chooserId = nextChooserId(room.session.players, room.session.chooserId)
    room.currentQuestionId = null
    room.answers = []
    this.resetRound(room)
  }

  private reassignChooser(room: Room) {
    if (room.session.chooserId && room.session.players.some(player => player.id === room.session.chooserId))
      return
    room.session.chooserId = room.session.players[0]?.id ?? null
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

    this.onPersist(cloneState({
      code: this.room.code,
      hostPlayerId: this.room.hostPlayerId,
      bank: this.room.bank,
      session: this.room.session,
      phase: this.room.phase,
      currentQuestionId: this.room.currentQuestionId,
      answers: this.room.answers,
      submissions: this.room.submissions,
      revealed: this.room.revealed,
      awarded: this.room.awarded,
      roundScores: this.room.roundScores,
    }))
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function snapshot(room: Room): RoomSnapshot {
  return cloneState({
    code: room.code,
    phase: room.phase,
    currentQuestionId: room.currentQuestionId,
    answers: room.revealed
      ? room.answers
      : room.answers.map(answer => ({ ...answer, isCorrect: false })),
    submissions: room.revealed
      ? room.submissions
      : room.submissions.map(item => ({ playerId: item.playerId, answerIds: [], text: '', skipped: false })),
    revealed: room.revealed,
    awarded: room.awarded,
    roundScores: room.revealed ? room.roundScores : {},
    bank: room.bank,
    session: room.session,
  })
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
