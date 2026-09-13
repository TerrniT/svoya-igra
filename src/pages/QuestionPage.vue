<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlayState } from '@/composables/usePlayState'
import { correctAnswers, formatSubmission, KIND_LABELS, questionKind, scoreSubmission, selectedAllAnswers } from '@/lib/question-round'
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
  localSession,
  isAnswered,
  isBoardComplete,
} = usePlayState()

const questionId = computed(() => {
  const raw = route.params.id
  return Array.isArray(raw) ? raw[0] : raw
})

const question = computed(() => questionId.value ? getQuestion(questionId.value) : undefined)
const kind = computed(() => questionKind(question.value))
const presenting = computed(() => inRoom.value && isHost.value)
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
const submittedLocally = ref(false)
const localSkipped = ref(false)
const localRevealed = ref(false)
const localAwarded = ref(false)
const localPicks = ref<string[]>([])
const selectedWinners = ref<string[]>([])
const greedyOpen = ref(false)

watch(questionId, (id) => {
  pickedIds.value = []
  freeText.value = ''
  submittedLocally.value = false
  localSkipped.value = false
  localRevealed.value = false
  localAwarded.value = false
  localPicks.value = []
  selectedWinners.value = []
  greedyOpen.value = false
  if (inRoom.value && snapshot.value?.answers.length)
    shuffledAnswers.value = snapshot.value.answers
  else
    shuffledAnswers.value = question.value && kind.value !== 'free' ? shuffle(question.value.answers) : []

  if (inRoom.value || !id)
    return
  if (!question.value || isAnswered(question.value.id))
    router.replace({ name: 'board' })
}, { immediate: true })

watch(() => snapshot.value?.answers, (answers) => {
  if (inRoom.value && answers?.length)
    shuffledAnswers.value = answers
})

const correctLabel = computed(() => {
  if (!question.value)
    return '—'
  if (kind.value === 'free')
    return correctAnswers(question.value)[0]?.text || 'Ведущий выберет самые близкие ответы'
  return correctAnswers(question.value).map(answer => answer.text).join(' · ') || '—'
})

const alreadySent = computed(() =>
  submittedLocally.value || Boolean(mySubmission.value) || revealed.value,
)

const canAnswer = computed(() => !alreadySent.value && !presenting.value)

const canPass = computed(() =>
  inRoom.value && !isHost.value && !alreadySent.value && !revealed.value,
)

function finishBoardIfNeeded() {
  const ids = questions.value.map(item => item.id)
  if (isBoardComplete(ids)) {
    router.replace({ name: 'results' })
    return
  }
  router.push({ name: 'board' })
}

function togglePick(id: string) {
  if (!canAnswer.value || !question.value)
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
  if (!question.value || alreadySent.value || presenting.value)
    return

  if (kind.value === 'free') {
    if (!freeText.value.trim()) {
      toast.error('Введите ответ')
      return
    }
    if (inRoom.value) {
      submittedLocally.value = true
      try {
        room.answer(question.value.id, { text: freeText.value.trim() })
      }
      catch {
        submittedLocally.value = false
      }
      return
    }
    localRevealed.value = true
    return
  }

  if (!pickedIds.value.length) {
    toast.error(kind.value === 'multi' ? 'Отметьте варианты' : 'Выберите ответ')
    return
  }

  if (selectedAllAnswers(question.value, pickedIds.value)) {
    greedyOpen.value = true
    return
  }

  if (inRoom.value) {
    submittedLocally.value = true
    try {
      room.answer(question.value.id, { answerIds: pickedIds.value })
    }
    catch {
      submittedLocally.value = false
    }
    return
  }

  localPicks.value = [...pickedIds.value]
  localRevealed.value = true
}

function passQuestion() {
  if (!question.value || !canPass.value)
    return

  submittedLocally.value = true
  localSkipped.value = true
  try {
    room.answer(question.value.id, { skipped: true })
  }
  catch {
    submittedLocally.value = false
    localSkipped.value = false
  }
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
  localSession.advanceChooser()
  localAwarded.value = true
  toast.success(selectedWinners.value.length ? 'Баллы начислены' : 'Никто не получил баллы')
  finishBoardIfNeeded()
}

