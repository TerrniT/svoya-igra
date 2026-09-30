export function shuffle<T>(items: readonly T[]): T[] {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = next[index]
    const swapped = next[swapIndex]
    if (current === undefined || swapped === undefined)
      continue

    next[index] = swapped
    next[swapIndex] = current
  }

  return next
}
