import type { GameDriver, GameId, GameModule } from './types'
import { getGameMeta } from './catalog'
import { quizDriver } from './quiz/driver'
import { golfDriver } from './golf/driver'
import { whoamiDriver } from './whoami/driver'
import { deepQuestionDriver } from './deep-question/driver'
import { platformsDriver } from './platforms/driver'

const cache = new Map<GameId, Promise<GameModule>>()

/** Eager drivers used by GameModule. Room reduce runs on the Go backend. */
export function resolveDriver(gameId: GameId): GameDriver {
  if (gameId === 'quiz')
    return quizDriver
  if (gameId === 'whoami')
    return whoamiDriver
  if (gameId === 'golf')
    return golfDriver
  if (gameId === 'deep-question')
    return deepQuestionDriver
  if (gameId === 'platforms')
    return platformsDriver
  throw new Error(`Неизвестная игра: ${gameId}`)
}

export function loadGame(gameId: GameId): Promise<GameModule> {
  const meta = getGameMeta(gameId)
  if (!meta)
    return Promise.reject(new Error('Обновите приложение: неизвестный тип игры'))

  let pending = cache.get(gameId)
  if (!pending) {
    pending = meta.load()
    cache.set(gameId, pending)
  }
  return pending
}

export function peekLoadedGame(gameId: GameId): Promise<GameModule> | undefined {
  return cache.get(gameId)
}
