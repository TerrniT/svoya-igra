export const BALL_RADIUS = 0.18
export const MAX_STROKES = 8

export interface GolfVec {
  x: number
  y: number
  z: number
}

export interface SlopeDef {
  x: number
  width: number
  z0: number
  z1: number
  y0: number
  y1: number
}

export interface BoxDef {
  kind: 'fairway' | 'wall' | 'bumper' | 'ramp'
  position: [number, number, number]
  size: [number, number, number]
  rotation?: [number, number, number]
  slope?: SlopeDef
}

export interface LevelDef {
  id: string
  name: string
  blurb: string
  par: number
  tee: [number, number, number]
  /** x, surface height, z */
  hole: [number, number, number]
  holeRadius: number
  water: boolean
  bodies: BoxDef[]
}

function tee(x: number, surface: number, z: number): [number, number, number] {
  return [x, surface + BALL_RADIUS + 0.02, z]
}

function fair(x: number, surface: number, z: number, w: number, d: number): BoxDef {
  const h = 1.2
  return { kind: 'fairway', position: [x, surface - h / 2, z], size: [w, h, d] }
}

function wall(x: number, surface: number, z: number, w: number, d: number): BoxDef {
  const h = 0.62
  return { kind: 'wall', position: [x, surface + h / 2, z], size: [w, h, d] }
}

function ramp(x: number, z0: number, z1: number, y0: number, y1: number, width: number): BoxDef {
  return {
    kind: 'ramp',
    position: [x, (y0 + y1) / 2, (z0 + z1) / 2],
    size: [width, Math.abs(y1 - y0) + 0.4, z1 - z0],
    slope: { x, width, z0, z1, y0, y1 },
  }
}

export function rampMesh(slope: SlopeDef) {
  const hw = slope.width / 2
  const base = Math.min(slope.y0, slope.y1) - 1.1
  const { x, z0, z1, y0, y1 } = slope
  const positions = [
    x - hw, base, z0,
    x + hw, base, z0,
    x + hw, base, z1,
    x - hw, base, z1,
    x - hw, y0, z0,
    x + hw, y0, z0,
    x + hw, y1, z1,
    x - hw, y1, z1,
  ]
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 7, 6, 4, 6, 5,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ]
  return { positions, indices }
}

export const GOLF_LEVELS: LevelDef[] = [
  {
    id: 'alley',
    name: 'Аллея',
    blurb: 'Прямой прогон. Мягкий удар доезжает, сильный упирается в стенку.',
    par: 2,
    tee: tee(0, 0, 1.15),
    hole: [0, 0, 11.6],
    holeRadius: 0.4,
    water: false,
    bodies: [
      fair(0, 0, 8, 3.4, 16.6),
      wall(-1.86, 0, 8, 0.28, 16.6),
      wall(1.86, 0, 8, 0.28, 16.6),
      wall(0, 0, 16.45, 3.72, 0.28),
      wall(0, 0, -0.45, 3.72, 0.28),
    ],
  },
  {
    id: 'knee',
    name: 'Колено',
    blurb: 'В конце аллеи коридор уходит вправо. Прямой удар в лунку не заходит.',
    par: 3,
    tee: tee(0, 0, 0.85),
    hole: [7.1, 0, 8.4],
    holeRadius: 0.4,
    water: false,
    bodies: [
      fair(0, 0, 5.1, 3.4, 11.2),
      fair(4.7, 0, 8.4, 9.4, 4.8),
      wall(-1.86, 0, 5.1, 0.28, 11.2),
      wall(1.86, 0, 2.15, 0.28, 5.6),
      wall(0, 0, -0.65, 3.72, 0.28),
      wall(3.7, 0, 10.95, 11.4, 0.28),
      wall(5.7, 0, 5.85, 7.6, 0.28),
      wall(9.55, 0, 8.4, 0.28, 5.08),
    ],
  },
  {
    id: 'hill',
    name: 'Горка',
    blurb: 'Нужен разгон, чтобы забраться на верхнюю грину.',
    par: 3,
    tee: tee(0, 0, 1),
    hole: [0, 1.2, 13.6],
    holeRadius: 0.42,
    water: false,
    bodies: [
      fair(0, 0, 3.35, 3.4, 7.5),
      ramp(0, 6.4, 10.6, 0, 1.2, 3.4),
      fair(0, 1.2, 13.5, 3.4, 6.2),
      wall(-1.86, 0, 3.35, 0.28, 7.5),
      wall(1.86, 0, 3.35, 0.28, 7.5),
      wall(0, 0, -0.55, 3.72, 0.28),
      wall(-1.86, 1.2, 13.5, 0.28, 6.2),
      wall(1.86, 1.2, 13.5, 0.28, 6.2),
      wall(0, 1.2, 16.74, 3.72, 0.28),
    ],
  },
  {
    id: 'block',
    name: 'Тумба',
    blurb: 'Посередине поля камень. Обходите его, а не бейте в лоб.',
    par: 3,
    tee: tee(0, 0, 1.15),
    hole: [0, 0, 13.4],
    holeRadius: 0.4,
    water: false,
    bodies: [
      fair(0, 0, 8, 8.2, 16.6),
      wall(0, 0, 16.45, 8.5, 0.28),
      wall(0, 0, -0.45, 8.5, 0.28),
      wall(-4.26, 0, 8, 0.28, 16.9),
      wall(4.26, 0, 8, 0.28, 16.9),
      { kind: 'bumper', position: [0, 0.55, 8], size: [1.7, 1.15, 1.7] },
    ],
  },
  {
    id: 'bridge',
    name: 'Мост',
    blurb: 'Узкий мостик над водой. Промах — удар с того же места.',
    par: 4,
    tee: tee(0, 0, 1.15),
    hole: [1.05, 0, 12.7],
    holeRadius: 0.4,
    water: true,
    bodies: [
      fair(0, 0, 2.15, 4.2, 4.5),
      fair(0, 0, 7.35, 1.28, 6.1),
      fair(0, 0, 12.45, 4.3, 4.3),
      wall(0, 0, -0.25, 4.5, 0.28),
      wall(-2.26, 0, 2.15, 0.28, 4.5),
      wall(2.26, 0, 2.15, 0.28, 4.5),
      wall(0, 0, 14.75, 4.6, 0.28),
      wall(-2.3, 0, 12.45, 0.28, 4.3),
      wall(2.3, 0, 12.45, 0.28, 4.3),
    ],
  },
]

export function holeSurface(level: LevelDef): GolfVec {
  return { x: level.hole[0], y: level.hole[1], z: level.hole[2] }
}

export function teeVec(level: LevelDef): GolfVec {
  return { x: level.tee[0], y: level.tee[1], z: level.tee[2] }
}

export function yawTowardHole(level: LevelDef, from: GolfVec) {
  return Math.atan2(level.hole[0] - from.x, level.hole[2] - from.z)
}
