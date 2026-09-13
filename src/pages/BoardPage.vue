<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import FirstChooserDialog from '@/components/room/FirstChooserDialog.vue'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { usePlayState } from '@/composables/usePlayState'
import { QUESTION_VALUES } from '@/lib/types'
import { cn } from '@/lib/utils'

const router = useRouter()
const {
  inRoom,
  isHost,
  meId,
  room,
  players,
  rosterPlayers,
  chooser,
  chooserId,
  categories,
  questions,
  questionAt,
  isAnswered,
  isBoardComplete,
  canOpenQuestion,
  setChooser,
} = usePlayState()

const questionIds = computed(() => questions.value.map(question => question.id))
const finished = computed(() => isBoardComplete(questionIds.value))

const rows = computed(() =>
  QUESTION_VALUES.map(value =>
    categories.value.map((category) => {
      const question = questionAt(category.id, value)
      return {
        key: `${category.id}-${value}`,
        question,
        answered: question ? isAnswered(question.id) : false,
      }
    }),
  ),
)

const needFirstChooser = computed(() =>
  Boolean(isHost.value && !chooserId.value && players.value.length),
)

const heading = computed(() => {
  if (!chooser.value)
    return isHost.value ? 'Кто ходит первым?' : 'Ждём первого игрока'
  if (chooser.value.id === meId.value)
    return 'Ваш ход — выберите карточку'
  return `Выбирает ${chooser.value.name}`
})

const hint = computed(() => {
  if (!chooser.value) {
    return isHost.value
      ? 'Назначьте игрока, который откроет первую карточку.'
      : 'Ведущий выбирает, кто ходит первым.'
  }
  if (canOpenQuestion())
    return 'Номиналы от 100 до 700. Закрытая клетка уже сыграна.'
  return `${chooser.value.name} выбирает вопрос. Дальше ход по списку.`
})

function openQuestion(id: string) {
  if (isAnswered(id) || !canOpenQuestion())
    return

  if (inRoom.value) {
    room.openQuestion(id)
    return
  }

  router.push({ name: 'question', params: { id } })
}

if (finished.value && !inRoom.value)
  router.replace({ name: 'results' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">Игровое поле</p>
        <h1 class="font-display text-2xl tracking-[0.1em] uppercase sm:text-4xl sm:tracking-[0.12em]">
          {{ heading }}
        </h1>
      </div>
      <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
        {{ hint }}
      </p>
    </div>

    <div v-if="rosterPlayers.length" class="board-players" aria-label="Игроки">
      <div
        v-for="player in rosterPlayers"
        :key="player.id"
        :class="cn(
          'board-player',
          player.id === meId && 'board-player-me',
          player.id === chooserId && 'board-player-turn',
        )"
      >
        <span class="truncate font-medium">{{ player.name }}</span>
        <span v-if="player.id === chooserId" class="chooser-now">ходит</span>
        <span v-else-if="player.isHost" class="text-muted-foreground text-[0.65rem] tracking-[0.16em] uppercase">ведущий</span>
      </div>
    </div>

    <Empty v-if="!categories.length || !questions.length" class="border">
      <EmptyHeader>
        <EmptyTitle>Нет категорий или вопросов</EmptyTitle>
        <EmptyDescription>Заполните админку, затем начните игру заново.</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <div v-else class="board-scroll">
      <div
        class="board-grid"
        :style="{ '--columns': String(categories.length) }"
      >
        <div
          v-for="category in categories"
          :key="category.id"
          class="category-head"
        >
          {{ category.name }}
        </div>

        <template v-for="row in rows" :key="row[0]?.key ?? 'row'">
          <template v-for="cell in row" :key="cell.key">
            <button
              v-if="cell.question"
              type="button"
              :disabled="cell.answered || !canOpenQuestion()"
              :class="cn('value-cell', cell.answered && 'value-cell-played')"
              @click="openQuestion(cell.question.id)"
            >
              <span v-if="cell.answered" class="played-mark" />
              <span v-else>{{ cell.question.value }}</span>
            </button>
            <div v-else class="value-cell value-cell-empty" />
          </template>
        </template>
      </div>
    </div>

    <FirstChooserDialog
      :open="needFirstChooser"
      :dismissible="false"
      :players
      @pick="setChooser"
    />
  </div>
</template>
