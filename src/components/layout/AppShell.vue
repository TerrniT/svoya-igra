<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'
import { cn } from '@/lib/utils'

const route = useRoute()
const { rankedPlayers, inRoom, canEditBank, meId, me, room } = usePlayState()

const showScores = computed(() =>
  route.name === 'board' || route.name === 'question' || route.name === 'results',
)
</script>

<template>
  <div class="relative isolate min-h-dvh">
    <div class="leopard-wash" aria-hidden="true" />
    <div class="leopard-spots" aria-hidden="true" />

    <header class="relative z-10 border-b border-border/70 bg-background/70 pt-[max(0.35rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
        <RouterLink to="/" class="group flex min-w-0 items-center gap-2 sm:gap-3">
          <span class="paw-mark shrink-0" aria-hidden="true" />
          <span class="flex min-w-0 flex-col leading-none">
            <span class="font-display text-[0.6rem] tracking-[0.32em] text-primary uppercase sm:text-[0.65rem] sm:tracking-[0.38em]">Savanna night</span>
            <span class="font-display text-lg tracking-[0.14em] text-foreground uppercase sm:text-2xl sm:tracking-[0.18em]">Своя игра</span>
          </span>
        </RouterLink>

        <nav class="flex shrink-0 items-center gap-1 sm:gap-2">
          <span
            v-if="inRoom && room.code.value"
            class="font-board text-primary px-1 text-lg tracking-[0.16em] sm:text-xl sm:tracking-[0.18em]"
          >
            {{ room.code.value }}
          </span>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink to="/">Игроки</RouterLink>
          </Button>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink to="/game">Поле</RouterLink>
          </Button>
          <Button v-if="canEditBank && route.name !== 'join'" variant="outline" size="sm" as-child>
            <RouterLink to="/admin">Админка</RouterLink>
          </Button>
        </nav>
      </div>

      <p v-if="inRoom && me" class="text-muted-foreground mx-auto max-w-7xl px-3 pb-2 text-xs sm:hidden">
        Вы в игре как <span class="text-foreground font-medium">{{ me.name }}</span>
      </p>

      <div v-if="showScores && rankedPlayers.length" class="border-t border-border/50 bg-card/40">
        <div class="scores-rail mx-auto max-w-7xl px-3 py-2 sm:px-6">
          <div
            v-for="player in rankedPlayers"
            :key="player.id"
            :class="cn('score-chip', player.id === meId && 'score-chip-me')"
          >
            <span class="truncate font-medium">{{ player.name }}</span>
            <span v-if="player.id === meId" class="text-primary text-[0.65rem] tracking-[0.16em] uppercase">Вы</span>
            <span class="font-board text-lg text-primary">{{ player.score }}</span>
          </div>
        </div>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <slot />
    </main>
  </div>
</template>
