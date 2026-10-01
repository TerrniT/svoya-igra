<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  CopyIcon,
  HouseIcon,
  LogOutIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  Trash2Icon,
  UserMinusIcon,
} from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useActiveGame } from '@/composables/useActiveGame'
import { usePlayState } from '@/composables/usePlayState'
import { cn } from '@/lib/utils'

const router = useRouter()
const { inRoom, isHost, me, room, players } = usePlayState()
const { activeModule } = useActiveGame()

const ShellNav = computed(() => activeModule.value?.ShellNav)
const paused = computed(() => Boolean(room.snapshot.value?.paused))
const inMatch = computed(() => {
  const phase = room.phase.value
  return Boolean(inRoom.value && phase && phase !== 'lobby')
})
const kickable = computed(() => players.value.filter(player => !player.isHost))
const confirmKind = ref<'end' | 'leave' | 'close' | null>(null)
const kickOpen = ref(false)
const showHostControls = computed(() => isHost.value && inRoom.value && (inMatch.value || kickable.value.length > 0))
let queuedConfirm: 'end' | 'leave' | 'close' | null = null

async function copyCode() {
  if (!room.code.value)
    return
  await navigator.clipboard.writeText(room.code.value)
  toast.success('Код скопирован')
}

function pauseMatch() {
  if (paused.value)
    room.resume()
  else
    room.pause()
}

function requestConfirm(kind: 'end' | 'leave' | 'close') {
  queuedConfirm = kind
  confirmKind.value = kind
}

function runConfirm() {
  const action = queuedConfirm
  queuedConfirm = null
  confirmKind.value = null
  if (action === 'end') {
    room.endGame()
    return
  }
  if (action === 'leave' || action === 'close') {
    void room.leaveRoom()
    void router.replace({ name: 'home' })
  }
}

function dismissConfirm() {
  confirmKind.value = null
}

function kickPlayer(playerId: string) {
  room.kick(playerId)
  if (kickable.value.length <= 1)
    kickOpen.value = false
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :class="cn(
          'studio-deck',
          inRoom && 'studio-deck-live',
          paused && 'studio-deck-paused',
        )"
      >
        <span class="studio-deck-label">{{ inRoom ? (paused ? 'пауза' : 'комната') : 'меню' }}</span>
        <span v-if="inRoom && room.code.value" class="studio-deck-code">{{ room.code.value }}</span>
        <span v-else class="studio-deck-code studio-deck-code-idle">···</span>
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent class="w-64">
      <DropdownMenuGroup v-if="inRoom">
        <DropdownMenuLabel>Комната {{ room.code.value }}</DropdownMenuLabel>
        <DropdownMenuItem @select="copyCode">
          <CopyIcon />
          Скопировать код
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          {{ me?.name ?? 'Гость' }}
          <span class="text-muted-foreground ml-auto text-xs tracking-[0.14em] uppercase">
            {{ isHost ? 'ведущий' : 'игрок' }}
          </span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator v-if="inRoom" />

      <DropdownMenuGroup>
        <DropdownMenuLabel>Экраны</DropdownMenuLabel>
        <DropdownMenuItem v-if="!inRoom" as-child>
          <RouterLink to="/">
            <HouseIcon />
            Все игры
          </RouterLink>
        </DropdownMenuItem>
        <component :is="ShellNav" v-if="ShellNav" />
      </DropdownMenuGroup>

      <template v-if="showHostControls">
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Пульт</DropdownMenuLabel>
          <DropdownMenuItem v-if="inMatch" @select="pauseMatch">
            <PlayIcon v-if="paused" />
            <PauseIcon v-else />
            {{ paused ? 'Снять паузу' : 'Пауза' }}
          </DropdownMenuItem>
          <DropdownMenuItem v-if="inMatch" variant="destructive" @select="requestConfirm('end')">
            <SquareIcon />
            Закончить игру
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="kickable.length"
            variant="destructive"
            @select="kickOpen = true"
          >
            <UserMinusIcon />
            Удалить игрока
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </template>

      <template v-if="inRoom">
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            v-if="isHost"
            variant="destructive"
            @select="requestConfirm('close')"
          >
            <LogOutIcon />
            Закрыть комнату
          </DropdownMenuItem>
          <DropdownMenuItem
            v-else
            variant="destructive"
            @select="requestConfirm('leave')"
          >
            <LogOutIcon />
            Выйти из игры
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>

  <AlertDialog :open="Boolean(confirmKind)" @update:open="value => { if (!value) dismissConfirm() }">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ confirmKind === 'end'
            ? 'Закончить партию?'
            : confirmKind === 'close'
              ? 'Закрыть комнату?'
              : 'Выйти из игры?' }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ confirmKind === 'end'
            ? 'Все вернутся в лобби. Очки сбросятся, комнату можно начать заново.'
            : confirmKind === 'close'
              ? 'Комната закроется для всех, кто сейчас в ней.'
              : 'Вы покинете комнату. Чтобы вернуться, нужен код.' }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Отмена</AlertDialogCancel>
        <AlertDialogAction
          :variant="confirmKind === 'leave' ? 'default' : 'destructive'"
          @pointerdown="runConfirm"
        >
          {{ confirmKind === 'end' ? 'Закончить' : confirmKind === 'close' ? 'Закрыть' : 'Выйти' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <Dialog v-model:open="kickOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Удалить игрока</DialogTitle>
        <DialogDescription>Игрок сразу вылетит из комнаты.</DialogDescription>
      </DialogHeader>
      <ul class="flex flex-col gap-2">
        <li
          v-for="player in kickable"
          :key="player.id"
          class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate font-medium">{{ player.name }}</span>
            <Badge v-if="!player.connected" variant="outline">офлайн</Badge>
          </span>
          <Button variant="ghost" size="icon-sm" @click="kickPlayer(player.id)">
            <Trash2Icon />
            <span class="sr-only">Удалить {{ player.name }}</span>
          </Button>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
