<script setup lang="ts">
import { nextTick, onUnmounted, useTemplateRef, watch } from 'vue'
import type { Options as ConfettiOptions } from 'canvas-confetti'
import { CrownIcon } from '@lucide/vue'
import { Confetti } from '@/components/inspira/ui/confetti'
import { NumberTicker } from '@/components/inspira/ui/number-ticker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import GoldReveal from '@/components/results/GoldReveal.vue'
import { useResultsCeremony, type CeremonyPlayer } from '@/composables/useResultsCeremony'
import { cn } from '@/lib/utils'

const { players, meId = null } = defineProps<{
  players: CeremonyPlayer[]
  meId?: string | null
}>()

const emit = defineEmits<{
  done: [finished: boolean]
}>()

const {
  phase,
  runId,
  gold,
  silver,
  bronze,
  rest,
  showPodium,
  alsoRansDocked,
  showBronzePlayer,
  showSilverPlayer,
  showGoldReveal,
  showGoldPlayer,
  showActions,
  instantScores,
  shouldCelebrate,
  skip,
  replay,
} = useResultsCeremony(() => players)
const confetti = useTemplateRef<{ fire: (options?: ConfettiOptions) => void }>('confetti')

watch(showActions, (finished) => emit('done', finished), { immediate: true })

const SAVANNA_COLORS = ['#e8b84a', '#f5d76e', '#fff1b8', '#c47a2c', '#ff9f43', '#8b5a2b']

let fireworksTimer: number | null = null

function stopFireworks() {
  if (fireworksTimer !== null) {
    window.clearInterval(fireworksTimer)
    fireworksTimer = null
  }
}

function burst(options: ConfettiOptions) {
  confetti.value?.fire({
    colors: SAVANNA_COLORS,
    disableForReducedMotion: true,
    ...options,
  })
}

function celebrate() {
  stopFireworks()
  burst({
    particleCount: 140,
    spread: 80,
    startVelocity: 52,
    origin: { x: 0.5, y: 0.35 },
    scalar: 1.15,
  })

  const endsAt = Date.now() + 3800
  fireworksTimer = window.setInterval(() => {
    if (Date.now() > endsAt) {
      stopFireworks()
      return
    }

    burst({
      particleCount: 36,
      spread: 64,
      startVelocity: 38,
      origin: { x: 0.18, y: 0.22 },
    })
    burst({
      particleCount: 36,
      spread: 64,
      startVelocity: 38,
      origin: { x: 0.82, y: 0.22 },
    })
  }, 280)
}

watch(shouldCelebrate, async (celebrateNow) => {
  if (!celebrateNow) {
    stopFireworks()
    return
  }
  await nextTick()
  celebrate()
})

onUnmounted(stopFireworks)

function scoreDuration(place: 'rest' | 'metal' | 'gold') {
  if (instantScores.value)
    return 0
  if (place === 'gold')
    return 1600
  if (place === 'metal')
    return 1200
  return 900
}
</script>

<template>
  <div class="ceremony" :data-phase="phase">
    <Confetti
      ref="confetti"
      manualstart
      :global-options="{ resize: true, useWorker: true }"
    />

    <GoldReveal
      v-if="showGoldReveal && gold"
      :key="`gold-${runId}`"
      :name="gold.name"
      :score="gold.score"
      :instant="instantScores"
      :mine="gold.id === meId"
    />

    <div class="flex flex-col items-center gap-3 pt-1 text-center">
      <Badge variant="secondary">Конец охоты</Badge>
      <h1 class="font-display text-4xl tracking-[0.14em] uppercase sm:text-5xl">
        {{ phase === 'also-rans' ? 'За чертой' : 'Пьедестал' }}
      </h1>
      <p class="text-muted-foreground max-w-md text-sm sm:text-base">
        {{ phase === 'also-rans'
          ? 'Сначала те, кому не хватило до медалей.'
          : 'Бронза, серебро, золото — и имя царя саванны.' }}
      </p>
    </div>

    <section
      v-if="rest.length"
      :class="cn('also-rans', alsoRansDocked && 'also-rans-docked')"
      aria-label="Игроки вне пьедестала"
    >
      <p class="also-rans-kicker">
        Не дотянулись до 1, 2 и 3 места
      </p>
      <ol class="also-rans-list">
        <li
          v-for="(player, index) in rest"
          :key="player.id"
          class="also-ran"
          :class="player.id === meId && 'player-me'"
          :style="{ '--stagger': `${index * 90}ms` }"
        >
          <span class="font-board text-muted-foreground text-xl">{{ index + 4 }}</span>
          <span class="min-w-0 truncate font-medium">{{ player.name }}</span>
          <Badge v-if="player.id === meId">Вы</Badge>
          <NumberTicker
            :key="`${runId}-rest-${player.id}`"
            :value="player.score"
            :duration="scoreDuration('rest')"
            :delay="index * 70"
            :decimal-places="0"
            class="font-board text-primary ml-auto text-2xl"
          />
        </li>
      </ol>
    </section>

    <section
      v-if="showPodium && (gold || silver || bronze)"
      class="podium-stage"
      aria-label="Пьедестал"
    >
      <div
        v-if="silver"
        class="podium-col podium-silver"
      >
        <div
          v-if="showSilverPlayer"
          class="podium-player"
        >
          <span class="podium-nick">{{ silver.name }}</span>
          <NumberTicker
            :key="`${runId}-silver`"
            :value="silver.score"
            :duration="scoreDuration('metal')"
            :decimal-places="0"
            class="font-board podium-points"
          />
        </div>
        <div class="podium-stand">
          <span class="podium-place">II</span>
          <span class="podium-metal">Серебро</span>
        </div>
      </div>

      <div
        v-if="gold"
        class="podium-col podium-gold"
      >
        <div
          v-if="showGoldPlayer"
          class="podium-player podium-player-gold"
        >
          <CrownIcon class="text-primary" />
          <span class="podium-nick">{{ gold.name }}</span>
          <NumberTicker
            :key="`${runId}-gold`"
            :value="gold.score"
            :duration="scoreDuration('gold')"
            :decimal-places="0"
            class="font-board podium-points"
          />
        </div>
        <div class="podium-stand">
          <span class="podium-place">I</span>
          <span class="podium-metal">Золото</span>
        </div>
      </div>

      <div
        v-if="bronze"
        class="podium-col podium-bronze"
      >
        <div
          v-if="showBronzePlayer"
          class="podium-player"
        >
          <span class="podium-nick">{{ bronze.name }}</span>
          <NumberTicker
            :key="`${runId}-bronze`"
            :value="bronze.score"
            :duration="scoreDuration('metal')"
            :decimal-places="0"
            class="font-board podium-points"
          />
        </div>
        <div class="podium-stand">
          <span class="podium-place">III</span>
          <span class="podium-metal">Бронза</span>
        </div>
      </div>
    </section>

    <div v-if="showActions" class="flex justify-center">
      <Button variant="ghost" size="sm" @click="replay()">
        Показать ещё раз
      </Button>
    </div>

    <Teleport to="body">
      <div v-if="!showActions" class="ceremony-toolbar">
        <Button variant="secondary" size="sm" @click="skip()">
          Пропустить
        </Button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ceremony {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 3.5rem;
}

