<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DoorOpenIcon, PawPrintIcon, PlusIcon, QrCodeIcon, Trash2Icon, UserRoundIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import RoomInvite from '@/components/room/RoomInvite.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlayState } from '@/composables/usePlayState'
import { cn } from '@/lib/utils'

const router = useRouter()
const {
  room,
  inRoom,
  isHost,
  meId,
  players,
  questions,
  categories,
  startGame,
  localSession,
  localBank,
} = usePlayState()

const hostName = ref('')
const hostNameError = ref('')
const localName = ref('')
const localNameError = ref('')

const canStartRoom = computed(() =>
  inRoom.value && isHost.value && players.value.length > 0 && questions.value.length > 0,
)
const canStartLocal = computed(() => localSession.players.value.length > 0 && localBank.questions.value.length > 0)

async function createRoom() {
  hostNameError.value = ''
  if (!hostName.value.trim()) {
    hostNameError.value = 'Как зовут ведущего?'
    return
  }

  try {
    await room.createRoom(hostName.value, localBank.getBank())
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось создать комнату')
  }
}

function beginRoom() {
  if (!canStartRoom.value) {
    toast.error('Нужны игроки и вопросы')
    return
  }
  startGame()
}

function submitLocalPlayer() {
  localNameError.value = ''
  const created = localSession.addPlayer(localName.value)
  if (!created) {
    localNameError.value = 'Введите имя игрока'
    return
  }
  localName.value = ''
}

