<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'
import YardageMap from '@/games/golf/components/YardageMap.vue'
import { isGolfPayload } from '@/games/golf/driver'
import { GOLF_LEVELS, MAX_STROKES, yawTowardHole, type GolfVec } from '@/games/golf/levels'
import { GolfWorld } from '@/games/golf/world'

const room = useRoom()
const canvasEl = ref<HTMLCanvasElement | null>(null)
const yaw = ref(0)
const power = ref(0)
const pulling = ref(false)
const intro = ref('')
const liveBall = ref<GolfVec | null>(null)
const webglError = ref(false)

const payload = computed(() => {
  const value = room.snapshot.value?.payload
  return isGolfPayload(value) ? value : null
})

const players = computed(() => room.snapshot.value?.session.players ?? [])
const level = computed(() => GOLF_LEVELS[payload.value?.levelIndex ?? 0] ?? GOLF_LEVELS[0]!)
const meId = computed(() => room.playerId.value)
const myTurn = computed(() => Boolean(payload.value && meId.value && payload.value.turnId === meId.value))
const canAim = computed(() => myTurn.value && payload.value?.status === 'aim')
const inOrder = computed(() => Boolean(meId.value && payload.value?.order.includes(meId.value)))

const turnName = computed(() =>
  players.value.find(player => player.id === payload.value?.turnId)?.name ?? 'игрок',
)

const roster = computed(() =>
  (payload.value?.order ?? []).map((id) => {
    const player = players.value.find(item => item.id === id)
    const total = (payload.value?.totals[id] ?? 0) + (payload.value?.strokes[id] ?? 0)
    return {
      id,
      name: player?.name ?? 'Игрок',
      total,
      active: id === payload.value?.turnId,
      mine: id === meId.value,
      strokes: payload.value?.strokes[id] ?? 0,
    }
  }),
)

const mapBall = computed<GolfVec>(() => liveBall.value ?? payload.value?.ball ?? {
  x: level.value.tee[0],
  y: level.value.tee[1],
  z: level.value.tee[2],
})

const aimLabel = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  const holeYaw = yawTowardHole(level.value, state.ball)
  let delta = (yaw.value - holeYaw) * 180 / Math.PI
  while (delta > 180) delta -= 360
  while (delta < -180) delta += 360
  const rounded = Math.round(delta)
  if (Math.abs(rounded) < 2)
    return 'на флаг'
  return rounded < 0 ? `${Math.abs(rounded)}° левее` : `${rounded}° правее`
})

const powerName = computed(() => {
  if (power.value < 0.2)
    return 'Толчок'
  if (power.value < 0.72)
    return 'Удар'
  return 'Сильный'
})

const strokeLabel = computed(() => {
  const mine = roster.value.find(player => player.mine)
  return `Удар ${(mine?.strokes ?? 0) + 1} / ${MAX_STROKES}`
})

const pullHint = computed(() => {
  if (pulling.value)
    return power.value >= 0.035 ? 'Отпустите, чтобы ударить' : 'Тяните дальше'
  if (power.value >= 0.035)
    return `${aimLabel.value} · пробел`
  return 'Зажмите мяч и тяните'
})

const banner = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  if (state.note === 'hole')
    return 'В лунке'
  if (state.note === 'water')
    return 'Вода. Мяч на прежнем месте'
  if (state.note === 'pickup')
    return 'Лимит ударов'
  if (state.status === 'roll')
    return 'Мяч в игре'
  if (!inOrder.value)
    return state.levelIndex < GOLF_LEVELS.length - 1 ? 'Вы войдёте со следующей лунки' : 'Вы наблюдаете'
  if (myTurn.value)
    return 'Ваш удар'
  return `Ход — ${turnName.value}`
})

let world: GolfWorld | null = null
let loadedLevel = -1
let simShot = -1
let introTimer = 0
let continueTimer = 0
let pullPointer = -1

