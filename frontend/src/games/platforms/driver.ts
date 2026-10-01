import type { GameDriver, GameReduceResult } from '@/games/types'
import type { RoomPlayer } from '@/lib/room-protocol'

export const PLATFORM_COUNT = 9
export const GRID_SIZE = 3
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 9
export const START_SEATS = [0, 8, 2, 6, 4, 1, 7, 3, 5] as const

export const FIGURE_COLORS = [
  '#f0b429',
  '#5ec8f0',
  '#f07178',
  '#9ece6a',
  '#bb9af7',
  '#ff9e64',
  '#7dcfff',
  '#e0af68',
  '#c0caf5',
] as const

export type PlatformsStatus = 'move' | 'warning' | 'shove'

export interface PlatformsPayload {
  order: string[]
  living: string[]
  eliminated: string[]
  positions: Record<string, number>
  turnId: string
  moved: string[]
  status: PlatformsStatus
  marked: number[]
  present: boolean[]
  round: number
  seed: number
  winnerId: string
}

export function emptyPlatformsPayload(): PlatformsPayload {
  return {
    order: [],
    living: [],
    eliminated: [],
    positions: {},
    turnId: '',
    moved: [],
    status: 'move',
    marked: [],
    present: Array.from({ length: PLATFORM_COUNT }, () => true),
    round: 0,
    seed: 0,
    winnerId: '',
  }
}

