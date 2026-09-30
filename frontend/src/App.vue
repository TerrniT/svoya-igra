<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import AppShell from '@/components/layout/AppShell.vue'
import RoomSync from '@/components/room/RoomSync.vue'
import { useRoom } from '@/composables/useRoom'

const room = useRoom()
</script>

<template>
  <RoomSync>
    <AppShell>
      <RouterView v-if="!room.blockingRestore.value" />
    </AppShell>
    <Toaster position="top-center" rich-colors />
  </RoomSync>
</template>
