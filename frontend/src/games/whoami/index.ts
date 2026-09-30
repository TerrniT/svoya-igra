import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { GameModule } from '@/games/types'
import { whoamiDriver } from './driver'
import WhoamiShellNav from './components/ShellNav.vue'

function syncRoute(
  phase: string,
  _snapshot: { phase: string, payload: unknown },
  router: Router,
  route: RouteLocationNormalizedLoaded,
) {
  if (phase === 'lobby' && (route.name === 'whoami-play' || route.name === 'whoami-results')) {
    router.replace({ name: 'game-lobby', params: { gameId: 'whoami' } })
    return
  }

  if (phase === 'play' && route.name !== 'whoami-play') {
    router.replace({ name: 'whoami-play' })
    return
  }

  if (phase === 'results' && route.name !== 'whoami-results')
    router.replace({ name: 'whoami-results' })
}

export const whoamiModule: GameModule = {
  id: 'whoami',
  driver: whoamiDriver,
  routes: [],
  syncRoute,
  ShellNav: WhoamiShellNav,
}

export default whoamiModule
