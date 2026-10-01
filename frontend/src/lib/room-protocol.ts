import type { GameId } from '@/games/types'

export type RoomRole = 'host' | 'player'

export type ServerNotice =
  | { kind: 'revealed' | 'awarded' | 'skip' | 'closed' | 'guessed' | 'kicked', playerName?: string, value?: number }

export interface RoomPlayer {
  id: string
  name: string
  deviceId: string
  connected: boolean
  isHost: boolean
}

export interface RoomSession {
  players: RoomPlayer[]
  scores: Record<string, number>
  startedAt: string | null
}

export interface RoomSnapshot {
  code: string
  gameId: GameId
  themeId: string
  phase: string
  paused?: boolean
  session: RoomSession
  payload: unknown
}

export type CoreClientMessage =
  | { type: 'create', name: string, deviceId: string, gameId: GameId, themeId: string, settings?: unknown }
  | { type: 'join', code: string, name: string, deviceId: string }
  | { type: 'reconnect', code: string, deviceId: string }
  | { type: 'leave' }
  | { type: 'kick', playerId: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'endGame' }

/** Game-specific messages are opaque to the room core */
export type ClientMessage = CoreClientMessage | ({ type: string } & Record<string, unknown>)

export type ServerMessage =
  | { type: 'hello', playerId: string, role: RoomRole, snapshot: RoomSnapshot }
  | { type: 'state', snapshot: RoomSnapshot }
  | { type: 'notice', kind: ServerNotice['kind'], playerName?: string, value?: number }
  | { type: 'error', message: string }

export function emptyRoomSession(): RoomSession {
  return {
    players: [],
    scores: {},
    startedAt: null,
  }
}
