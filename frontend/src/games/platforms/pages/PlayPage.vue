<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'
import { HAZARD_Y, yawTowardCenter } from '@/games/platforms/board'
import { figureColor, isPlatformsPayload, presentCount } from '@/games/platforms/driver'
import { PlatformWorld } from '@/games/platforms/world'

const room = useRoom()
const canvasEl = ref<HTMLCanvasElement | null>(null)
const yaw = ref(0)
const power = ref(0)
const pulling = ref(false)
const orbiting = ref(false)
const intro = ref('')
const liveFigure = ref<{ x: number, y: number, z: number } | null>(null)
const webglError = ref(false)
const countdown = ref(0)

const payload = computed(() => {
  const value = room.snapshot.value?.payload
  return isPlatformsPayload(value) ? value : null
})

const players = computed(() => room.snapshot.value?.session.players ?? [])
const meId = computed(() => room.playerId.value)
const myTurn = computed(() => Boolean(payload.value && meId.value && payload.value.turnId === meId.value))
const canAim = computed(() => myTurn.value && payload.value?.status === 'aim')
const inOrder = computed(() => Boolean(meId.value && payload.value?.living.includes(meId.value)))

const turnName = computed(() =>
  players.value.find(player => player.id === payload.value?.turnId)?.name ?? 'игрок',
)

const roster = computed(() =>
  (payload.value?.order ?? []).map((id) => {
    const player = players.value.find(item => item.id === id)
    const out = !payload.value?.living.includes(id)
    return {
      id,
      name: player?.name ?? 'Игрок',
      mine: id === meId.value,
      active: id === payload.value?.turnId && !out,
      out,
      color: figureColor(payload.value?.order ?? [], id),
    }
  }),
)

const pads = computed(() => {
  const state = payload.value
  if (!state)
    return []
  return state.present.map((present, index) => ({
    index,
    present,
    marked: state.marked.includes(index),
    occupied: Object.values(state.cells).includes(index),
  }))
})

const powerName = computed(() => {
  if (power.value < 0.2)
    return 'Толчок'
  if (power.value < 0.72)
    return 'Сильнее'
  return 'Рывок'
})

const pullHint = computed(() => {
  if (pulling.value)
    return power.value >= 0.035 ? 'Отпустите, чтобы толкнуть' : 'Тяните дальше'
  if (power.value >= 0.035)
    return `${powerName.value} · пробел`
  return 'Зажмите фигуру и тяните · крутите поле'
})

const banner = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  if (state.status === 'warning') {
    const n = state.marked.length
    return n === 1 ? 'Платформа уходит' : `Уходят ${n} платформы`
  }
  if (state.note === 'fell')
    return 'В пропасть'
  if (state.status === 'roll')
    return 'Фигура в движении'
  if (!inOrder.value)
    return 'Вы наблюдаете'
  if (myTurn.value)
    return 'Ваш толчок'
  return `Ход — ${turnName.value}`
})

const hint = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  if (state.status === 'warning')
    return countdown.value > 0 ? `Исчезнут через ${countdown.value}` : 'Пол уходит'
  return `Круг ${state.round} · платформ ${presentCount(state)}`
})

let world: PlatformWorld | null = null
let simShot = -1
let introTimer = 0
let vanishTimer = 0
let tickTimer = 0
let pullPointer = -1
let orbitPointer = -1
let lastOrbitX = 0
let lastOrbitY = 0

function send(message: { type: string } & Record<string, unknown>) {
  try {
    room.sendGame(message)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось отправить ход')
  }
}

function push() {
  if (!canAim.value)
    return
  send({ type: 'push', yaw: yaw.value, power: power.value })
}

function skipTurn() {
  send({ type: 'skipTurn' })
}

function currentPoint() {
  const state = payload.value
  if (!state)
    return liveFigure.value
  return liveFigure.value ?? state.figures[state.turnId] ?? state.lie
}

