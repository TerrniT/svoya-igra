<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { FlagIcon } from '@lucide/vue'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useRoom } from '@/composables/useRoom'

const route = useRoute()
const room = useRoom()
</script>

<template>
  <DropdownMenuItem
    v-if="room.snapshot.value && route.name !== 'golf-play' && room.phase.value === 'play'"
    as-child
  >
    <RouterLink to="/golf">
      <FlagIcon />
      К лункам
    </RouterLink>
  </DropdownMenuItem>
</template>
