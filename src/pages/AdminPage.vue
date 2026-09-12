<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef } from 'vue'
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { usePlayState } from '@/composables/usePlayState'
import { useQuizBank } from '@/composables/useQuizBank'
import { createId } from '@/lib/ids'
import { parseQuizBankJson, serializeQuizBank } from '@/lib/quiz-bank-io'
import { KIND_HINTS, KIND_LABELS, questionKind } from '@/lib/question-round'
import { QUESTION_KINDS, QUESTION_VALUES, type Question, type QuestionKind, type QuestionValue, type QuizBank } from '@/lib/types'

const {
  categories,
  questions,
  getBank,
  replaceBank,
  resetToSeed,
  addCategory,
  updateCategory,
  removeCategory,
  moveCategory,
  upsertQuestion,
  removeQuestion,
} = useQuizBank()

const { inRoom, canEditBank } = usePlayState()
const canEdit = computed(() => canEditBank.value)
const adminTab = ref('categories')

const categoryDialogOpen = ref(false)
const categoryName = ref('')
const categoryNameError = ref('')
const editingCategoryId = ref<string | null>(null)
const categoryToDelete = ref<string | null>(null)
let pendingCategoryId: string | null = null
let pendingQuestionId: string | null = null

const importInput = useTemplateRef<HTMLInputElement>('import-file')
const importPreview = ref<QuizBank | null>(null)
const seedResetOpen = ref(false)
let pendingImport: QuizBank | null = null

const questionDialogOpen = ref(false)
const questionToDelete = ref<string | null>(null)
const questionErrors = reactive({
  categoryId: '',
  text: '',
  answers: '',
})

const questionForm = reactive({
  id: '' as string | undefined,
  categoryId: '',
  value: '100' as string,
  kind: 'single' as QuestionKind,
  text: '',
  answers: [
    { id: createId('a'), text: '', isCorrect: true },
    { id: createId('a'), text: '', isCorrect: false },
    { id: createId('a'), text: '', isCorrect: false },
    { id: createId('a'), text: '', isCorrect: false },
  ],
})

const sortedQuestions = computed(() =>
  [...questions.value].sort((left, right) => {
    const leftCategory = categories.value.find(category => category.id === left.categoryId)?.order ?? 99
    const rightCategory = categories.value.find(category => category.id === right.categoryId)?.order ?? 99
    if (leftCategory !== rightCategory)
      return leftCategory - rightCategory
    return left.value - right.value
  }),
)

function categoryNameById(id: string) {
  return categories.value.find(category => category.id === id)?.name ?? 'Без категории'
}

function openCreateCategory() {
  if (!canEdit.value)
    return
  editingCategoryId.value = null
  categoryName.value = ''
  categoryNameError.value = ''
  categoryDialogOpen.value = true
}

function openEditCategory(id: string, name: string) {
  if (!canEdit.value)
    return
  editingCategoryId.value = id
  categoryName.value = name
  categoryNameError.value = ''
  categoryDialogOpen.value = true
}

function saveCategory() {
  if (!canEdit.value)
    return
  categoryNameError.value = ''
  const name = categoryName.value.trim()
  if (!name) {
    categoryNameError.value = 'Название обязательно'
    return
  }

  if (editingCategoryId.value)
    updateCategory(editingCategoryId.value, name)
  else
    addCategory(name)

  categoryDialogOpen.value = false
  toast.success('Категория сохранена')
}

function requestDeleteCategory(id: string) {
  pendingCategoryId = id
  categoryToDelete.value = id
}

function confirmDeleteCategory() {
  const id = pendingCategoryId
  pendingCategoryId = null
  categoryToDelete.value = null
  if (!canEdit.value || !id)
    return

  removeCategory(id)
  toast.success('Категория и её вопросы удалены')
}

function blankAnswers() {
  return [
    { id: createId('a'), text: '', isCorrect: true },
    { id: createId('a'), text: '', isCorrect: false },
    { id: createId('a'), text: '', isCorrect: false },
    { id: createId('a'), text: '', isCorrect: false },
  ]
}

function openCreateQuestion() {
  if (!canEdit.value)
    return
  questionForm.id = undefined
  questionForm.categoryId = categories.value[0]?.id ?? ''
  questionForm.value = '100'
  questionForm.kind = 'single'
  questionForm.text = ''
  questionForm.answers = blankAnswers()
  questionErrors.categoryId = ''
  questionErrors.text = ''
  questionErrors.answers = ''
  questionDialogOpen.value = true
}

