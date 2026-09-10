import Peer, { type DataConnection } from 'peerjs'
import type { ClientMessage, ServerMessage } from '@/lib/room-protocol'

export const HOST_PEER_PREFIX = 'svoya-'

export function hostPeerId(code: string) {
  return `${HOST_PEER_PREFIX}${code.replace(/\D/g, '').padStart(4, '0')}`
}

export function randomRoomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export function isUnavailableId(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'type' in error && error.type === 'unavailable-id')
}

export function createPeer(id?: string) {
  return id
    ? new Peer(id, { debug: 0 })
    : new Peer({ debug: 0 })
}

export function waitForPeerOpen(peer: Peer, ms = 12_000) {
  return new Promise<string>((resolve, reject) => {
    if (peer.open && peer.id) {
      resolve(peer.id)
      return
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Не удалось подключиться к сети комнат'))
    }, ms)

    const onOpen = (id: string) => {
      cleanup()
      resolve(id)
    }
    const onError = (error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error('Не удалось подключиться к сети комнат'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      peer.off('open', onOpen)
      peer.off('error', onError)
    }

    peer.on('open', onOpen)
    peer.on('error', onError)
  })
}

export function waitForConnection(connection: DataConnection, ms = 12_000) {
  return new Promise<DataConnection>((resolve, reject) => {
    if (connection.open) {
      resolve(connection)
      return
    }

    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Комната не найдена. Проверьте код и что вкладка ведущего открыта.'))
    }, ms)

    const onOpen = () => {
      cleanup()
      resolve(connection)
    }
    const onError = (error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error('Не удалось войти в комнату'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      connection.off('open', onOpen)
      connection.off('error', onError)
    }

    connection.on('open', onOpen)
    connection.on('error', onError)
  })
}

export async function claimHostPeer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = randomRoomCode()
    const peer = createPeer(hostPeerId(code))
    try {
      await waitForPeerOpen(peer)
      return { peer, code }
    }
    catch (error) {
      peer.destroy()
      if (isUnavailableId(error))
        continue
      throw error instanceof Error ? error : new Error('Не удалось создать комнату')
    }
  }

  throw new Error('Не удалось выдать код комнаты')
}

export function parseWireData(raw: unknown) {
  if (typeof raw === 'string')
    return JSON.parse(raw) as unknown
  return raw
}

export function sendWire(connection: DataConnection, message: ClientMessage | ServerMessage) {
  if (connection.open)
    connection.send(JSON.stringify(message))
}
