import { joinRoom, selfId } from 'trystero'
import type { ClientMessage, ServerMessage } from '@/lib/room-protocol'

const APP_ID = 'svoya-igra'
const JOIN_MS = 18_000

export function randomRoomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function normalizeRoomCode(code: string) {
  return code.replace(/\D/g, '').padStart(4, '0').slice(-4)
}

function roomTopic(code: string) {
  return `${APP_ID}-${normalizeRoomCode(code)}`
}

type HostPing = { t: 'h' }

export class RoomLink {
  readonly code: string
  private hostId: string | null = null
  private left = false
  private readonly room
  private readonly clientAction
  private readonly serverAction
  private readonly hostAction

  constructor(code: string) {
    this.code = normalizeRoomCode(code)
    this.room = joinRoom({
      appId: APP_ID,
      password: roomTopic(this.code),
      relayConfig: { redundancy: 4, warnOnRelayFailure: false },
    }, roomTopic(this.code))
    this.clientAction = this.room.makeAction('c')
    this.serverAction = this.room.makeAction('s')
    this.hostAction = this.room.makeAction<HostPing>('h')
  }

  becomeHost() {
    this.hostId = selfId
    const ping = (peerId?: string) => {
      void this.hostAction.send({ t: 'h' }, peerId ? { target: peerId } : undefined)
    }
    this.room.onPeerJoin = peerId => ping(peerId)
    ping()
  }

  waitForHost(ms: number) {
    return new Promise<string | null>((resolve) => {
      let settled = false
      const finish = (id: string | null) => {
        if (settled)
          return
        settled = true
        window.clearTimeout(timer)
        this.hostAction.onMessage = null
        resolve(id)
      }
      const timer = window.setTimeout(() => finish(null), ms)
      this.hostAction.onMessage = (_ping, { peerId }) => {
        if (peerId === selfId)
          return
        this.hostId = peerId
        finish(peerId)
      }
    })
  }

  onClient(handler: (peerId: string, message: ClientMessage) => void) {
    this.clientAction.onMessage = (message, { peerId }) => {
      handler(peerId, message as ClientMessage)
    }
  }

  onServer(handler: (message: ServerMessage) => void) {
    this.serverAction.onMessage = (message) => {
      handler(message as ServerMessage)
    }
  }

  onPeerLeave(handler: (peerId: string) => void) {
    this.room.onPeerLeave = handler
  }

  sendClient(message: ClientMessage) {
    if (!this.hostId || this.hostId === selfId)
      throw new Error('Нет связи с комнатой')
    void this.clientAction.send(message as never, { target: this.hostId })
  }

  sendServer(peerId: string, message: ServerMessage) {
    void this.serverAction.send(message as never, { target: peerId })
  }

  async leave() {
    if (this.left)
      return
    this.left = true
    this.room.onPeerJoin = null
    this.room.onPeerLeave = null
    this.clientAction.onMessage = null
    this.serverAction.onMessage = null
    this.hostAction.onMessage = null
    await Promise.race([
      this.room.leave().catch(() => {}),
      new Promise<void>(resolve => window.setTimeout(resolve, 400)),
    ])
  }
}

export function claimHostRoom() {
  const code = randomRoomCode()
  return { link: new RoomLink(code), code }
}

export function openHostRoom(code: string) {
  return new RoomLink(code)
}

export async function openGuestRoom(code: string) {
  const link = new RoomLink(code)
  const hostId = await link.waitForHost(JOIN_MS)
  if (!hostId) {
    await link.leave()
    throw new Error('Комната не найдена. Проверьте код и что вкладка ведущего открыта.')
  }
  return link
}
