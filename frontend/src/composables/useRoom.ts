import { computed, ref } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { createId } from '@/lib/ids'
import { RoomsClient } from '@/api/rooms'
import type { ClientMessage, RoomRole, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import type { QuizBank } from '@/lib/types'
import type { GameId } from '@/games/types'
import { applyThemeFromId } from '@/themes/apply'

function abortIfStale(token: number, session: number) {
  if (token !== session)
    throw Object.assign(new Error('aborted'), { name: 'RoomAbortError' })
}

function isRoomMissing(message: string) {
  return message.includes('не найдена') || message.includes('Нет связи с комнатой') || message.includes('переподключиться')
}

function wasOnPlayRoute() {
  if (typeof location === 'undefined')
    return false
  const path = location.pathname
  return path.startsWith('/game') || path.startsWith('/whoami') || path.startsWith('/golf') || path.startsWith('/platforms') || path.startsWith('/g/')
}

function useRoomBase() {
  const deviceId = useSessionStorage('svoya-igra:device-id', createId('device'))
  const lastCode = useSessionStorage('svoya-igra:last-peer-room', '')

  const connecting = ref(false)
  const pendingRestore = ref(Boolean(lastCode.value && wasOnPlayRoute()))
  const restoreError = ref('')
  const snapshot = ref<RoomSnapshot | null>(null)
  const restoring = computed(() => pendingRestore.value && !snapshot.value && !restoreError.value)
  const blockingRestore = computed(() => restoring.value || Boolean(restoreError.value))
  const linkReady = ref(false)
  const playerId = ref<string | null>(null)
  const role = ref<RoomRole | null>(null)
  const error = ref('')
  const lastNotice = ref<Extract<ServerMessage, { type: 'notice' }> | null>(null)

  const client = new RoomsClient()
  let session = 0
  let helloWait: { resolve: () => void, reject: (error: Error) => void, token: number } | null = null

  const connected = computed(() => snapshot.value !== null && linkReady.value)
  const isHost = computed(() => role.value === 'host')
  const hosting = computed(() => isHost.value && connected.value)
  const code = computed(() => snapshot.value?.code ?? '')
  const phase = computed(() => snapshot.value?.phase ?? null)
  const paused = computed(() => Boolean(snapshot.value?.paused))
  const gameId = computed(() => snapshot.value?.gameId ?? null)
  const themeId = computed(() => snapshot.value?.themeId ?? null)
  const me = computed(() => snapshot.value?.session.players.find(player => player.id === playerId.value))

  client.onMessage(applyServerMessage)
  client.onClose(() => {
    if (snapshot.value)
      linkReady.value = false
  })

  function settleHello(ok: boolean, message?: string) {
    const pending = helloWait
    if (!pending)
      return
    helloWait = null
    if (ok)
      pending.resolve()
    else
      pending.reject(new Error(message || 'Не удалось войти в комнату'))
  }

  function applyServerMessage(message: ServerMessage) {
    if (message.type === 'error') {
      error.value = message.message
      settleHello(false, message.message)
      return
    }

    if (message.type === 'notice') {
      lastNotice.value = message
      if (message.kind === 'closed' || message.kind === 'kicked') {
        forgetRoom()
        restoreError.value = message.kind === 'closed' ? 'Такой комнаты нет' : ''
      }
      return
    }

    snapshot.value = message.snapshot
    error.value = ''
    lastCode.value = message.snapshot.code
    applyThemeFromId(message.snapshot.themeId)
    linkReady.value = true

    if (message.type === 'hello') {
      playerId.value = message.playerId
      role.value = message.role
      pendingRestore.value = false
      restoreError.value = ''
      settleHello(true)
    }
  }

  function forgetRoom() {
    snapshot.value = null
    playerId.value = null
    role.value = null
    lastCode.value = ''
    pendingRestore.value = false
    linkReady.value = false
  }

  function markRoomMissing() {
    forgetRoom()
    restoreError.value = 'Такой комнаты нет'
  }

  function dismissRestoreError() {
    restoreError.value = ''
    pendingRestore.value = false
    forgetRoom()
  }

  async function teardown() {
    session += 1
    settleHello(false, 'aborted')
    client.disconnect()
    linkReady.value = false
  }

  function waitForHello(token: number) {
    return new Promise<void>((resolve, reject) => {
      helloWait = { resolve, reject, token }
      window.setTimeout(() => {
        if (helloWait?.token !== token)
          return
        settleHello(false, 'Нет связи с комнатой')
      }, 8_000)
    })
  }

  function send(message: ClientMessage) {
    client.send(message)
  }

  async function openSession(token: number) {
    abortIfStale(token, session)
    await client.connect()
    abortIfStale(token, session)
  }

  async function createRoom(
    name: string,
    options: { gameId: GameId, themeId: string, settings?: unknown },
  ) {
    connecting.value = true
    error.value = ''
    await teardown()
    const token = session

    try {
      await openSession(token)
      const hello = waitForHello(token)
      send({
        type: 'create',
        name,
        deviceId: deviceId.value,
        gameId: options.gameId,
        themeId: options.themeId,
        settings: options.settings ?? {},
      })
      await hello
    }
    catch (caught) {
      if (token !== session)
        return
      error.value = caught instanceof Error ? caught.message : 'Не удалось создать комнату'
      await teardown()
      throw caught instanceof Error ? caught : new Error(error.value)
    }
    finally {
      if (token === session)
        connecting.value = false
    }
  }

  async function joinRoom(roomCode: string, name: string) {
    connecting.value = true
    error.value = ''
    await teardown()
    const token = session

    try {
      await openSession(token)
      const hello = waitForHello(token)
      send({
        type: 'join',
        code: roomCode,
        name,
        deviceId: deviceId.value,
      })
      await hello
    }
    catch (caught) {
      if (token !== session)
        return
      await teardown()
      error.value = caught instanceof Error ? caught.message : 'Не удалось войти в комнату'
      if (isRoomMissing(error.value))
        restoreError.value = 'Такой комнаты нет'
      throw caught instanceof Error ? caught : new Error(error.value)
    }
    finally {
      if (token === session)
        connecting.value = false
    }
  }

  async function reconnect(allowGuest = true) {
    if (!allowGuest || !lastCode.value) {
      pendingRestore.value = false
      return
    }

    const code = lastCode.value
    pendingRestore.value = true
    restoreError.value = ''
    connecting.value = true
    error.value = ''
    await teardown()
    const token = session

    try {
      await openSession(token)
      const hello = waitForHello(token)
      send({
        type: 'reconnect',
        code,
        deviceId: deviceId.value,
      })
      await hello
    }
    catch (caught) {
      if (token !== session)
        return
      await teardown()
      pendingRestore.value = false
      error.value = caught instanceof Error ? caught.message : 'Не удалось переподключиться'
      markRoomMissing()
    }
    finally {
      if (token === session)
        connecting.value = false
    }
  }

  async function leaveRoom() {
    try {
      send({ type: 'leave' })
    }
    catch {
      // already offline
    }
    await teardown()
    forgetRoom()
  }

  function updateBank(bank: QuizBank) {
    send({ type: 'updateBank', bank })
  }

  function start(firstChooserId?: string) {
    send({ type: 'start', firstChooserId })
  }

  function playAgain(firstChooserId?: string) {
    send({ type: 'playAgain', firstChooserId })
  }

  function setChooser(playerId: string) {
    send({ type: 'setChooser', playerId })
  }

  function openQuestion(questionId: string) {
    send({ type: 'openQuestion', questionId })
  }

  function backToBoard() {
    send({ type: 'backToBoard' })
  }

  function answer(questionId: string, input: { answerIds?: string[], text?: string, skipped?: boolean }) {
    send({ type: 'answer', questionId, answerIds: input.answerIds, text: input.text, skipped: input.skipped })
  }

  function reveal() {
    send({ type: 'reveal' })
  }

  function awardFree(questionId: string, playerIds: string[]) {
    send({ type: 'awardFree', questionId, playerIds })
  }

  function skip(questionId: string) {
    send({ type: 'skip', questionId })
  }

  function markGuessed(targetId: string) {
    send({ type: 'markGuessed', playerId: targetId })
  }

  function kick(targetId: string) {
    send({ type: 'kick', playerId: targetId })
  }

  function pause() {
    send({ type: 'pause' })
  }

  function resume() {
    send({ type: 'resume' })
  }

  function endGame() {
    send({ type: 'endGame' })
  }

  function sendGame(message: { type: string } & Record<string, unknown>) {
    send(message)
  }

  return {
    connecting,
    restoring,
    blockingRestore,
    restoreError,
    dismissRestoreError,
    connected,
    snapshot,
    playerId,
    role,
    isHost,
    code,
    phase,
    paused,
    gameId,
    themeId,
    me,
    error,
    lastNotice,
    lastCode,
    hosting,
    createRoom,
    joinRoom,
    reconnect,
    leaveRoom,
    updateBank,
    start,
    playAgain,
    setChooser,
    openQuestion,
    backToBoard,
    answer,
    reveal,
    awardFree,
    skip,
    markGuessed,
    kick,
    pause,
    resume,
    endGame,
    sendGame,
  }
}

let shared: ReturnType<typeof useRoomBase> | undefined

export function useRoom() {
  shared ??= useRoomBase()
  return shared
}
