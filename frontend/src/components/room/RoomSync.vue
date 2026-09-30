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
import { useActiveGame } from '@/composables/useActiveGame'
import { useQuizBank } from '@/composables/useQuizBank'
import { useRoom } from '@/composables/useRoom'
import { isGameId } from '@/games/catalog'

const router = useRouter()
const route = useRoute()
const room = useRoom()
const { activeModule, loadError } = useActiveGame()
const { getBank, categories, questions } = useQuizBank()

onMounted(() => {
  const shouldRestore = route.name !== 'home' && route.name !== 'join'
  void room.reconnect(shouldRestore)
})

watch(
  () => [room.phase.value, room.snapshot.value, activeModule.value, route.name] as const,
  ([phase, snapshot, mod]) => {
    if (!snapshot || !phase || !mod)
      return
    mod.syncRoute(phase, snapshot, router, route)
  },
)

watch(
  () => room.snapshot.value?.gameId,
  (gameId) => {
    if (!gameId)
      return
    if (route.name === 'join' || (route.name === 'game-lobby' && route.params.gameId !== gameId))
      router.replace({ name: 'game-lobby', params: { gameId } })
  },
)

watch(
  () => [room.snapshot.value, room.restoring.value, room.restoreError.value, room.lastCode.value] as const,
  ([snapshot, restoring, restoreError, lastCode]) => {
    if (snapshot || restoring || restoreError)
      return
    const playRoutes = ['board', 'question', 'results', 'whoami-play', 'whoami-results', 'golf-play', 'golf-results', 'deep-question-play']
    if (!lastCode && playRoutes.includes(String(route.name)) && !route.meta.localOnly)
      router.replace({ name: 'home' })
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
  if (notice.kind === 'guessed')
    toast.success(notice.playerName ? `${notice.playerName} угадал!` : 'Угадано!')
  if (notice.kind === 'closed')
    router.replace({ name: 'home' })
})

watch(() => room.error.value, (message) => {
  if (message && !room.restoreError.value)
    toast.error(message)
})

watch(() => loadError.value, (message) => {
  if (message)
    toast.error(message)
})

watch(
  [categories, questions, () => room.isHost.value, () => room.phase.value, () => room.gameId.value],
  () => {
    if (!room.isHost.value || room.phase.value !== 'lobby' || !room.snapshot.value)
      return
    if (room.gameId.value !== 'quiz')
      return
    room.updateBank(getBank())
  },
)

function closeMissingRoom() {
  room.dismissRestoreError()
  router.replace({ name: 'home' })
}

watch(
  () => route.params.gameId,
  (id) => {
    if (route.name === 'game-lobby' && id && !isGameId(String(Array.isArray(id) ? id[0] : id)))
      router.replace({ name: 'home' })
  },
)
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
            ? 'Комната уже закрыта или код больше не действует. Создайте новую или войдите по свежему коду.'
            : (room.lastCode.value ? `Комната ${room.lastCode.value}. Подождите, восстанавливаем игру.` : 'Ищем комнату.') }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter v-if="room.restoreError.value" class="sm:justify-center">
        <Button class="w-full" @click="closeMissingRoom">К играм</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
