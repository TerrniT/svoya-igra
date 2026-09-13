import { computed, ref } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { createId } from '@/lib/ids'
import {
  HOST_RECOVERY_MS,
  RoomLink,
  claimHostRoom,
  openGuestRoom,
} from '@/lib/peer-room'
import { RoomEngine, type HostRoomState, type WireClient } from '@/lib/room-engine'
import type { ClientMessage, RoomRole, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import type { QuizBank } from '@/lib/types'

function abortIfStale(token: number, session: number) {
  if (token !== session)
    throw Object.assign(new Error('aborted'), { name: 'RoomAbortError' })
}

function isRoomMissing(message: string) {
  return message.includes('не найдена') || message.includes('Нет связи с комнатой')
}

const HOST_STATE_KEY = 'svoya-igra:host-room'
const HOSTING_KEY = 'svoya-igra:hosting'

function wasOnPlayRoute() {
  return typeof location !== 'undefined' && location.pathname.startsWith('/game')
}

function useRoomBase() {
  const deviceId = useSessionStorage('svoya-igra:device-id', createId('device'))
  const lastCode = useSessionStorage('svoya-igra:last-peer-room', '')
  const hostState = useSessionStorage<HostRoomState | null>(HOST_STATE_KEY, null)
  const hosting = useSessionStorage(HOSTING_KEY, false)

  if (hosting.value || hostState.value) {
    hostState.value = null
    hosting.value = false
    lastCode.value = ''
  }

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

  let link: RoomLink | null = null
  let engine: RoomEngine | null = null
  let disposed = true
  let session = 0
  let recoveringHost = false

  const connected = computed(() => snapshot.value !== null && linkReady.value)
  const isHost = computed(() => role.value === 'host')
  const code = computed(() => snapshot.value?.code ?? '')
  const phase = computed(() => snapshot.value?.phase ?? null)
  const me = computed(() => snapshot.value?.session.players.find(player => player.id === playerId.value))

  const localWire: WireClient = {
    key: 'local-host',
    send: applyServerMessage,
  }

  function persistHost(state: HostRoomState | null) {
    hostState.value = state
    hosting.value = state !== null
  }

  function applyServerMessage(message: ServerMessage) {
    if (message.type === 'error') {
      error.value = message.message
      return
    }

    if (message.type === 'notice') {
      lastNotice.value = message
      if (message.kind === 'closed') {
        forgetRoom()
        restoreError.value = 'Такой комнаты нет'
      }
      return
    }

    snapshot.value = message.snapshot
    error.value = ''
    lastCode.value = message.snapshot.code

    if (message.type === 'hello') {
      playerId.value = message.playerId
      role.value = message.role
    }
  }

  function forgetRoom() {
    snapshot.value = null
    playerId.value = null
    role.value = null
    lastCode.value = ''
    pendingRestore.value = false
    persistHost(null)
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
    disposed = true
    recoveringHost = false
    engine = null
    const previous = link
    link = null
    linkReady.value = false
    if (previous)
      await previous.leave().catch(() => {})
  }

  function bindHostLink(next: RoomLink) {
    next.onClient((peerId, message) => {
      const wire: WireClient = {
        key: peerId,
        send: payload => next.sendServer(peerId, payload),
      }

      try {
        engine?.handle(wire, message)
      }
      catch (caught) {
        wire.send({
          type: 'error',
          message: caught instanceof Error ? caught.message : 'Ошибка комнаты',
        })
      }
    })

    next.onPeerLeave((peerId) => {
      engine?.disconnect(peerId)
    })
  }

  function bindGuestLink(next: RoomLink) {
    next.onServer(applyServerMessage)
    next.onPeerLeave((peerId) => {
      // Trystero meshes every guest. A new player joining can flap a
      // guest-to-guest link; that is not the room closing.
      if (disposed || hosting.value || !next.isHostPeer(peerId))
        return
      next.clearHost()
      linkReady.value = false
      if (recoveringHost)
        return
      recoveringHost = true
      void recoverGuestHost(next).finally(() => {
        recoveringHost = false
      })
    })
  }

  async function recoverGuestHost(next: RoomLink) {
    const token = session
    const hostId = await next.waitForHost(HOST_RECOVERY_MS)
    if (token !== session || disposed || hosting.value || next !== link)
      return
    if (!hostId) {
      markRoomMissing()
      return
    }

    linkReady.value = true
    try {
      next.sendClient({
        type: 'reconnect',
        code: lastCode.value,
        deviceId: deviceId.value,
      })
    }
    catch {
      markRoomMissing()
    }
  }

  function send(message: ClientMessage) {
    if (hosting.value && engine) {
      try {
        engine.handle(localWire, message)
      }
      catch (caught) {
        error.value = caught instanceof Error ? caught.message : 'Ошибка комнаты'
        throw caught
      }
      return
    }

    if (!link)
      throw new Error('Нет связи с комнатой')

    link.sendClient(message)
  }

  function connectAsHost(next: RoomLink, restore?: HostRoomState) {
    disposed = false
    link = next
    bindHostLink(next)
    engine = new RoomEngine(persistHost)
    linkReady.value = true
    hosting.value = true

    if (restore)
      engine.hydrate(restore, deviceId.value, localWire)

    next.becomeHost()
  }

  async function connectAsGuest(roomCode: string, message: ClientMessage, token: number) {
    abortIfStale(token, session)
    disposed = false
    const next = await openGuestRoom(roomCode)
    abortIfStale(token, session)
    link = next
    bindGuestLink(next)
    next.sendClient(message)
    linkReady.value = true
  }

  async function createRoom(name: string, bank: QuizBank) {
    connecting.value = true
    error.value = ''
    await teardown()
    const token = session

    try {
      const claimed = claimHostRoom()
      if (token !== session) {
        await claimed.link.leave()
        return
      }
      connectAsHost(claimed.link)
      if (token !== session || !engine)
        throw new Error('Не удалось создать комнату')
      engine.createRoom(claimed.code, name, deviceId.value, bank, localWire)
    }
    catch (caught) {
      if (token !== session)
        return
      persistHost(null)
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
    persistHost(null)
    const token = session

    try {
      await connectAsGuest(roomCode, {
        type: 'join',
        code: roomCode,
        name,
        deviceId: deviceId.value,
      }, token)
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
    if (!allowGuest || !lastCode.value || hosting.value) {
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
      await connectAsGuest(code, {
        type: 'reconnect',
        code,
        deviceId: deviceId.value,
      }, token)
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

  function start(firstChooserId: string) {
    send({ type: 'start', firstChooserId })
  }

  function playAgain(firstChooserId: string) {
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

  function kick(targetId: string) {
    send({ type: 'kick', playerId: targetId })
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
    kick,
  }
}

let shared: ReturnType<typeof useRoomBase> | undefined

export function useRoom() {
  shared ??= useRoomBase()
  return shared
}
