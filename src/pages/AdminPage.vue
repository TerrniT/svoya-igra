<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
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
import { QUESTION_VALUES, type Question, type QuestionValue } from '@/lib/types'

const {
  categories,
  questions,
  addCategory,
  updateCategory,
  removeCategory,
  moveCategory,
  upsertQuestion,
  removeQuestion,
} = useQuizBank()

const { inRoom, canEditBank } = usePlayState()
const canEdit = computed(() => canEditBank.value)

const categoryDialogOpen = ref(false)
const categoryName = ref('')
const categoryNameError = ref('')
const editingCategoryId = ref<string | null>(null)
const categoryToDelete = ref<string | null>(null)

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

function confirmDeleteCategory() {
  if (!canEdit.value || !categoryToDelete.value)
    return

  removeCategory(categoryToDelete.value)
  categoryToDelete.value = null
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
  questionForm.text = question.text
  questionForm.answers = question.answers.map(answer => ({ ...answer }))
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
  if (wasCorrect && questionForm.answers[0])
    questionForm.answers[0].isCorrect = true
}

function markCorrect(id: string) {
  for (const answer of questionForm.answers)
    answer.isCorrect = answer.id === id
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
  if (filled.length < 2)
    questionErrors.answers = 'Нужны минимум два ответа'
  else if (!filled.some(answer => answer.isCorrect))
    questionErrors.answers = 'Отметьте правильный ответ'

  if (questionErrors.categoryId || questionErrors.text || questionErrors.answers)
    return

  try {
    upsertQuestion({
      id: questionForm.id,
      categoryId: questionForm.categoryId,
      value: Number(questionForm.value) as QuestionValue,
      text: questionForm.text.trim(),
      answers: filled.map(answer => ({
        id: answer.id,
        text: answer.text.trim(),
        isCorrect: answer.isCorrect,
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

function confirmDeleteQuestion() {
  if (!canEdit.value || !questionToDelete.value)
    return

  removeQuestion(questionToDelete.value)
  questionToDelete.value = null
  toast.success('Вопрос удалён')
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-2">
      <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">Админка</p>
      <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-4xl">Банк вопросов</h1>
      <p class="text-muted-foreground max-w-2xl">
        Категории становятся колонками поля. У каждой категории может быть по одному вопросу на номинал от 100 до 700.
      </p>
    </div>

    <Alert v-if="!canEdit">
      <AlertTitle>Только ведущий</AlertTitle>
      <AlertDescription>
        Вопросы в комнате меняет ведущий. Вы видите поле таким, каким его собрал хост.
      </AlertDescription>
    </Alert>

    <Tabs default-value="categories" class="gap-4">
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
            <Button v-if="canEdit" class="w-full sm:w-auto" @click="openCreateCategory">
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
                      <Button variant="ghost" size="icon-sm" @click="categoryToDelete = category.id">
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
                  ? 'Один правильный ответ. В комнате поле общее — правки сразу уходят игрокам, пока партия не началась.'
                  : 'Один правильный ответ и несколько ложных. После верного ответа ведущий выберет игрока.' }}
              </CardDescription>
            </div>
            <Button v-if="canEdit" class="w-full sm:w-auto" :disabled="!categories.length" @click="openCreateQuestion">
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
                  <TableHead>Вопрос</TableHead>
                  <TableHead v-if="canEdit" class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="question in sortedQuestions" :key="question.id">
                  <TableCell>{{ categoryNameById(question.categoryId) }}</TableCell>
                  <TableCell class="font-board text-primary text-lg">{{ question.value }}</TableCell>
                  <TableCell class="max-w-[12rem] truncate sm:max-w-md">{{ question.text }}</TableCell>
                  <TableCell v-if="canEdit">
                    <div class="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" @click="openEditQuestion(question)">
                        <PencilIcon />
                        <span class="sr-only">Редактировать</span>
                      </Button>
                      <Button variant="ghost" size="icon-sm" @click="questionToDelete = question.id">
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
      <DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ questionForm.id ? 'Редактировать вопрос' : 'Новый вопрос' }}</DialogTitle>
          <DialogDescription>Один номинал в категории — одна карточка на поле.</DialogDescription>
        </DialogHeader>

        <FieldGroup>
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

          <Field :data-invalid="questionErrors.answers ? true : undefined">
            <FieldLabel>Ответы</FieldLabel>
            <p class="text-muted-foreground text-sm">Отметьте правильный кружком слева.</p>
            <div class="flex flex-col gap-2">
              <div
                v-for="answer in questionForm.answers"
                :key="answer.id"
                class="flex items-center gap-2"
              >
                <input
                  :id="`correct-${answer.id}`"
                  type="radio"
                  class="accent-primary size-4"
                  name="correct-answer"
                  :checked="answer.isCorrect"
                  @change="markCorrect(answer.id)"
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

        <DialogFooter>
          <Button variant="outline" @click="questionDialogOpen = false">Отмена</Button>
          <Button @click="saveQuestion">Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
  </div>
</template>
