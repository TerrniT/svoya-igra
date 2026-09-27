<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRightIcon, RotateCcwIcon, SparklesIcon } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useDeepQuestionGame } from '@/composables/useDeepQuestionGame'
import { useRoom } from '@/composables/useRoom'
import { type DeepQuestionCategory } from '../data.ru'
import { isDeepQuestionPayload } from '../types'

const route = useRoute()
const room = useRoom()
const category = computed<DeepQuestionCategory>(() =>
  route.query.category === 'partner' ? 'partner' : 'friends',
)
const localGame = useDeepQuestionGame(category)
const categoryLabel = computed(() =>
  category.value === 'partner' ? 'С партнёром' : 'С друзьями',
)

const isRoom = computed(() => room.gameId.value === 'deep-question')
const roomPayload = computed(() => {
  const payload = room.snapshot.value?.payload
  return isDeepQuestionPayload(payload) ? payload : null
})
const currentQuestion = computed(() => {
  if (!isRoom.value)
    return localGame.currentQuestion.value

  const id = roomPayload.value?.currentQuestionId
  return roomPayload.value?.questions.find(question => question.id === id) ?? null
})
const askedCount = computed(() =>
  isRoom.value
    ? roomPayload.value?.usedQuestionIds.length ?? 0
    : localGame.askedCount.value,
)
const totalQuestions = computed(() =>
  roomPayload.value?.questions.length ?? localGame.totalQuestions.value,
)
const canAdvance = computed(() => !isRoom.value || room.isHost.value)

function nextQuestion() {
  if (isRoom.value) {
    room.sendGame({ type: 'nextQuestion' })
    return
  }
  localGame.nextQuestion()
}

function resetGame() {
  if (isRoom.value) {
    room.playAgain()
    return
  }
  localGame.reset()
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 sm:gap-8">
    <section class="flex flex-col gap-3 pt-1 text-center sm:pt-4">
      <Badge variant="secondary" class="mx-auto">
        {{ isRoom ? `Комната ${room.code.value}` : 'Один экран' }}
      </Badge>
      <Badge v-if="!isRoom" variant="outline" class="mx-auto">{{ categoryLabel }}</Badge>
      <h1 class="font-display text-3xl tracking-[0.12em] text-balance uppercase sm:text-5xl sm:tracking-[0.14em]">
        Глубокие вопросы
      </h1>
      <p class="text-muted-foreground mx-auto max-w-2xl text-pretty text-sm sm:text-base">
        Один вопрос — один повод поговорить честнее. Отвечать можно вслух или просто пропустить вопрос.
      </p>
    </section>

    <Card class="deep-question-card">
      <CardHeader class="items-center text-center">
        <div class="flex flex-wrap items-center justify-center gap-2">
          <Badge variant="outline">Вопрос {{ askedCount }} из {{ totalQuestions }}</Badge>
          <Badge v-if="isRoom" variant="secondary">Ведущий управляет экраном</Badge>
        </div>
        <CardTitle class="sr-only">Текущий вопрос</CardTitle>
      </CardHeader>
      <CardContent class="flex min-h-56 items-center justify-center px-6 py-10 text-center sm:min-h-72 sm:px-12">
        <p v-if="currentQuestion" class="font-display max-w-3xl text-3xl leading-tight text-balance sm:text-5xl">
          {{ currentQuestion.title }}
        </p>
        <div v-else class="flex max-w-md flex-col items-center gap-3 text-center">
          <SparklesIcon class="text-primary size-10" aria-hidden="true" />
          <p class="font-display text-2xl sm:text-3xl">Готовы поговорить глубже?</p>
          <p class="text-muted-foreground text-sm">
            Нажмите кнопку ниже — приложение выберет случайный вопрос из коллекции.
          </p>
        </div>
      </CardContent>
      <CardFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button
          variant="ghost"
          class="w-full sm:w-auto"
          :disabled="isRoom && !room.isHost.value"
          @click="resetGame"
        >
          <RotateCcwIcon data-icon="inline-start" />
          Начать сначала
        </Button>
        <Button
          size="lg"
          class="deep-question-next-button w-full sm:w-auto"
          :disabled="!canAdvance"
          @click="nextQuestion"
        >
          <ArrowRightIcon data-icon="inline-start" />
          Следующий вопрос
        </Button>
      </CardFooter>
    </Card>
  </div>
</template>
