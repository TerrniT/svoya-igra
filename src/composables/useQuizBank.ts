import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { createId } from '@/lib/ids'
import { createSeedBank } from '@/lib/seed'
import type { Category, Question, QuestionValue, QuizBank } from '@/lib/types'

const STORAGE_KEY = 'svoya-igra:quiz-bank'

export function useQuizBank() {
  const bank = useLocalStorage<QuizBank>(STORAGE_KEY, createSeedBank)

  const categories = computed(() =>
    [...bank.value.categories].sort((left, right) => left.order - right.order),
  )

  const questions = computed(() => bank.value.questions)

  function questionAt(categoryId: string, value: QuestionValue) {
    return bank.value.questions.find(question =>
      question.categoryId === categoryId && question.value === value,
    )
  }

  function getQuestion(id: string) {
    return bank.value.questions.find(question => question.id === id)
  }

  function addCategory(name: string) {
    const trimmed = name.trim()
    if (!trimmed)
      return null

    const category: Category = {
      id: createId('cat'),
      name: trimmed,
      order: bank.value.categories.length,
    }

    bank.value.categories.push(category)
    return category
  }

  function updateCategory(id: string, name: string) {
    const category = bank.value.categories.find(item => item.id === id)
    if (!category)
      return

    const trimmed = name.trim()
    if (!trimmed)
      return

    category.name = trimmed
  }

  function removeCategory(id: string) {
    bank.value.categories = bank.value.categories.filter(item => item.id !== id)
    bank.value.questions = bank.value.questions.filter(item => item.categoryId !== id)
    bank.value.categories.forEach((item, index) => {
      item.order = index
    })
  }

  function moveCategory(id: string, direction: -1 | 1) {
    const sorted = [...bank.value.categories].sort((left, right) => left.order - right.order)
    const index = sorted.findIndex(item => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= sorted.length)
      return

    const current = sorted[index]
    const neighbor = sorted[target]
    if (!current || !neighbor)
      return

    const currentOrder = current.order
    current.order = neighbor.order
    neighbor.order = currentOrder
  }

  function upsertQuestion(input: Omit<Question, 'id'> & { id?: string }) {
    const existing = input.id
      ? bank.value.questions.find(item => item.id === input.id)
      : undefined

    const duplicate = bank.value.questions.find(item =>
      item.categoryId === input.categoryId
      && item.value === input.value
      && item.id !== existing?.id,
    )

    if (duplicate)
      throw new Error('В этой категории уже есть вопрос с таким номиналом')

    if (existing) {
      existing.categoryId = input.categoryId
      existing.value = input.value
      existing.text = input.text
      existing.answers = input.answers
      return existing
    }

    const created: Question = {
      id: createId('q'),
      categoryId: input.categoryId,
      value: input.value,
      text: input.text,
      answers: input.answers,
    }

    bank.value.questions.push(created)
    return created
  }

  function removeQuestion(id: string) {
    bank.value.questions = bank.value.questions.filter(item => item.id !== id)
  }

  function getBank(): QuizBank {
    return bank.value
  }

  return {
    getBank,
    categories,
    questions,
    questionAt,
    getQuestion,
    addCategory,
    updateCategory,
    removeCategory,
    moveCategory,
    upsertQuestion,
    removeQuestion,
  }
}
