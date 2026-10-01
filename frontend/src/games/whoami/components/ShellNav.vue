<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { ScanFaceIcon } from '@lucide/vue'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useRoom } from '@/composables/useRoom'

const route = useRoute()
const room = useRoom()
</script>

<template>
  <DropdownMenuItem
    v-if="room.snapshot.value && route.name !== 'whoami-play' && room.phase.value === 'play'"
    as-child
  >
    <RouterLink to="/whoami">
      <ScanFaceIcon />
      Карточки
    </RouterLink>
  </DropdownMenuItem>
</template>
