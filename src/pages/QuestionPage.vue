<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePlayState } from '@/composables/usePlayState'
import { shuffle } from '@/lib/random'
import { cn } from '@/lib/utils'
import type { Answer } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const {
  inRoom,
  isHost,
  me,
  room,
  players,
  questions,
  categories,
  getQuestion,
  awardPoints,
  skipQuestion,
  isAnswered,
  isBoardComplete,
} = usePlayState()

const questionId = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? raw[0] : raw
})

const question = computed(() => questionId.value ? getQuestion(questionId.value) : undefined)
const categoryName = computed(() => {
  if (!question.value)
    return ''

  return categories.value.find(category => category.id === question.value?.categoryId)?.name ?? ''
})

const shuffledAnswers = ref<Answer[]>([])
const pickedId = ref<string | null>(null)
const verdict = ref<'idle' | 'wrong' | 'correct'>('idle')
const awardOpen = ref(false)
const shake = ref(false)
const winnerName = ref('')

watch(question, (next) => {
  pickedId.value = null
  verdict.value = 'idle'
  awardOpen.value = false
  winnerName.value = ''
  if (inRoom.value && room.snapshot.value?.answers.length)
    shuffledAnswers.value = room.snapshot.value.answers
  else
    shuffledAnswers.value = next ? shuffle(next.answers) : []
}, { immediate: true })

watch(() => room.snapshot.value?.answers, (answers) => {
  if (inRoom.value && answers?.length)
    shuffledAnswers.value = answers
})

watch(question, (next) => {
  if (inRoom.value || !questionId.value)
    return

  if (!next || isAnswered(next.id))
    router.replace({ name: 'board' })
}, { immediate: true })

watch(() => room.lastNotice.value, (notice) => {
  if (!notice || !inRoom.value)
    return

  if (notice.kind === 'wrong') {
    verdict.value = 'wrong'
    shake.value = true
    window.setTimeout(() => {
      shake.value = false
    }, 420)
  }

  if (notice.kind === 'correct') {
    verdict.value = 'correct'
    winnerName.value = notice.playerName ?? ''
  }
})

const correctAnswer = computed(() => question.value?.answers.find(answer => answer.isCorrect))

function finishBoardIfNeeded() {
  const ids = questions.value.map(item => item.id)
  if (isBoardComplete(ids)) {
    router.replace({ name: 'results' })
    return
  }

  router.push({ name: 'board' })
}

function pickAnswer(answer: Answer) {
  if (verdict.value === 'correct' || !question.value)
    return

  pickedId.value = answer.id

  if (inRoom.value) {
    room.answer(question.value.id, answer.id)
    return
  }

  if (!answer.isCorrect) {
    verdict.value = 'wrong'
    shake.value = true
    window.setTimeout(() => {
      shake.value = false
    }, 420)
    toast.error('Неверно. Можно попробовать ещё раз или сдать вопрос.')
    return
  }

  verdict.value = 'correct'
  awardOpen.value = true
}

function award(playerId: string) {
  if (!question.value)
    return

  awardPoints(playerId, question.value.value, question.value.id)
  awardOpen.value = false
  toast.success('Баллы начислены')
  finishBoardIfNeeded()
}

function giveUp() {
  if (!question.value)
    return

  skipQuestion(question.value.id)
  if (!inRoom.value) {
    toast.message(`Правильный ответ: ${correctAnswer.value?.text ?? '—'}`)
    finishBoardIfNeeded()
  }
}

function backToBoard() {
  if (inRoom.value) {
    if (isHost.value)
      room.backToBoard()
    return
  }
  router.push({ name: 'board' })
}
</script>

<template>
  <div v-if="question" class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">
        {{ categoryName }} · {{ question.value }}
      </p>
      <h1 class="font-display text-2xl leading-tight text-balance sm:text-4xl">
        {{ question.text }}
      </h1>
      <p v-if="inRoom && me" class="rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm">
        Вы отвечаете как <span class="font-medium">{{ me.name }}</span>
      </p>
      <p v-if="winnerName" class="text-primary font-medium">
        Верно! Баллы получает {{ winnerName }}.
      </p>
    </div>

    <div :class="cn('grid gap-3', shake && 'shake')">
      <button
        v-for="answer in shuffledAnswers"
        :key="answer.id"
        type="button"
        :disabled="verdict === 'correct'"
        :class="cn(
          'answer-btn',
          pickedId === answer.id && verdict === 'wrong' && !answer.isCorrect && 'answer-btn-wrong',
          verdict === 'correct' && answer.isCorrect && 'answer-btn-right',
        )"
        @click="pickAnswer(answer)"
      >
        {{ answer.text }}
      </button>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
      <Button v-if="!inRoom || isHost" variant="ghost" class="w-full sm:w-auto" @click="backToBoard">
        Назад к полю
      </Button>
      <p v-else class="text-muted-foreground text-sm">Ведущий закроет карточку.</p>
      <Button
        v-if="!inRoom || isHost"
        variant="outline"
        class="w-full sm:w-auto"
        :disabled="verdict === 'correct'"
        @click="giveUp"
      >
        Сдать вопрос
      </Button>
    </div>

    <Dialog :open="awardOpen">
      <DialogContent :show-close-button="false" class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Кому начислить баллы?</DialogTitle>
          <DialogDescription>
            Правильный ответ. Выберите игрока, который получает {{ question.value }}.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-2">
          <Button
            v-for="player in players"
            :key="player.id"
            size="lg"
            class="w-full"
            @click="award(player.id)"
          >
            {{ player.name }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
