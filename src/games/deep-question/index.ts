import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameModule } from '@/games/types'
import DeepQuestionShellNav from './components/ShellNav.vue'
import { deepQuestionDriver } from './driver'

function syncRoute(
  phase: string,
  _snapshot: { phase: string, payload: unknown },
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  if (phase === 'lobby' && route.name === 'deep-question-play') {
    router.replace({ name: 'game-lobby', params: { gameId: 'deep-question' } })
    return
  }

  if (phase === 'play' && route.name !== 'deep-question-play') {
    router.replace({ name: 'deep-question-play' })
    return
  }
}

export const deepQuestionModule: GameModule = {
  id: 'deep-question',
  driver: deepQuestionDriver,
  routes: [],
  syncRoute,
  ShellNav: DeepQuestionShellNav,
}

export default deepQuestionModule
