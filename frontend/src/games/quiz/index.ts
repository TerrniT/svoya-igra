import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameModule } from '@/games/types'
import { quizDriver } from './driver'
import type { QuizPayload } from './types'
import QuizShellNav from './components/ShellNav.vue'
import QuizShellStatus from './components/ShellStatus.vue'

function syncRoute(
  phase: string,
  snapshot: { phase: string, payload: unknown },
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  const payload = snapshot.payload as QuizPayload
  const questionId = payload?.currentQuestionId ?? null

  if (phase === 'lobby' && (route.name === 'board' || route.name === 'question' || route.name === 'results')) {
    const gameId = 'quiz'
    router.replace({ name: 'game-lobby', params: { gameId } })
    return
  }

  if (phase === 'board' && route.name !== 'board') {
    router.replace({ name: 'board' })
    return
  }

  if (phase === 'question' && questionId) {
    const current = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
    if (route.name !== 'question' || current !== questionId)
      router.replace({ name: 'question', params: { id: questionId } })
    return
  }

  if (phase === 'results' && route.name !== 'results')
    router.replace({ name: 'results' })
}

export const quizModule: GameModule = {
  id: 'quiz',
  driver: quizDriver,
  routes: [],
  syncRoute,
  ShellNav: QuizShellNav,
  ShellStatus: QuizShellStatus,
}

export default quizModule
