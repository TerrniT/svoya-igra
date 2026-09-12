<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2Icon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

watch(
  () => [room.snapshot.value, room.restoring.value, room.restoreError.value, room.lastCode.value] as const,
  ([snapshot, restoring, restoreError, lastCode]) => {
    if (snapshot || restoring || restoreError)
      return
    if (!lastCode && (route.name === 'board' || route.name === 'question' || route.name === 'results'))
      router.replace({ name: 'lobby' })
  },
)

watch(() => room.lastNotice.value, (notice) => {
  if (!notice)
    return

  if (notice.kind === 'revealed')
    toast.message('Все ответы на столе')
  if (notice.kind === 'awarded')
    toast.success(notice.value ? `Ведущий начислил по ${notice.value}` : 'Очки начислены')
  if (notice.kind === 'skip')
    toast.message('Вопрос сдали без баллов')
  if (notice.kind === 'closed')
    router.replace({ name: 'lobby' })
})

watch(() => room.error.value, (message) => {
  if (message && !room.restoreError.value)
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

function closeMissingRoom() {
  room.dismissRestoreError()
  router.replace({ name: 'lobby' })
}
</script>

<template>
  <slot />

  <Dialog
    :open="room.restoring.value || Boolean(room.restoreError.value)"
    :modal="true"
    @update:open="open => { if (!open && room.restoreError.value) closeMissingRoom() }"
  >
    <DialogContent
      class="sm:max-w-sm"
      :show-close-button="Boolean(room.restoreError.value)"
      @pointer-down-outside.prevent
      @escape-key-down.prevent
      @interact-outside.prevent
    >
      <DialogHeader class="items-center text-center">
        <Loader2Icon v-if="room.restoring.value" class="text-primary size-10 animate-spin" />
        <DialogTitle>
          {{ room.restoreError.value || 'Подключаемся к комнате' }}
        </DialogTitle>
        <DialogDescription>
          {{ room.restoreError.value
            ? 'Ведущий закрыл вкладку или комната уже не существует. Создайте новую или войдите по свежему коду.'
            : (room.lastCode.value ? `Комната ${room.lastCode.value}. Подождите, восстанавливаем игру.` : 'Ищем комнату ведущего.') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter v-if="room.restoreError.value" class="sm:justify-center">
        <Button class="w-full" @click="closeMissingRoom">К игрокам</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
