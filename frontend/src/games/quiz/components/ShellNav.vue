<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { BookOpenIcon, LayoutGridIcon } from '@lucide/vue'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { usePlayState } from '@/composables/usePlayState'

const route = useRoute()
const { canEditBank } = usePlayState()
</script>

<template>
  <template v-if="canEditBank && route.name !== 'join'">
    <DropdownMenuItem as-child>
      <RouterLink to="/game">
        <LayoutGridIcon />
        Игровое поле
      </RouterLink>
    </DropdownMenuItem>
    <DropdownMenuItem as-child>
      <RouterLink to="/admin">
        <BookOpenIcon />
        Вопросы
      </RouterLink>
    </DropdownMenuItem>
  </template>
</template>
