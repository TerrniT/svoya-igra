<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'
import { figureColor, isPlatformsPayload } from '@/games/platforms/driver'

const room = useRoom()
const restarting = ref(false)

const payload = computed(() => {
  const value = room.snapshot.value?.payload
  return isPlatformsPayload(value) ? value : null
})

const players = computed(() => room.snapshot.value?.session.players ?? [])
const isHost = computed(() => room.isHost.value)

const winner = computed(() => {
  const id = payload.value?.winnerId
  if (!id)
    return null
  return players.value.find(player => player.id === id) ?? null
})

const fallen = computed(() =>
  [...(payload.value?.eliminated ?? [])].reverse().map((id, index) => {
    const player = players.value.find(item => item.id === id)
    return {
      id,
      name: player?.name ?? 'Игрок',
      place: index + 2,
      color: figureColor(payload.value?.order ?? [], id),
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
    <p class="platforms-kicker">Последний устоял</p>
    <h1 class="font-display text-4xl tracking-[0.1em] uppercase sm:text-5xl">
      {{ winner?.name ?? 'Никто' }}
    </h1>
    <p class="text-muted-foreground">
      {{ winner ? 'Остался на поле, когда платформы кончились.' : 'Поле опустело.' }}
    </p>

    <ol v-if="fallen.length" class="flex flex-col gap-2 text-left">
      <li
        v-for="row in fallen"
        :key="row.id"
        class="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2"
      >
        <span class="flex items-center gap-2">
          <span class="dot" :style="{ background: row.color }" />
          <span class="font-medium">{{ row.name }}</span>
        </span>
        <span class="text-muted-foreground text-sm">{{ row.place }} место</span>
      </li>
    </ol>

    <Button v-if="isHost" size="lg" :disabled="restarting" @click="playAgain">
      Ещё раз
    </Button>
    <p v-else class="text-muted-foreground text-sm">Ждём, пока ведущий запустит новый раунд.</p>
  </div>
</template>

<style scoped>
.platforms-kicker {
  font-family: var(--font-board);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 0.72rem;
  color: var(--primary);
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
}
</style>
