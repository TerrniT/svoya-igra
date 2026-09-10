<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import AppShell from '@/components/layout/AppShell.vue'
import RoomSync from '@/components/room/RoomSync.vue'
</script>

<template>
  <RoomSync>
    <AppShell>
      <RouterView />
    </AppShell>
    <Toaster position="top-center" rich-colors />
  </RoomSync>
</template>
