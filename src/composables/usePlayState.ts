import { computed } from 'vue'
import { useGameSession } from '@/composables/useGameSession'
import { useQuizBank } from '@/composables/useQuizBank'
import { useRoom } from '@/composables/useRoom'
import type { QuestionValue } from '@/lib/types'

export function usePlayState() {
  const room = useRoom()
  const localSession = useGameSession()
  const localBank = useQuizBank()

  const inRoom = computed(() => Boolean(room.snapshot.value))
  const isHost = computed(() => !inRoom.value || room.isHost.value)
  const canEditBank = computed(() => {
    if (inRoom.value)
      return room.isHost.value
    if (room.hosting.value)
      return true
    if (room.lastCode.value)
      return false
    return true
  })
  const meId = computed(() => room.playerId.value)
  const me = computed(() => room.me.value)

  const players = computed(() =>
    inRoom.value
      ? room.snapshot.value?.session.players ?? []
      : localSession.players.value.map(player => ({
          ...player,
          deviceId: player.id,
          connected: true,
          isHost: false,
        })),
  )

  const scores = computed(() =>
    inRoom.value
      ? room.snapshot.value?.session.scores ?? {}
      : localSession.scores.value,
  )

  const answeredQuestionIds = computed(() =>
    inRoom.value
      ? room.snapshot.value?.session.answeredQuestionIds ?? []
      : localSession.answeredQuestionIds.value,
  )

  const chooserId = computed(() =>
    inRoom.value
      ? room.snapshot.value?.session.chooserId ?? null
      : localSession.chooserId.value,
  )

  const chooser = computed(() =>
    players.value.find(player => player.id === chooserId.value) ?? null,
  )

  const rankedPlayers = computed(() =>
    [...players.value]
      .map(player => ({
        ...player,
        score: scores.value[player.id] ?? 0,
      }))
      .sort((left, right) => right.score - left.score),
  )

  const categories = computed(() => {
    const list = inRoom.value
      ? room.snapshot.value?.bank.categories ?? []
      : localBank.categories.value
    return [...list].sort((left, right) => left.order - right.order)
  })

  const questions = computed(() =>
    inRoom.value
      ? room.snapshot.value?.bank.questions ?? []
      : localBank.questions.value,
  )

  function questionAt(categoryId: string, value: QuestionValue) {
    return questions.value.find(question =>
      question.categoryId === categoryId && question.value === value,
    )
  }

  function getQuestion(id: string) {
    return questions.value.find(question => question.id === id)
  }

  function isAnswered(questionId: string) {
    return answeredQuestionIds.value.includes(questionId)
  }

  function isBoardComplete(questionIds: string[]) {
    if (questionIds.length === 0)
      return false
    return questionIds.every(id => answeredQuestionIds.value.includes(id))
  }

  function startGame(firstChooserId: string) {
    if (inRoom.value) {
      room.start(firstChooserId)
      return
    }
    localSession.startGame(firstChooserId)
  }

  function setChooser(playerId: string) {
    if (inRoom.value) {
      room.setChooser(playerId)
      return
    }
    localSession.setChooser(playerId)
  }

  function canOpenQuestion() {
    if (!chooserId.value)
      return false
    if (!inRoom.value)
      return true
    return isHost.value || meId.value === chooserId.value
  }

  function awardPoints(playerId: string, value: number, questionId: string) {
    if (inRoom.value)
      return
    localSession.awardPoints(playerId, value, questionId)
  }

  function skipQuestion(questionId: string) {
    if (inRoom.value) {
      room.skip(questionId)
      return
    }
    localSession.skipQuestion(questionId)
  }

  return {
    room,
    inRoom,
    isHost,
    canEditBank,
    meId,
    me,
    players,
    scores,
    answeredQuestionIds,
    chooserId,
    chooser,
    rankedPlayers,
    categories,
    questions,
    questionAt,
    getQuestion,
    isAnswered,
    isBoardComplete,
    startGame,
    setChooser,
    canOpenQuestion,
    awardPoints,
    skipQuestion,
    localSession,
    localBank,
  }
}
