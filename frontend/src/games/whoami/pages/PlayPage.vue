<script setup lang="ts">
import { computed } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRoom } from '@/composables/useRoom'
import type { WhoamiPayload } from '@/games/whoami/driver'
import { cn } from '@/lib/utils'

const room = useRoom()

const payload = computed(() => room.snapshot.value?.payload as WhoamiPayload | undefined)
const players = computed(() => room.snapshot.value?.session.players ?? [])
const meId = computed(() => room.playerId.value)
const isHost = computed(() => room.isHost.value)

const rows = computed(() =>
  players.value.map((player) => {
    const card = payload.value?.cards[player.id]
    const mine = player.id === meId.value
    return {
      player,
      card,
      mine,
      hidden: mine && card && !card.guessed,
      text: card ? (mine && !card.guessed ? '???' : card.text) : '—',
      guessed: Boolean(card?.guessed),
    }
  }),
)

const myRow = computed(() => rows.value.find(row => row.mine))

function markGuessed(playerId: string) {
  try {
    room.markGuessed(playerId)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось отметить')
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-6">
    <section class="text-center">
      <Badge variant="secondary" class="mb-3">Кто я?</Badge>
      <h1 class="font-display text-3xl tracking-[0.1em] uppercase sm:text-4xl">
        Карточки на лбу
      </h1>
      <p class="text-muted-foreground mt-2 text-sm sm:text-base">
        Свою карточку вы не видите. Задавайте вопросы остальным — ведущий отметит, когда угадаете.
      </p>
    </section>

    <Card v-if="myRow" class="border-primary/40">
      <CardHeader class="text-center">
        <CardDescription>Ваша карточка (на лбу)</CardDescription>
        <CardTitle class="font-display text-4xl tracking-[0.12em] uppercase sm:text-5xl">
          {{ myRow.text }}
        </CardTitle>
      </CardHeader>
      <CardContent v-if="myRow.guessed" class="text-center">
        <Badge>Угадано!</Badge>
      </CardContent>
    </Card>

    <div class="flex flex-col gap-3">
      <h2 class="font-display text-xl tracking-[0.08em] uppercase">Все игроки</h2>
      <ul class="flex flex-col gap-2">
        <li
          v-for="row in rows"
          :key="row.player.id"
          :class="cn(
            'flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
            row.mine ? 'player-me' : 'border-border/80 bg-card/60',
            row.guessed && 'opacity-70',
          )"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-medium">{{ row.player.name }}</span>
              <Badge v-if="row.mine" variant="default">Вы</Badge>
              <Badge v-if="row.player.isHost" variant="secondary">Ведущий</Badge>
              <Badge v-if="row.guessed" variant="outline">угадал</Badge>
            </div>
            <p class="font-display mt-1 text-2xl tracking-[0.08em] uppercase">
              {{ row.text }}
            </p>
          </div>
          <Button
            v-if="isHost && !row.guessed && row.card"
            size="sm"
            class="shrink-0"
            @click="markGuessed(row.player.id)"
          >
            Угадал
          </Button>
        </li>
      </ul>
    </div>
  </div>
</template>