function syncWorld() {
  const state = payload.value
  if (!world || !state)
    return
  world.sync(
    state.present,
    state.marked,
    state.figures,
    state.living,
    state.order,
    state.turnId,
  )
  if (room.isHost.value && state.status === 'roll' && state.shot !== simShot) {
    world.launch(state.turnId, state.yaw, state.power, state.lie)
    simShot = state.shot
    return
  }
  if (state.status !== 'roll') {
    simShot = state.shot
    const pos = state.figures[state.turnId]
    if (pos && room.isHost.value)
      world.place(state.turnId, pos)
    else if (pos)
      world.showFigure(state.turnId, pos, true)
    return
  }
  if (!room.isHost.value && state.shot !== simShot) {
    world.showFigure(state.turnId, state.lie, true)
    simShot = state.shot
  }
}

function applyPull(clientX: number, clientY: number) {
  const hit = world?.readPointer(clientX, clientY)
  const figure = currentPoint()
  const screen = world?.projectFigure()
  if (!hit || !figure || !screen)
    return
  const pixels = Math.hypot(clientX - screen.x, clientY - screen.y)
  const dx = hit.x - figure.x
  const dz = hit.z - figure.z
  if (Math.hypot(dx, dz) >= 0.05)
    yaw.value = Math.atan2(dx, dz)
  power.value = Math.min(1, Math.max(0, pixels - 16) / 168)
}

function onPointerDown(event: PointerEvent) {
  if (!world)
    return
  const hit = world.readPointer(event.clientX, event.clientY)
  if (canAim.value && hit?.hitsFigure) {
    pulling.value = true
    pullPointer = event.pointerId
    power.value = 0
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    applyPull(event.clientX, event.clientY)
    return
  }
  orbiting.value = true
  orbitPointer = event.pointerId
  lastOrbitX = event.clientX
  lastOrbitY = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (pulling.value && event.pointerId === pullPointer) {
    applyPull(event.clientX, event.clientY)
    return
  }
  if (!orbiting.value || event.pointerId !== orbitPointer)
    return
  world?.orbitBy(event.clientX - lastOrbitX, event.clientY - lastOrbitY)
  lastOrbitX = event.clientX
  lastOrbitY = event.clientY
}

function onPointerUp(event: PointerEvent) {
  if (pulling.value && event.pointerId === pullPointer) {
    const fired = power.value >= 0.035
    pulling.value = false
    pullPointer = -1
    if (fired)
      push()
    else
      power.value = 0
    return
  }
  if (event.pointerId === orbitPointer) {
    orbiting.value = false
    orbitPointer = -1
  }
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId === pullPointer) {
    pulling.value = false
    pullPointer = -1
    power.value = 0
  }
  if (event.pointerId === orbitPointer) {
    orbiting.value = false
    orbitPointer = -1
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault()
  world?.zoomBy(event.deltaY)
}

function onKey(event: KeyboardEvent) {
  if (!canAim.value)
    return
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON')
    return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    yaw.value -= 0.08
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    yaw.value += 0.08
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    power.value = Math.min(1, (power.value < 0.04 ? 0 : power.value) + 0.08)
  }
  else if (event.key === 'ArrowDown') {
    event.preventDefault()
    power.value = Math.max(0.04, power.value - 0.08)
  }
  else if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (power.value < 0.035)
      power.value = 0.12
    push()
  }
}

function clearTimers() {
  window.clearTimeout(introTimer)
  window.clearTimeout(vanishTimer)
  window.clearInterval(tickTimer)
}

watch(
  () => payload.value?.round,
  (round) => {
    intro.value = round ? `Круг ${round}` : ''
    window.clearTimeout(introTimer)
    introTimer = window.setTimeout(() => {
      intro.value = ''
    }, 1400)
  },
)

watch(
  () => {
    const state = payload.value
    if (!state)
      return ''
    return `${state.round}:${state.shot}:${state.status}:${state.turnId}:${state.present.join('')}:${state.marked.join(',')}`
  },
  () => syncWorld(),
)

watch(
  () => payload.value?.figures[payload.value.turnId],
  (pos) => {
    const state = payload.value
    if (!world || !pos || !state || room.isHost.value || state.status !== 'roll')
      return
    world.showFigure(state.turnId, pos)
  },
  { deep: true },
)

watch(
  () => {
    const state = payload.value
    if (!state || state.status !== 'aim' || state.turnId !== meId.value)
      return ''
    const pos = state.figures[state.turnId]
    return `${state.round}:${state.turnId}:${pos?.x.toFixed(2)}:${pos?.z.toFixed(2)}`
  },
  (key) => {
    const state = payload.value
    if (!key || !state)
      return
    const pos = state.figures[state.turnId] ?? state.lie
    yaw.value = yawTowardCenter(pos)
    power.value = 0
    pulling.value = false
  },
)

