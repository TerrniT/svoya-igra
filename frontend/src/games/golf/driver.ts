import type { GameDriver, GameReduceResult } from '@/games/types'
import type { RoomPlayer } from '@/lib/room-protocol'
import {
  GOLF_LEVELS,
  MAX_STROKES,
  teeVec,
  type GolfVec,
  type LevelDef,
} from './levels'

export type GolfNote = '' | 'water' | 'hole' | 'pickup'
export type GolfStatus = 'aim' | 'roll' | 'sunk'

export interface GolfPayload {
  levelIndex: number
  order: string[]
  turnId: string
  strokes: Record<string, number>
  totals: Record<string, number>
  cards: Record<string, number[]>
  done: string[]
  status: GolfStatus
  lie: GolfVec
  ball: GolfVec
  velocity: GolfVec
  shot: number
  yaw: number
  power: number
  note: GolfNote
}

function zero(): GolfVec {
  return { x: 0, y: 0, z: 0 }
}

function levelAt(index: number): LevelDef {
  return GOLF_LEVELS[index] ?? GOLF_LEVELS[0]!
}

export function emptyGolfPayload(): GolfPayload {
  const tee = teeVec(levelAt(0))
  return {
    levelIndex: 0,
    order: [],
    turnId: '',
    strokes: {},
    totals: {},
    cards: {},
    done: [],
    status: 'aim',
    lie: tee,
    ball: { ...tee },
    velocity: zero(),
    shot: 0,
    yaw: 0,
    power: 0.55,
    note: '',
  }
}

function asPayload(value: unknown): GolfPayload {
  if (!value || typeof value !== 'object' || !('ball' in value) || !('levelIndex' in value))
    throw new Error('Некорректное состояние гольфа')
  return value as GolfPayload
}

function livingOrder(order: string[], players: RoomPlayer[]) {
  const ids = order.filter(id => players.some(player => player.id === id))
  for (const player of players) {
    if (!ids.includes(player.id))
      ids.push(player.id)
  }
  return ids
}

function scoreTable(payload: GolfPayload, players: RoomPlayer[]) {
  const scores: Record<string, number> = {}
  for (const player of players) {
    scores[player.id] = (payload.totals[player.id] ?? 0) + (payload.strokes[player.id] ?? 0)
  }
  return scores
}

function openHole(
  levelIndex: number,
  order: string[],
  cards: Record<string, number[]>,
  totals: Record<string, number>,
  shot: number,
): GolfPayload {
  const tee = teeVec(levelAt(levelIndex))
  const strokes: Record<string, number> = {}
  for (const id of order)
    strokes[id] = 0
  return {
    levelIndex,
    order,
    turnId: order[0] ?? '',
    strokes,
    totals,
    cards,
    done: [],
    status: 'aim',
    lie: { ...tee },
    ball: { ...tee },
    velocity: zero(),
    shot,
    yaw: 0,
    power: 0.55,
    note: '',
  }
}

function readAngle(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n))
    throw new Error('Некорректный прицел')
  return n
}

function readPower(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n))
    throw new Error('Некорректная сила')
  return Math.min(1, Math.max(0.02, n))
}

function readCoord(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 80)
    throw new Error('Некорректная позиция мяча')
  return Math.round(n * 1000) / 1000
}

function nextPending(payload: GolfPayload) {
  if (!payload.order.length)
    return null
  const start = Math.max(0, payload.order.indexOf(payload.turnId))
  for (let step = 1; step <= payload.order.length; step += 1) {
    const id = payload.order[(start + step) % payload.order.length]!
    if (!payload.done.includes(id))
      return id
  }
  return null
}

function markDone(payload: GolfPayload, note: GolfNote) {
  const id = payload.turnId
  if (id && !payload.done.includes(id))
    payload.done.push(id)
  payload.status = 'sunk'
  payload.note = note
  payload.velocity = zero()
}

function foldHole(payload: GolfPayload, players: RoomPlayer[]): GameReduceResult {
  for (const id of payload.order) {
    const strokes = payload.strokes[id] ?? MAX_STROKES
    payload.cards[id] = [...(payload.cards[id] ?? []), strokes]
    payload.totals[id] = (payload.totals[id] ?? 0) + strokes
  }
  payload.strokes = {}
  const order = livingOrder(payload.order, players)
  if (payload.levelIndex >= GOLF_LEVELS.length - 1) {
    return {
      phase: 'results',
      payload,
      scores: scoreTable(payload, players),
    }
  }
  const next = openHole(payload.levelIndex + 1, order, payload.cards, payload.totals, payload.shot)
  return {
    payload: next,
    scores: scoreTable(next, players),
  }
}

function armNext(payload: GolfPayload) {
  const next = nextPending(payload)
  if (!next)
    return false
  const tee = teeVec(levelAt(payload.levelIndex))
  payload.turnId = next
  payload.status = 'aim'
  payload.note = ''
  payload.ball = { ...tee }
  payload.lie = { ...tee }
  payload.velocity = zero()
  return true
}