function send(message: { type: string } & Record<string, unknown>) {
  try {
    room.sendGame(message)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось отправить ход')
  }
}

function putt() {
  if (!canAim.value)
    return
  send({ type: 'putt', yaw: yaw.value, power: power.value })
}

function skipTurn() {
  send({ type: 'skipTurn' })
}

function nudge(delta: number) {
  yaw.value += delta
}

function syncWorld() {
  const state = payload.value
  if (!world || !state)
    return
  const course = GOLF_LEVELS[state.levelIndex]
  if (!course)
    return
  if (loadedLevel !== state.levelIndex) {
    world.load(course)
    loadedLevel = state.levelIndex
    simShot = -1
    liveBall.value = { ...state.ball }
  }
  if (room.isHost.value && state.status === 'roll' && state.shot !== simShot) {
    world.launch(state.yaw, state.power, state.lie)
    simShot = state.shot
    return
  }
  if (state.status !== 'roll') {
    simShot = state.shot
    if (room.isHost.value)
      world.place(state.ball)
    else
      world.showBall(state.ball, state.velocity, true)
    return
  }
  if (!room.isHost.value && state.shot !== simShot) {
    world.showBall(state.lie, state.velocity, true)
    simShot = state.shot
  }
}

function onKey(event: KeyboardEvent) {
  if (!canAim.value)
    return
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON')
    return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    nudge(-0.08)
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    nudge(0.08)
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
      power.value = 0.05
    putt()
  }
}

function ballPoint() {
  return liveBall.value ?? payload.value?.ball ?? null
}

function applyPull(clientX: number, clientY: number) {
  const hit = world?.readPointer(clientX, clientY)
  const ball = ballPoint()
  const screen = world?.projectBall()
  if (!hit || !ball || !screen)
    return
  const pixels = Math.hypot(clientX - screen.x, clientY - screen.y)
  const dx = hit.x - ball.x
  const dz = hit.z - ball.z
  if (Math.hypot(dx, dz) >= 0.05)
    yaw.value = Math.atan2(dx, dz)
  power.value = Math.min(1, Math.max(0, pixels - 16) / 168)
}

function onPointerDown(event: PointerEvent) {
  if (!canAim.value || !world)
    return
  const hit = world.readPointer(event.clientX, event.clientY)
  if (!hit?.hitsBall)
    return
  pulling.value = true
  pullPointer = event.pointerId
  power.value = 0
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  applyPull(event.clientX, event.clientY)
}

function onPointerMove(event: PointerEvent) {
  if (!pulling.value || event.pointerId !== pullPointer)
    return
  applyPull(event.clientX, event.clientY)
}

function onPointerUp(event: PointerEvent) {
  if (!pulling.value || event.pointerId !== pullPointer)
    return
  const fired = power.value >= 0.035
  pulling.value = false
  pullPointer = -1
  if (fired)
    putt()
  else
    power.value = 0
}

function onPointerCancel(event: PointerEvent) {
  if (event.pointerId !== pullPointer)
    return
  pulling.value = false
  pullPointer = -1
  power.value = 0
}

watch(
  () => payload.value?.levelIndex,
  (index) => {
    const course = GOLF_LEVELS[index ?? 0]
    intro.value = course?.name ?? ''
    window.clearTimeout(introTimer)
    introTimer = window.setTimeout(() => {
      intro.value = ''
    }, 1700)
  },
  { immediate: true },
)

watch(
  () => {
    const state = payload.value
    if (!state)
      return ''
    return `${state.levelIndex}:${state.shot}:${state.status}:${state.turnId}`
  },
  () => syncWorld(),
)

watch(
  () => payload.value?.ball,
  (ball) => {
    const state = payload.value
    if (!world || !ball || !state || room.isHost.value || state.status !== 'roll')
      return
    world.showBall(ball, state.velocity)
  },
  { deep: true },
)

