<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlayState } from '@/composables/usePlayState'
import { correctAnswers, formatSubmission, KIND_LABELS, questionKind, scoreSubmission } from '@/lib/question-round'
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
const kind = computed(() => questionKind(question.value))
const categoryName = computed(() => {
  if (!question.value)
    return ''
  return categories.value.find(category => category.id === question.value?.categoryId)?.name ?? ''
})

const snapshot = computed(() => room.snapshot.value)
const revealed = computed(() => inRoom.value ? Boolean(snapshot.value?.revealed) : localRevealed.value)
const awarded = computed(() => inRoom.value ? Boolean(snapshot.value?.awarded) : localAwarded.value)
const submissions = computed(() => snapshot.value?.submissions ?? [])
const mySubmission = computed(() => submissions.value.find(item => item.playerId === me.value?.id))
const shuffledAnswers = ref<Answer[]>([])
const pickedIds = ref<string[]>([])
const freeText = ref('')
const localRevealed = ref(false)
const localAwarded = ref(false)
const localPicks = ref<string[]>([])
const selectedWinners = ref<string[]>([])

watch(question, (next) => {
  pickedIds.value = []
  freeText.value = ''
  localRevealed.value = false
  localAwarded.value = false
  localPicks.value = []
  selectedWinners.value = []
  if (inRoom.value && snapshot.value?.answers.length)
    shuffledAnswers.value = snapshot.value.answers
  else
    shuffledAnswers.value = next && kind.value !== 'free' ? shuffle(next.answers) : []
}, { immediate: true })

watch(() => snapshot.value?.answers, (answers) => {
  if (inRoom.value && answers?.length)
    shuffledAnswers.value = answers
})

watch(question, (next) => {
  if (inRoom.value || !questionId.value)
    return
  if (!next || isAnswered(next.id))
    router.replace({ name: 'board' })
}, { immediate: true })

const correctLabel = computed(() => {
  if (!question.value)
    return '—'
  if (kind.value === 'free')
    return correctAnswers(question.value)[0]?.text || 'Ведущий выберет самые близкие ответы'
  return correctAnswers(question.value).map(answer => answer.text).join(' · ') || '—'
})

const alreadySent = computed(() => Boolean(mySubmission.value) || revealed.value)

function finishBoardIfNeeded() {
  const ids = questions.value.map(item => item.id)
  if (isBoardComplete(ids)) {
    router.replace({ name: 'results' })
    return
  }
  router.push({ name: 'board' })
}

function togglePick(id: string) {
  if (alreadySent.value || !question.value)
    return
  if (kind.value === 'single') {
    pickedIds.value = [id]
    return
  }
  pickedIds.value = pickedIds.value.includes(id)
    ? pickedIds.value.filter(item => item !== id)
    : [...pickedIds.value, id]
}

function submitAnswer() {
  if (!question.value || alreadySent.value)
    return

  if (kind.value === 'free') {
    if (!freeText.value.trim()) {
      toast.error('Введите ответ')
      return
    }
    if (inRoom.value) {
      room.answer(question.value.id, { text: freeText.value.trim() })
      return
    }
    localRevealed.value = true
    return
  }

  if (!pickedIds.value.length) {
    toast.error(kind.value === 'multi' ? 'Отметьте варианты' : 'Выберите ответ')
    return
  }

  if (inRoom.value) {
    room.answer(question.value.id, { answerIds: pickedIds.value })
    return
  }

  localPicks.value = [...pickedIds.value]
  localRevealed.value = true
}

function toggleWinner(playerId: string) {
  if (awarded.value)
    return
  selectedWinners.value = selectedWinners.value.includes(playerId)
    ? selectedWinners.value.filter(id => id !== playerId)
    : [...selectedWinners.value, playerId]
}

function awardSelected() {
  if (!question.value || awarded.value)
    return

  if (inRoom.value) {
    room.awardFree(question.value.id, selectedWinners.value)
    return
  }

  const points = kind.value === 'free'
    ? question.value.value
    : scoreSubmission(question.value, { playerId: 'local', answerIds: localPicks.value, text: freeText.value })

  for (const playerId of selectedWinners.value)
    awardPoints(playerId, points, question.value.id)
  if (!selectedWinners.value.length)
    skipQuestion(question.value.id)
  localAwarded.value = true
  toast.success(selectedWinners.value.length ? 'Баллы начислены' : 'Никто не получил баллы')
  finishBoardIfNeeded()
}

function giveUp() {
  if (!question.value)
    return
  skipQuestion(question.value.id)
  if (!inRoom.value)
    finishBoardIfNeeded()
}

function backToBoard() {
  if (inRoom.value) {
    if (isHost.value)
      room.backToBoard()
    return
  }
  router.push({ name: 'board' })
}

function playerName(id: string) {
  return players.value.find(player => player.id === id)?.name ?? 'Игрок'
}

const revealRows = computed(() => {
  if (inRoom.value) {
    return submissions.value.map(submission => ({
      playerId: submission.playerId,
      label: formatSubmission(question.value!, submission),
      points: snapshot.value?.roundScores[submission.playerId] ?? 0,
    }))
  }

  return [{
    playerId: 'local',
    label: kind.value === 'free'
      ? (freeText.value.trim() || '—')
      : shuffledAnswers.value.filter(answer => localPicks.value.includes(answer.id)).map(answer => answer.text).join(', ') || '—',
    points: question.value ? scoreSubmission(question.value, { playerId: 'local', answerIds: localPicks.value, text: freeText.value }) : 0,
  }]
})

