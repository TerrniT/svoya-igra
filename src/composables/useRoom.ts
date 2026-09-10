import { computed, ref } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import type { DataConnection, Peer } from 'peerjs'
import { createId } from '@/lib/ids'
import {
  claimHostPeer,
  createPeer,
  hostPeerId,
  parseWireData,
  sendWire,
  waitForConnection,
  waitForPeerOpen,
} from '@/lib/peer-room'
import { RoomEngine, type HostRoomState, type WireClient } from '@/lib/room-engine'
import type { ClientMessage, RoomRole, RoomSnapshot, ServerMessage } from '@/lib/room-protocol'
import type { QuizBank } from '@/lib/types'

function abortIfStale(token: number, session: number) {
  if (token !== session)
    throw Object.assign(new Error('aborted'), { name: 'RoomAbortError' })
}

const HOST_STATE_KEY = 'svoya-igra:host-room'
const HOSTING_KEY = 'svoya-igra:hosting'

function useRoomBase() {
  const deviceId = useSessionStorage('svoya-igra:device-id', createId('device'))
  const lastCode = useSessionStorage('svoya-igra:last-peer-room', '')
  const hostState = useSessionStorage<HostRoomState | null>(HOST_STATE_KEY, null)
  const hosting = useSessionStorage(HOSTING_KEY, false)

  const connecting = ref(false)
  const linkReady = ref(false)
  const snapshot = ref<RoomSnapshot | null>(null)
  const playerId = ref<string | null>(null)
  const role = ref<RoomRole | null>(null)
  const error = ref('')
  const lastNotice = ref<Extract<ServerMessage, { type: 'notice' }> | null>(null)

  let peer: Peer | null = null
  let guestConnection: DataConnection | null = null
  let engine: RoomEngine | null = null
  let disposed = true
  let session = 0

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
      if (message.kind === 'closed')
        forgetRoom()
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
    persistHost(null)
  }

  function teardown() {
    session += 1
    disposed = true
    engine = null
    guestConnection?.close()
    guestConnection = null
    peer?.destroy()
    peer = null
    linkReady.value = false
  }

  function bindHostPeer(next: Peer) {
    next.on('connection', (connection) => {
      const wire: WireClient = {
        key: connection.peer,
        send: message => sendWire(connection, message),
        close: () => connection.close(),
      }

      connection.on('data', (raw) => {
        try {
          const message = parseWireData(raw) as ClientMessage
          engine?.handle(wire, message)
        }
        catch (caught) {
          wire.send({
            type: 'error',
            message: caught instanceof Error ? caught.message : 'Ошибка комнаты',
          })
        }
      })

      connection.on('close', () => {
        engine?.disconnect(connection.peer)
      })
    })

    next.on('disconnected', () => {
      if (!next.destroyed)
        next.reconnect()
    })

    next.on('close', () => {
      linkReady.value = false
      if (disposed || !snapshot.value || !hosting.value)
        return
      error.value = 'Связь с комнатой потеряна'
    })
  }

  function bindGuestConnection(connection: DataConnection) {
    connection.on('data', (raw) => {
      applyServerMessage(parseWireData(raw) as ServerMessage)
    })

    connection.on('close', () => {
      linkReady.value = false
      if (disposed || hosting.value)
        return
      if (snapshot.value)
        error.value = 'Связь с комнатой потеряна'
      window.setTimeout(() => {
        if (!disposed && !connecting.value && lastCode.value && !hosting.value && !linkReady.value)
          void reconnect()
      }, 800)
    })
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

    if (!guestConnection?.open)
      throw new Error('Нет связи с комнатой')

    sendWire(guestConnection, message)
  }

  async function connectAsHost(next: Peer, restore?: HostRoomState) {
    disposed = false
    peer = next
    bindHostPeer(next)
    engine = new RoomEngine(persistHost)
    linkReady.value = true
    hosting.value = true

    if (restore)
      engine.hydrate(restore, deviceId.value, localWire)
  }

  async function connectAsGuest(roomCode: string, message: ClientMessage, token: number) {
    abortIfStale(token, session)
    disposed = false
    const next = createPeer()
    peer = next
    await waitForPeerOpen(next)
    abortIfStale(token, session)
    const connection = next.connect(hostPeerId(roomCode), { reliable: true })
    await waitForConnection(connection)
    abortIfStale(token, session)
    guestConnection = connection
    bindGuestConnection(connection)
    sendWire(connection, message)
    linkReady.value = true
  }

  async function createRoom(name: string, bank: QuizBank) {
    connecting.value = true
    error.value = ''
    teardown()
    const token = session

    try {
      const claimed = await claimHostPeer()
      if (token !== session) {
        claimed.peer.destroy()
        return
      }
      await connectAsHost(claimed.peer)
      if (token !== session || !engine)
        throw new Error('Не удалось создать комнату')
      engine.createRoom(claimed.code, name, deviceId.value, bank, localWire)
    }
    catch (caught) {
      if (token !== session)
        return
      teardown()
      persistHost(null)
      error.value = caught instanceof Error ? caught.message : 'Не удалось создать комнату'
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
    teardown()
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
      teardown()
      error.value = caught instanceof Error ? caught.message : 'Не удалось войти в комнату'
      throw caught instanceof Error ? caught : new Error(error.value)
    }
    finally {
      if (token === session)
        connecting.value = false
    }
  }

  async function reconnect() {
    if (hosting.value && hostState.value) {
      connecting.value = true
      error.value = ''
      const saved = hostState.value
      teardown()
      const token = session
      try {
        const next = createPeer(hostPeerId(saved.code))
        await waitForPeerOpen(next)
        if (token !== session) {
          next.destroy()
          return
        }
        await connectAsHost(next, saved)
      }
      catch (caught) {
        if (token !== session)
          return
        teardown()
        persistHost(null)
        error.value = caught instanceof Error ? caught.message : 'Не удалось восстановить комнату'
      }
      finally {
        if (token === session)
          connecting.value = false
      }
      return
    }

    if (!lastCode.value || hosting.value)
      return

    connecting.value = true
    error.value = ''
    teardown()
    const token = session

    try {
      await connectAsGuest(lastCode.value, {
        type: 'reconnect',
        code: lastCode.value,
        deviceId: deviceId.value,
      }, token)
    }
    catch (caught) {
      if (token !== session)
        return
      teardown()
      error.value = caught instanceof Error ? caught.message : 'Не удалось переподключиться'
    }
    finally {
      if (token === session)
        connecting.value = false
    }
  }

  function leaveRoom() {
    try {
      send({ type: 'leave' })
    }
    catch {
      // already offline
    }
    teardown()
    forgetRoom()
  }

  function updateBank(bank: QuizBank) {
    send({ type: 'updateBank', bank })
  }

  function start() {
    send({ type: 'start' })
  }

  function playAgain() {
    send({ type: 'playAgain' })
  }

  function openQuestion(questionId: string) {
    send({ type: 'openQuestion', questionId })
  }

  function backToBoard() {
    send({ type: 'backToBoard' })
  }

  function answer(questionId: string, answerId: string) {
    send({ type: 'answer', questionId, answerId })
  }

  function skip(questionId: string) {
    send({ type: 'skip', questionId })
  }

  function kick(targetId: string) {
    send({ type: 'kick', playerId: targetId })
  }

  return {
    connecting,
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
    createRoom,
    joinRoom,
    reconnect,
    leaveRoom,
    updateBank,
    start,
    playAgain,
    openQuestion,
    backToBoard,
    answer,
    skip,
    kick,
  }
}

let shared: ReturnType<typeof useRoomBase> | undefined

export function useRoom() {
  shared ??= useRoomBase()
  return shared
}