.also-rans {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.also-rans-kicker {
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: oklch(0.74 0.03 75);
  text-align: center;
}

.also-rans-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.also-ran {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.95rem;
  border: 1px solid oklch(0.78 0.155 78 / 0.22);
  background: oklch(0.2 0.03 48 / 0.78);
  animation: ran-in 520ms cubic-bezier(0.16, 1, 0.3, 1) var(--stagger) both;
}

.also-rans-docked .also-rans-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}

.also-rans-docked .also-ran {
  padding: 0.28rem 0.75rem;
  border-radius: 999px;
  animation: none;
}

.also-rans-docked .also-ran .text-2xl {
  font-size: 1.1rem;
}

.podium-stage {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.55rem;
  min-height: 22rem;
  padding-top: 1rem;
}

.podium-col {
  display: flex;
  width: min(11.5rem, 30vw);
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
}

.podium-player {
  display: flex;
  min-height: 4.6rem;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  text-align: center;
  animation: player-drop 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.podium-player-gold {
  min-height: 5.4rem;
}

.podium-nick {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 650;
  font-size: 1.05rem;
}

.podium-points {
  font-size: 1.85rem;
  color: var(--primary);
}

.podium-stand {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
  padding-bottom: 0.85rem;
  border: 1px solid transparent;
  border-radius: 0.85rem 0.85rem 0.35rem 0.35rem;
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.22),
    0 16px 28px oklch(0.08 0.02 40 / 0.38);
  transform-origin: bottom center;
}

.podium-place {
  font-family: var(--font-board);
  font-size: 2.1rem;
  letter-spacing: 0.08em;
}

.podium-metal {
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.podium-bronze .podium-stand {
  height: 8.2rem;
  color: oklch(0.86 0.07 55);
  border-color: oklch(0.62 0.1 50 / 0.55);
  background:
    linear-gradient(180deg, oklch(0.58 0.12 52), oklch(0.32 0.08 45));
  animation: stand-rise 780ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.podium-silver .podium-stand {
  height: 10.6rem;
  color: oklch(0.93 0.02 240);
  border-color: oklch(0.82 0.03 230 / 0.55);
  background:
    linear-gradient(180deg, oklch(0.78 0.02 230), oklch(0.38 0.02 240));
  animation: stand-rise 780ms cubic-bezier(0.16, 1, 0.3, 1) 160ms both;
}

.podium-gold .podium-stand {
  height: 13.6rem;
  color: oklch(0.22 0.04 70);
  border-color: oklch(0.86 0.16 82 / 0.7);
  background:
    linear-gradient(180deg, oklch(0.88 0.16 90), oklch(0.58 0.14 70));
  animation: stand-rise 820ms cubic-bezier(0.16, 1, 0.3, 1) 320ms both;
}

.podium-gold .podium-place,
.podium-gold .podium-metal {
  color: oklch(0.2 0.04 55);
}

.ceremony-toolbar {
  position: fixed;
  inset-inline: 0;
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 90;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.ceremony-toolbar :deep([data-slot="button"]) {
  pointer-events: auto;
}

@keyframes ran-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes stand-rise {
  0% {
    opacity: 0;
    transform: translateY(70%) scaleY(0.86);
  }
  72% {
    opacity: 1;
    transform: translateY(-4%) scaleY(1.02);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes player-drop {
  from {
    opacity: 0;
    transform: translateY(-18px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 640px) {
  .podium-stage {
    min-height: 18rem;
    gap: 0.35rem;
  }

  .podium-col {
    width: min(7.4rem, 31vw);
  }

  .podium-bronze .podium-stand { height: 6.4rem; }
  .podium-silver .podium-stand { height: 8.2rem; }
  .podium-gold .podium-stand { height: 10.4rem; }

  .podium-nick { font-size: 0.86rem; }
  .podium-points { font-size: 1.35rem; }
  .podium-place { font-size: 1.5rem; }
}

@media (prefers-reduced-motion: reduce) {
  .also-ran,
  .podium-stand,
  .podium-player {
    animation: none;
  }
}
</style>
