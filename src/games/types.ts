import type { Component } from 'vue'
import type { RouteLocationNormalizedLoaded, Router, RouteRecordRaw } from 'vue-router'
import type { ThemeId } from '@/themes/catalog'
import type { RoomPlayer, RoomSession, ServerNotice } from '@/lib/room-protocol'

export type GameId = 'quiz' | 'whoami' | 'golf' | 'deep-question'

export interface GameMeta {
  id: GameId
  name: string
  description: string
  minPlayers: number
  /** Host participates as a scoring/playing contestant */
  hostPlays: boolean
  supportsLocal: boolean
  /** Whether creating a new room is currently available for this game. */
  roomEnabled: boolean
  themeIds: ThemeId[]
  defaultThemeId: ThemeId
  load: () => Promise<GameModule>
}

export interface GameDriverContext {
  players: RoomPlayer[]
  hostPlayerId: string
  scores: Record<string, number>
  phase: string
  clientPlayerId: string
  clientRole: 'host' | 'player'
  isHost: boolean
}

export interface GameReduceResult {
  phase?: string
  payload?: unknown
  scores?: Record<string, number>
  startedAt?: string | null
  notices?: ServerNotice[]
  /** Broadcast the snapshot without writing the host session store. */
  volatile?: boolean
}

export interface GameDriver {
  createPayload(input?: { bank?: unknown }): unknown
  initialPhase(): string
  canStart(ctx: { players: RoomPlayer[], payload: unknown }): string | null
  reduce(message: unknown, ctx: GameDriverContext & { payload: unknown }): GameReduceResult
  /** Mask secrets for a specific viewer before sending snapshot */
  toClientPayload(payload: unknown, phase: string, viewer: { playerId: string, isHost: boolean }): unknown
  onPlayerRemoved?(payload: unknown, playerId: string): unknown
}

export interface GameModule {
  id: GameId
  driver: GameDriver
  routes: RouteRecordRaw[]
  syncRoute: (
    phase: string,
    snapshot: { phase: string, payload: unknown, session: RoomSession },
    router: Router,
    route: RouteLocationNormalizedLoaded,
  ) => void
  ShellNav?: Component
  ShellStatus?: Component
  LobbyExtras?: Component
}
