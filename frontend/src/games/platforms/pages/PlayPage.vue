<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'
import {
  cellLabel,
  figureColor,
  isPlatformsPayload,
  legalPushTargets,
  legalShoveTargets,
  occupants,
  presentCount,
} from '@/games/platforms/driver'
import { cn } from '@/lib/utils'

const room = useRoom()
const countdown = ref(0)
let vanishTimer = 0
let tickTimer = 0

const payload = computed(() => {
  const value = room.snapshot.value?.payload
  return isPlatformsPayload(value) ? value : null
})

const players = computed(() => room.snapshot.value?.session.players ?? [])
const meId = computed(() => room.playerId.value)
const myTurn = computed(() => Boolean(payload.value && meId.value && payload.value.turnId === meId.value))
const inOrder = computed(() => Boolean(meId.value && payload.value?.order.includes(meId.value)))
const living = computed(() => payload.value?.living ?? [])

const turnName = computed(() =>
  players.value.find(player => player.id === payload.value?.turnId)?.name ?? 'игрок',
)

const pushTargets = computed(() => {
  if (!payload.value || !meId.value || !myTurn.value || payload.value.status !== 'move')
    return []
  return legalPushTargets(payload.value, meId.value)
})

const shoveTargets = computed(() => {
  if (!payload.value || !meId.value || !myTurn.value)
    return []
  return legalShoveTargets(payload.value, meId.value)
})

const canStay = computed(() =>
  Boolean(payload.value && meId.value && myTurn.value && payload.value.status === 'move' && pushTargets.value.length === 0),
)

const cells = computed(() => {
  const state = payload.value
  if (!state)
    return []
  return state.present.map((present, index) => {
    const here = occupants(state, index).map((id) => {
      const player = players.value.find(item => item.id === id)
      return {
        id,
        name: player?.name ?? 'Игрок',
        mine: id === meId.value,
        color: figureColor(state.order, id),
        initial: (player?.name ?? '?').trim().slice(0, 1).toUpperCase(),
      }
    })
    return {
      index,
      present,
      marked: state.marked.includes(index),
      gone: !present,
      figures: here,
      target: pushTargets.value.includes(index),
      stayHere: canStay.value && state.positions[meId.value ?? ''] === index,
    }
  })
})

const roster = computed(() =>
  (payload.value?.order ?? []).map((id) => {
    const player = players.value.find(item => item.id === id)
    const out = payload.value?.eliminated.includes(id) || !living.value.includes(id)
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

const banner = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  if (state.status === 'warning') {
    const n = state.marked.length
    return n === 1 ? 'Платформа уходит' : `Уходят ${n} платформы`
  }
  if (state.status === 'shove') {
    if (myTurn.value)
      return 'Последняя платформа. Столкните соперника'
    return `${turnName.value} выбирает, кого столкнуть`
  }
  if (!inOrder.value)
    return 'Вы наблюдаете'
  if (myTurn.value)
    return canStay.value ? 'Некуда толкать — останьтесь' : 'Толкните фигуру на соседнюю платформу'
  return `Ход — ${turnName.value}`
})

const hint = computed(() => {
  const state = payload.value
  if (!state)
    return ''
  if (state.status === 'warning')
    return countdown.value > 0 ? `Исчезнут через ${countdown.value}` : 'Пол уходит'
  if (state.status === 'shove' && myTurn.value)
    return 'Нажмите на чужую фигуру'
  if (myTurn.value && pushTargets.value.length)
    return 'Нажмите на соседнюю платформу'
  return `Круг ${state.round} · платформ ${presentCount(state)}`
})

function send(message: { type: string } & Record<string, unknown>) {
  try {
    room.sendGame(message)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : 'Не удалось отправить ход')
  }
}

function pushTo(index: number) {
  if (!myTurn.value || !payload.value || payload.value.status !== 'move')
    return
  send({ type: 'push', to: index })
}

function shove(playerId: string) {
  if (!myTurn.value || !payload.value || payload.value.status !== 'shove')
    return
  send({ type: 'shove', playerId })
}

function skipTurn() {
  send({ type: 'skipTurn' })
}

function clearTimers() {
  window.clearTimeout(vanishTimer)
  window.clearInterval(tickTimer)
}

