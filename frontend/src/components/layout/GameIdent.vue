<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { RouterLink } from 'vue-router'
import { FlagIcon, LayersIcon, LayoutGridIcon, MessageCircleHeartIcon, PawPrintIcon, ScanFaceIcon } from '@lucide/vue'
import { useActiveGame } from '@/composables/useActiveGame'
import { usePlayState } from '@/composables/usePlayState'
import { getGameMeta } from '@/games/catalog'
import type { GameId } from '@/games/types'

const { inRoom } = usePlayState()
const { gameId } = useActiveGame()

const ident = computed(() => {
  const id = gameId.value
  const meta = id ? getGameMeta(id) : undefined
  if (id && meta) {
    return {
      id,
      name: meta.name,
      kicker: inRoom.value ? 'в эфире' : 'партия',
    }
  }
  return {
    id: 'hub' as const,
    name: 'Своя игра',
    kicker: 'студия',
  }
})

const Tag = computed(() => inRoom.value ? 'div' : RouterLink)

watchEffect(() => {
  document.title = ident.value.id === 'hub' || ident.value.name === 'Своя игра'
    ? 'Своя игра'
    : `${ident.value.name} · Своя игра`
})

function markIcon(id: GameId | 'hub') {
  if (id === 'quiz')
    return LayoutGridIcon
  if (id === 'whoami')
    return ScanFaceIcon
  if (id === 'golf')
    return FlagIcon
  if (id === 'deep-question')
    return MessageCircleHeartIcon
  if (id === 'platforms')
    return LayersIcon
  return PawPrintIcon
}
</script>

<template>
  <component
    :is="Tag"
    :to="inRoom ? undefined : '/'"
    class="game-ident-link group flex min-w-0 items-center gap-2.5 sm:gap-3"
    :aria-label="inRoom ? ident.name : 'Все игры'"
  >
    <span class="game-ident" :data-game="ident.id" aria-hidden="true">
      <component :is="markIcon(ident.id)" class="game-ident-glyph" />
    </span>
    <span class="flex min-w-0 flex-col leading-none">
      <span class="game-ident-kicker">{{ ident.kicker }}</span>
      <span class="game-ident-name">{{ ident.name }}</span>
    </span>
  </component>
</template>
