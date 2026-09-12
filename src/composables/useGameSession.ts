import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { nextChooserId, requireChooser } from '@/lib/chooser'
import { createId } from '@/lib/ids'
import type { GameSession, Player } from '@/lib/types'

const STORAGE_KEY = 'svoya-igra:game'

function emptySession(): GameSession {
  return {
    players: [],
    scores: {},
    answeredQuestionIds: [],
    startedAt: null,
    chooserId: null,
  }
}

export function useGameSession() {
  const session = useLocalStorage<GameSession>(STORAGE_KEY, emptySession)

  const players = computed(() => session.value.players)
  const scores = computed(() => session.value.scores)
  const answeredQuestionIds = computed(() => session.value.answeredQuestionIds)
  const startedAt = computed(() => session.value.startedAt)
  const chooserId = computed(() => session.value.chooserId)

  const rankedPlayers = computed(() =>
    [...session.value.players]
      .map(player => ({
        ...player,
        score: session.value.scores[player.id] ?? 0,
      }))
      .sort((left, right) => right.score - left.score),
  )

  function addPlayer(name: string) {
    const trimmed = name.trim()
    if (!trimmed)
      return null

    const player: Player = {
      id: createId('player'),
      name: trimmed,
    }

    session.value.players.push(player)
    session.value.scores[player.id] = 0
    return player
  }

  function removePlayer(id: string) {
    session.value.players = session.value.players.filter(player => player.id !== id)
    const nextScores = { ...session.value.scores }
    delete nextScores[id]
    session.value.scores = nextScores
    if (session.value.chooserId === id)
      session.value.chooserId = session.value.players[0]?.id ?? null
  }

  function startGame(firstChooserId: string) {
    const nextScores: Record<string, number> = {}
    for (const player of session.value.players)
      nextScores[player.id] = 0

    session.value.scores = nextScores
    session.value.answeredQuestionIds = []
    session.value.startedAt = new Date().toISOString()
    session.value.chooserId = requireChooser(session.value.players, firstChooserId)
  }

  function advanceChooser() {
    session.value.chooserId = nextChooserId(session.value.players, session.value.chooserId)
  }

  function setChooser(playerId: string) {
    session.value.chooserId = requireChooser(session.value.players, playerId)
  }

  function isAnswered(questionId: string) {
    return session.value.answeredQuestionIds.includes(questionId)
  }

  function awardPoints(playerId: string, value: number, questionId: string) {
    if (!session.value.players.some(player => player.id === playerId))
      return

    session.value.scores[playerId] = (session.value.scores[playerId] ?? 0) + value
    if (!session.value.answeredQuestionIds.includes(questionId))
      session.value.answeredQuestionIds.push(questionId)
  }

  function skipQuestion(questionId: string) {
    if (!session.value.answeredQuestionIds.includes(questionId))
      session.value.answeredQuestionIds.push(questionId)
  }

  function isBoardComplete(questionIds: string[]) {
    if (questionIds.length === 0)
      return false

    return questionIds.every(id => session.value.answeredQuestionIds.includes(id))
  }

  function resetPlayers() {
    session.value = emptySession()
  }

  return {
    players,
    scores,
    answeredQuestionIds,
    startedAt,
    chooserId,
    rankedPlayers,
    addPlayer,
    removePlayer,
    startGame,
    setChooser,
    advanceChooser,
    isAnswered,
    awardPoints,
    skipQuestion,
    isBoardComplete,
    resetPlayers,
  }
}
