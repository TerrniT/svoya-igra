<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'
import { expectedRespondents } from '@/lib/question-round'
import { cn } from '@/lib/utils'

const route = useRoute()
const { rosterPlayers, inRoom, canEditBank, meId, me, chooserId, room, getQuestion } = usePlayState()

const onQuestion = computed(() => route.name === 'question')
const showScores = computed(() =>
  route.name === 'board' || (route.name === 'question' && !inRoom.value),
)

const questionStatuses = computed(() => {
  if (!onQuestion.value || !inRoom.value)
    return []

  const snapshot = room.snapshot.value
  const question = snapshot?.currentQuestionId ? getQuestion(snapshot.currentQuestionId) : undefined
  if (!question)
    return []

  const submitted = new Set((snapshot?.submissions ?? []).map(item => item.playerId))
  const respondents = expectedRespondents(question, snapshot?.session.players ?? [])
  const extras = (snapshot?.session.players ?? []).filter((player) => {
    if (respondents.some(item => item.id === player.id))
      return false
    return submitted.has(player.id)
  })

  return [...respondents, ...extras].map(player => ({
    id: player.id,
    name: player.name,
    mine: player.id === meId.value,
    done: submitted.has(player.id),
  }))
})
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
            <span class="font-display hidden sm:block text-lg tracking-[0.14em] text-foreground uppercase sm:text-2xl sm:tracking-[0.18em]">Своя игра</span>
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
          <template v-if="canEditBank && route.name !== 'join'">
            <Button variant="ghost" size="sm" as-child>
              <RouterLink to="/game">Поле</RouterLink>
            </Button>
            <Button variant="outline" size="sm" as-child>
              <RouterLink to="/admin">Админка</RouterLink>
            </Button>
          </template>
        </nav>
      </div>

      <p v-if="inRoom && me" class="text-muted-foreground mx-auto max-w-7xl px-3 pb-2 text-xs sm:hidden">
        Вы в игре как <span class="text-foreground font-medium">{{ me.name }}</span>
      </p>

      <div v-if="onQuestion && inRoom && questionStatuses.length" class="border-t border-border/50 bg-card/40">
        <div class="scores-rail mx-auto max-w-7xl px-3 py-2 sm:px-6">
          <div
            v-for="player in questionStatuses"
            :key="player.id"
            :class="cn(
              'score-chip',
              player.mine && 'score-chip-me',
              player.done ? 'status-chip-done' : 'status-chip-thinking',
            )"
          >
            <span :class="cn('status-dot', player.done && 'status-dot-done')" aria-hidden="true" />
            <span class="truncate font-medium">{{ player.name }}</span>
            <span v-if="player.mine" class="text-primary text-[0.65rem] tracking-[0.16em] uppercase">Вы</span>
            <span class="text-xs tracking-[0.12em] uppercase">{{ player.done ? 'ответил' : 'думает' }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="showScores && rosterPlayers.length" class="border-t border-border/50 bg-card/40">
        <div class="scores-rail mx-auto max-w-7xl px-3 py-2 sm:px-6">
          <div
            v-for="player in rosterPlayers"
            :key="player.id"
            :class="cn(
              'score-chip',
              player.id === meId && 'score-chip-me',
              player.id === chooserId && 'score-chip-chooser',
            )"
          >
            <span class="truncate font-medium">{{ player.name }}</span>
            <span v-if="player.id === meId" class="text-primary text-[0.65rem] tracking-[0.16em] uppercase">Вы</span>
            <span v-if="player.id === chooserId" class="chooser-now">ходит</span>
            <span v-if="player.scoring" class="font-board text-lg text-primary">{{ player.score }}</span>
            <span v-else class="text-muted-foreground text-[0.65rem] tracking-[0.16em] uppercase">ведущий</span>
          </div>
        </div>
      </div>
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <slot />
    </main>
  </div>
</template>