watch(
  () => {
    const state = payload.value
    return state ? `${state.status}:${state.round}:${state.marked.join(',')}` : ''
  },
  () => {
    window.clearTimeout(vanishTimer)
    window.clearInterval(tickTimer)
    countdown.value = 0
    const state = payload.value
    if (!state || state.status !== 'warning')
      return
    countdown.value = 2
    tickTimer = window.setInterval(() => {
      countdown.value = Math.max(0, countdown.value - 1)
    }, 1000)
    if (!room.isHost.value)
      return
    vanishTimer = window.setTimeout(() => {
      try {
        room.sendGame({ type: 'vanish' })
      }
      catch {
        // Круг уже сменился.
      }
    }, 2200)
  },
)

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas)
    return
  try {
    world = new PlatformWorld(canvas, {
      onSample: (sample) => {
        const state = payload.value
        if (!room.isHost.value || !state || state.status !== 'roll')
          return
        const pos = sample.figures[state.turnId]
        if (!pos)
          return
        send({
          type: 'figure',
          shot: state.shot,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: sample.velocity.x,
          vy: sample.velocity.y,
          vz: sample.velocity.z,
        })
      },
      onRest: (sample) => {
        const state = payload.value
        if (!room.isHost.value || !state || state.status !== 'roll')
          return
        const pos = sample.figures[state.turnId]
        if (!pos)
          return
        send({
          type: 'settle',
          shot: state.shot,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          hazard: sample.fallen.includes(state.turnId) || pos.y < HAZARD_Y,
          fallen: sample.fallen,
          figures: sample.figures,
        })
      },
      onFigure: (position) => {
        liveFigure.value = position
      },
      aim: () => {
        if (!canAim.value || (!pulling.value && power.value < 0.02))
          return null
        return { yaw: yaw.value, power: power.value, holdCamera: pulling.value }
      },
    })
    syncWorld()
  }
  catch {
    webglError.value = true
  }
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearTimers()
  world?.dispose()
  world = null
})
</script>

<template>
  <div v-if="webglError" class="mx-auto max-w-md py-16 text-center">
    <h1 class="font-display text-3xl">Поле не открылось</h1>
    <p class="text-muted-foreground mt-2 text-sm">В этом браузере нет WebGL. Попробуйте другое устройство.</p>
  </div>

  <div v-else class="platforms-bleed">
    <canvas
      ref="canvasEl"
      class="platforms-canvas"
      :class="{ aiming: canAim, pulling, orbiting }"
      aria-label="Девять платформ в пропасти"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @wheel.prevent="onWheel"
    />

    <div class="platforms-hud">
      <header class="platforms-top">
        <div>
          <p class="platforms-kicker">Круг {{ payload?.round ?? 1 }}</p>
          <h1 class="font-display text-3xl leading-none tracking-[0.1em] uppercase sm:text-5xl">Платформы</h1>
          <p class="mt-1 max-w-sm text-sm text-muted-foreground">{{ hint }}</p>
        </div>
        <div class="mini-map" aria-hidden="true">
          <span
            v-for="pad in pads"
            :key="pad.index"
            class="mini-pad"
            :class="{ gone: !pad.present, marked: pad.marked, occupied: pad.occupied }"
          />
        </div>
      </header>

      <ul class="platforms-roster">
        <li
          v-for="player in roster"
          :key="player.id"
          :class="{ active: player.active, mine: player.mine, out: player.out }"
        >
          <span class="dot" :style="{ background: player.color }" />
          <span>{{ player.name }}</span>
        </li>
      </ul>

      <p v-if="intro" class="platforms-intro font-display">{{ intro }}</p>
      <p v-if="banner && !canAim" class="platforms-banner">{{ banner }}</p>

      <footer class="platforms-bar" :class="{ hot: pulling }">
        <div v-if="canAim" class="platforms-aim">
          <div class="platforms-meter" :style="{ '--p': String(power) }">
            <span>Толчок</span>
            <span class="track"><span class="fill" /></span>
            <span>Рывок</span>
          </div>
          <div class="platforms-aim-row">
            <p>Ваш толчок</p>
            <p>{{ pullHint }}</p>
            <p class="power-name">{{ pulling || power >= 0.02 ? powerName : 'Фигура' }}</p>
          </div>
        </div>
        <div v-else class="platforms-aim-row">
          <p>{{ hint }}</p>
          <Button
            v-if="room.isHost.value && payload?.status === 'aim'"
            type="button"
            variant="ghost"
            size="sm"
            @click="skipTurn"
          >
            Пропустить ход
          </Button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.platforms-bleed {
  position: relative;
  height: calc(100dvh - 7.25rem);
  margin: -1rem -0.75rem;
  overflow: hidden;
  background: #0b0914;
  color: #f6f1e4;
}

