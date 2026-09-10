import { createRouter, createWebHistory } from 'vue-router'
import '@/router/types'
import { usePlayState } from '@/composables/usePlayState'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'lobby',
      component: () => import('@/pages/LobbyPage.vue'),
    },
    {
      path: '/join/:code?',
      name: 'join',
      component: () => import('@/pages/JoinPage.vue'),
    },
    {
      path: '/game',
      name: 'board',
      component: () => import('@/pages/BoardPage.vue'),
      meta: { requiresPlayers: true },
    },
    {
      path: '/game/question/:id',
      name: 'question',
      component: () => import('@/pages/QuestionPage.vue'),
      meta: { requiresPlayers: true },
    },
    {
      path: '/game/results',
      name: 'results',
      component: () => import('@/pages/ResultsPage.vue'),
      meta: { requiresPlayers: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/pages/AdminPage.vue'),
      meta: { requiresHost: true },
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const { players, inRoom, canEditBank, room } = usePlayState()

  if (to.meta.requiresHost && !canEditBank.value)
    return { name: 'lobby' }

  if (!to.meta.requiresPlayers)
    return true

  if (inRoom.value || room.lastCode.value || room.connecting.value)
    return true
  if (players.value.length === 0)
    return { name: 'lobby' }

  return true
})

export default router