export function isPlatformsPayload(value: unknown): value is PlatformsPayload {
  return Boolean(
    value
    && typeof value === 'object'
    && 'present' in value
    && 'positions' in value
    && 'status' in value
    && Array.isArray((value as PlatformsPayload).present),
  )
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
    positions: value.positions ?? {},
    moved: value.moved ?? [],
    marked: value.marked ?? [],
    present: normalizePresent(value.present),
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

export function adjacent(a: number, b: number) {
  if (a === b || a < 0 || b < 0 || a >= PLATFORM_COUNT || b >= PLATFORM_COUNT)
    return false
  const ar = Math.floor(a / GRID_SIZE)
  const ac = a % GRID_SIZE
  const br = Math.floor(b / GRID_SIZE)
  const bc = b % GRID_SIZE
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1
}

export function presentCount(payload: PlatformsPayload) {
  return payload.present.filter(Boolean).length
}

export function occupants(payload: PlatformsPayload, cell: number) {
  return payload.living.filter(id => payload.positions[id] === cell)
}

export function legalPushTargets(payload: PlatformsPayload, playerId: string) {
  const from = payload.positions[playerId]
  if (from === undefined)
    return []
  const targets: number[] = []
  for (let to = 0; to < PLATFORM_COUNT; to += 1) {
    if (to !== from && payload.present[to] && adjacent(from, to))
      targets.push(to)
  }
  return targets
}

export function legalShoveTargets(payload: PlatformsPayload, playerId: string) {
  if (payload.status !== 'shove')
    return []
  const from = payload.positions[playerId]
  if (from === undefined)
    return []
  return occupants(payload, from).filter(id => id !== playerId)
}

export function figureColor(order: string[], playerId: string) {
  const index = Math.max(0, order.indexOf(playerId))
  return FIGURE_COLORS[index % FIGURE_COLORS.length]!
}

export function cellLabel(index: number) {
  return `${Math.floor(index / GRID_SIZE) + 1}×${(index % GRID_SIZE) + 1}`
}

function livingOrder(payload: PlatformsPayload, players: RoomPlayer[]) {
  return payload.living.filter(id => players.some(player => player.id === id))
}

function scoreTable(payload: PlatformsPayload, players: RoomPlayer[]) {
  const scores: Record<string, number> = {}
  for (const player of players)
    scores[player.id] = player.id === payload.winnerId ? 1 : 0
  return scores
}

function contains(ids: string[], value: string) {
  return ids.includes(value)
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
  const positions: Record<string, number> = {}
  order.forEach((id, index) => {
    positions[id] = START_SEATS[index % START_SEATS.length]!
  })
  return {
    order,
    living: [...order],
    eliminated: [],
    positions,
    turnId: order[0] ?? '',
    moved: [],
    status: 'move',
    marked: [],
    present: Array.from({ length: PLATFORM_COUNT }, () => true),
    round: 1,
    seed: Date.now(),
    winnerId: '',
  }
}

function finishIfWon(payload: PlatformsPayload, players: RoomPlayer[]): GameReduceResult | null {
  payload.living = livingOrder(payload, players)
  if (payload.living.length !== 1)
    return null
  payload.winnerId = payload.living[0]!
  payload.status = 'move'
  payload.marked = []
  return {
    phase: 'results',
    payload,
    scores: scoreTable(payload, players),
  }
}

function stay(payload: PlatformsPayload, playerId: string) {
  if (!contains(payload.living, playerId))
    throw new Error('Этого игрока уже нет на поле')
  if (contains(payload.moved, playerId))
    throw new Error('Вы уже ходили в этом круге')
  payload.moved.push(playerId)
}

function applyPush(payload: PlatformsPayload, playerId: string, to: number) {
  const from = payload.positions[playerId]
  if (from === undefined)
    throw new Error('Этого игрока уже нет на поле')
  const targets = legalPushTargets(payload, playerId)
  if (targets.length === 0) {
    if (to !== from)
      throw new Error('Только на соседнюю платформу')
    stay(payload, playerId)
    return
  }
  if (!targets.includes(to))
    throw new Error('Сюда нельзя толкнуть')
  payload.positions[playerId] = to
  payload.moved.push(playerId)
}

function afterMove(payload: PlatformsPayload, players: RoomPlayer[]): GameReduceResult {
  if (!allMoved(payload)) {
    payload.turnId = nextUnmoved(payload)
    return { payload, scores: scoreTable(payload, players) }
  }
  if (presentCount(payload) <= 1) {
    payload.status = 'shove'
    payload.moved = []
    payload.marked = []
    payload.turnId = nextLiving(payload, payload.turnId)
    return { payload, scores: scoreTable(payload, players) }
  }
  payload.marked = pickMarked(payload)
  payload.status = 'warning'
  return { payload, scores: scoreTable(payload, players) }
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
    const cell = payload.positions[id]
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
      return {
        phase: 'play',
        payload: next,
        scores,
        startedAt: new Date().toISOString(),
      }
    }

    if (ctx.phase !== 'play')
      throw new Error('Игра ещё не началась')

    const won = finishIfWon(payload, ctx.players)
    if (won)
      return won

    if (msg.type === 'push') {
      if (payload.status !== 'move')
        throw new Error('Нужно толкнуть фигуру на соседнюю платформу')
      if (ctx.clientPlayerId !== payload.turnId)
        throw new Error('Сейчас ход другого игрока')
      applyPush(payload, ctx.clientPlayerId, Number(msg.to))
      return afterMove(payload, ctx.players)
    }

    if (msg.type === 'shove') {
      if (payload.status !== 'shove')
        throw new Error('Можно столкнуть только с последней платформы')
      if (ctx.clientPlayerId !== payload.turnId)
        throw new Error('Сейчас ход другого игрока')
      const targetId = String(msg.playerId)
      if (targetId === ctx.clientPlayerId || !contains(payload.living, targetId))
        throw new Error('Можно столкнуть только с последней платформы')
      if (payload.positions[ctx.clientPlayerId] !== payload.positions[targetId])
        throw new Error('Можно столкнуть только с последней платформы')
      payload.living = payload.living.filter(id => id !== targetId)
      payload.eliminated.push(targetId)
      const done = finishIfWon(payload, ctx.players)
      if (done)
        return done
      payload.turnId = nextLiving(payload, payload.turnId)
      return { payload, scores: scoreTable(payload, ctx.players) }
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
      const fallen = payload.living.filter((id) => {
        const pos = payload.positions[id]
        return pos === undefined || !payload.present[pos]
      })
      payload.living = payload.living.filter(id => !fallen.includes(id))
      payload.eliminated.push(...fallen)
      payload.marked = []
      const done = finishIfWon(payload, ctx.players)
      if (done)
        return done
      payload.round += 1
      payload.moved = []
      payload.status = presentCount(payload) <= 1 && payload.living.length >= 2 ? 'shove' : 'move'
      payload.turnId = nextLiving(payload, payload.turnId)
      return { payload, scores: scoreTable(payload, ctx.players) }
    }

    if (msg.type === 'skipTurn') {
      if (!ctx.isHost)
        throw new Error('Пропустить ход может только ведущий')
      if (payload.status === 'warning' || !payload.turnId)
        throw new Error('Сейчас нельзя пропустить ход')
      if (payload.status === 'shove') {
        payload.turnId = nextLiving(payload, payload.turnId)
        return { payload, scores: scoreTable(payload, ctx.players) }
      }
      stay(payload, payload.turnId)
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
    delete state.positions[playerId]
    if (state.winnerId === playerId)
      state.winnerId = ''
    if (wasTurn)
      state.turnId = nextLiving(state, playerId)
    if (state.living.length === 1)
      state.winnerId = state.living[0]!
    return state
  },
}
