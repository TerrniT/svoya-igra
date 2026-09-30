<script setup lang="ts">
import type {
  GlobalOptions as ConfettiGlobalOptions,
  CreateTypes as ConfettiInstance,
  Options as ConfettiOptions,
} from 'canvas-confetti'
import { create } from 'canvas-confetti'
import { onMounted, onUnmounted, provide, useTemplateRef } from 'vue'
import { cn } from '@/lib/utils'

interface ConfettiApi {
  fire: (options?: ConfettiOptions) => void
}

const props = withDefaults(defineProps<{
  options?: ConfettiOptions
  globalOptions?: ConfettiGlobalOptions
  manualstart?: boolean
  class?: string
}>(), {
  manualstart: false,
})

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef')
let instance: ConfettiInstance | null = null

function fire(opts: ConfettiOptions = {}) {
  instance?.({ ...props.options, ...opts })
}

const api: ConfettiApi = { fire }
provide('ConfettiContext', api)

onMounted(() => {
  if (!canvasRef.value)
    return

  instance = create(canvasRef.value, {
    resize: true,
    useWorker: true,
    disableForReducedMotion: true,
    ...props.globalOptions,
  })

  if (!props.manualstart)
    fire()
})

onUnmounted(() => {
  instance?.reset()
  instance = null
})

defineExpose({
  fire,
})
</script>

<template>
  <canvas
    ref="canvasRef"
    :class="cn('pointer-events-none fixed inset-0 z-[80] size-full', props.class)"
  />
</template>