export const golfDriver: GameDriver = {
  createPayload() {
    return emptyGolfPayload()
  },

  initialPhase() {
    return 'lobby'
  },

  canStart({ players }) {
    if (players.length < 1)
      return 'Нужен хотя бы один игрок'
    if (players.length > 8)
      return 'На поле максимум 8 игроков'
    return null
  },

  reduce(message, ctx): GameReduceResult {
    const payload = structuredClone(asPayload(ctx.payload))
    const msg = message as { type: string } & Record<string, unknown>

    if (msg.type === 'start' || msg.type === 'playAgain') {
      if (!ctx.isHost)
        throw new Error('Только ведущий начинает игру')
      const reason = this.canStart({ players: ctx.players, payload })
      if (reason)
        throw new Error(reason)
      const order = ctx.players.map(player => player.id)
      const next = openHole(0, order, {}, {}, 0)
      const scores: Record<string, number> = {}
      for (const id of order)
        scores[id] = 0
      return {
        phase: 'play',
        payload: next,
        scores,
        startedAt: new Date().toISOString(),
      }
    }

    if (ctx.phase !== 'play')
      throw new Error('Игра ещё не началась')

    if (msg.type === 'putt') {
      if (payload.status !== 'aim')
        throw new Error('Мяч ещё в игре')
      if (ctx.clientPlayerId !== payload.turnId)
        throw new Error('Сейчас ход другого игрока')
      const strokes = (payload.strokes[payload.turnId] ?? 0) + 1
      if (strokes > MAX_STROKES)
        throw new Error('Лимит ударов исчерпан')
      payload.strokes[payload.turnId] = strokes
      payload.yaw = readAngle(msg.yaw)
      payload.power = readPower(msg.power)
      payload.shot += 1
      payload.status = 'roll'
      payload.note = ''
      payload.velocity = zero()
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    if (msg.type === 'ball') {
      if (!ctx.isHost)
        throw new Error('Позицию мяча сообщает только ведущий')
      if (payload.status !== 'roll' || Number(msg.shot) !== payload.shot)
        return { volatile: true }
      payload.ball = {
        x: readCoord(msg.x),
        y: readCoord(msg.y),
        z: readCoord(msg.z),
      }
      payload.velocity = {
        x: readCoord(msg.vx),
        y: readCoord(msg.vy),
        z: readCoord(msg.vz),
      }
      return { payload, volatile: true }
    }

    if (msg.type === 'settle') {
      if (!ctx.isHost)
        throw new Error('Результат удара сообщает только ведущий')
      if (payload.status !== 'roll' || Number(msg.shot) !== payload.shot)
        return { volatile: true }

      const level = levelAt(payload.levelIndex)
      const pos = {
        x: readCoord(msg.x),
        y: readCoord(msg.y),
        z: readCoord(msg.z),
      }
      const holeDist = Math.hypot(pos.x - level.hole[0], pos.z - level.hole[2])
      const holed = Boolean(msg.holed) && holeDist <= level.holeRadius + 0.25
      const hazard = Boolean(msg.hazard) || pos.y < -0.45

      if (holed) {
        payload.ball = { x: level.hole[0], y: level.hole[1] + 0.05, z: level.hole[2] }
        markDone(payload, 'hole')
        return { payload, scores: scoreTable(payload, ctx.players) }
      }

      if (hazard) {
        payload.ball = { ...payload.lie }
        payload.velocity = zero()
        payload.note = 'water'
        if ((payload.strokes[payload.turnId] ?? 0) >= MAX_STROKES) {
          payload.strokes[payload.turnId] = MAX_STROKES
          markDone(payload, 'pickup')
          return { payload, scores: scoreTable(payload, ctx.players) }
        }
        payload.status = 'aim'
        return { payload, scores: scoreTable(payload, ctx.players) }
      }

      payload.ball = pos
      payload.lie = { ...pos }
      payload.velocity = zero()
      payload.note = ''
      if ((payload.strokes[payload.turnId] ?? 0) >= MAX_STROKES) {
        payload.strokes[payload.turnId] = MAX_STROKES
        markDone(payload, 'pickup')
        return { payload, scores: scoreTable(payload, ctx.players) }
      }
      payload.status = 'aim'
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    if (msg.type === 'continue') {
      if (!ctx.isHost)
        throw new Error('Только ведущий продолжает игру')
      if (payload.status !== 'sunk')
        throw new Error('Лунка ещё не закрыта')
      if (armNext(payload))
        return { payload, scores: scoreTable(payload, ctx.players) }
      return foldHole(payload, ctx.players)
    }

    if (msg.type === 'skipTurn') {
      if (!ctx.isHost)
        throw new Error('Пропустить ход может только ведущий')
      if (payload.status === 'roll')
        throw new Error('Дождитесь, пока мяч остановится')
      if (payload.status === 'sunk')
        throw new Error('Ход уже завершён')
      payload.strokes[payload.turnId] = MAX_STROKES
      markDone(payload, 'pickup')
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    throw new Error('Неизвестное сообщение гольфа')
  },

  toClientPayload(payload) {
    return asPayload(payload)
  },

  onPlayerRemoved(payload, playerId) {
    const state = structuredClone(asPayload(payload))
    state.order = state.order.filter(id => id !== playerId)
    delete state.strokes[playerId]
    delete state.totals[playerId]
    delete state.cards[playerId]
    state.done = state.done.filter(id => id !== playerId)
    if (state.turnId !== playerId)
      return state

    state.shot += 1
    state.velocity = zero()
    const next = state.order.find(id => !state.done.includes(id))
    if (!next) {
      state.status = 'sunk'
      state.note = 'pickup'
      state.turnId = state.order[0] ?? ''
      return state
    }
    const tee = teeVec(levelAt(state.levelIndex))
    state.turnId = next
    state.status = 'aim'
    state.note = ''
    state.ball = { ...tee }
    state.lie = { ...tee }
    return state
  },
}

export function isGolfPayload(value: unknown): value is GolfPayload {
  return Boolean(value && typeof value === 'object' && 'order' in value && 'ball' in value && 'levelIndex' in value)
}
