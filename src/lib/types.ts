export const QUESTION_VALUES = [100, 200, 300, 400, 500, 600, 700] as const

export type QuestionValue = (typeof QUESTION_VALUES)[number]

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