function openEditQuestion(question: Question) {
  if (!canEdit.value)
    return
  questionForm.id = question.id
  questionForm.categoryId = question.categoryId
  questionForm.value = String(question.value)
  questionForm.kind = questionKind(question)
  questionForm.text = question.text
  questionForm.answers = question.answers.length
    ? question.answers.map(answer => ({ ...answer }))
    : [{ id: createId('a'), text: '', isCorrect: true }]
  questionErrors.categoryId = ''
  questionErrors.text = ''
  questionErrors.answers = ''
  questionDialogOpen.value = true
}

function addAnswerRow() {
  if (questionForm.answers.length >= 6)
    return

  questionForm.answers.push({ id: createId('a'), text: '', isCorrect: false })
}

function removeAnswerRow(id: string) {
  if (questionForm.answers.length <= 2)
    return

  const wasCorrect = questionForm.answers.find(answer => answer.id === id)?.isCorrect
  questionForm.answers = questionForm.answers.filter(answer => answer.id !== id)
  if (questionForm.kind === 'single' && wasCorrect && questionForm.answers[0])
    questionForm.answers[0].isCorrect = true
}

function markCorrect(id: string) {
  for (const answer of questionForm.answers)
    answer.isCorrect = answer.id === id
}

function toggleCorrect(id: string) {
  const answer = questionForm.answers.find(item => item.id === id)
  if (answer)
    answer.isCorrect = !answer.isCorrect
}

function changeKind(next: string) {
  const kind = next as QuestionKind
  questionForm.kind = kind
  if (kind === 'free') {
    const reference = questionForm.answers.find(answer => answer.isCorrect)?.text
      ?? questionForm.answers[0]?.text
      ?? ''
    questionForm.answers = [{ id: createId('a'), text: reference, isCorrect: true }]
    return
  }
  if (questionForm.answers.length < 2)
    questionForm.answers = blankAnswers()
  if (kind === 'single') {
    const firstCorrect = questionForm.answers.find(answer => answer.isCorrect) ?? questionForm.answers[0]
    for (const answer of questionForm.answers)
      answer.isCorrect = answer.id === firstCorrect?.id
  }
}

