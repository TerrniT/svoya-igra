<script setup lang="ts">
import { computed } from 'vue'
import type { GolfVec, LevelDef } from '@/games/golf/levels'

const { level, ball } = defineProps<{
  level: LevelDef
  ball: GolfVec
}>()

const shapes = computed(() =>
  level.bodies.map((body) => {
    const w = body.size[0]
    const d = body.size[2]
    const x = body.position[0] - w / 2
    const z = body.position[2] - d / 2
    return {
      key: `${body.kind}-${x.toFixed(2)}-${z.toFixed(2)}`,
      x,
      y: -(z + d),
      w,
      d,
      fill: body.kind === 'wall'
        ? '#3d2c20'
        : body.kind === 'bumper'
          ? '#c4553a'
          : body.kind === 'ramp'
            ? '#186b3c'
            : '#1f8a4c',
    }
  }),
)

const viewBox = computed(() => {
  const pad = 0.7
  let minX = level.tee[0]
  let maxX = level.tee[0]
  let minY = -level.tee[2]
  let maxY = -level.tee[2]
  for (const shape of shapes.value) {
    minX = Math.min(minX, shape.x)
    maxX = Math.max(maxX, shape.x + shape.w)
    minY = Math.min(minY, shape.y)
    maxY = Math.max(maxY, shape.y + shape.d)
  }
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
})
</script>

<template>
  <svg class="yardage" :viewBox="viewBox" role="img" aria-label="Схема лунки">
    <rect
      v-for="shape in shapes"
      :key="shape.key"
      :x="shape.x"
      :y="shape.y"
      :width="shape.w"
      :height="shape.d"
      :fill="shape.fill"
      rx="0.12"
    />
    <circle
      :cx="level.hole[0]"
      :cy="-level.hole[2]"
      r="0.38"
      fill="#0b100e"
      stroke="#e7a23a"
      stroke-width="0.1"
    />
    <circle :cx="ball.x" :cy="-ball.z" r="0.2" fill="#f6f1e4" />
  </svg>
</template>

<style scoped>
.yardage {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
