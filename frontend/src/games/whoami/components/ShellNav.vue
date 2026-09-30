<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'

const route = useRoute()
const room = useRoom()
</script>

<template>
  <Button
    v-if="room.snapshot.value && route.name !== 'whoami-play' && room.phase.value === 'play'"
    variant="ghost"
    size="sm"
    as-child
  >
    <RouterLink to="/whoami">Стол</RouterLink>
  </Button>
</template>
