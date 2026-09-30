<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useRoom } from '@/composables/useRoom'
import { GOLF_LEVELS } from '@/games/golf/levels'
import { isGolfPayload } from '@/games/golf/driver'

const room = useRoom()
const restarting = ref(false)

const payload = computed(() => {
  const value = room.snapshot.value?.payload
  return isGolfPayload(value) ? value : null
})

const players = computed(() => room.snapshot.value?.session.players ?? [])
const isHost = computed(() => room.isHost.value)
const parTotal = GOLF_LEVELS.reduce((sum, level) => sum + level.par, 0)

const rows = computed(() => {
  const card = payload.value
  return players.value
    .map((player) => {
      const holes = card?.cards[player.id] ?? []
      const total = holes.reduce((sum, strokes) => sum + strokes, 0)
      return { player, holes, total, played: holes.length > 0 }
    })
    .filter(row => row.played)
    .sort((left, right) => left.total - right.total || left.player.name.localeCompare(right.player.name, 'ru'))
})

const best = computed(() => rows.value[0]?.total ?? null)

function holeStrokes(row: { holes: number[] }, index: number) {
  return row.holes[index] ?? null
}

function playAgain() {
  restarting.value = true
  try {
    room.playAgain()
  }
  finally {
    restarting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <header class="text-center">
      <p class="font-board text-xs tracking-[0.28em] text-[#e7a23a] uppercase">Ночная поляна</p>
      <h1 class="font-golf mt-2 text-4xl text-[#f6f1e4] sm:text-6xl">Карточка клуба</h1>
      <p class="mt-2 text-sm text-[#d5cbb8]">Пар круга {{ parTotal }}. Меньше ударов — выше место.</p>
    </header>

    <div class="scorecard overflow-x-auto">
      <table class="w-full min-w-[36rem] border-collapse text-left">
        <thead>
          <tr>
            <th>Игрок</th>
            <th v-for="(level, index) in GOLF_LEVELS" :key="level.id" :title="level.name">
              {{ index + 1 }}
            </th>
            <th>Итог</th>
          </tr>
        </thead>
        <tbody>
          <tr class="par">
            <th>Пар</th>
            <td v-for="level in GOLF_LEVELS" :key="level.id">{{ level.par }}</td>
            <td>{{ parTotal }}</td>
          </tr>
          <tr v-for="row in rows" :key="row.player.id" :class="{ winner: best !== null && row.total === best }">
            <th>
              {{ row.player.name }}
              <span v-if="best !== null && row.total === best" class="winner-mark">победитель</span>
            </th>
            <td v-for="(level, index) in GOLF_LEVELS" :key="level.id">
              {{ holeStrokes(row, index) ?? '—' }}
            </td>
            <td class="total">{{ row.total }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Button v-if="isHost" size="lg" class="mx-auto" :disabled="restarting" @click="playAgain">
      Ещё круг
    </Button>
    <p v-else class="text-center text-sm text-[#d5cbb8]">Ждём, пока ведущий запустит новый круг.</p>
  </div>
</template>

<style scoped>
.font-golf {
  font-family: Fraunces, "Iowan Old Style", Palatino, serif;
  font-weight: 560;
  letter-spacing: -0.03em;
}

.scorecard {
  background:
    linear-gradient(180deg, rgb(246 241 228 / 0.96), rgb(232 220 196 / 0.96));
  color: #1a241c;
  border-radius: 1.25rem;
  padding: 0.85rem;
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.28);
}

th, td {
  padding: 0.65rem 0.45rem;
  border-bottom: 1px solid rgb(26 36 28 / 0.12);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

th:first-child, td:first-child {
  text-align: left;
}

thead th {
  font-family: Oswald, Impact, sans-serif;
  font-weight: 500;
  letter-spacing: 0.14em;
  font-size: 0.78rem;
  text-transform: uppercase;
}

.par th, .par td {
  color: #6d6254;
  font-size: 0.82rem;
}

.winner th, .winner td {
  background: rgb(231 162 58 / 0.2);
}

.total {
  font-family: Oswald, Impact, sans-serif;
  font-size: 1.15rem;
}

.winner-mark {
  display: block;
  font-family: Fraunces, Palatino, serif;
  font-size: 0.72rem;
  font-weight: 560;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a5a12;
}
</style>
