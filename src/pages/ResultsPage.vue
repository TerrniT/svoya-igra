<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PawPrintIcon } from '@lucide/vue'
import FirstChooserDialog from '@/components/room/FirstChooserDialog.vue'
import ResultsCeremony from '@/components/results/ResultsCeremony.vue'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'
import type { CeremonyPlayer } from '@/composables/useResultsCeremony'

const DEMO_PLAYERS: CeremonyPlayer[] = [
  { id: 'demo-1', name: 'Лео', score: 2400 },
  { id: 'demo-2', name: 'Мара', score: 1700 },
  { id: 'demo-3', name: 'Куш', score: 1100 },
  { id: 'demo-4', name: 'Тень', score: 600 },
  { id: 'demo-5', name: 'Ирис', score: 300 },
]

const router = useRouter()
const route = useRoute()
const {
  inRoom,
  isHost,
  meId,
  room,
  players,
  rankedPlayers,
  answeredQuestionIds,
  questions,
  startGame,
} = usePlayState()

const answeredCount = computed(() => answeredQuestionIds.value.length)

const pickerOpen = ref(false)
const ceremonyDone = ref(false)

const ceremonyPlayers = computed<CeremonyPlayer[]>(() => {
  if (route.query.demo === '1')
    return DEMO_PLAYERS

  return rankedPlayers.value.map(player => ({
    id: player.id,
    name: player.name,
    score: player.score,
  }))
})

const showActions = computed(() => ceremonyPlayers.value.length > 0 && ceremonyDone.value)

function playAgain() {
  pickerOpen.value = true
}

function confirmFirstChooser(playerId: string) {
  startGame(playerId)
  if (!inRoom.value)
    router.push({ name: 'board' })
}

function backToLobby() {
  if (inRoom.value && isHost.value) {
    room.leaveRoom()
    return
  }
  router.push({ name: 'lobby' })
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-8">
    <ResultsCeremony
      v-if="ceremonyPlayers.length"
      :players="ceremonyPlayers"
      :me-id="meId"
      @done="ceremonyDone = $event"
    />

    <p v-else class="text-muted-foreground py-16 text-center">
      Нет игроков
    </p>

    <p
      v-if="showActions && route.query.demo !== '1'"
      class="text-muted-foreground text-center text-sm"
    >
      Сыграно вопросов: {{ answeredCount }} из {{ questions.length }}
    </p>

    <div
      v-if="showActions"
      class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"
    >
      <Button variant="outline" class="w-full sm:w-auto" @click="backToLobby">
        К игрокам
      </Button>
      <Button v-if="!inRoom || isHost" size="lg" class="w-full sm:w-auto" @click="playAgain">
        <PawPrintIcon data-icon="inline-start" />
        Ещё партия
      </Button>
    </div>

    <FirstChooserDialog
      v-model:open="pickerOpen"
      :players
      @pick="confirmFirstChooser"
    />
  </div>
</template>
