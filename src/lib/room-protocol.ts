import type { Answer, GameSession, QuizBank } from './types'

export type RoomPhase = 'lobby' | 'board' | 'question' | 'results'
export type RoomRole = 'host' | 'player'

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
  answeredQuestionIds: string[]
  startedAt: string | null
}

export interface RoomSnapshot {
  code: string
  phase: RoomPhase
  currentQuestionId: string | null
  answers: Answer[]
  bank: QuizBank
  session: RoomSession
}

export type ClientMessage =
  | { type: 'join', code: string, name: string, deviceId: string }
  | { type: 'reconnect', code: string, deviceId: string }
  | { type: 'leave' }
  | { type: 'updateBank', bank: QuizBank }
  | { type: 'start' }
  | { type: 'openQuestion', questionId: string }
  | { type: 'backToBoard' }
  | { type: 'answer', questionId: string, answerId: string }
  | { type: 'skip', questionId: string }
  | { type: 'playAgain' }
  | { type: 'kick', playerId: string }

export type ServerMessage =
  | { type: 'hello', playerId: string, role: RoomRole, snapshot: RoomSnapshot }
  | { type: 'state', snapshot: RoomSnapshot }
  | { type: 'notice', kind: 'correct' | 'wrong' | 'skip' | 'closed', playerName?: string, value?: number }
  | { type: 'error', message: string }

export function emptyRoomSession(): RoomSession {
  return {
    players: [],
    scores: {},
    answeredQuestionIds: [],
    startedAt: null,
  }
}

export function toLocalSession(session: RoomSession): GameSession {
  return {
    players: session.players.map(({ id, name }) => ({ id, name })),
    scores: session.scores,
    answeredQuestionIds: session.answeredQuestionIds,
    startedAt: session.startedAt,
  }
}
