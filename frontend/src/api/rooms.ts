import type { ClientMessage, ServerMessage } from '@/lib/room-protocol'

export type CreateRoomInput = {
  name: string
  deviceId: string
  gameId: string
  themeId: string
  settings?: unknown
}

export function roomsSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

/** WebSocket transport for room protocol. Composables never open sockets themselves. */
export class RoomsClient {
  private ws: WebSocket | null = null
  private generation = 0
  private readonly messageListeners = new Set<(message: ServerMessage) => void>()
  private readonly closeListeners = new Set<() => void>()

  onMessage(handler: (message: ServerMessage) => void) {
    this.messageListeners.add(handler)
    return () => {
      this.messageListeners.delete(handler)
    }
  }

  onClose(handler: () => void) {
    this.closeListeners.add(handler)
    return () => {
      this.closeListeners.delete(handler)
    }
  }

  async connect() {
    this.disconnect()
    const generation = ++this.generation
    const socket = new WebSocket(roomsSocketUrl())
    this.ws = socket

    socket.addEventListener('message', (event) => {
      if (generation !== this.generation)
        return
      let message: ServerMessage
      try {
        message = JSON.parse(String(event.data)) as ServerMessage
      }
      catch {
        return
      }
      for (const handler of this.messageListeners)
        handler(message)
    })

    socket.addEventListener('close', () => {
      if (generation !== this.generation)
        return
      for (const handler of this.closeListeners)
        handler()
    })

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error('Нет связи с комнатой'))
      }, 8_000)
      socket.addEventListener('open', () => {
        window.clearTimeout(timer)
        resolve()
      }, { once: true })
      socket.addEventListener('error', () => {
        window.clearTimeout(timer)
        reject(new Error('Нет связи с комнатой'))
      }, { once: true })
    })
  }

  send(message: ClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      throw new Error('Нет связи с комнатой')
    this.ws.send(JSON.stringify(message))
  }

  disconnect() {
    this.generation += 1
    const socket = this.ws
    this.ws = null
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
      socket.close()
  }
}
