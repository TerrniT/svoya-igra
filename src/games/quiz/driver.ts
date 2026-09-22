import type { GameDriver, GameDriverContext, GameReduceResult } from '@/games/types'
import { nextChooserId, playingPlayers, requireChooser } from '@/lib/chooser'
import { everyoneSubmitted, questionKind, scoreSubmission, selectedAllAnswers } from '@/lib/question-round'
import type { QuizBank } from '@/lib/types'
import { shuffle } from '@/lib/random'
import { emptyQuizPayload, isQuizPayload, type PlayerSubmission, type QuizPayload } from './types'

function asPayload(value: unknown): QuizPayload {
  if (!isQuizPayload(value))
    throw new Error('Некорректное состояние викторины')
  return value
}

function resetRound(payload: QuizPayload) {
  payload.submissions = []
  payload.revealed = false
  payload.awarded = false
  payload.roundScores = {}
}

function revealRound(payload: QuizPayload, scores: Record<string, number>, players: GameDriverContext['players']): GameReduceResult {
  if (payload.revealed)
    return { payload, scores }

  const question = payload.bank.questions.find(item => item.id === payload.currentQuestionId)
  payload.revealed = true
  if (!question)
    return { payload, scores, notices: [{ kind: 'revealed' }] }

  if (!payload.answeredQuestionIds.includes(question.id))
    payload.answeredQuestionIds.push(question.id)

  const nextScores = { ...scores }
  if (questionKind(question) !== 'free') {
    const roundScores: Record<string, number> = {}
    for (const submission of payload.submissions) {
      const respondent = players.find(item => item.id === submission.playerId)
      if (respondent?.isHost)
        continue
      const points = scoreSubmission(question, submission)
      roundScores[submission.playerId] = points
      if (points)
        nextScores[submission.playerId] = (nextScores[submission.playerId] ?? 0) + points
    }
    payload.roundScores = roundScores
    payload.awarded = true
  }

  return { payload, scores: nextScores, notices: [{ kind: 'revealed' }] }
}

function finishIfComplete(payload: QuizPayload, players: GameDriverContext['players']): string {
  const ids = payload.bank.questions.map(question => question.id)
  const phase = ids.length > 0 && ids.every(id => payload.answeredQuestionIds.includes(id))
    ? 'results'
    : 'board'

  const played = Boolean(payload.currentQuestionId && payload.answeredQuestionIds.includes(payload.currentQuestionId))
  if (played)
    payload.chooserId = nextChooserId(players, payload.chooserId)
  payload.currentQuestionId = null
  payload.answers = []
  resetRound(payload)
  return phase
}