function beginLocal() {
  if (!localSession.players.value.length) {
    toast.error('Сначала добавьте хотя бы одного игрока')
    return
  }
  if (!localBank.questions.value.length) {
    toast.error('В админке нет ни одного вопроса')
    return
  }
  localSession.startGame()
  router.push({ name: 'board' })
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 sm:gap-8">
    <section class="flex flex-col gap-3 pt-1 text-center sm:pt-4">
      <Badge variant="secondary" class="mx-auto">{{ inRoom ? `Комната ${room.code.value}` : 'Перед охотой' }}</Badge>
      <h1 class="font-display text-3xl tracking-[0.12em] text-balance uppercase sm:text-5xl sm:tracking-[0.14em]">
        {{ inRoom ? 'Прайд собирается' : 'Соберите прайд' }}
      </h1>
      <p class="text-muted-foreground text-pretty text-sm sm:text-base">
        {{ inRoom
          ? 'Остальные заходят по коду или QR. Ведущий не закрывает эту вкладку — комната живёт на его устройстве.'
          : 'Создайте комнату для нескольких устройств или сыграйте на одном экране.' }}
      </p>
    </section>

    <template v-if="inRoom">
      <div class="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
        <RoomInvite v-if="isHost" :code="room.code.value" />
        <Card class="md:col-span-1" :class="isHost ? '' : 'md:col-span-2'">
          <CardHeader>
            <CardTitle>В комнате</CardTitle>
            <CardDescription>
              {{ isHost ? 'Вы ведущий. Когда прайд соберётся — начинайте.' : 'Ждём, пока ведущий откроет поле.' }}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul class="flex flex-col gap-2">
              <li
                v-for="(player, index) in players"
                :key="player.id"
                :class="cn(
                  'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5',
                  player.id === meId
                    ? 'player-me'
                    : 'border-border/80 bg-muted/30',
                )"
              >
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="font-board text-primary text-xl">{{ index + 1 }}</span>
                  <span class="truncate font-medium">{{ player.name }}</span>
                  <Badge v-if="player.id === meId" variant="default">Вы</Badge>
                  <Badge v-if="player.isHost" variant="secondary">Ведущий</Badge>
                  <Badge v-if="!player.connected" variant="outline">офлайн</Badge>
                </div>
                <Button
                  v-if="isHost && !player.isHost"
                  variant="ghost"
                  size="icon-sm"
                  @click="room.kick(player.id)"
                >
                  <Trash2Icon />
                  <span class="sr-only">Удалить {{ player.name }}</span>
                </Button>
              </li>
            </ul>
          </CardContent>
          <CardFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
            <Button variant="ghost" class="w-full sm:w-auto" @click="room.leaveRoom()">Выйти</Button>
            <div v-if="isHost" class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Button variant="outline" class="w-full sm:w-auto" as-child>
                <RouterLink to="/admin">К вопросам</RouterLink>
              </Button>
              <Button class="w-full sm:w-auto" :disabled="!canStartRoom" @click="beginRoom">
                <PawPrintIcon data-icon="inline-start" />
                Начать игру
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </template>

    <Tabs v-else default-value="room" class="gap-4">
      <TabsList class="w-full sm:w-auto">
        <TabsTrigger value="room">Комната</TabsTrigger>
        <TabsTrigger value="local">Один экран</TabsTrigger>
      </TabsList>

      <TabsContent value="room">
        <div class="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Создать комнату</CardTitle>
              <CardDescription>Вы ведущий. Не закрывайте вкладку: игроки подключаются напрямую к вам.</CardDescription>
            </CardHeader>
            <CardContent>
              <form class="flex flex-col gap-4" @submit.prevent="createRoom">
                <FieldGroup>
                  <Field :data-invalid="hostNameError ? true : undefined">
                    <FieldLabel for="host-name">Ваше имя</FieldLabel>
                    <Input
                      id="host-name"
                      v-model="hostName"
                      maxlength="32"
                      placeholder="Например, Лео"
                      :aria-invalid="hostNameError ? true : undefined"
                    />
                    <FieldError v-if="hostNameError" :errors="[hostNameError]" />
                  </Field>
                </FieldGroup>
                <Button type="submit" :disabled="room.connecting.value">
                  <QrCodeIcon data-icon="inline-start" />
                  {{ room.connecting.value ? 'Создаём…' : 'Создать' }}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Войти</CardTitle>
              <CardDescription>4-значный код с экрана ведущего или QR-код камерой.</CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-3">
              <p class="text-muted-foreground text-sm">
                На телефоне отсканируйте QR или откройте страницу входа и введите код.
              </p>
              <Button variant="outline" as-child>
                <RouterLink to="/join">
                  <DoorOpenIcon data-icon="inline-start" />
                  Ввести код
                </RouterLink>
              </Button>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="local">
        <Card>
          <CardHeader>
            <CardTitle>Игроки на этом экране</CardTitle>
            <CardDescription>Классический режим: имена здесь, баллы выбирает ведущий после верного ответа.</CardDescription>
          </CardHeader>
          <CardContent>
            <form class="flex flex-col gap-4" @submit.prevent="submitLocalPlayer">
              <FieldGroup>
                <Field :data-invalid="localNameError ? true : undefined">
                  <FieldLabel for="player-name">Имя</FieldLabel>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="player-name"
                      v-model="localName"
                      maxlength="32"
                      placeholder="Например, Лео"
                      :aria-invalid="localNameError ? true : undefined"
                    />
                    <Button type="submit">
                      <PlusIcon data-icon="inline-start" />
                      Добавить
                    </Button>
                  </div>
                  <FieldError v-if="localNameError" :errors="[localNameError]" />
                </Field>
              </FieldGroup>
            </form>

            <Empty v-if="!localSession.players.value.length" class="mt-6 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserRoundIcon />
                </EmptyMedia>
                <EmptyTitle>Пока никого нет</EmptyTitle>
                <EmptyDescription>Добавьте хотя бы одного охотника, чтобы открыть поле.</EmptyDescription>
              </EmptyHeader>
            </Empty>

            <ul v-else class="mt-6 flex flex-col gap-2">
              <li
                v-for="(player, index) in localSession.players.value"
                :key="player.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <span class="font-board text-primary text-xl">{{ index + 1 }}</span>
                  <span class="truncate font-medium">{{ player.name }}</span>
                </div>
                <Button variant="ghost" size="icon-sm" @click="localSession.removePlayer(player.id)">
                  <Trash2Icon />
                  <span class="sr-only">Удалить {{ player.name }}</span>
                </Button>
              </li>
            </ul>
          </CardContent>
          <CardFooter class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
            <p class="text-muted-foreground text-sm">
              Категорий: {{ categories.length }} · вопросов: {{ questions.length }}
            </p>
            <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Button variant="outline" class="w-full sm:w-auto" as-child>
                <RouterLink to="/admin">К вопросам</RouterLink>
              </Button>
              <Button class="w-full sm:w-auto" :disabled="!canStartLocal" @click="beginLocal">
                <PawPrintIcon data-icon="inline-start" />
                {{ localSession.startedAt.value ? 'Новая игра' : 'Начать игру' }}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </TabsContent>
    </Tabs>

    <Alert v-if="!questions.length">
      <AlertTitle>Поле пустое</AlertTitle>
      <AlertDescription>
        {{ isHost
          ? 'В админке ещё нет вопросов. Добавьте категории и карточки, затем создавайте комнату.'
          : 'Ведущий ещё не добавил вопросы. Дождитесь старта.' }}
      </AlertDescription>
    </Alert>
  </div>
</template>
