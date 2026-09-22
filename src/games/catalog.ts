import type { GameId, GameMeta, GameModule } from './types'

export const GAME_CATALOG: GameMeta[] = [
  {
    id: 'quiz',
    name: 'Своя игра',
    description: 'Поле с категориями и номиналами. Ведущий не играет — ведёт раунд.',
    minPlayers: 1,
    hostPlays: false,
    supportsLocal: true,
    themeIds: ['leopard', 'studio', 'paper'],
    defaultThemeId: 'leopard',
    load: () => import('./quiz').then(mod => mod.default ?? mod.quizModule),
  },
  {
    id: 'whoami',
    name: 'Кто я?',
    description: 'Карточка на лбу. Остальные видят, вы — нет. Угадали — ведущий отмечает.',
    minPlayers: 2,
    hostPlays: true,
    supportsLocal: false,
    themeIds: ['studio', 'paper'],
    defaultThemeId: 'studio',
    load: () => import('./whoami').then(mod => mod.default ?? mod.whoamiModule),
  },
]

export function getGameMeta(id: string): GameMeta | undefined {
  return GAME_CATALOG.find(game => game.id === id)
}

export function isGameId(id: string): id is GameId {
  return GAME_CATALOG.some(game => game.id === id)
}

export type { GameModule }
