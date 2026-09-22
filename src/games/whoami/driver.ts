import type { GameDriver, GameDriverContext, GameReduceResult } from '@/games/types'
import { shuffle } from '@/lib/random'
import { WHOAMI_DECK, type WhoamiCardDef } from './deck'

export type WhoamiPhase = 'lobby' | 'play' | 'results'

export interface WhoamiCardState {
  id: string
  text: string
  guessed: boolean
}

export interface WhoamiPayload {
  cards: Record<string, WhoamiCardState>
}

export function emptyWhoamiPayload(): WhoamiPayload {
  return { cards: {} }
}

function asPayload(value: unknown): WhoamiPayload {
  if (!value || typeof value !== 'object' || !('cards' in value))
    throw new Error('Некорректное состояние «Кто я?»')
  return value as WhoamiPayload
}

function dealCards(players: GameDriverContext['players'], deck: WhoamiCardDef[]): WhoamiPayload {
  if (players.length > deck.length)
    throw new Error(`В колоде только ${deck.length} карточек, а игроков ${players.length}`)

  const dealt = shuffle(deck).slice(0, players.length)
  const cards: Record<string, WhoamiCardState> = {}
  players.forEach((player, index) => {
    const card = dealt[index]!
    cards[player.id] = { id: card.id, text: card.text, guessed: false }
  })
  return { cards }
}

function allGuessed(payload: WhoamiPayload) {
  const entries = Object.values(payload.cards)
  return entries.length > 0 && entries.every(card => card.guessed)
}

export const whoamiDriver: GameDriver = {
  createPayload() {
    return emptyWhoamiPayload()
  },

  initialPhase() {
    return 'lobby'
  },

  canStart({ players }) {
    if (players.length < 2)
      return 'Нужно минимум двое игроков'
    if (players.length > WHOAMI_DECK.length)
      return `Слишком много игроков (макс. ${WHOAMI_DECK.length})`
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

      const scores: Record<string, number> = {}
      for (const player of ctx.players)
        scores[player.id] = 0

      return {
        phase: 'play',
        payload: dealCards(ctx.players, WHOAMI_DECK),
        scores,
        startedAt: new Date().toISOString(),
      }
    }

    if (msg.type === 'markGuessed') {
      if (!ctx.isHost)
        throw new Error('Отметить угадавшего может только ведущий')
      if (ctx.phase !== 'play')
        throw new Error('Игра ещё не началась')

      const playerId = String(msg.playerId)
      const card = payload.cards[playerId]
      if (!card)
        throw new Error('У этого игрока нет карточки')
      if (card.guessed)
        throw new Error('Уже угадали')

      card.guessed = true
      const player = ctx.players.find(item => item.id === playerId)
      const notices = [{ kind: 'guessed' as const, playerName: player?.name }]

      if (allGuessed(payload))
        return { phase: 'results', payload, notices }

      return { payload, notices }
    }

    throw new Error('Неизвестное сообщение «Кто я?»')
  },

  toClientPayload(payload, _phase, viewer) {
    const state = asPayload(payload)
    const cards: Record<string, WhoamiCardState> = {}
    for (const [playerId, card] of Object.entries(state.cards)) {
      if (playerId === viewer.playerId && !card.guessed) {
        cards[playerId] = { id: card.id, text: '???', guessed: false }
      }
      else {
        cards[playerId] = { ...card }
      }
    }
    return { cards } satisfies WhoamiPayload
  },

  onPlayerRemoved(payload, playerId) {
    const state = structuredClone(asPayload(payload))
    delete state.cards[playerId]
    return state
  },
}
