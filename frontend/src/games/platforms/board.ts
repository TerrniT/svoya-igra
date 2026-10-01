export const PLATFORM_COUNT = 9
export const GRID_SIZE = 3
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 9
export const START_SEATS = [0, 8, 2, 6, 4, 1, 7, 3, 5] as const

export const FIGURE_RADIUS = 0.22
export const PLATFORM_SIZE = 1.72
export const PLATFORM_PHYS = 2.22
export const PLATFORM_HEIGHT = 0.32
export const SPACING = 2.45
export const HAZARD_Y = -0.45
export const LAND_RADIUS = 1.28
export const GRAVITY_Y = -16

export const FIGURE_COLORS = [
  '#f0b429',
  '#5ec8f0',
  '#f07178',
  '#9ece6a',
  '#bb9af7',
  '#ff9e64',
  '#7dcfff',
  '#e0af68',
  '#c0caf5',
] as const

export interface Vec3 {
  x: number
  y: number
  z: number
}

export function zeroVec(): Vec3 {
  return { x: 0, y: 0, z: 0 }
}

export function restY() {
  return PLATFORM_HEIGHT / 2 + FIGURE_RADIUS
}

export function cellCenter(index: number): Vec3 {
  const col = index % GRID_SIZE
  const row = Math.floor(index / GRID_SIZE)
  return {
    x: (col - 1) * SPACING,
    y: restY(),
    z: (row - 1) * SPACING,
  }
}

export function cellAt(x: number, z: number, present: boolean[]) {
  let best = -1
  let bestDist = LAND_RADIUS
  for (let index = 0; index < PLATFORM_COUNT; index += 1) {
    if (!present[index])
      continue
    const center = cellCenter(index)
    const dist = Math.hypot(x - center.x, z - center.z)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  }
  return best
}

export function figureColor(order: string[], playerId: string) {
  const index = Math.max(0, order.indexOf(playerId))
  return FIGURE_COLORS[index % FIGURE_COLORS.length]!
}

export function yawTowardCenter(from: Vec3) {
  const dx = -from.x
  const dz = -from.z
  if (Math.hypot(dx, dz) < 0.08)
    return 0
  return Math.atan2(dx, dz)
}

export function shotVelocity(yaw: number, power: number): Vec3 {
  const clamped = Math.min(1, Math.max(0, power))
  const speed = 0.55 + clamped ** 1.15 * 7.4
  const lift = 0.06 + clamped ** 1.2 * 2.2
  return {
    x: Math.sin(yaw) * speed,
    y: lift,
    z: Math.cos(yaw) * speed,
  }
}
