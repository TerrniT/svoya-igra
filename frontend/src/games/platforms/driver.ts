import type { GameDriver, GameReduceResult } from '@/games/types'
import type { RoomPlayer } from '@/lib/room-protocol'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLATFORM_COUNT,
  START_SEATS,
  cellAt,
  cellCenter,
  figureColor,
  type Vec3,
  yawTowardCenter,
  zeroVec,
} from './board'

export type PlatformsStatus = 'aim' | 'roll' | 'warning'

export interface PlatformsPayload {
  order: string[]
  living: string[]
  eliminated: string[]
  cells: Record<string, number>
  figures: Record<string, Vec3>
  turnId: string
  moved: string[]
  status: PlatformsStatus
  marked: number[]
  present: boolean[]
  round: number
  seed: number
  winnerId: string
  shot: number
  yaw: number
  power: number
  lie: Vec3
  velocity: Vec3
  note: string
}

export { figureColor, PLATFORM_COUNT, MIN_PLAYERS, MAX_PLAYERS, yawTowardCenter }

export function emptyPlatformsPayload(): PlatformsPayload {
  return {
    order: [],
    living: [],
    eliminated: [],
    cells: {},
    figures: {},
    turnId: '',
    moved: [],
    status: 'aim',
    marked: [],
    present: Array.from({ length: PLATFORM_COUNT }, () => true),
    round: 0,
    seed: 0,
    winnerId: '',
    shot: 0,
    yaw: 0,
    power: 0.55,
    lie: zeroVec(),
    velocity: zeroVec(),
    note: '',
  }
}

export function isPlatformsPayload(value: unknown): value is PlatformsPayload {
  return Boolean(
    value
    && typeof value === 'object'
    && 'present' in value
    && 'figures' in value
    && 'status' in value
    && Array.isArray((value as PlatformsPayload).present),
  )
}

export function presentCount(payload: PlatformsPayload) {
  return payload.present.filter(Boolean).length
}

function asPayload(value: unknown): PlatformsPayload {
  if (!isPlatformsPayload(value))
    throw new Error('Некорректное состояние «Платформы»')
  return {
    ...emptyPlatformsPayload(),
    ...value,
    order: value.order ?? [],
    living: value.living ?? [],
    eliminated: value.eliminated ?? [],
    cells: value.cells ?? {},
    figures: value.figures ?? {},
    moved: value.moved ?? [],
    marked: value.marked ?? [],
    present: normalizePresent(value.present),
    lie: value.lie ?? zeroVec(),
    velocity: value.velocity ?? zeroVec(),
  }
}

function normalizePresent(present: boolean[] | undefined) {
  const next = Array.from({ length: PLATFORM_COUNT }, () => true)
  present?.forEach((flag, index) => {
    if (index < PLATFORM_COUNT)
      next[index] = flag
  })
  return next
}

function contains(ids: string[], value: string) {
  return ids.includes(value)
}

function scoreTable(payload: PlatformsPayload, players: RoomPlayer[]) {
  const scores: Record<string, number> = {}
  for (const player of players)
    scores[player.id] = player.id === payload.winnerId ? 1 : 0
  return scores
}

function livingOrder(payload: PlatformsPayload, players: RoomPlayer[]) {
  return payload.living.filter(id => players.some(player => player.id === id))
}

function nextLiving(payload: PlatformsPayload, after: string) {
  const start = payload.order.indexOf(after)
  if (start < 0)
    return payload.living[0] ?? ''
  for (let step = 1; step <= payload.order.length; step += 1) {
    const id = payload.order[(start + step) % payload.order.length]!
    if (contains(payload.living, id))
      return id
  }
  return payload.living[0] ?? ''
}

function nextUnmoved(payload: PlatformsPayload) {
  const start = Math.max(0, payload.order.indexOf(payload.turnId))
  for (let step = 1; step <= payload.order.length; step += 1) {
    const id = payload.order[(start + step) % payload.order.length]!
    if (contains(payload.living, id) && !contains(payload.moved, id))
      return id
  }
  return payload.living[0] ?? ''
}

function allMoved(payload: PlatformsPayload) {
  return payload.living.length > 0 && payload.living.every(id => contains(payload.moved, id))
}

