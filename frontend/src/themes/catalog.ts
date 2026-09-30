export type ThemeId = 'studio' | 'paper' | 'leopard' | 'links' | 'deep'

export interface ThemeMeta {
  id: ThemeId
  name: string
  description: string
  /** Thematic themes are scoped to specific games via GameMeta.themeIds */
  kind: 'default' | 'thematic'
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  studio: {
    id: 'studio',
    name: 'Студия',
    description: 'Тёмная нейтральная тема',
    kind: 'default',
  },
  paper: {
    id: 'paper',
    name: 'Бумага',
    description: 'Светлая нейтральная тема',
    kind: 'default',
  },
  leopard: {
    id: 'leopard',
    name: 'Леопард',
    description: 'Саванна и пятна для викторины',
    kind: 'thematic',
  },
  links: {
    id: 'links',
    name: 'Ночное поле',
    description: 'Хвоя, латунь и луна для гольфа',
    kind: 'thematic',
  },
  deep: {
    id: 'deep',
    name: 'Глубокая ночь',
    description: 'Чёрный фон и белый контраст для глубоких вопросов',
    kind: 'thematic',
  },
}

export function isThemeId(id: string): id is ThemeId {
  return id in THEMES
}

export const DEFAULT_THEME_IDS: ThemeId[] = ['studio', 'paper']

export function getTheme(id: string): ThemeMeta | undefined {
  return THEMES[id as ThemeId]
}

export function resolveThemeId(id: string | null | undefined, allowed: ThemeId[], fallback: ThemeId): ThemeId {
  if (id && allowed.includes(id as ThemeId))
    return id as ThemeId
  return fallback
}
