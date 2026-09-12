import { createId } from '@/lib/ids'
import { QUESTION_KINDS, QUESTION_VALUES, type Category, type Question, type QuestionKind, type QuestionValue, type QuizBank } from '@/lib/types'
import { questionKind } from '@/lib/question-round'

export const QUIZ_BANK_EXPORT_VERSION = 1 as const

export interface QuizBankExport {
  version: typeof QUIZ_BANK_EXPORT_VERSION
  categories: Array<{ name: string, order?: number }>
  questions: Array<{
    category: string
    value: number
    text: string
    kind?: QuestionKind
    answers: Array<{ text: string, isCorrect: boolean }>
  }>
}

function isQuestionValue(value: number): value is QuestionValue {
  return (QUESTION_VALUES as readonly number[]).includes(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  return value as Record<string, unknown>
}

export function serializeQuizBank(bank: QuizBank): QuizBankExport {
  const categories = [...bank.categories].sort((left, right) => left.order - right.order)
  const nameById = new Map(categories.map(category => [category.id, category.name]))

  return {
    version: QUIZ_BANK_EXPORT_VERSION,
    categories: categories.map(category => ({
      name: category.name,
      order: category.order,
    })),
    questions: [...bank.questions]
      .sort((left, right) => {
        const leftOrder = categories.find(category => category.id === left.categoryId)?.order ?? 99
        const rightOrder = categories.find(category => category.id === right.categoryId)?.order ?? 99
        if (leftOrder !== rightOrder)
          return leftOrder - rightOrder
        return left.value - right.value
      })
      .map(question => ({
        category: nameById.get(question.categoryId) ?? 'Без категории',
        value: question.value,
        text: question.text,
        kind: questionKind(question),
        answers: question.answers.map(answer => ({
          text: answer.text,
          isCorrect: answer.isCorrect,
        })),
      })),
  }
}

function readName(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} должно быть непустой строкой`)
  return value.trim()
}

function hintedKind(raw: unknown): QuestionKind | 'unknown' {
  if (typeof raw === 'string' && (QUESTION_KINDS as readonly string[]).includes(raw))
    return raw as QuestionKind
  return 'unknown'
}

function parseKind(raw: unknown, answers: Array<{ isCorrect: boolean }>): QuestionKind {
  const hinted = hintedKind(raw)
  if (hinted !== 'unknown')
    return hinted
  if (answers.length <= 1)
    return 'free'
  if (answers.filter(answer => answer.isCorrect).length > 1)
    return 'multi'
  return 'single'
}

function parseAnswers(raw: unknown, questionLabel: string, kind: QuestionKind | 'unknown' = 'unknown') {
  if (kind === 'free' && (raw === undefined || (Array.isArray(raw) && raw.length === 0)))
    return []

  if (!Array.isArray(raw))
    throw new Error(`${questionLabel}: нужны ответы`)

  const answers = raw.map((item, index) => {
    const record = asRecord(item)
    if (!record)
      throw new Error(`${questionLabel}: ответ ${index + 1} некорректен`)

    const text = readName(record.text, `${questionLabel}: текст ответа ${index + 1}`)
    if (typeof record.isCorrect !== 'boolean')
      throw new Error(`${questionLabel}: у ответа «${text}» нет флага isCorrect`)

    return { text, isCorrect: record.isCorrect }
  })

  const resolved = kind === 'unknown' ? parseKind(undefined, answers) : kind

  if (resolved === 'free')
    return answers.slice(0, 1)

  if (answers.length < 2 || answers.length > 6)
    throw new Error(`${questionLabel}: нужно от 2 до 6 ответов`)

  const correct = answers.filter(answer => answer.isCorrect).length
  if (resolved === 'single' && correct !== 1)
    throw new Error(`${questionLabel}: отметьте ровно один правильный ответ`)
  if (resolved === 'multi' && correct < 2)
    throw new Error(`${questionLabel}: отметьте хотя бы два правильных ответа`)

  return answers
}

function parsePortable(data: Record<string, unknown>): QuizBank {
  const rawCategories = Array.isArray(data.categories) ? data.categories : []
  const rawQuestions = Array.isArray(data.questions) ? data.questions : []

  if (!rawQuestions.length && !rawCategories.length)
    throw new Error('В файле нет категорий и вопросов')

  const categories: Category[] = []
  const idByName = new Map<string, string>()

  rawCategories.forEach((item, index) => {
    const record = asRecord(item)
    if (!record)
      throw new Error(`Категория ${index + 1} некорректна`)

    const name = readName(record.name, `Категория ${index + 1}`)
    if (idByName.has(name))
      return

    const category: Category = {
      id: createId('cat'),
      name,
      order: typeof record.order === 'number' ? record.order : categories.length,
    }
    idByName.set(name, category.id)
    categories.push(category)
  })

  const questions: Question[] = []
  const usedSlots = new Set<string>()

  rawQuestions.forEach((item, index) => {
    const record = asRecord(item)
    if (!record)
      throw new Error(`Вопрос ${index + 1} некорректен`)

    const categoryName = readName(record.category ?? record.categoryName, `Вопрос ${index + 1}: категория`)
    let categoryId = idByName.get(categoryName)
    if (!categoryId) {
      const category: Category = {
        id: createId('cat'),
        name: categoryName,
        order: categories.length,
      }
      idByName.set(categoryName, category.id)
      categories.push(category)
      categoryId = category.id
    }

    if (typeof record.value !== 'number' || !isQuestionValue(record.value))
      throw new Error(`Вопрос ${index + 1}: номинал должен быть одним из ${QUESTION_VALUES.join(', ')}`)

    const text = readName(record.text, `Вопрос ${index + 1}`)
    const slot = `${categoryId}:${record.value}`
    if (usedSlots.has(slot))
      throw new Error(`Два вопроса на номинал ${record.value} в категории «${categoryName}»`)
    usedSlots.add(slot)

    const answers = parseAnswers(record.answers, `Вопрос ${index + 1}`, hintedKind(record.kind))
    const kind = parseKind(record.kind, answers)
    questions.push({
      id: createId('q'),
      categoryId,
      value: record.value,
      text,
      kind,
      answers: answers.map(answer => ({
        id: createId('a'),
        text: answer.text,
        isCorrect: answer.isCorrect,
      })),
    })
  })

  return {
    categories: categories
      .sort((left, right) => left.order - right.order)
      .map((category, index) => ({ ...category, order: index })),
    questions,
  }
}

function parseInternal(data: Record<string, unknown>): QuizBank | null {
  const rawCategories = data.categories
  const rawQuestions = data.questions
  if (!Array.isArray(rawCategories) || !Array.isArray(rawQuestions))
    return null

  const looksInternal = rawCategories.some(item => asRecord(item)?.id)
    || rawQuestions.some(item => asRecord(item)?.categoryId)
  if (!looksInternal)
    return null

  const categories: Category[] = rawCategories.map((item, index) => {
    const record = asRecord(item)
    if (!record)
      throw new Error(`Категория ${index + 1} некорректна`)

    return {
      id: typeof record.id === 'string' && record.id ? record.id : createId('cat'),
      name: readName(record.name, `Категория ${index + 1}`),
      order: typeof record.order === 'number' ? record.order : index,
    }
  })

  const categoryIds = new Set(categories.map(category => category.id))
  const usedSlots = new Set<string>()

  const questions: Question[] = rawQuestions.map((item, index) => {
    const record = asRecord(item)
    if (!record)
      throw new Error(`Вопрос ${index + 1} некорректен`)

    const categoryId = readName(record.categoryId, `Вопрос ${index + 1}: categoryId`)
    if (!categoryIds.has(categoryId))
      throw new Error(`Вопрос ${index + 1}: неизвестная категория`)

    if (typeof record.value !== 'number' || !isQuestionValue(record.value))
      throw new Error(`Вопрос ${index + 1}: номинал должен быть одним из ${QUESTION_VALUES.join(', ')}`)

    const slot = `${categoryId}:${record.value}`
    if (usedSlots.has(slot))
      throw new Error(`Вопрос ${index + 1}: номинал ${record.value} уже занят`)
    usedSlots.add(slot)

    const answers = parseAnswers(record.answers, `Вопрос ${index + 1}`, hintedKind(record.kind))
    return {
      id: typeof record.id === 'string' && record.id ? record.id : createId('q'),
      categoryId,
      value: record.value,
      text: readName(record.text, `Вопрос ${index + 1}`),
      kind: parseKind(record.kind, answers),
      answers: answers.map(answer => ({
        id: createId('a'),
        text: answer.text,
        isCorrect: answer.isCorrect,
      })),
    }
  })

  return {
    categories: categories
      .sort((left, right) => left.order - right.order)
      .map((category, index) => ({ ...category, order: index })),
    questions,
  }
}

export function parseQuizBankJson(raw: unknown): QuizBank {
  const data = asRecord(raw)
  if (!data)
    throw new Error('JSON должен быть объектом с категориями и вопросами')

  const internal = parseInternal(data)
  if (internal)
    return internal

  return parsePortable(data)
}