function openRound(players: RoomPlayer[]): PlatformsPayload {
  const order = players.map(player => player.id)
  const cells: Record<string, number> = {}
  const figures: Record<string, Vec3> = {}
  order.forEach((id, index) => {
    const seat = START_SEATS[index % START_SEATS.length]!
    cells[id] = seat
    figures[id] = cellCenter(seat)
  })
  const turnId = order[0] ?? ''
  return {
    ...emptyPlatformsPayload(),
    order,
    living: [...order],
    cells,
    figures,
    turnId,
    status: 'aim',
    present: Array.from({ length: PLATFORM_COUNT }, () => true),
    round: 1,
    seed: Date.now(),
    lie: turnId ? figures[turnId]! : zeroVec(),
    power: 0.55,
  }
}

function finishIfWon(payload: PlatformsPayload, players: RoomPlayer[]): GameReduceResult | null {
  payload.living = livingOrder(payload, players)
  if (payload.living.length !== 1)
    return null
  payload.winnerId = payload.living[0]!
  payload.status = 'aim'
  payload.marked = []
  return { phase: 'results', payload, scores: scoreTable(payload, players) }
}

function eliminate(payload: PlatformsPayload, playerId: string) {
  payload.living = payload.living.filter(id => id !== playerId)
  payload.moved = payload.moved.filter(id => id !== playerId)
  if (!payload.eliminated.includes(playerId))
    payload.eliminated.push(playerId)
}

function mulberry(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number) {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = next[index]!
    next[index] = next[swap]!
    next[swap] = current
  }
  return next
}

export function vanishCount(remaining: number) {
  if (remaining <= 1)
    return 0
  if (remaining >= 6)
    return Math.min(2, remaining - 1)
  return 1
}

export function pickMarked(payload: PlatformsPayload) {
  const count = vanishCount(presentCount(payload))
  if (count <= 0)
    return []
  const livingOn = new Map<number, number>()
  for (const id of payload.living) {
    const cell = payload.cells[id]
    if (cell === undefined)
      continue
    livingOn.set(cell, (livingOn.get(cell) ?? 0) + 1)
  }
  const empty: number[] = []
  const occupiedSafe: number[] = []
  payload.present.forEach((ok, cell) => {
    if (!ok)
      return
    const here = livingOn.get(cell) ?? 0
    if (here === 0)
      empty.push(cell)
    else if (here < payload.living.length)
      occupiedSafe.push(cell)
  })
  const random = mulberry((payload.seed + payload.round * 997) >>> 0)
  const pool = [...shuffle(empty, random), ...shuffle(occupiedSafe, random)]
  const take = Math.min(count, pool.length, presentCount(payload) - 1)
  return take > 0 ? pool.slice(0, take) : []
}

function afterMove(payload: PlatformsPayload, players: RoomPlayer[]): GameReduceResult {
  const won = finishIfWon(payload, players)
  if (won)
    return won
  if (!allMoved(payload)) {
    payload.turnId = nextUnmoved(payload)
    payload.status = 'aim'
    payload.lie = payload.figures[payload.turnId] ?? payload.lie
    payload.velocity = zeroVec()
    return { payload, scores: scoreTable(payload, players) }
  }
  if (presentCount(payload) <= 1) {
    payload.status = 'aim'
    payload.moved = []
    payload.marked = []
    payload.turnId = nextLiving(payload, payload.turnId)
    payload.lie = payload.figures[payload.turnId] ?? payload.lie
    return { payload, scores: scoreTable(payload, players) }
  }
  payload.marked = pickMarked(payload)
  payload.status = 'warning'
  return { payload, scores: scoreTable(payload, players) }
}

function readCoord(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 40)
    throw new Error('Некорректная позиция фигуры')
  return Math.round(n * 1000) / 1000
}