watch(
  () => {
    const state = payload.value
    if (!state || state.status !== 'aim' || state.turnId !== meId.value)
      return ''
    return `${state.levelIndex}:${state.turnId}:${state.ball.x.toFixed(2)}:${state.ball.z.toFixed(2)}`
  },
  (key) => {
    const state = payload.value
    if (!key || !state)
      return
    const course = GOLF_LEVELS[state.levelIndex]
    if (course)
      yaw.value = yawTowardHole(course, state.ball)
    power.value = 0
    pulling.value = false
  },
)

watch(
  () => {
    const state = payload.value
    return state ? `${state.status}:${state.shot}:${state.levelIndex}:${state.turnId}` : ''
  },
  () => {
    window.clearTimeout(continueTimer)
    const state = payload.value
    if (!state || !room.isHost.value || state.status !== 'sunk')
      return
    continueTimer = window.setTimeout(() => {
      try {
        room.sendGame({ type: 'continue' })
      }
      catch {
        // Ход уже сменился.
      }
    }, 1500)
  },
)

onMounted(() => {
  const canvas = canvasEl.value
  if (!canvas)
    return
  try {
    world = new GolfWorld(canvas, {
      onSample: (sample) => {
        const state = payload.value
        if (!room.isHost.value || !state || state.status !== 'roll')
          return
        send({
          type: 'ball',
          shot: state.shot,
          x: sample.position.x,
          y: sample.position.y,
          z: sample.position.z,
          vx: sample.velocity.x,
          vy: sample.velocity.y,
          vz: sample.velocity.z,
        })
      },
      onRest: (sample) => {
        const state = payload.value
        if (!room.isHost.value || !state || state.status !== 'roll')
          return
        send({
          type: 'settle',
          shot: state.shot,
          x: sample.position.x,
          y: sample.position.y,
          z: sample.position.z,
          holed: sample.holed,
          hazard: sample.hazard,
        })
      },
      onBall: (position) => {
        liveBall.value = position
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
  window.clearTimeout(introTimer)
  window.clearTimeout(continueTimer)
  world?.dispose()
  world = null
})
</script>

<template>
  <div v-if="webglError" class="mx-auto max-w-md py-16 text-center">
    <h1 class="font-golf text-3xl">Поле не открылось</h1>
    <p class="mt-2 text-sm text-[#d5cbb8]">В этом браузере нет WebGL. Попробуйте другое устройство.</p>
  </div>

  <div v-else class="golf-bleed">
    <canvas
      ref="canvasEl"
      class="golf-canvas"
      :class="{ aiming: canAim, pulling }"
      aria-label="Ночное поле для гольфа"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />

    <div class="golf-hud">
      <header class="golf-top">
        <div>
          <p class="golf-kicker">Лунка {{ (payload?.levelIndex ?? 0) + 1 }} / {{ GOLF_LEVELS.length }}</p>
          <h1 class="font-golf text-3xl leading-none sm:text-5xl">{{ level.name }}</h1>
          <p class="mt-1 max-w-sm text-sm text-[#d9d0c2]">{{ level.blurb }}</p>
        </div>
        <div class="yardage-frame" aria-hidden="true">
          <YardageMap :level="level" :ball="mapBall" />
        </div>
      </header>

      <ul class="golf-roster">
        <li
          v-for="player in roster"
          :key="player.id"
          :class="{ active: player.active, mine: player.mine }"
        >
          <span>{{ player.name }}</span>
          <strong>{{ player.total }}</strong>
        </li>
      </ul>

      <p v-if="intro" class="golf-intro font-golf">{{ intro }}</p>
      <p v-if="banner && !canAim" class="golf-banner">{{ banner }}</p>

      <footer class="golf-bar" :class="{ hot: pulling }">
        <div v-if="canAim" class="golf-aim">
          <div class="golf-meter" :style="{ '--p': String(power) }">
            <span>Толчок</span>
            <span class="track"><span class="fill" /></span>
            <span>Сильный</span>
          </div>
          <div class="golf-aim-row">
            <p>{{ strokeLabel }}</p>
            <p class="power-name">{{ pulling || power >= 0.02 ? powerName : 'Мяч' }}</p>
            <p>{{ pullHint }}</p>
          </div>
        </div>
        <div v-else class="golf-aim-row">
          <p>Пар {{ level.par }}</p>
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
.font-golf {
  font-family: Fraunces, "Iowan Old Style", Palatino, serif;
  font-weight: 560;
  letter-spacing: -0.03em;
}

.golf-bleed {
  position: relative;
  height: calc(100dvh - 7.25rem);
  margin: -1rem -0.75rem;
  overflow: hidden;
  background: #07140f;
  color: #f6f1e4;
}

.golf-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.golf-canvas.aiming {
  cursor: crosshair;
}

.golf-canvas.pulling {
  cursor: grabbing;
}

.golf-hud {
  pointer-events: none;
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.85rem;
  padding-bottom: max(0.85rem, env(safe-area-inset-bottom));
}

.golf-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.golf-kicker {
  font-family: Oswald, Impact, sans-serif;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 0.72rem;
  color: #e7a23a;
}

.yardage-frame {
  width: 6.5rem;
  height: 6.5rem;
  flex: none;
  padding: 0.35rem;
  border: 1px solid rgb(231 162 58 / 0.7);
  border-radius: 0.9rem;
  background: rgb(7 20 15 / 0.72);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.28);
}

.golf-roster {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.75rem;
  overflow-x: auto;
}

.golf-roster li {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  border: 1px solid rgb(246 241 228 / 0.18);
  background: rgb(7 20 15 / 0.55);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.82rem;
  white-space: nowrap;
}

.golf-roster li strong {
  font-family: Oswald, Impact, sans-serif;
  font-weight: 500;
}

.golf-roster li.active {
  border-color: #e7a23a;
  background: rgb(231 162 58 / 0.18);
}

.golf-intro {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  font-size: clamp(3rem, 10vw, 6.5rem);
  text-shadow: 0 18px 40px rgb(0 0 0 / 0.45);
  animation: golf-in 1.7s ease both;
}

.golf-banner {
  position: absolute;
  left: 50%;
  bottom: 4.4rem;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgb(7 20 15 / 0.72);
  border: 1px solid rgb(231 162 58 / 0.35);
  padding: 0.35rem 0.9rem;
  font-size: 0.92rem;
  white-space: nowrap;
}

.golf-bar {
  pointer-events: none;
  width: min(28rem, 100%);
  margin: 0 auto;
  border: 1px solid rgb(231 162 58 / 0.28);
  background: rgb(7 20 15 / 0.62);
  backdrop-filter: blur(8px);
  border-radius: 999px;
  padding: 0.45rem 0.85rem 0.5rem;
}

.golf-bar.hot {
  border-color: rgb(231 162 58 / 0.7);
  background: rgb(7 20 15 / 0.82);
}

.golf-bar :deep(button) {
  pointer-events: auto;
}

.golf-meter {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  font-family: Oswald, Impact, sans-serif;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 0.68rem;
  color: #e7a23a;
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
  background: linear-gradient(90deg, #f6f1e4, #e7a23a);
}

.golf-aim-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: #f6f1e4;
}

.power-name {
  font-family: Fraunces, "Iowan Old Style", Palatino, serif;
  color: #e7a23a;
}

@keyframes golf-in {
  0% { opacity: 0; transform: translate(-50%, -40%); }
  18% { opacity: 1; transform: translate(-50%, -50%); }
  72% { opacity: 1; }
  100% { opacity: 0; }
}

@media (min-width: 640px) {
  .golf-bleed {
    height: calc(100dvh - 6.25rem);
    margin: -2rem -1.5rem;
  }

  .yardage-frame {
    width: 8rem;
    height: 8rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .golf-intro {
    animation: none;
  }
}
</style>
