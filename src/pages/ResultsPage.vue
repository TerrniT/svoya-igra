<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CrownIcon, PawPrintIcon } from '@lucide/vue'
import FirstChooserDialog from '@/components/room/FirstChooserDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlayState } from '@/composables/usePlayState'
import { cn } from '@/lib/utils'

const router = useRouter()
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

const pickerOpen = ref(false)

const winner = computed(() => rankedPlayers.value[0])
const maxScore = computed(() => Math.max(1, ...rankedPlayers.value.map(player => player.score)))
const answeredCount = computed(() => answeredQuestionIds.value.length)

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
  <div class="mx-auto flex max-w-2xl flex-col gap-6">
    <section class="flex flex-col items-center gap-3 pt-2 text-center">
      <Badge variant="secondary">Конец охоты</Badge>
      <h1 class="font-display text-4xl tracking-[0.14em] uppercase sm:text-5xl">Статистика</h1>
      <p class="text-muted-foreground">
        Сыграно вопросов: {{ answeredCount }} из {{ questions.length }}
      </p>
    </section>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CrownIcon class="text-primary" />
          {{ winner ? `${winner.name} впереди` : 'Нет игроков' }}
        </CardTitle>
        <CardDescription>
          {{ inRoom
            ? 'Баллы получал тот, кто первым дал верный ответ со своего устройства.'
            : 'После каждого верного ответа баллы уходили выбранному игроку.' }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol class="flex flex-col gap-3">
          <li
            v-for="(player, index) in rankedPlayers"
            :key="player.id"
            class="flex flex-col gap-2 rounded-xl border p-3"
            :class="player.id === meId ? 'player-me' : 'border-border/80 bg-muted/20'"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span
                  :class="cn(
                    'font-board text-2xl',
                    index === 0 ? 'text-primary' : 'text-muted-foreground',
                  )"
                >
                  {{ index + 1 }}
                </span>
                <span class="truncate text-lg font-medium">{{ player.name }}</span>
                <Badge v-if="player.id === meId">Вы</Badge>
              </div>
              <span class="font-board text-primary text-3xl">{{ player.score }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-all"
                :style="{ width: `${Math.round((player.score / maxScore) * 100)}%` }"
              />
            </div>
          </li>
        </ol>
      </CardContent>
      <CardFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button variant="outline" class="w-full sm:w-auto" @click="backToLobby">
          К игрокам
        </Button>
        <Button v-if="!inRoom || isHost" size="lg" class="w-full sm:w-auto" @click="playAgain">
          <PawPrintIcon data-icon="inline-start" />
          Ещё партия
        </Button>
      </CardFooter>
    </Card>

    <FirstChooserDialog
      v-model:open="pickerOpen"
      :players
      @pick="confirmFirstChooser"
    />
  </div>
</template>
