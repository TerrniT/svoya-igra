<script setup lang="ts">
import { NumberTicker } from '@/components/inspira/ui/number-ticker'
import { cn } from '@/lib/utils'

const { name, score, instant = false, mine = false } = defineProps<{
  name: string
  score: number
  instant?: boolean
  mine?: boolean
}>()

const streaks = Array.from({ length: 14 }, (_, index) => ({
  angle: index * (360 / 14),
  delay: 120 + (index % 7) * 70,
  length: index % 2 === 0 ? 1 : 0.72,
}))
</script>

<template>
  <Teleport to="body">
    <div class="gold-reveal" role="dialog" aria-modal="true" aria-label="Победитель">
      <div class="gold-reveal-wash" aria-hidden="true" />
      <div class="gold-reveal-rays" aria-hidden="true" />
      <div class="gold-reveal-bloom" aria-hidden="true" />

      <span
        v-for="streak in streaks"
        :key="streak.angle"
        class="gold-streak"
        aria-hidden="true"
        :style="{
          '--angle': `${streak.angle}deg`,
          '--delay': `${streak.delay}ms`,
          '--length': String(streak.length),
        }"
      />

      <span class="gold-ring" aria-hidden="true" />
      <span class="gold-ring gold-ring-late" aria-hidden="true" />

      <div class="gold-reveal-copy">
        <p class="gold-kicker">
          Золото охоты
        </p>
        <p :class="cn('gold-name', mine && 'gold-name-mine')">
          {{ name }}
        </p>
        <p class="gold-score-line">
          <NumberTicker
            :key="`${name}-${score}`"
            :value="score"
            :delay="instant ? 0 : 280"
            :duration="instant ? 0 : 1600"
            :decimal-places="0"
            class="gold-score"
          />
        </p>
        <p class="gold-score-label">
          очков
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gold-reveal {
  position: fixed;
  inset: 0;
  z-index: 70;
  overflow: hidden;
  display: grid;
  place-items: center;
  animation: gold-veil-in 420ms ease-out both;
}

.gold-reveal-wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 50% 45%, oklch(0.42 0.12 80 / 0.72), transparent 70%),
    oklch(0.08 0.03 50 / 0.94);
}

.gold-reveal-rays {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 160vmax;
  height: 160vmax;
  translate: -50% -50%;
  background: repeating-conic-gradient(
    from 0deg,
    oklch(0.88 0.16 85 / 0) 0 9deg,
    oklch(0.9 0.16 85 / 0.16) 9deg 12deg,
    oklch(0.88 0.16 85 / 0) 12deg 18deg
  );
  mask-image: radial-gradient(circle at center, black 8%, transparent 58%);
  animation: gold-spin 22s linear infinite;
}

.gold-reveal-bloom {
  position: absolute;
  left: 50%;
  top: 48%;
  width: min(38rem, 80vw);
  height: min(38rem, 80vw);
  translate: -50% -50%;
  border-radius: 999px;
  background:
    radial-gradient(circle, oklch(0.92 0.16 95 / 0.55) 0 12%, oklch(0.78 0.16 80 / 0.18) 32%, transparent 68%);
  animation: gold-bloom 1.6s ease-out both;
}

.gold-streak {
  position: absolute;
  left: 50%;
  top: 48%;
  width: calc(min(72vw, 46rem) * var(--length));
  height: 3px;
  background: linear-gradient(
    90deg,
    oklch(0.98 0.08 100 / 0.95),
    oklch(0.86 0.16 85 / 0.45),
    transparent
  );
  transform: rotate(var(--angle)) scaleX(0);
  transform-origin: left center;
  filter: blur(0.3px);
  animation: gold-streak 1.05s cubic-bezier(0.16, 1, 0.3, 1) var(--delay) both;
}

.gold-ring,
.gold-ring-late {
  position: absolute;
  left: 50%;
  top: 48%;
  width: min(16rem, 46vw);
  height: min(16rem, 46vw);
  border: 2px solid oklch(0.9 0.14 90 / 0.7);
  border-radius: 999px;
  translate: -50% -50%;
  animation: gold-ring 1.4s ease-out 180ms both;
}

.gold-ring-late {
  animation-delay: 640ms;
  border-color: oklch(0.86 0.16 85 / 0.4);
}

.gold-reveal-copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.5rem;
  text-align: center;
}

.gold-kicker {
  font-family: var(--font-display);
  font-size: 0.82rem;
  letter-spacing: 0.46em;
  text-transform: uppercase;
  color: oklch(0.9 0.12 90);
  animation: gold-rise 640ms cubic-bezier(0.16, 1, 0.3, 1) 80ms both;
}

.gold-name {
  max-width: min(92vw, 28rem);
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: clamp(3.2rem, 14vw, 7.4rem);
  line-height: 0.86;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: oklch(0.97 0.04 95);
  text-shadow:
    0 0 28px oklch(0.86 0.16 85 / 0.55),
    0 12px 40px oklch(0.2 0.04 50 / 0.45);
  animation: gold-slam 820ms cubic-bezier(0.16, 1, 0.3, 1) 180ms both;
}

.gold-name-mine {
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.12em;
}

.gold-score-line {
  margin-top: 0.7rem;
}

.gold-score {
  font-family: var(--font-board);
  font-size: clamp(3.6rem, 16vw, 8rem);
  line-height: 0.9;
  color: oklch(0.86 0.16 82);
  text-shadow: 0 0 34px oklch(0.78 0.16 80 / 0.55);
}

.gold-score-label {
  font-size: 0.78rem;
  letter-spacing: 0.38em;
  text-transform: uppercase;
  color: oklch(0.86 0.05 85 / 0.75);
  animation: gold-rise 700ms ease-out 900ms both;
}

@keyframes gold-veil-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes gold-spin {
  to { transform: rotate(360deg); }
}

@keyframes gold-bloom {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes gold-streak {
  0% {
    transform: rotate(var(--angle)) scaleX(0);
    opacity: 0;
  }
  35% { opacity: 1; }
  100% {
    transform: rotate(var(--angle)) scaleX(1);
    opacity: 0.28;
  }
}

@keyframes gold-ring {
  from { transform: scale(0.2); opacity: 0.85; }
  to { transform: scale(2.35); opacity: 0; }
}

@keyframes gold-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}

@keyframes gold-slam {
  0% {
    opacity: 0;
    transform: scale(2.15) rotate(-5deg);
    filter: blur(14px);
  }
  62% {
    opacity: 1;
    transform: scale(0.94) rotate(1deg);
    filter: blur(0);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
    filter: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gold-reveal,
  .gold-reveal-rays,
  .gold-reveal-bloom,
  .gold-streak,
  .gold-ring,
  .gold-kicker,
  .gold-name,
  .gold-score-label {
    animation: none;
  }

  .gold-streak {
    transform: rotate(var(--angle)) scaleX(1);
    opacity: 0.2;
  }
}
</style>
