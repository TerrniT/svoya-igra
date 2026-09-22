<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { usePlayState } from '@/composables/usePlayState'

const route = useRoute()
const { canEditBank } = usePlayState()
</script>

<template>
  <template v-if="canEditBank && route.name !== 'join'">
    <Button variant="ghost" size="sm" as-child>
      <RouterLink to="/game">Поле</RouterLink>
    </Button>
    <Button variant="outline" size="sm" as-child>
      <RouterLink to="/admin">Админка</RouterLink>
    </Button>
  </template>
</template>
