import type { Answer, QuizBank } from '@/lib/types'

export type QuizPhase = 'lobby' | 'board' | 'question' | 'results'

export interface PlayerSubmission {
  playerId: string
  answerIds: string[]
  text: string
  skipped?: boolean
}

export interface QuizPayload {
  bank: QuizBank
  chooserId: string | null
  answeredQuestionIds: string[]
  currentQuestionId: string | null
  answers: Answer[]
  submissions: PlayerSubmission[]
  revealed: boolean
  awarded: boolean
  roundScores: Record<string, number>
}

export function emptyQuizPayload(bank: QuizBank = { categories: [], questions: [] }): QuizPayload {
  return {
    bank,
    chooserId: null,
    answeredQuestionIds: [],
    currentQuestionId: null,
    answers: [],
    submissions: [],
    revealed: false,
    awarded: false,
    roundScores: {},
  }
}

export function isQuizPayload(value: unknown): value is QuizPayload {
  return Boolean(value && typeof value === 'object' && 'bank' in value)
}
