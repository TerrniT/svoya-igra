<script setup lang="ts">
import { computed } from 'vue'
import GameIdent from '@/components/layout/GameIdent.vue'
import PauseOverlay from '@/components/layout/PauseOverlay.vue'
import RoomMenu from '@/components/layout/RoomMenu.vue'
import { useActiveGame } from '@/composables/useActiveGame'
import { usePlayState } from '@/composables/usePlayState'
import { useTheme } from '@/themes/apply'

const { room } = usePlayState()
const { activeModule, gameId } = useActiveGame()
const { themeId } = useTheme()

const ShellStatus = computed(() => activeModule.value?.ShellStatus)
const isLeopard = computed(() => themeId.value === 'leopard')
const paused = computed(() => Boolean(room.snapshot.value?.paused))
</script>

<template>
  <div class="relative isolate min-h-dvh" :data-game="gameId ?? 'hub'">
    <div class="theme-wash" aria-hidden="true" />
    <div v-if="isLeopard" class="theme-spots" aria-hidden="true" />

    <header class="shell-masthead relative z-20 pt-[max(0.35rem,env(safe-area-inset-top))]">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6 sm:py-3">
        <GameIdent />
        <RoomMenu />
      </div>

      <component :is="ShellStatus" v-if="ShellStatus && !paused" />
    </header>

    <PauseOverlay />

    <main
      v-show="!paused"
      class="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8"
    >
      <slot />
    </main>
  </div>
</template>
