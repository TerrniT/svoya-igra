<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { MessageCircleHeartIcon } from '@lucide/vue'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

const route = useRoute()
</script>

<template>
  <DropdownMenuItem v-if="route.name !== 'deep-question-play'" as-child>
    <RouterLink to="/deep-question">
      <MessageCircleHeartIcon />
      К вопросам
    </RouterLink>
  </DropdownMenuItem>
</template>