export const platformsDriver: GameDriver = {
  createPayload() {
    return emptyPlatformsPayload()
  },

  initialPhase() {
    return 'lobby'
  },

  canStart({ players }) {
    if (players.length < MIN_PLAYERS)
      return 'Нужно от 2 до 9 игроков'
    if (players.length > MAX_PLAYERS)
      return 'На поле максимум 9 игроков'
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
      const next = openRound(ctx.players)
      const scores: Record<string, number> = {}
      for (const player of ctx.players)
        scores[player.id] = 0
      return { phase: 'play', payload: next, scores, startedAt: new Date().toISOString() }
    }

    if (ctx.phase !== 'play')
      throw new Error('Игра ещё не началась')

    const won = finishIfWon(payload, ctx.players)
    if (won)
      return won

    if (msg.type === 'push') {
      if (payload.status !== 'aim')
        throw new Error('Сначала дождитесь остановки фигуры')
      if (ctx.clientPlayerId !== payload.turnId)
        throw new Error('Сейчас ход другого игрока')
      payload.yaw = Number(msg.yaw)
      payload.power = Math.min(1, Math.max(0.02, Number(msg.power)))
      payload.shot += 1
      payload.status = 'roll'
      payload.note = ''
      payload.lie = payload.figures[payload.turnId] ?? payload.lie
      payload.velocity = zeroVec()
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    if (msg.type === 'figure') {
      if (!ctx.isHost)
        throw new Error('Позицию фигуры сообщает только ведущий')
      if (payload.status !== 'roll' || Number(msg.shot) !== payload.shot)
        return { volatile: true }
      if (payload.turnId) {
        payload.figures[payload.turnId] = {
          x: readCoord(msg.x),
          y: readCoord(msg.y),
          z: readCoord(msg.z),
        }
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
        throw new Error('Результат толчка сообщает только ведущий')
      if (payload.status !== 'roll' || Number(msg.shot) !== payload.shot)
        return { volatile: true }
      const pos = { x: readCoord(msg.x), y: readCoord(msg.y), z: readCoord(msg.z) }
      const extras = msg.figures as Record<string, Vec3> | undefined
      if (extras) {
        for (const [id, figure] of Object.entries(extras)) {
          payload.figures[id] = {
            x: readCoord(figure.x),
            y: readCoord(figure.y),
            z: readCoord(figure.z),
          }
        }
      }
      const cell = cellAt(pos.x, pos.z, payload.present)
      const fell = Boolean(msg.hazard) || pos.y < -0.45 || cell < 0
      if (fell) {
        payload.figures[payload.turnId] = pos
        payload.velocity = zeroVec()
        payload.note = 'fell'
        eliminate(payload, payload.turnId)
      }
      else {
        const spot = cellCenter(cell)
        payload.cells[payload.turnId] = cell
        payload.figures[payload.turnId] = spot
        payload.lie = spot
        payload.velocity = zeroVec()
        payload.note = 'landed'
        if (!payload.moved.includes(payload.turnId))
          payload.moved.push(payload.turnId)
      }
      const fallen = Array.isArray(msg.fallen) ? msg.fallen.map(String) : []
      for (const other of fallen) {
        if (other !== payload.turnId)
          eliminate(payload, other)
      }
      return afterMove(payload, ctx.players)
    }

    if (msg.type === 'vanish') {
      if (!ctx.isHost)
        throw new Error('Платформы убирает только ведущий')
      if (payload.status !== 'warning')
        throw new Error('Сначала все должны сходить')
      for (const cell of payload.marked) {
        if (cell >= 0 && cell < PLATFORM_COUNT)
          payload.present[cell] = false
      }
      const dropped = payload.living.filter((id) => {
        const cell = payload.cells[id]
        return cell === undefined || !payload.present[cell]
      })
      for (const id of dropped) {
        const pos = payload.figures[id]
        if (pos)
          payload.figures[id] = { ...pos, y: -1.2 }
        eliminate(payload, id)
      }
      payload.marked = []
      const done = finishIfWon(payload, ctx.players)
      if (done)
        return done
      payload.round += 1
      payload.moved = []
      payload.status = 'aim'
      payload.turnId = nextLiving(payload, payload.turnId)
      payload.lie = payload.figures[payload.turnId] ?? payload.lie
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    if (msg.type === 'skipTurn') {
      if (!ctx.isHost)
        throw new Error('Пропустить ход может только ведущий')
      if (payload.status !== 'aim' || !payload.turnId)
        throw new Error('Сейчас нельзя пропустить ход')
      if (payload.moved.includes(payload.turnId))
        throw new Error('Вы уже ходили в этом круге')
      payload.moved.push(payload.turnId)
      return afterMove(payload, ctx.players)
    }

    if (msg.type === 'resolve') {
      if (!ctx.isHost)
        throw new Error('Только ведущий продолжает игру')
      return finishIfWon(payload, ctx.players) ?? { payload, scores: scoreTable(payload, ctx.players) }
    }

    throw new Error('Неизвестное сообщение «Платформы»')
  },

  toClientPayload(payload) {
    return asPayload(payload)
  },

  onPlayerRemoved(payload, playerId) {
    const state = structuredClone(asPayload(payload))
    const wasTurn = state.turnId === playerId
    state.order = state.order.filter(id => id !== playerId)
    state.living = state.living.filter(id => id !== playerId)
    state.eliminated = state.eliminated.filter(id => id !== playerId)
    state.moved = state.moved.filter(id => id !== playerId)
    delete state.cells[playerId]
    delete state.figures[playerId]
    if (wasTurn)
      state.turnId = nextLiving(state, playerId)
    if (state.living.length === 1)
      state.winnerId = state.living[0]!
    return state
  },
}