function saveQuestion() {
  if (!canEdit.value)
    return
  questionErrors.categoryId = ''
  questionErrors.text = ''
  questionErrors.answers = ''

  if (!questionForm.categoryId)
    questionErrors.categoryId = 'Выберите категорию'

  if (!questionForm.text.trim())
    questionErrors.text = 'Введите текст вопроса'

  const filled = questionForm.answers.filter(answer => answer.text.trim())
  if (questionForm.kind === 'free') {
    // эталон необязателен
  }
  else if (filled.length < 2) {
    questionErrors.answers = 'Нужны минимум два ответа'
  }
  else if (questionForm.kind === 'single' && filled.filter(answer => answer.isCorrect).length !== 1) {
    questionErrors.answers = 'Отметьте ровно один правильный ответ'
  }
  else if (questionForm.kind === 'multi' && filled.filter(answer => answer.isCorrect).length < 2) {
    questionErrors.answers = 'Отметьте хотя бы два правильных ответа'
  }

  if (questionErrors.categoryId || questionErrors.text || questionErrors.answers)
    return

  try {
    upsertQuestion({
      id: questionForm.id,
      categoryId: questionForm.categoryId,
      value: Number(questionForm.value) as QuestionValue,
      text: questionForm.text.trim(),
      kind: questionForm.kind,
      answers: (questionForm.kind === 'free' ? filled.slice(0, 1) : filled).map(answer => ({
        id: answer.id,
        text: answer.text.trim(),
        isCorrect: questionForm.kind === 'free' ? true : answer.isCorrect,
      })),
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось сохранить вопрос')
    return
  }

  questionDialogOpen.value = false
  toast.success('Вопрос сохранён')
}

function requestDeleteQuestion(id: string) {
  pendingQuestionId = id
  questionToDelete.value = id
}

function confirmDeleteQuestion() {
  const id = pendingQuestionId
  pendingQuestionId = null
  questionToDelete.value = null
  if (!canEdit.value || !id)
    return

  removeQuestion(id)
  toast.success('Вопрос удалён')
}

function exportQuestions() {
  const payload = serializeQuizBank(getBank())
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'svoya-igra-questions.json'
  link.click()
  URL.revokeObjectURL(url)
  toast.success('JSON скачан')
}

function openImportPicker() {
  if (!canEdit.value)
    return
  importInput.value?.click()
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !canEdit.value)
    return

  try {
    const parsed = parseQuizBankJson(JSON.parse(await file.text()))
    pendingImport = parsed
    importPreview.value = parsed
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось прочитать JSON')
  }
}

function confirmImport() {
  const next = pendingImport
  pendingImport = null
  importPreview.value = null
  if (!canEdit.value || !next)
    return

  replaceBank(next)
  toast.success('Банк вопросов заменён')
}

function confirmSeedReset() {
  if (!canEdit.value)
    return
  seedResetOpen.value = false
  resetToSeed()
  toast.success('Загружены примеры: 4 категории, все типы вопросов')
}
</script>

<template>
  <div class="flex flex-col gap-6 pb-24 sm:pb-0">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-2">
        <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">Админка</p>
        <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-4xl">Банк вопросов</h1>
        <p class="text-muted-foreground max-w-2xl">
          Категории становятся колонками поля. У каждой категории может быть по одному вопросу на номинал от 100 до 700.
        </p>
      </div>
      <div v-if="canEdit" class="flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" class="w-full sm:w-auto" @click="exportQuestions">
          <DownloadIcon data-icon="inline-start" />
          Экспорт JSON
        </Button>
        <Button variant="outline" class="w-full sm:w-auto" @click="openImportPicker">
          <UploadIcon data-icon="inline-start" />
          Импорт JSON
        </Button>
        <Button variant="outline" class="w-full sm:w-auto" @click="seedResetOpen = true">
          <RefreshCwIcon data-icon="inline-start" />
          Примеры
        </Button>
        <input
          ref="import-file"
          type="file"
          accept="application/json,.json"
          class="sr-only"
          @change="onImportFile"
        >
      </div>
    </div>

    <Alert v-if="!canEdit">
      <AlertTitle>Только ведущий</AlertTitle>
      <AlertDescription>
        Вопросы в комнате меняет ведущий. Вы видите поле таким, каким его собрал хост.
      </AlertDescription>
    </Alert>

    <Tabs v-model="adminTab" class="gap-4">
      <TabsList class="w-full sm:w-auto">
        <TabsTrigger value="categories">Категории</TabsTrigger>
        <TabsTrigger value="questions">Вопросы</TabsTrigger>
      </TabsList>

      <TabsContent value="categories">
        <Card>
          <CardHeader class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex flex-col gap-1">
              <CardTitle>Категории</CardTitle>
              <CardDescription>Порядок колонок на поле можно менять стрелками.</CardDescription>
            </div>
            <Button v-if="canEdit" class="hidden sm:inline-flex" @click="openCreateCategory">
              <PlusIcon data-icon="inline-start" />
              Категория
            </Button>
          </CardHeader>
          <CardContent>
            <Empty v-if="!categories.length" class="border">
              <EmptyHeader>
                <EmptyTitle>Категорий нет</EmptyTitle>
                <EmptyDescription>Создайте первую колонку для игрового поля.</EmptyDescription>
              </EmptyHeader>
            </Empty>

            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Вопросов</TableHead>
                  <TableHead v-if="canEdit" class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="category in categories" :key="category.id">
                  <TableCell class="font-medium">{{ category.name }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {{ questions.filter(question => question.categoryId === category.id).length }}
                    </Badge>
                  </TableCell>
                  <TableCell v-if="canEdit">
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" @click="moveCategory(category.id, -1)">
                        <ChevronUpIcon />
                        <span class="sr-only">Выше</span>
                      </Button>
                      <Button variant="ghost" size="icon-sm" @click="moveCategory(category.id, 1)">
                        <ChevronDownIcon />
                        <span class="sr-only">Ниже</span>
                      </Button>
                      <Button variant="ghost" size="icon-sm" @click="openEditCategory(category.id, category.name)">
                        <PencilIcon />
                        <span class="sr-only">Редактировать</span>
                      </Button>
                      <Button variant="ghost" size="icon-sm" @click="requestDeleteCategory(category.id)">
                        <Trash2Icon />
                        <span class="sr-only">Удалить</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="questions">
        <Card>
          <CardHeader class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex flex-col gap-1">
              <CardTitle>Вопросы</CardTitle>
              <CardDescription>
                {{ inRoom
                  ? 'В комнате поле общее — правки сразу уходят игрокам, пока партия не началась.'
                  : 'Свободный ответ, один верный вариант или несколько верных с частичными баллами.' }}
              </CardDescription>
            </div>
            <Button v-if="canEdit" class="hidden sm:inline-flex" :disabled="!categories.length" @click="openCreateQuestion">
              <PlusIcon data-icon="inline-start" />
              Вопрос
            </Button>
          </CardHeader>
          <CardContent>
            <Empty v-if="!sortedQuestions.length" class="border">
              <EmptyHeader>
                <EmptyTitle>Вопросов нет</EmptyTitle>
                <EmptyDescription>Добавьте карточки, чтобы собрать поле.</EmptyDescription>
              </EmptyHeader>
            </Empty>

            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>Категория</TableHead>
                  <TableHead>Номинал</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Вопрос</TableHead>
                  <TableHead v-if="canEdit" class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="question in sortedQuestions" :key="question.id">
                  <TableCell>{{ categoryNameById(question.categoryId) }}</TableCell>
                  <TableCell class="font-board text-primary text-lg">{{ question.value }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ KIND_LABELS[questionKind(question)] }}</Badge>
                  </TableCell>
                  <TableCell class="max-w-[12rem] truncate sm:max-w-md">{{ question.text }}</TableCell>
                  <TableCell v-if="canEdit">
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" @click="openEditQuestion(question)">
                        <PencilIcon />
                        <span class="sr-only">Редактировать</span>
                      </Button>
                      <Button variant="ghost" size="icon-sm" @click="requestDeleteQuestion(question.id)">
                        <Trash2Icon />
                        <span class="sr-only">Удалить</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog v-model:open="categoryDialogOpen">
      <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ editingCategoryId ? 'Категория' : 'Новая категория' }}</DialogTitle>
          <DialogDescription>Название колонки на игровом поле.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field :data-invalid="categoryNameError ? true : undefined">
            <FieldLabel for="category-name">Название</FieldLabel>
            <Input
              id="category-name"
              v-model="categoryName"
              :aria-invalid="categoryNameError ? true : undefined"
              maxlength="40"
            />
            <FieldError v-if="categoryNameError" :errors="[categoryNameError]" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" @click="categoryDialogOpen = false">Отмена</Button>
          <Button @click="saveCategory">Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="questionDialogOpen">
      <DialogContent
        class="inset-0! top-0! left-0! h-dvh! max-h-dvh! w-full! max-w-none! translate-x-0! translate-y-0! rounded-none p-0 sm:max-w-none! grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
      >
        <DialogHeader class="mx-auto w-full max-w-lg px-4 pt-5 pr-14">
          <DialogTitle>{{ questionForm.id ? 'Редактировать вопрос' : 'Новый вопрос' }}</DialogTitle>
          <DialogDescription>
            Один номинал в категории. Сначала выберите тип: свободный ответ, один верный или несколько верных.
          </DialogDescription>
        </DialogHeader>

        <div class="min-h-0 overflow-y-auto pb-28 sm:pb-4">
          <FieldGroup class="mx-auto w-full max-w-lg px-4 py-4">
          <Field>
            <FieldLabel>Тип вопроса</FieldLabel>
            <div class="grid gap-2">
              <Button
                v-for="item in QUESTION_KINDS"
                :key="item"
                type="button"
                :variant="questionForm.kind === item ? 'default' : 'outline'"
                class="h-auto w-full flex-col items-start justify-start py-3 text-left whitespace-normal"
                @click="changeKind(item)"
              >
                <span class="font-semibold">{{ KIND_LABELS[item] }}</span>
                <span class="text-xs font-normal opacity-80">{{ KIND_HINTS[item] }}</span>
              </Button>
            </div>
          </Field>

          <Field :data-invalid="questionErrors.categoryId ? true : undefined">
            <FieldLabel>Категория</FieldLabel>
            <Select v-model="questionForm.categoryId">
              <SelectTrigger class="w-full" :aria-invalid="questionErrors.categoryId ? true : undefined">
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="category in categories"
                    :key="category.id"
                    :value="category.id"
                  >
                    {{ category.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError v-if="questionErrors.categoryId" :errors="[questionErrors.categoryId]" />
          </Field>

          <Field>
            <FieldLabel>Номинал</FieldLabel>
            <Select v-model="questionForm.value">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    v-for="value in QUESTION_VALUES"
                    :key="value"
                    :value="String(value)"
                  >
                    {{ value }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field :data-invalid="questionErrors.text ? true : undefined">
            <FieldLabel for="question-text">Текст вопроса</FieldLabel>
            <Textarea
              id="question-text"
              v-model="questionForm.text"
              :aria-invalid="questionErrors.text ? true : undefined"
              rows="3"
            />
            <FieldError v-if="questionErrors.text" :errors="[questionErrors.text]" />
          </Field>

          <Field v-if="questionForm.kind === 'free'" :data-invalid="questionErrors.answers ? true : undefined">
            <FieldLabel for="reference-answer">Эталон для ведущего</FieldLabel>
            <Textarea
              id="reference-answer"
              :model-value="questionForm.answers[0]?.text ?? ''"
              rows="3"
              placeholder="Необязательно. Покажется в центре после ответов игроков."
              @update:model-value="value => {
                const text = String(value ?? '')
                if (!questionForm.answers[0])
                  questionForm.answers = [{ id: createId('a'), text, isCorrect: true }]
                else
                  questionForm.answers[0].text = text
              }"
            />
          </Field>

          <Field v-else :data-invalid="questionErrors.answers ? true : undefined">
            <FieldLabel>Ответы</FieldLabel>
            <p class="text-muted-foreground text-sm">
              {{ questionForm.kind === 'multi'
                ? 'Отметьте галочками все верные варианты.'
                : 'Отметьте правильный кружком слева.' }}
            </p>
            <div class="flex flex-col gap-2">
              <div
                v-for="answer in questionForm.answers"
                :key="answer.id"
                class="flex items-center gap-2"
              >
                <input
                  :id="`correct-${answer.id}`"
                  :type="questionForm.kind === 'multi' ? 'checkbox' : 'radio'"
                  class="accent-primary size-4"
                  name="correct-answer"
                  :checked="answer.isCorrect"
                  @change="questionForm.kind === 'multi' ? toggleCorrect(answer.id) : markCorrect(answer.id)"
                >
                <Input
                  v-model="answer.text"
                  :aria-invalid="questionErrors.answers ? true : undefined"
                  :placeholder="answer.isCorrect ? 'Правильный ответ' : 'Неверный ответ'"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :disabled="questionForm.answers.length <= 2"
                  @click="removeAnswerRow(answer.id)"
                >
                  <Trash2Icon />
                  <span class="sr-only">Удалить ответ</span>
                </Button>
              </div>
            </div>
            <FieldError v-if="questionErrors.answers" :errors="[questionErrors.answers]" />
            <Button variant="outline" size="sm" :disabled="questionForm.answers.length >= 6" @click="addAnswerRow">
              <PlusIcon data-icon="inline-start" />
              Ещё ответ
            </Button>
          </Field>
          </FieldGroup>
        </div>

        <DialogFooter class="fixed inset-x-0 bottom-0 z-10 mx-0 mb-0 rounded-none border-t bg-background/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:static sm:z-auto sm:bg-muted/50 sm:p-4 sm:backdrop-blur-none">
          <div class="mx-auto flex w-full max-w-lg flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" class="w-full sm:w-auto" @click="questionDialogOpen = false">Отмена</Button>
            <Button class="w-full sm:w-auto" @click="saveQuestion">Сохранить</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <div
      v-if="canEdit && !questionDialogOpen"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden"
    >
      <Button
        v-if="adminTab === 'categories'"
        class="w-full"
        @click="openCreateCategory"
      >
        <PlusIcon data-icon="inline-start" />
        Категория
      </Button>
      <Button
        v-else
        class="w-full"
        :disabled="!categories.length"
        @click="openCreateQuestion"
      >
        <PlusIcon data-icon="inline-start" />
        Вопрос
      </Button>
    </div>

    <AlertDialog :open="Boolean(categoryToDelete)" @update:open="value => !value && (categoryToDelete = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить категорию?</AlertDialogTitle>
          <AlertDialogDescription>
            Вместе с колонкой пропадут все её вопросы. Это нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteCategory">Удалить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(questionToDelete)" @update:open="value => !value && (questionToDelete = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить вопрос?</AlertDialogTitle>
          <AlertDialogDescription>Карточка исчезнет с игрового поля.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction @click="confirmDeleteQuestion">Удалить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="seedResetOpen" @update:open="value => (seedResetOpen = value)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Загрузить примеры?</AlertDialogTitle>
          <AlertDialogDescription>
            Текущий банк заменится сидом: Саванна, Кино, Планета и Наука. В каждой категории есть свободный ответ, один верный и несколько верных.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction @click="confirmSeedReset">Загрузить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="Boolean(importPreview)" @update:open="value => !value && (importPreview = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Заменить банк вопросов?</AlertDialogTitle>
          <AlertDialogDescription>
            Текущие категории и карточки будут заменены файлом:
            {{ importPreview?.categories.length ?? 0 }} категорий,
            {{ importPreview?.questions.length ?? 0 }} вопросов.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction @click="confirmImport">Заменить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
