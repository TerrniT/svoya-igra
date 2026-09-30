<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })

const { players, dismissible = true } = defineProps<{
  players: Array<{ id: string, name: string, isHost?: boolean }>
  dismissible?: boolean
}>()

const emit = defineEmits<{
  pick: [playerId: string]
}>()

function pick(playerId: string) {
  emit('pick', playerId)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md" :show-close-button="dismissible">
      <DialogHeader>
        <DialogTitle>Кто выбирает первый вопрос?</DialogTitle>
        <DialogDescription>
          Ведущий назначает первого. Дальше ход идёт по списку участников.
        </DialogDescription>
      </DialogHeader>
      <ul class="flex max-h-72 flex-col gap-2 overflow-y-auto">
        <li v-for="player in players" :key="player.id">
          <Button variant="outline" class="w-full justify-start" @click="pick(player.id)">
            <span class="truncate">{{ player.name }}</span>
            <span v-if="player.isHost" class="text-muted-foreground ml-auto text-xs">ведущий</span>
          </Button>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
