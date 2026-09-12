export const QUESTION_VALUES = [100, 200, 300, 400, 500, 600, 700] as const

export type QuestionValue = (typeof QUESTION_VALUES)[number]

export const QUESTION_KINDS = ['single', 'multi', 'free'] as const

export type QuestionKind = (typeof QUESTION_KINDS)[number]

export interface Category {
  id: string
  name: string
  order: number
}

export interface Answer {
  id: string
  text: string
  isCorrect: boolean
}

export interface Question {
  id: string
  categoryId: string
  value: QuestionValue
  text: string
  kind: QuestionKind
  answers: Answer[]
}

export interface Player {
  id: string
  name: string
}

export interface QuizBank {
  categories: Category[]
  questions: Question[]
}

export interface GameSession {
  players: Player[]
  scores: Record<string, number>
  answeredQuestionIds: string[]
  startedAt: string | null
}
