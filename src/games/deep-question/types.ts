import type { DeepQuestion } from './data'

export type DeepQuestionPhase = 'lobby' | 'play'

export interface DeepQuestionPayload {
  questions: DeepQuestion[]
  currentQuestionId: string | null
  usedQuestionIds: string[]
}

export function emptyDeepQuestionPayload(): DeepQuestionPayload {
  return {
    questions: [],
    currentQuestionId: null,
    usedQuestionIds: [],
  }
}

export function isDeepQuestionPayload(value: unknown): value is DeepQuestionPayload {
  return Boolean(
    value
    && typeof value === 'object'
    && 'questions' in value
    && 'currentQuestionId' in value,
  )
}
