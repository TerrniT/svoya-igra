import { ref, watch, type Ref } from 'vue'
import type { ThemeId } from './catalog'

const currentThemeId = ref<ThemeId>('studio')

export function useTheme(): { themeId: Ref<ThemeId>, setTheme: (id: ThemeId) => void } {
  return {
    themeId: currentThemeId,
    setTheme,
  }
}

export function setTheme(id: ThemeId) {
  currentThemeId.value = id
  if (typeof document === 'undefined')
    return
  document.documentElement.dataset.theme = id
}

export function applyThemeFromId(id: string | null | undefined, fallback: ThemeId = 'studio') {
  const next = (id === 'studio' || id === 'paper' || id === 'leopard') ? id : fallback
  setTheme(next)
}

if (typeof document !== 'undefined') {
  setTheme(currentThemeId.value)
  watch(currentThemeId, (id) => {
    document.documentElement.dataset.theme = id
  }, { immediate: true })
}
