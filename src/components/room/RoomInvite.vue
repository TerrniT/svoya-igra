<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { CopyIcon } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { resolveJoinUrl } from '@/lib/join-url'

const { code } = defineProps<{
  code: string
}>()

const joinUrl = ref('')
const qrSrc = ref('')

async function refresh() {
  joinUrl.value = await resolveJoinUrl(code)
  qrSrc.value = await QRCode.toDataURL(joinUrl.value, {
    width: 280,
    margin: 1,
    color: {
      dark: '#1c1108',
      light: '#f3d7a0',
    },
  })
}

watch(() => code, refresh)
onMounted(refresh)

async function copyCode() {
  await navigator.clipboard.writeText(code)
  toast.success('Код скопирован')
}

async function copyLink() {
  if (!joinUrl.value)
    return
  await navigator.clipboard.writeText(joinUrl.value)
  toast.success('Ссылка скопирована')
}
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-xl border border-primary/30 bg-muted/20 p-5">
    <p class="font-display text-primary text-xs tracking-[0.32em] uppercase">Код комнаты</p>
    <p class="font-board text-primary text-6xl tracking-[0.28em]">{{ code }}</p>
    <div class="flex flex-wrap justify-center gap-2">
      <Button variant="outline" size="sm" @click="copyCode">
        <CopyIcon data-icon="inline-start" />
        Код
      </Button>
      <Button variant="outline" size="sm" @click="copyLink">
        <CopyIcon data-icon="inline-start" />
        Ссылка
      </Button>
    </div>
    <img
      v-if="qrSrc"
      :src="qrSrc"
      alt="QR-код комнаты"
      class="size-52 rounded-xl border border-primary/25"
    >
    <p class="text-muted-foreground max-w-sm text-center text-sm">
      С другого устройства откройте камеру или введите код на экране входа. Вкладка ведущего должна оставаться открытой.
    </p>
    <p v-if="joinUrl" class="text-muted-foreground max-w-full truncate text-xs">
      {{ joinUrl }}
    </p>
  </div>
</template>
