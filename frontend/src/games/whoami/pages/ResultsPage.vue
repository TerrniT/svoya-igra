<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRoom } from '@/composables/useRoom'
import type { WhoamiPayload } from '@/games/whoami/driver'

const room = useRoom()
const restarting = ref(false)

const payload = computed(() => room.snapshot.value?.payload as WhoamiPayload | undefined)
const players = computed(() => room.snapshot.value?.session.players ?? [])
const isHost = computed(() => room.isHost.value)

const results = computed(() =>
  players.value.map((player) => {
    const card = payload.value?.cards[player.id]
    return {
      player,
      text: card?.text ?? '—',
      guessed: Boolean(card?.guessed),
    }
  }),
)

function playAgain() {
  restarting.value = true
  try {
    room.playAgain()
  }
  finally {
    restarting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-lg flex-col gap-6 text-center">
    <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-4xl">
      Все угаданы!
    </h1>
    <p class="text-muted-foreground">
      Вот кто кем был.
    </p>

    <Card>
      <CardHeader>
        <CardTitle>Итог</CardTitle>
        <CardDescription>Карточки раунда</CardDescription>
      </CardHeader>
      <CardContent>
        <ul class="flex flex-col gap-3 text-left">
          <li
            v-for="row in results"
            :key="row.player.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
          >
            <span class="font-medium">{{ row.player.name }}</span>
            <span class="font-display text-xl tracking-[0.06em] uppercase">{{ row.text }}</span>
          </li>
        </ul>
      </CardContent>
    </Card>

    <Button v-if="isHost" size="lg" :disabled="restarting" @click="playAgain">
      Ещё раз
    </Button>
    <p v-else class="text-muted-foreground text-sm">Ждём, пока ведущий запустит новый раунд.</p>
  </div>
</template>
