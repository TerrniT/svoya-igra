<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayState } from '@/composables/usePlayState'
import { expectedRespondents } from '@/lib/question-round'
import { cn } from '@/lib/utils'

const route = useRoute()
const { rosterPlayers, inRoom, meId, chooserId, room, getQuestion, quizPayload } = usePlayState()

const onQuestion = computed(() => route.name === 'question')
const showScores = computed(() =>
  route.name === 'board' || (route.name === 'question' && !inRoom.value),
)

const questionStatuses = computed(() => {
  if (!onQuestion.value || !inRoom.value || !quizPayload.value)
    return []

  const question = quizPayload.value.currentQuestionId
    ? getQuestion(quizPayload.value.currentQuestionId)
    : undefined
  if (!question)
    return []

  const players = room.snapshot.value?.session.players ?? []
  const submitted = new Set((quizPayload.value.submissions ?? []).map(item => item.playerId))
  const respondents = expectedRespondents(question, players)
  const extras = players.filter((player) => {
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
</template>
