import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { GameId, GameModule } from '@/games/types'
import { loadGame } from '@/games/load-game'
import { useRoom } from '@/composables/useRoom'
import { isGameId } from '@/games/catalog'

const activeModule = shallowRef<GameModule | null>(null)
const loadError = ref('')
const loading = ref(false)
let lastRequested: GameId | null = null

async function ensureGame(id: GameId | null) {
  if (!id) {
    activeModule.value = null
    loadError.value = ''
    lastRequested = null
    return
  }
  if (lastRequested === id && activeModule.value?.id === id)
    return

  lastRequested = id
  loading.value = true
  loadError.value = ''
  try {
    activeModule.value = await loadGame(id)
  }
  catch (error) {
    activeModule.value = null
    loadError.value = error instanceof Error ? error.message : 'Не удалось загрузить игру'
  }
  finally {
    loading.value = false
  }
}

export function useActiveGame() {
  const room = useRoom()
  const route = useRoute()

  const gameId = computed<GameId | null>(() => {
    if (room.gameId.value && isGameId(room.gameId.value))
      return room.gameId.value
    const fromMeta = route.meta.gameId
    if (typeof fromMeta === 'string' && isGameId(fromMeta))
      return fromMeta
    const fromParam = route.params.gameId
    const param = Array.isArray(fromParam) ? fromParam[0] : fromParam
    if (typeof param === 'string' && isGameId(param))
      return param
    return null
  })

  watch(gameId, id => { void ensureGame(id) }, { immediate: true })

  return {
    activeModule,
    loadError,
    loading,
    gameId,
  }
}
