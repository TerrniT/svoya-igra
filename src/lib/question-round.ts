import type { Question, QuestionKind } from '@/lib/types'
import type { PlayerSubmission, RoomPlayer } from '@/lib/room-protocol'

export function questionKind(question: Pick<Question, 'kind' | 'answers'> | undefined): QuestionKind {
  if (!question)
    return 'single'
  if (question.kind)
    return question.kind

  const correct = question.answers.filter(answer => answer.isCorrect).length
  if (question.answers.length <= 1)
    return 'free'
  if (correct > 1)
    return 'multi'
  return 'single'
}

export function correctAnswers(question: Question) {
  return question.answers.filter(answer => answer.isCorrect)
}

export function selectedAllAnswers(question: Question, answerIds: string[]) {
  return questionKind(question) === 'multi'
    && question.answers.length > 1
    && answerIds.length === question.answers.length
}

export function formatSubmission(question: Question, submission: PlayerSubmission) {
  if (submission.skipped)
    return 'Пропуск'

  const kind = questionKind(question)
  if (kind === 'free')
    return submission.text.trim() || '—'

  const labels = submission.answerIds
    .map(id => question.answers.find(answer => answer.id === id)?.text)
    .filter((text): text is string => Boolean(text))

  return labels.join(', ') || '—'
}

export function scoreSubmission(question: Question, submission: PlayerSubmission) {
  if (submission.skipped)
    return 0

  const kind = questionKind(question)
  if (kind === 'free' || selectedAllAnswers(question, submission.answerIds))
    return 0

  const correctIds = correctAnswers(question).map(answer => answer.id)
  if (!correctIds.length)
    return 0

  if (kind === 'single')
    return correctIds.includes(submission.answerIds[0] ?? '') ? question.value : 0

  const hits = submission.answerIds.filter(id => correctIds.includes(id)).length
  return Math.round((question.value * hits) / correctIds.length)
}

export function expectedRespondents(_question: Question, players: RoomPlayer[]) {
  return players.filter(player => player.connected && !player.isHost)
}

export function everyoneSubmitted(question: Question, players: RoomPlayer[], submissions: PlayerSubmission[]) {
  const expected = expectedRespondents(question, players)
  if (!expected.length)
    return false
  const submitted = new Set(submissions.map(item => item.playerId))
  return expected.every(player => submitted.has(player.id))
}

export const KIND_LABELS: Record<QuestionKind, string> = {
  single: 'Один верный',
  multi: 'Несколько верных',
  free: 'Свободный',
}

export const KIND_HINTS: Record<QuestionKind, string> = {
  single: 'Игроки выбирают один вариант. Верный ответ — полный номинал.',
  multi: 'Можно отметить несколько. Часть верных — часть баллов.',
  free: 'Игроки пишут свой текст. Ведущий выбирает, кому начислить очки.',
}
