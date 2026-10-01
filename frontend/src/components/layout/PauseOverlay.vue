<script setup lang="ts">
import { computed } from 'vue'
import { PlayIcon } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'

const { inRoom, isHost, room } = usePlayState()

const paused = computed(() => Boolean(inRoom.value && room.snapshot.value?.paused))
</script>

<template>
  <div v-if="paused" class="pause-broadcast" role="status" aria-live="polite">
    <p class="pause-kicker">эфир приостановлен</p>
    <h1 class="pause-word">Пауза</h1>
    <p class="pause-copy">
      {{ isHost ? 'Гости видят этот экран. Когда будете готовы — продолжайте.' : 'Ведущий поставил игру на паузу.' }}
    </p>
    <Button v-if="isHost" size="lg" @click="room.resume()">
      <PlayIcon data-icon="inline-start" />
      Продолжить
    </Button>
  </div>
</template>
