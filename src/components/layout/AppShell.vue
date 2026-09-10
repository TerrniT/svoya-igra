<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'

const route = useRoute()
const { rankedPlayers, inRoom, isHost, room } = usePlayState()

const showScores = computed(() =>
  route.name === 'board' || route.name === 'question' || route.name === 'results',
)
</script>

<template>
  <div class="relative isolate min-h-dvh">
    <div class="leopard-wash" aria-hidden="true" />
    <div class="leopard-spots" aria-hidden="true" />

    <header class="relative z-10 border-b border-border/70 bg-background/70 backdrop-blur-md">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <RouterLink to="/" class="group flex items-center gap-3">
          <span class="paw-mark" aria-hidden="true" />
          <span class="flex flex-col leading-none">
            <span class="font-display text-[0.65rem] tracking-[0.38em] text-primary uppercase">Savanna night</span>
            <span class="font-display text-xl tracking-[0.18em] text-foreground uppercase sm:text-2xl">Своя игра</span>
          </span>
        </RouterLink>

        <nav class="flex items-center gap-2">
          <span v-if="inRoom && room.code.value" class="font-board text-primary hidden text-xl tracking-[0.18em] sm:inline">
            {{ room.code.value }}
          </span>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink to="/">Игроки</RouterLink>
          </Button>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink to="/game">Поле</RouterLink>
          </Button>
          <Button v-if="isHost" variant="outline" size="sm" as-child>
            <RouterLink to="/admin">Админка</RouterLink>
          </Button>
        </nav>
      </div>

      <div v-if="showScores && rankedPlayers.length" class="border-t border-border/50 bg-card/40">
        <div class="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-2 sm:px-6">
          <div
            v-for="player in rankedPlayers"
            :key="player.id"
            class="score-chip"
          >
            <span class="truncate font-medium">{{ player.name }}</span>
            <span class="font-board text-lg text-primary">{{ player.score }}</span>
          </div>
        </div>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <slot />
    </main>
  </div>
</template>