export const quizDriver: GameDriver = {
  createPayload(input) {
    const bank = (input?.bank as QuizBank | undefined) ?? { categories: [], questions: [] }
    return emptyQuizPayload(structuredClone(bank))
  },

  initialPhase() {
    return 'lobby'
  },

  canStart({ players, payload }) {
    const quiz = asPayload(payload)
    if (!playingPlayers(players).length)
      return 'Нужен хотя бы один игрок'
    if (!quiz.bank.questions.length)
      return 'В комнате нет вопросов'
    return null
  },

  reduce(message, ctx) {
    const payload = structuredClone(asPayload(ctx.payload))
    const msg = message as { type: string } & Record<string, unknown>

    if (msg.type === 'updateBank') {
      if (!ctx.isHost)
        throw new Error('Только ведущий меняет вопросы')
      if (ctx.phase !== 'lobby')
        throw new Error('Вопросы можно менять до старта')
      payload.bank = msg.bank as QuizBank
      return { payload }
    }

    if (msg.type === 'start' || msg.type === 'playAgain') {
      if (!ctx.isHost)
        throw new Error('Только ведущий начинает игру')
      const reason = this.canStart({ players: ctx.players, payload })
      if (reason)
        throw new Error(reason)

      const scores: Record<string, number> = {}
      for (const player of ctx.players)
        scores[player.id] = 0

      payload.answeredQuestionIds = []
      payload.chooserId = requireChooser(ctx.players, String(msg.firstChooserId))
      payload.currentQuestionId = null
      payload.answers = []
      resetRound(payload)

      return {
        phase: 'board',
        payload,
        scores,
        startedAt: new Date().toISOString(),
      }
    }

    if (msg.type === 'setChooser') {
      if (!ctx.isHost)
        throw new Error('Первого игрока выбирает ведущий')
      if (ctx.phase !== 'board' && ctx.phase !== 'lobby')
        throw new Error('Сейчас нельзя сменить того, кто выбирает')
      payload.chooserId = requireChooser(ctx.players, String(msg.playerId))
      return { phase: 'board', payload }
    }

    if (msg.type === 'openQuestion') {
      if (!payload.chooserId)
        throw new Error('Сначала ведущий выбирает, кто ходит первым')
      if (!ctx.isHost && ctx.clientPlayerId !== payload.chooserId)
        throw new Error('Сейчас выбирает другой игрок')
      const questionId = String(msg.questionId)
      if (payload.answeredQuestionIds.includes(questionId))
        throw new Error('Этот вопрос уже сыгран')
      const question = payload.bank.questions.find(item => item.id === questionId)
      if (!question)
        throw new Error('Вопрос не найден')

      payload.currentQuestionId = question.id
      payload.answers = questionKind(question) === 'free' ? [] : shuffle(question.answers)
      resetRound(payload)
      return { phase: 'question', payload }
    }

    if (msg.type === 'backToBoard') {
      if (!ctx.isHost)
        throw new Error('Только ведущий возвращает поле')
      return { phase: finishIfComplete(payload, ctx.players), payload }
    }

    if (msg.type === 'skip') {
      if (!ctx.isHost)
        throw new Error('Сдать вопрос может только ведущий')
      const questionId = String(msg.questionId)
      if (!payload.answeredQuestionIds.includes(questionId))
        payload.answeredQuestionIds.push(questionId)
      const phase = finishIfComplete(payload, ctx.players)
      return { phase, payload, notices: [{ kind: 'skip' }] }
    }

    if (msg.type === 'answer') {
      if (ctx.phase !== 'question' || payload.currentQuestionId !== msg.questionId)
        throw new Error('Сейчас нет этого вопроса')
      if (payload.revealed)
        throw new Error('Ответы уже вскрыты')

      const question = payload.bank.questions.find(item => item.id === payload.currentQuestionId)
      if (!question)
        throw new Error('Вопрос не найден')

      const player = ctx.players.find(item => item.id === ctx.clientPlayerId)
      if (!player)
        throw new Error('Игрок не найден')
      if (player.isHost)
        throw new Error('Ведущий не отвечает на вопросы')
      if (payload.submissions.some(item => item.playerId === player.id))
        throw new Error('Вы уже ответили')

      if (msg.skipped) {
        payload.submissions.push({
          playerId: player.id,
          answerIds: [],
          text: '',
          skipped: true,
        })
        if (everyoneSubmitted(question, ctx.players, payload.submissions))
          return revealRound(payload, ctx.scores, ctx.players)
        return { payload }
      }

      const kind = questionKind(question)
      const answerIds = [...new Set((msg.answerIds as string[] | undefined) ?? [])]
      const text = String(msg.text ?? '').trim()

      if (kind === 'free') {
        if (!text)
          throw new Error('Введите ответ')
      }
      else {
        if (!answerIds.length)
          throw new Error('Выберите вариант')
        if (kind === 'single' && answerIds.length !== 1)
          throw new Error('Выберите один вариант')
        if (selectedAllAnswers(question, answerIds))
          throw new Error('Все варианты выбрать нельзя')
        if (answerIds.some(id => !question.answers.some(answer => answer.id === id)))
          throw new Error('Ответ не найден')
      }

      const submission: PlayerSubmission = {
        playerId: player.id,
        answerIds: kind === 'free' ? [] : answerIds,
        text: kind === 'free' ? text : '',
      }
      payload.submissions.push(submission)

      if (everyoneSubmitted(question, ctx.players, payload.submissions))
        return revealRound(payload, ctx.scores, ctx.players)

      return { payload }
    }

    if (msg.type === 'reveal') {
      if (!ctx.isHost)
        throw new Error('Вскрыть ответы может только ведущий')
      if (ctx.phase !== 'question' || !payload.currentQuestionId)
        throw new Error('Сейчас нет открытого вопроса')
      if (!payload.revealed)
        return revealRound(payload, ctx.scores, ctx.players)
      return { payload }
    }

    if (msg.type === 'awardFree') {
      if (!ctx.isHost)
        throw new Error('Очки начисляет ведущий')
      if (ctx.phase !== 'question' || payload.currentQuestionId !== msg.questionId)
        throw new Error('Сейчас нет этого вопроса')
      if (!payload.revealed)
        throw new Error('Сначала дождитесь всех ответов')
      if (payload.awarded)
        throw new Error('Очки уже начислены')

      const question = payload.bank.questions.find(item => item.id === payload.currentQuestionId)
      if (!question || questionKind(question) !== 'free')
        throw new Error('Это не свободный вопрос')

      const chosen = new Set((msg.playerIds as string[]).filter((playerId) => {
        const winner = ctx.players.find(item => item.id === playerId)
        return Boolean(winner && !winner.isHost)
      }))
      const roundScores: Record<string, number> = {}
      const nextScores = { ...ctx.scores }
      for (const submission of payload.submissions) {
        if (!chosen.has(submission.playerId))
          continue
        roundScores[submission.playerId] = question.value
        nextScores[submission.playerId] = (nextScores[submission.playerId] ?? 0) + question.value
      }
      payload.roundScores = roundScores
      payload.awarded = true
      return {
        payload,
        scores: nextScores,
        notices: [{ kind: 'awarded', value: question.value }],
      }
    }

    throw new Error('Неизвестное сообщение викторины')
  },

  toClientPayload(payload, _phase, _viewer) {
    const quiz = asPayload(payload)
    return {
      ...quiz,
      answers: quiz.revealed
        ? quiz.answers
        : quiz.answers.map(answer => ({ ...answer, isCorrect: false })),
      submissions: quiz.revealed
        ? quiz.submissions
        : quiz.submissions.map(item => ({ playerId: item.playerId, answerIds: [], text: '', skipped: false })),
      roundScores: quiz.revealed ? quiz.roundScores : {},
    } satisfies QuizPayload
  },

  onPlayerRemoved(payload, playerId) {
    const quiz = asPayload(structuredClone(payload))
    quiz.submissions = quiz.submissions.filter(item => item.playerId !== playerId)
    if (quiz.chooserId === playerId)
      quiz.chooserId = null
    return quiz
  },
}

/** Host-side auto-reveal when someone disconnects mid-question */
export function quizMaybeAutoReveal(
  payload: QuizPayload,
  players: GameDriverContext['players'],
  scores: Record<string, number>,
): GameReduceResult | null {
  if (payload.revealed || !payload.currentQuestionId)
    return null
  const question = payload.bank.questions.find(item => item.id === payload.currentQuestionId)
  if (!question || !everyoneSubmitted(question, players, payload.submissions))
    return null
  return revealRound(structuredClone(payload), scores, players)
}