.platforms-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.platforms-canvas.aiming {
  cursor: crosshair;
}

.platforms-canvas.pulling,
.platforms-canvas.orbiting {
  cursor: grabbing;
}

.platforms-hud {
  pointer-events: none;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.85rem;
  padding-bottom: max(0.85rem, env(safe-area-inset-bottom));
}

.platforms-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.platforms-kicker {
  font-family: var(--font-board);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 0.72rem;
  color: var(--primary);
}

.mini-map {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.18rem;
  width: 4.6rem;
  height: 4.6rem;
  padding: 0.35rem;
  border: 1px solid color-mix(in oklch, var(--primary) 55%, transparent);
  border-radius: 0.85rem;
  background: rgb(11 9 20 / 0.72);
}

.mini-pad {
  border-radius: 0.2rem;
  background: color-mix(in oklch, var(--primary) 28%, #2a2740);
}

.mini-pad.occupied {
  background: var(--primary);
}

.mini-pad.marked {
  background: #c45b3a;
}

.mini-pad.gone {
  background: rgb(246 241 228 / 0.08);
}

.platforms-roster {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.75rem;
  overflow-x: auto;
}

.platforms-roster li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid rgb(246 241 228 / 0.18);
  background: rgb(11 9 20 / 0.55);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.82rem;
  white-space: nowrap;
}

.platforms-roster li.active {
  border-color: var(--primary);
  background: color-mix(in oklch, var(--primary) 18%, transparent);
}

.platforms-roster li.out {
  opacity: 0.45;
  text-decoration: line-through;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
}

.platforms-intro {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  font-size: clamp(2.4rem, 8vw, 5.5rem);
  text-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
  animation: platforms-in 1.4s ease both;
}

.platforms-banner {
  position: absolute;
  left: 50%;
  bottom: 4.4rem;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgb(11 9 20 / 0.72);
  border: 1px solid color-mix(in oklch, var(--primary) 35%, transparent);
  padding: 0.35rem 0.9rem;
  font-size: 0.92rem;
  white-space: nowrap;
}

.platforms-bar {
  pointer-events: none;
  width: min(28rem, 100%);
  margin: 0 auto;
  border: 1px solid color-mix(in oklch, var(--primary) 28%, transparent);
  background: rgb(11 9 20 / 0.62);
  backdrop-filter: blur(8px);
  border-radius: 999px;
  padding: 0.45rem 0.85rem 0.5rem;
}

.platforms-bar.hot {
  border-color: color-mix(in oklch, var(--primary) 70%, transparent);
}

.platforms-bar :deep(button) {
  pointer-events: auto;
}

.platforms-meter {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--font-board);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 0.68rem;
  color: var(--primary);
}

.track {
  height: 0.28rem;
  border-radius: 999px;
  background: rgb(246 241 228 / 0.16);
  overflow: hidden;
}

.fill {
  display: block;
  height: 100%;
  width: calc(var(--p) * 100%);
  border-radius: inherit;
  background: linear-gradient(90deg, #f6f1e4, var(--primary));
}

.platforms-aim-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.2rem;
  font-size: 0.78rem;
}

.power-name {
  font-family: var(--font-display);
  color: var(--primary);
}

@keyframes platforms-in {
  0% { opacity: 0; transform: translate(-50%, -40%); }
  18% { opacity: 1; transform: translate(-50%, -50%); }
  72% { opacity: 1; }
  100% { opacity: 0; }
}

@media (min-width: 640px) {
  .platforms-bleed {
    height: calc(100dvh - 6.25rem);
    margin: -2rem -1.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .platforms-intro {
    animation: none;
  }
}
</style>
