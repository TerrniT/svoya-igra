<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <Button variant="outline" size="sm" as-child>
    <RouterLink to="/deep-question">Вопросы</RouterLink>
  </Button>
</template>
