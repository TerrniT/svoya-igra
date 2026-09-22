<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useActiveGame } from '@/composables/useActiveGame'
import { usePlayState } from '@/composables/usePlayState'
import { useTheme } from '@/themes/apply'

const route = useRoute()
const { inRoom, me, room } = usePlayState()
const { activeModule } = useActiveGame()
const { themeId } = useTheme()

const ShellNav = computed(() => activeModule.value?.ShellNav)
const ShellStatus = computed(() => activeModule.value?.ShellStatus)
const showThemeLayers = computed(() => true)
const isLeopard = computed(() => themeId.value === 'leopard')
</script>

<template>
  <div class="relative isolate min-h-dvh">
    <div v-if="showThemeLayers" class="theme-wash" aria-hidden="true" />
    <div v-if="isLeopard" class="theme-spots" aria-hidden="true" />

    <header class="relative z-10 border-b border-border/70 bg-background/70 pt-[max(0.35rem,env(safe-area-inset-top))] backdrop-blur-md">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
        <RouterLink to="/" class="group flex min-w-0 items-center gap-2 sm:gap-3">
          <span class="brand-mark shrink-0" aria-hidden="true" />
          <span class="flex min-w-0 flex-col leading-none">
            <span class="font-display hidden sm:block text-lg tracking-[0.14em] text-foreground uppercase sm:text-2xl sm:tracking-[0.18em]">Своя игра</span>
          </span>
        </RouterLink>

        <nav class="flex shrink-0 items-center gap-1 sm:gap-2">
          <span
            v-if="inRoom && room.code.value"
            class="font-board text-primary px-1 text-lg tracking-[0.16em] sm:text-xl sm:tracking-[0.18em]"
          >
            {{ room.code.value }}
          </span>
          <Button variant="ghost" size="sm" as-child>
            <RouterLink to="/">Игры</RouterLink>
          </Button>
          <component :is="ShellNav" v-if="ShellNav && route.name !== 'join'" />
        </nav>
      </div>

      <p v-if="inRoom && me" class="text-muted-foreground mx-auto max-w-7xl px-3 pb-2 text-xs sm:hidden">
        Вы в игре как <span class="text-foreground font-medium">{{ me.name }}</span>
      </p>

      <component :is="ShellStatus" v-if="ShellStatus" />
    </header>

    <main class="relative z-10 mx-auto w-full max-w-7xl px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
      <slot />
    </main>
  </div>
</template>
