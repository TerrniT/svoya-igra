<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useQuizBank } from '@/composables/useQuizBank'
import { useRoom } from '@/composables/useRoom'

const router = useRouter()
const route = useRoute()
const room = useRoom()
const { getBank, categories, questions } = useQuizBank()

onMounted(() => {
  const guests = route.name !== 'lobby' && route.name !== 'join'
  void room.reconnect(guests)
})

watch(
  () => [room.phase.value, room.snapshot.value?.currentQuestionId] as const,
  ([phase, questionId]) => {
    if (!room.snapshot.value || !phase)
      return

    if (phase === 'lobby' && (route.name === 'join' || route.name === 'board' || route.name === 'question' || route.name === 'results')) {
      router.replace({ name: 'lobby' })
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
  },
)

watch(() => room.lastNotice.value, (notice) => {
  if (!notice)
    return

  if (notice.kind === 'correct')
    toast.success(`${notice.playerName ?? 'Игрок'} +${notice.value ?? 0}`)
  if (notice.kind === 'wrong')
    toast.error('Неверно. Можно попробовать ещё раз.')
  if (notice.kind === 'skip')
    toast.message('Вопрос сдали без баллов')
  if (notice.kind === 'closed') {
    toast.error('Комната закрыта')
    router.replace({ name: 'lobby' })
  }
})

watch(() => room.error.value, (message) => {
  if (message)
    toast.error(message)
})

watch(
  [categories, questions, () => room.isHost.value, () => room.phase.value],
  () => {
    if (!room.isHost.value || room.phase.value !== 'lobby' || !room.snapshot.value)
      return
    room.updateBank(getBank())
  },
)
</script>

<template>
  <slot />
</template>
