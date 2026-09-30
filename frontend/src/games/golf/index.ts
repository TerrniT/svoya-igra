import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameModule } from '@/games/types'
import { golfDriver } from './driver'
import GolfShellNav from './components/ShellNav.vue'

function syncRoute(
  phase: string,
  _snapshot: { phase: string, payload: unknown },
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  if (phase === 'lobby' && (route.name === 'golf-play' || route.name === 'golf-results')) {
    router.replace({ name: 'game-lobby', params: { gameId: 'golf' } })
    return
  }

  if (phase === 'play' && route.name !== 'golf-play') {
    router.replace({ name: 'golf-play' })
    return
  }

  if (phase === 'results' && route.name !== 'golf-results')
    router.replace({ name: 'golf-results' })
}

export const golfModule: GameModule = {
  id: 'golf',
  driver: golfDriver,
  routes: [],
  syncRoute,
  ShellNav: GolfShellNav,
}

export default golfModule
