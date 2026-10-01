import type { GameId, GameMeta, GameModule } from './types'

export const GAME_CATALOG: GameMeta[] = [
  {
    id: 'quiz',
    name: 'Своя игра',
    description: 'Поле с категориями и номиналами. Ведущий не играет — ведёт раунд.',
    minPlayers: 1,
    hostPlays: false,
    supportsLocal: true,
    roomEnabled: true,
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
    roomEnabled: true,
    themeIds: ['studio', 'paper'],
    defaultThemeId: 'studio',
    load: () => import('./whoami').then(mod => mod.default ?? mod.whoamiModule),
  },
  {
    id: 'golf',
    name: 'Гольф',
    description: 'Пять лунок на ночном поле. Один мяч, ход по очереди, комната на всех.',
    minPlayers: 1,
    hostPlays: true,
    supportsLocal: false,
    roomEnabled: true,
    themeIds: ['links', 'studio'],
    defaultThemeId: 'links',
    load: () => import('./golf').then(mod => mod.default ?? mod.golfModule),
  },
  {
    id: 'deep-question',
    name: 'Глубокие вопросы',
    description: 'Случайные вопросы для честных и содержательных разговоров.',
    minPlayers: 1,
    hostPlays: true,
    supportsLocal: true,
    roomEnabled: false,
    themeIds: ['deep'],
    defaultThemeId: 'deep',
    load: () => import('./deep-question').then(mod => mod.default ?? mod.deepQuestionModule),
  },
  {
    id: 'platforms',
    name: 'Платформы',
    description: 'Девять платформ. Толкните фигуру на соседнюю — потом пол уходит. Кто остался, тот и выиграл.',
    minPlayers: 2,
    hostPlays: true,
    supportsLocal: false,
    roomEnabled: true,
    themeIds: ['rift', 'studio'],
    defaultThemeId: 'rift',
    load: () => import('./platforms').then(mod => mod.default ?? mod.platformsModule),
  },
]

export function getGameMeta(id: string): GameMeta | undefined {
  return GAME_CATALOG.find(game => game.id === id)
}

export function isGameId(id: string): id is GameId {
  return GAME_CATALOG.some(game => game.id === id)
}

export type { GameModule }
