<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { usePlayState } from '@/composables/usePlayState'
import { QUESTION_VALUES } from '@/lib/types'
import { cn } from '@/lib/utils'

const router = useRouter()
const {
  inRoom,
  isHost,
  room,
  categories,
  questions,
  questionAt,
  isAnswered,
  isBoardComplete,
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

function openQuestion(id: string) {
  if (isAnswered(id))
    return

  if (inRoom.value) {
    if (!isHost.value)
      return
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
        <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-4xl">
          {{ isHost ? 'Выберите карточку' : 'Ждём карточку' }}
        </h1>
      </div>
      <p class="text-muted-foreground text-sm">
        {{ isHost
          ? 'Номиналы от 100 до 700. Закрытая клетка уже сыграна.'
          : 'Ведущий откроет вопрос. Отвечать будете со своего устройства.' }}
      </p>
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
              :disabled="cell.answered || (inRoom && !isHost)"
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
  </div>
</template>
