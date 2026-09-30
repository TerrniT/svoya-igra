export interface ChooserPlayer {
  id: string
  isHost?: boolean
}

export function playingPlayers<T extends ChooserPlayer>(players: T[]) {
  return players.filter(player => !player.isHost)
}

export function nextChooserId(players: ChooserPlayer[], currentChooserId: string | null): string | null {
  if (!players.length)
    return null

  const currentIndex = currentChooserId
    ? players.findIndex(player => player.id === currentChooserId)
    : -1

  if (currentIndex === -1)
    return players[0]?.id ?? null

  return players[(currentIndex + 1) % players.length]?.id ?? null
}

export function requireChooser(players: ChooserPlayer[], playerId: string) {
  if (!players.some(player => player.id === playerId))
    throw new Error('Этого игрока нет среди участников')
  return playerId
}
