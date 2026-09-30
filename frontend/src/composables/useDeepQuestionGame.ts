import { computed, type Ref } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { DEEP_QUESTIONS, type DeepQuestionCategory } from '@/games/deep-question/data.ru'

interface DeepQuestionLocalState {
  currentQuestionId: string | null
  usedQuestionIds: string[]
}

type DeepQuestionLocalStateByCategory = Record<DeepQuestionCategory, DeepQuestionLocalState>

const STORAGE_KEY = 'svoya-igra:deep-question'

function emptyState(): DeepQuestionLocalState {
  return {
    currentQuestionId: null,
    usedQuestionIds: [],
  }
}

function emptyStateByCategory(): DeepQuestionLocalStateByCategory {
  return {
    partner: emptyState(),
    friends: emptyState(),
  }
}

export function useDeepQuestionGame(category: Ref<DeepQuestionCategory>) {
  const state = useLocalStorage<DeepQuestionLocalStateByCategory>(STORAGE_KEY, emptyStateByCategory)
  const stored = state.value as Partial<DeepQuestionLocalStateByCategory> & Partial<DeepQuestionLocalState>
  if (!stored.partner || !stored.friends) {
    state.value = {
      ...emptyStateByCategory(),
      friends: 'usedQuestionIds' in stored
        ? {
            currentQuestionId: stored.currentQuestionId ?? null,
            usedQuestionIds: stored.usedQuestionIds ?? [],
          }
        : emptyState(),
    }
  }

  const currentQuestion = computed(() =>
    DEEP_QUESTIONS
      .filter(question => question.category === category.value)
      .find(question => question.id === state.value[category.value].currentQuestionId) ?? null,
  )
  const questions = computed(() => DEEP_QUESTIONS.filter(question => question.category === category.value))
  const askedCount = computed(() => state.value[category.value].usedQuestionIds.length)

  function nextQuestion() {
    const activeState = state.value[category.value]
    const available = questions.value.filter(question =>
      !activeState.usedQuestionIds.includes(question.id),
    )

    if (!available.length)
      activeState.usedQuestionIds = []

    const pool = available.length ? available : questions.value
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (!next)
      return

    activeState.currentQuestionId = next.id
    if (!activeState.usedQuestionIds.includes(next.id))
      activeState.usedQuestionIds.push(next.id)
  }

  function reset() {
    state.value[category.value] = emptyState()
  }

  return {
    currentQuestion,
    askedCount,
    totalQuestions: computed(() => questions.value.length),
    nextQuestion,
    reset,
  }
}
