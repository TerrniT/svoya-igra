import * as CANNON from 'cannon-es'
import {
  FIGURE_RADIUS,
  HAZARD_Y,
  PLATFORM_COUNT,
  PLATFORM_HEIGHT,
  PLATFORM_SIZE,
  cellCenter,
  shotVelocity,
  type Vec3,
} from './board'

const FIXED = 1 / 120
const REST_SPEED = 0.18
const REST_TIME = 0.28
const MAX_AGE = 10

export interface SimSample {
  figures: Record<string, Vec3>
  velocity: Vec3
  currentId: string
  resting: boolean
  fallen: string[]
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

function roundVec(v: CANNON.Vec3): Vec3 {
  return { x: round(v.x), y: round(v.y), z: round(v.z) }
}

export class PlatformSim {
  private world!: CANNON.World
  private pads: CANNON.Body[] = []
  private bodies = new Map<string, CANNON.Body>()
  private currentId = ''
  private age = 0
  private stillFor = 0

  load(present: boolean[], figures: Record<string, Vec3>, living: string[]) {
    const stone = new CANNON.Material('stone')
    const pawn = new CANNON.Material('pawn')
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) })
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = false
    world.addContactMaterial(new CANNON.ContactMaterial(pawn, stone, {
      friction: 0.72,
      restitution: 0.04,
    }))
    world.addContactMaterial(new CANNON.ContactMaterial(pawn, pawn, {
      friction: 0.12,
      restitution: 0.35,
    }))

    this.pads = []
    for (let index = 0; index < PLATFORM_COUNT; index += 1) {
      if (!present[index])
        continue
      const center = cellCenter(index)
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_SIZE / 2, PLATFORM_HEIGHT / 2, PLATFORM_SIZE / 2)),
        position: new CANNON.Vec3(center.x, 0, center.z),
        material: stone,
      })
      world.addBody(body)
      this.pads.push(body)
    }

    this.bodies = new Map()
    for (const id of living) {
      const pos = figures[id] ?? cellCenter(0)
      const body = new CANNON.Body({
        mass: 0.08,
        shape: new CANNON.Sphere(FIGURE_RADIUS),
        material: pawn,
        linearDamping: 0.12,
        angularDamping: 0.4,
        allowSleep: false,
      })
      body.position.set(pos.x, pos.y, pos.z)
      world.addBody(body)
      this.bodies.set(id, body)
    }

    world.addEventListener('postStep', () => {
      const current = this.bodies.get(this.currentId)
      if (!current)
        return
      const drag = 1.05
      const scale = Math.max(0, 1 - drag * world.dt)
      current.velocity.x *= scale
      current.velocity.z *= scale
    })

    this.world = world
    this.age = 0
    this.stillFor = 0
  }

  launch(id: string, yaw: number, power: number, from: Vec3) {
    this.currentId = id
    const body = this.bodies.get(id)
    if (!body)
      return
    body.position.set(from.x, from.y, from.z)
    const velocity = shotVelocity(yaw, power)
    body.velocity.set(velocity.x, velocity.y, velocity.z)
    body.angularVelocity.set(velocity.z / FIGURE_RADIUS, 0, -velocity.x / FIGURE_RADIUS)
    this.age = 0
    this.stillFor = 0
  }

  place(id: string, pos: Vec3) {
    const body = this.bodies.get(id)
    if (!body)
      return
    body.position.set(pos.x, pos.y, pos.z)
    body.velocity.set(0, 0, 0)
    body.angularVelocity.set(0, 0, 0)
  }

  step(dt = 1 / 60): SimSample {
    let last = this.sample()
    let left = dt
    while (left > 1e-8) {
      const h = Math.min(FIXED, left)
      this.world.step(h)
      this.age += h
      left -= h
      last = this.evaluate(h)
      if (last.resting)
        return last
    }
    return last
  }

  sample(): SimSample {
    return this.evaluate(0)
  }

  private evaluate(dt: number): SimSample {
    const current = this.bodies.get(this.currentId)
    const figures: Record<string, Vec3> = {}
    const fallen: string[] = []
    for (const [id, body] of this.bodies) {
      figures[id] = roundVec(body.position)
      if (body.position.y < HAZARD_Y)
        fallen.push(id)
    }
    const velocity = current ? roundVec(current.velocity) : { x: 0, y: 0, z: 0 }
    const speed = current
      ? Math.hypot(current.velocity.x, current.velocity.y, current.velocity.z)
      : 0
    const timedOut = this.age >= MAX_AGE
    if (speed < REST_SPEED)
      this.stillFor += dt
    else
      this.stillFor = 0
    return {
      figures,
      velocity,
      currentId: this.currentId,
      fallen,
      resting: timedOut || this.stillFor >= REST_TIME || Boolean(current && current.position.y < HAZARD_Y),
    }
  }
}