watch(
  () => {
    const state = payload.value
    return state ? `${state.status}:${state.round}:${state.marked.join(',')}` : ''
  },
  () => {
    clearTimers()
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

watch(
  () => payload.value?.winnerId,
  (winnerId) => {
    if (winnerId && room.isHost.value && payload.value?.living.length === 1) {
      try {
        room.sendGame({ type: 'resolve' })
      }
      catch {
        // Итог уже открыт.
      }
    }
  },
)

onUnmounted(clearTimers)
</script>

<template>
  <div v-if="payload" class="mx-auto flex max-w-xl flex-col gap-5">
    <header class="text-center">
      <p class="platforms-kicker">Круг {{ payload.round }}</p>
      <h1 class="font-display text-3xl tracking-[0.12em] uppercase sm:text-5xl">Платформы</h1>
      <p class="text-muted-foreground mt-2 text-sm sm:text-base">{{ banner }}</p>
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

    <div class="platforms-board" role="grid" aria-label="Поле из девяти платформ">
      <div
        v-for="cell in cells"
        :key="cell.index"
        role="gridcell"
        :aria-label="cell.gone
          ? `Платформа ${cellLabel(cell.index)} исчезла`
          : `Платформа ${cellLabel(cell.index)}${cell.marked ? ', уходит' : ''}`"
        :class="cn(
          'platform',
          cell.gone && 'gone',
          cell.marked && 'marked',
          cell.target && 'target',
          cell.stayHere && 'target',
        )"
        @click="cell.stayHere || cell.target ? pushTo(cell.index) : undefined"
      >
        <span v-if="cell.marked" class="crack">уходит</span>
        <span v-if="cell.gone" class="void" aria-hidden="true" />
        <span class="figures">
          <button
            v-for="figure in cell.figures"
            :key="figure.id"
            type="button"
            class="figure"
            :class="{ mine: figure.mine, hot: shoveTargets.includes(figure.id) }"
            :style="{ '--figure': figure.color }"
            :disabled="!shoveTargets.includes(figure.id)"
            :aria-label="`${figure.name} на платформе ${cellLabel(cell.index)}`"
            @click.stop="shove(figure.id)"
          >
            {{ figure.initial }}
          </button>
        </span>
      </div>
    </div>

    <footer class="platforms-bar">
      <p>{{ hint }}</p>
      <Button
        v-if="room.isHost.value && payload.status !== 'warning'"
        type="button"
        variant="ghost"
        size="sm"
        @click="skipTurn"
      >
        Пропустить ход
      </Button>
    </footer>
  </div>
</template>

<style scoped>
.platforms-kicker {
  font-family: var(--font-board);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 0.72rem;
  color: var(--primary);
}

.platforms-roster {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
}

.platforms-roster li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid color-mix(in oklch, var(--foreground) 16%, transparent);
  background: color-mix(in oklch, var(--card) 80%, transparent);
  border-radius: 999px;
  padding: 0.28rem 0.7rem;
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

.platforms-board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
  aspect-ratio: 1;
}

.platform {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  border-radius: 1.05rem;
  border: 1px solid color-mix(in oklch, var(--primary) 28%, transparent);
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--card) 92%, white), color-mix(in oklch, var(--card) 70%, black));
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.14),
    0 10px 22px oklch(0 0 0 / 0.22);
  color: inherit;
}

.platform.target,
.platform:has(.figure.hot) {
  cursor: pointer;
}

.platform.target {
  border-color: var(--primary);
  box-shadow:
    0 0 0 2px color-mix(in oklch, var(--primary) 55%, transparent),
    0 12px 24px oklch(0 0 0 / 0.24);
}

.platform.marked {
  animation: platform-warn 0.9s ease-in-out infinite;
  border-color: color-mix(in oklch, var(--destructive) 70%, var(--primary));
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--destructive) 28%, var(--card)), color-mix(in oklch, var(--card) 70%, black));
}

.platform.gone {
  border-style: dashed;
  border-color: color-mix(in oklch, var(--foreground) 14%, transparent);
  background: color-mix(in oklch, var(--background) 70%, black);
  box-shadow: none;
}

.void {
  width: 42%;
  height: 42%;
  border-radius: 999px;
  background: radial-gradient(circle, oklch(0.08 0.03 280) 0 55%, transparent 72%);
  opacity: 0.85;
}

.crack {
  position: absolute;
  top: 0.4rem;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-board);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--primary-foreground);
  background: color-mix(in oklch, var(--destructive) 80%, var(--primary));
  border-radius: 999px;
  padding: 0.08rem 0.4rem;
}

.figures {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  padding: 0.35rem;
}

.figure {
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 999px;
  border: 2px solid color-mix(in oklch, var(--figure) 80%, white);
  background: var(--figure);
  color: oklch(0.16 0.02 80);
  font-family: var(--font-board);
  font-size: 0.95rem;
  line-height: 1;
}

.figure:disabled {
  pointer-events: none;
}

.figure.mine {
  box-shadow: 0 0 0 2px color-mix(in oklch, var(--foreground) 70%, transparent);
}

.figure.hot {
  pointer-events: auto;
  cursor: pointer;
  transform: scale(1.08);
  box-shadow: 0 0 0 3px var(--primary);
}

.platforms-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid color-mix(in oklch, var(--primary) 22%, transparent);
  background: color-mix(in oklch, var(--card) 72%, transparent);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  font-size: 0.86rem;
}

@keyframes platform-warn {
  0%,
  100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@media (prefers-reduced-motion: reduce) {
  .platform.marked {
    animation: none;
  }
}
</style>
