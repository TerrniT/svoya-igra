import { createRouter, createWebHistory } from 'vue-router'
import '@/router/types'
import { usePlayState } from '@/composables/usePlayState'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/HomePage.vue'),
    },
    {
      path: '/g/:gameId',
      name: 'game-lobby',
      component: () => import('@/pages/GameLobbyPage.vue'),
    },
    {
      path: '/join/:code?',
      name: 'join',
      component: () => import('@/pages/JoinPage.vue'),
    },
    {
      path: '/game',
      name: 'board',
      component: () => import('@/games/quiz/pages/BoardPage.vue'),
      meta: { requiresPlayers: true, gameId: 'quiz' },
    },
    {
      path: '/game/question/:id',
      name: 'question',
      component: () => import('@/games/quiz/pages/QuestionPage.vue'),
      meta: { requiresPlayers: true, gameId: 'quiz' },
    },
    {
      path: '/game/results',
      name: 'results',
      component: () => import('@/games/quiz/pages/ResultsPage.vue'),
      meta: { requiresPlayers: true, gameId: 'quiz' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/games/quiz/pages/AdminPage.vue'),
      meta: { requiresHost: true, gameId: 'quiz' },
    },
    {
      path: '/whoami',
      name: 'whoami-play',
      component: () => import('@/games/whoami/pages/PlayPage.vue'),
      meta: { requiresPlayers: true, gameId: 'whoami' },
    },
    {
      path: '/whoami/results',
      name: 'whoami-results',
      component: () => import('@/games/whoami/pages/ResultsPage.vue'),
      meta: { requiresPlayers: true, gameId: 'whoami' },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const { players, inRoom, canEditBank, room } = usePlayState()

  if (to.meta.requiresHost && !canEditBank.value)
    return { name: 'home' }

  if (!to.meta.requiresPlayers)
    return true

  if (to.name === 'results' && to.query.demo === '1')
    return true

  if (inRoom.value || room.lastCode.value || room.connecting.value)
    return true
  if (players.value.length === 0)
    return { name: 'home' }

  return true
})

export default router
