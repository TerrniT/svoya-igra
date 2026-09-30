import { computed, onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

export type CeremonyPhase =
  | 'also-rans'
  | 'podium'
  | 'bronze-player'
  | 'silver-player'
  | 'gold-reveal'
  | 'finale'

export interface CeremonyPlayer {
  id: string
  name: string
  score: number
}

const HOLD = {
  alsoRans: 2600,
  podium: 1500,
  place: 1800,
  goldReveal: 4200,
} as const

export function useResultsCeremony(players: MaybeRefOrGetter<CeremonyPlayer[]>) {
  const reducedMotion = usePreferredReducedMotion()
  const phase = ref<CeremonyPhase>('finale')
  const skipped = ref(false)
  const runId = ref(0)
  const shouldCelebrate = ref(false)

  const roster = computed(() => toValue(players))
  const gold = computed(() => roster.value[0] ?? null)
  const silver = computed(() => roster.value[1] ?? null)
  const bronze = computed(() => roster.value[2] ?? null)
  const rest = computed(() => roster.value.slice(3))
  const reduced = computed(() => reducedMotion.value === 'reduce')

  const showPodium = computed(() => phase.value !== 'also-rans')
  const alsoRansDocked = computed(() => rest.value.length > 0 && phase.value !== 'also-rans')
  const showBronzePlayer = computed(() =>
    Boolean(bronze.value) && ['bronze-player', 'silver-player', 'gold-reveal', 'finale'].includes(phase.value),
  )
  const showSilverPlayer = computed(() =>
    Boolean(silver.value) && ['silver-player', 'gold-reveal', 'finale'].includes(phase.value),
  )
  const showGoldReveal = computed(() => phase.value === 'gold-reveal')
  const showGoldPlayer = computed(() => Boolean(gold.value) && phase.value === 'finale')
  const showActions = computed(() => phase.value === 'finale')
  const instantScores = computed(() => skipped.value || reduced.value)

  let timers: number[] = []

  function clearTimers() {
    for (const id of timers)
      window.clearTimeout(id)
    timers = []
  }

  function later(ms: number, fn: () => void) {
    timers.push(window.setTimeout(fn, ms))
  }

  function steps(): Array<{ phase: CeremonyPhase, wait: number }> {
    const list: Array<{ phase: CeremonyPhase, wait: number }> = []
    if (rest.value.length)
      list.push({ phase: 'also-rans', wait: HOLD.alsoRans })
    if (gold.value || silver.value || bronze.value)
      list.push({ phase: 'podium', wait: HOLD.podium })
    if (bronze.value)
      list.push({ phase: 'bronze-player', wait: HOLD.place })
    if (silver.value)
      list.push({ phase: 'silver-player', wait: HOLD.place })
    if (gold.value)
      list.push({ phase: 'gold-reveal', wait: HOLD.goldReveal })
    list.push({ phase: 'finale', wait: 0 })
    return list
  }

  function start() {
    clearTimers()
    skipped.value = false
    shouldCelebrate.value = false

    if (reduced.value || roster.value.length === 0) {
      phase.value = 'finale'
      return
    }

    const queue = steps()
    phase.value = queue[0].phase

    let acc = 0
    for (let i = 0; i < queue.length - 1; i++) {
      acc += queue[i].wait
      const next = queue[i + 1]
      later(acc, () => {
        phase.value = next.phase
        if (next.phase === 'finale')
          shouldCelebrate.value = true
      })
    }
  }

  function skip() {
    clearTimers()
    skipped.value = true
    phase.value = 'finale'
    shouldCelebrate.value = Boolean(gold.value) && !reduced.value
  }

  function replay() {
    runId.value += 1
    start()
  }

  watch(
    () => roster.value.map(player => `${player.id}:${player.score}`).join('|'),
    start,
    { immediate: true },
  )

  onUnmounted(clearTimers)

  return {
    phase,
    skipped,
    runId,
    reduced,
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
  }
}