const canAnswer = computed(() => {
  if (revealed.value)
    return false
  if (!inRoom.value)
    return true
  if (kind.value === 'free' && isHost.value)
    return false
  return !mySubmission.value
})

const waitingHint = computed(() => {
  if (!inRoom.value || revealed.value)
    return ''
  if (mySubmission.value)
    return 'Ответ принят. Ждём остальных.'
  if (kind.value === 'free' && isHost.value)
    return 'Игроки пишут ответы. Когда все будут готовы, можно вскрыть.'
  return ''
})
</script>

<template>
  <div v-if="question" class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">
        {{ categoryName }} · {{ question.value }} · {{ KIND_LABELS[kind] }}
      </p>
      <h1 class="font-display text-2xl leading-tight text-balance sm:text-4xl">
        {{ question.text }}
      </h1>
      <p v-if="inRoom && me" class="rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm">
        Вы в комнате как <span class="font-medium">{{ me.name }}</span>
      </p>
      <p v-if="kind === 'multi' && !revealed" class="text-muted-foreground text-sm">
        Отметьте все верные варианты. Частичный ответ даёт часть баллов.
      </p>
      <p v-if="waitingHint" class="text-muted-foreground text-sm">{{ waitingHint }}</p>
    </div>

    <div v-if="!revealed" class="flex flex-col gap-3">
      <div v-if="kind === 'free' && canAnswer" class="flex flex-col gap-3">
        <Textarea v-model="freeText" rows="4" placeholder="Ваш ответ" />
        <Button class="w-full sm:w-auto" @click="submitAnswer">Ответить</Button>
      </div>

      <template v-else-if="kind !== 'free'">
        <div class="grid gap-3">
          <button
            v-for="answer in shuffledAnswers"
            :key="answer.id"
            type="button"
            :disabled="!canAnswer"
            :class="cn('answer-btn', pickedIds.includes(answer.id) && 'answer-btn-picked')"
            @click="togglePick(answer.id)"
          >
            {{ answer.text }}
          </button>
        </div>
        <Button
          v-if="canAnswer"
          class="w-full sm:w-auto"
          :disabled="!pickedIds.length"
          @click="submitAnswer"
        >
          Ответить
        </Button>
      </template>
    </div>

    <div v-else class="flex flex-col gap-6">
      <div class="reveal-correct">
        <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">Правильный ответ</p>
        <p class="font-display text-2xl leading-tight text-balance sm:text-4xl">{{ correctLabel }}</p>
      </div>

      <div class="grid gap-3">
        <div
          v-for="row in revealRows"
          :key="row.playerId"
          :class="cn(
            'player-answer-card',
            inRoom && isHost && kind === 'free' && !awarded && selectedWinners.includes(row.playerId) && 'player-answer-card-pick',
          )"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium">{{ row.playerId === 'local' ? 'Ответ за стол' : playerName(row.playerId) }}</p>
              <p class="text-muted-foreground mt-1 text-sm break-words">{{ row.label }}</p>
            </div>
            <span v-if="awarded || kind !== 'free'" class="font-board text-primary shrink-0 text-xl">
              +{{ row.points }}
            </span>
          </div>
          <Button
            v-if="inRoom && isHost && kind === 'free' && !awarded"
            variant="outline"
            size="sm"
            class="mt-3 w-full"
            @click="toggleWinner(row.playerId)"
          >
            {{ selectedWinners.includes(row.playerId) ? 'Снять выбор' : 'Подходит' }}
          </Button>
        </div>
      </div>

      <div
        v-if="!inRoom && revealed && !localAwarded"
        class="flex flex-col gap-2"
      >
        <p class="text-muted-foreground text-sm">Кому начислить баллы за этот ответ?</p>
        <Button
          v-for="player in players"
          :key="player.id"
          :variant="selectedWinners.includes(player.id) ? 'default' : 'outline'"
          class="w-full"
          @click="toggleWinner(player.id)"
        >
          {{ player.name }}
        </Button>
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
      <Button v-if="!inRoom || isHost" variant="ghost" class="w-full sm:w-auto" @click="backToBoard">
        Назад к полю
      </Button>
      <p v-else class="text-muted-foreground text-sm">Ведущий закроет карточку.</p>

      <div class="flex flex-col gap-2 sm:flex-row">
        <Button
          v-if="inRoom && isHost && !revealed"
          variant="outline"
          class="w-full sm:w-auto"
          @click="room.reveal()"
        >
          Вскрыть ответы
        </Button>
        <Button
          v-if="revealed && !awarded && (kind === 'free' ? isHost : !inRoom)"
          class="w-full sm:w-auto"
          @click="awardSelected"
        >
          Начислить выбранным
        </Button>
        <Button
          v-if="!inRoom || isHost"
          variant="outline"
          class="w-full sm:w-auto"
          :disabled="revealed"
          @click="giveUp"
        >
          Сдать вопрос
        </Button>
      </div>
    </div>
  </div>
</template>
