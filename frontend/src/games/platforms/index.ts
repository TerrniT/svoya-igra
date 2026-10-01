import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameModule } from '@/games/types'
import { platformsDriver } from './driver'
import PlatformsShellNav from './components/ShellNav.vue'

function syncRoute(
  phase: string,
  _snapshot: { phase: string, payload: unknown },
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  if (phase === 'lobby' && (route.name === 'platforms-play' || route.name === 'platforms-results')) {
    router.replace({ name: 'game-lobby', params: { gameId: 'platforms' } })
    return
  }

  if (phase === 'play' && route.name !== 'platforms-play') {
    router.replace({ name: 'platforms-play' })
    return
  }

  if (phase === 'results' && route.name !== 'platforms-results')
    router.replace({ name: 'platforms-results' })
}

export const platformsModule: GameModule = {
  id: 'platforms',
  driver: platformsDriver,
  routes: [],
  syncRoute,
  ShellNav: PlatformsShellNav,
}

export default platformsModule