function giveUp() {
  if (!question.value)
    return
  skipQuestion(question.value.id)
  if (!inRoom.value) {
    localSession.advanceChooser()
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

function playerName(id: string) {
  return players.value.find(player => player.id === id)?.name ?? 'Игрок'
}

function answerLetter(index: number) {
  return String.fromCharCode(65 + index)
}

const revealRows = computed(() => {
  if (inRoom.value) {
    return submissions.value
      .filter(submission => !players.value.find(player => player.id === submission.playerId)?.isHost)
      .map(submission => ({
        playerId: submission.playerId,
        label: formatSubmission(question.value!, submission),
        points: snapshot.value?.roundScores[submission.playerId] ?? 0,
        skipped: Boolean(submission.skipped),
      }))
  }

  return [{
    playerId: 'local',
    label: kind.value === 'free'
      ? (freeText.value.trim() || '—')
      : shuffledAnswers.value.filter(answer => localPicks.value.includes(answer.id)).map(answer => answer.text).join(', ') || '—',
    points: question.value ? scoreSubmission(question.value, { playerId: 'local', answerIds: localPicks.value, text: freeText.value }) : 0,
    skipped: false,
  }]
})

const waitingHint = computed(() => {
  if (!inRoom.value || revealed.value)
    return ''
  if (presenting.value)
    return 'Игроки отвечают на своих устройствах. Этот экран можно показать залу.'
  if (alreadySent.value)
    return localSkipped.value ? 'Пропустили. Ждём остальных.' : 'Ответ принят. Ждём остальных.'
  return ''
})
</script>

<template>
  <div v-if="question" :class="cn('mx-auto flex flex-col gap-6', presenting ? 'max-w-5xl' : 'max-w-3xl')">
    <div :class="cn('flex flex-col gap-2', presenting && 'host-stage')">
      <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">
        {{ categoryName }} · {{ question.value }} · {{ KIND_LABELS[kind] }}
      </p>
      <h1
        :class="cn(
          'font-display leading-tight text-balance',
          presenting ? 'text-3xl sm:text-5xl lg:text-6xl' : 'text-2xl sm:text-4xl',
        )"
      >
        {{ question.text }}
      </h1>
      <p v-if="inRoom && me && !presenting" class="rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm">
        Вы в комнате как <span class="font-medium">{{ me.name }}</span>
      </p>
      <p v-if="kind === 'single' && !revealed && !presenting && !alreadySent" class="text-muted-foreground text-sm">
        Выберите один вариант.
      </p>
      <p v-if="kind === 'multi' && !revealed && !presenting && !alreadySent" class="text-muted-foreground text-sm">
        Отметьте все верные варианты. Частичный ответ даёт часть баллов.
      </p>
      <p v-if="waitingHint" class="text-muted-foreground text-sm">{{ waitingHint }}</p>
    </div>

    <div v-if="presenting && kind !== 'free' && !revealed" class="grid gap-3">
      <div
        v-for="(answer, index) in shuffledAnswers"
        :key="answer.id"
        class="display-option"
      >
        <span class="display-option-letter">{{ answerLetter(index) }}</span>
        <span>{{ answer.text }}</span>
      </div>
    </div>

    <div v-if="!revealed && !presenting" class="flex flex-col gap-3">
      <div v-if="kind === 'free' && (canAnswer || alreadySent)" class="flex flex-col gap-3">
        <Textarea
          v-model="freeText"
          rows="4"
          placeholder="Ваш ответ"
          :disabled="!canAnswer"
          :readonly="!canAnswer"
        />
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button v-if="canAnswer" class="w-full sm:w-auto" @click="submitAnswer">Ответить</Button>
          <Button v-if="canPass" variant="outline" class="w-full sm:w-auto" @click="passQuestion">
            Пропустить
          </Button>
        </div>
      </div>

      <template v-else-if="kind !== 'free'">
        <div
          class="grid gap-3"
          :role="kind === 'single' ? 'radiogroup' : 'group'"
          :aria-disabled="alreadySent ? true : undefined"
          :aria-label="kind === 'single' ? 'Один вариант ответа' : 'Несколько вариантов ответа'"
          :class="alreadySent && 'answer-group-locked'"
        >
          <button
            v-for="answer in shuffledAnswers"
            :key="answer.id"
            type="button"
            :role="kind === 'single' ? 'radio' : 'checkbox'"
            :aria-checked="pickedIds.includes(answer.id)"
            :disabled="alreadySent"
            :class="cn(
              'answer-btn',
              kind === 'multi' ? 'answer-btn-multi' : 'answer-btn-single',
              pickedIds.includes(answer.id) && 'answer-btn-picked',
            )"
            @click="togglePick(answer.id)"
          >
            <span class="answer-btn-mark" aria-hidden="true">
              <CheckIcon v-if="kind === 'multi'" class="answer-btn-tick" />
            </span>
            <span>{{ answer.text }}</span>
          </button>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button
            v-if="canAnswer"
            class="w-full sm:w-auto"
            :disabled="!pickedIds.length"
            @click="submitAnswer"
          >
            Ответить
          </Button>
          <Button v-if="canPass" variant="outline" class="w-full sm:w-auto" @click="passQuestion">
            Пропустить
          </Button>
        </div>
      </template>
    </div>

    <div v-else-if="revealed" class="flex flex-col gap-6">
      <div v-if="presenting && kind !== 'free'" class="grid gap-3">
        <div
          v-for="(answer, index) in shuffledAnswers"
          :key="answer.id"
          :class="cn('display-option', answer.isCorrect && 'display-option-right')"
        >
          <span class="display-option-letter">{{ answerLetter(index) }}</span>
          <span>{{ answer.text }}</span>
        </div>
      </div>

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

    <AlertDialog v-model:open="greedyOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Какой ты умник, все ответы нельзя выбрать )</AlertDialogTitle>
          <AlertDialogDescription>
            Сними лишние варианты и отправь ответ ещё раз.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Ладно</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
