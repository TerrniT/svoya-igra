import type { GameDriver, GameReduceResult } from '@/games/types'
import { DEEP_QUESTIONS } from './data.ru'
import {
  emptyDeepQuestionPayload,
  isDeepQuestionPayload,
  type DeepQuestionPayload,
} from './types'

function asPayload(value: unknown): DeepQuestionPayload {
  if (!isDeepQuestionPayload(value))
    throw new Error('Некорректное состояние игры «Глубокие вопросы»')
  return value
}

function chooseNext(payload: DeepQuestionPayload) {
  const available = payload.questions.filter(question =>
    !payload.usedQuestionIds.includes(question.id),
  )

  if (!available.length) {
    payload.usedQuestionIds = []
    return payload.questions[Math.floor(Math.random() * payload.questions.length)] ?? null
  }

  return available[Math.floor(Math.random() * available.length)] ?? null
}

export const deepQuestionDriver: GameDriver = {
  createPayload() {
    return {
      ...emptyDeepQuestionPayload(),
      questions: structuredClone(DEEP_QUESTIONS),
    }
  },

  initialPhase() {
    return 'lobby'
  },

  canStart({ players, payload }) {
    if (!players.length)
      return 'Нужен хотя бы один участник'
    if (!asPayload(payload).questions.length)
      return 'В коллекции нет вопросов'
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

      payload.currentQuestionId = null
      payload.usedQuestionIds = []
      return {
        phase: 'play',
        payload,
        startedAt: new Date().toISOString(),
      }
    }

    if (msg.type === 'nextQuestion') {
      if (!ctx.isHost)
        throw new Error('Следующий вопрос выбирает ведущий')
      if (ctx.phase !== 'play')
        throw new Error('Сначала начните игру')

      const next = chooseNext(payload)
      if (!next)
        throw new Error('В коллекции нет вопросов')
      payload.currentQuestionId = next.id
      if (!payload.usedQuestionIds.includes(next.id))
        payload.usedQuestionIds.push(next.id)
      return { payload }
    }

    throw new Error('Неизвестное сообщение игры «Глубокие вопросы»')
  },

  toClientPayload(payload) {
    return asPayload(payload)
  },

  onPlayerRemoved(payload, _playerId: string) {
    return asPayload(payload)
  },
}
