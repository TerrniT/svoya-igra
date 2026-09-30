import * as CANNON from 'cannon-es'
import { BALL_RADIUS, rampMesh, type BoxDef, type GolfVec, type LevelDef } from './levels'

const FIXED = 1 / 120
const REST_SPEED = 0.16
const REST_TIME = 0.32
const MAX_AGE = 14

export interface SimSample {
  position: GolfVec
  velocity: GolfVec
  holed: boolean
  hazard: boolean
  resting: boolean
}

export function shotVelocity(yaw: number, power: number): GolfVec {
  const clamped = Math.min(1, Math.max(0, power))
  const speed = 1.15 + Math.pow(clamped, 1.2) * 13.1
  return {
    x: Math.sin(yaw) * speed,
    y: 0.03,
    z: Math.cos(yaw) * speed,
  }
}

function roundVec(v: CANNON.Vec3): GolfVec {
  return {
    x: Math.round(v.x * 1000) / 1000,
    y: Math.round(v.y * 1000) / 1000,
    z: Math.round(v.z * 1000) / 1000,
  }
}

export class GolfSim {
  private world!: CANNON.World
  private ball!: CANNON.Body
  private level!: LevelDef
  private age = 0
  private stillFor = 0
  private wallGlide = 0
  private readonly incoming = new CANNON.Vec3()

  load(level: LevelDef) {
    this.level = level
    const green = new CANNON.Material('green')
    const wood = new CANNON.Material('wood')
    const rubber = new CANNON.Material('rubber')
    const ballMat = new CANNON.Material('ball')

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -12.5, 0) })
    world.broadphase = new CANNON.SAPBroadphase(world)
    world.allowSleep = false
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, green, {
      friction: 0.4,
      restitution: 0.02,
    }))
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, wood, {
      friction: 0.04,
      restitution: 0.75,
    }))
    world.addContactMaterial(new CANNON.ContactMaterial(ballMat, rubber, {
      friction: 0.02,
      restitution: 0.86,
    }))

    for (const box of level.bodies) {
      if (box.kind === 'ramp' && box.slope) {
        world.addBody(wedgeBody(box, green))
        continue
      }
      const surface = box.kind === 'bumper' ? 'bumper' : box.kind === 'wall' ? 'wall' : 'green'
      const material = surface === 'bumper' ? rubber : surface === 'wall' ? wood : green
      world.addBody(staticBox(box, material, surface))
    }

    const ball = new CANNON.Body({
      mass: 0.05,
      shape: new CANNON.Sphere(BALL_RADIUS),
      material: ballMat,
      linearDamping: 0.05,
      angularDamping: 0.22,
      allowSleep: false,
    })
    world.addBody(ball)
    ball.addEventListener('collide', (event: { body: CANNON.Body & { surface?: string }, contact: CANNON.ContactEquation }) => {
      this.bounce(event)
    })
    world.addEventListener('postStep', () => {
      if (Math.abs(ball.velocity.y) > 0.7)
        return
      const drag = this.wallGlide > 0 ? 0.2 : 1.15
      if (this.wallGlide > 0)
        this.wallGlide = Math.max(0, this.wallGlide - world.dt)
      const scale = Math.max(0, 1 - drag * world.dt)
      ball.velocity.x *= scale
      ball.velocity.z *= scale
    })
    this.world = world
    this.ball = ball
    this.place(vecFromTuple(level.tee))
  }

  place(pos: GolfVec) {
    this.ball.position.set(pos.x, pos.y, pos.z)
    this.ball.velocity.set(0, 0, 0)
    this.ball.angularVelocity.set(0, 0, 0)
    this.ball.force.set(0, 0, 0)
    this.ball.torque.set(0, 0, 0)
    this.age = 0
    this.stillFor = 0
    this.wallGlide = 0
  }

  launch(yaw: number, power: number, from: GolfVec) {
    this.place(from)
    const velocity = shotVelocity(yaw, power)
    this.ball.velocity.set(velocity.x, velocity.y, velocity.z)
    this.ball.angularVelocity.set(
      velocity.z / BALL_RADIUS,
      0,
      -velocity.x / BALL_RADIUS,
    )
  }

  step(dt = 1 / 60): SimSample {
    let last = this.sample()
    let left = dt
    while (left > 1e-8) {
      this.incoming.copy(this.ball.velocity)
      const h = Math.min(FIXED, left)
      this.world.step(h)
      this.age += h
      left -= h
      this.attract(h)
      last = this.evaluate(h)
      if (last.holed || last.hazard || last.resting)
        return last
    }
    return last
  }

  private evaluate(dt: number): SimSample {

    const position = roundVec(this.ball.position)
    const velocity = roundVec(this.ball.velocity)
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y, this.ball.velocity.z)
    const hazard = position.y < -0.55
    const holed = this.inCup(speed)

    if (holed) {
      const hole = this.level.hole
      this.ball.velocity.set(0, 0, 0)
      this.ball.position.set(hole[0], hole[1] + 0.05, hole[2])
      return {
        position: { x: hole[0], y: hole[1] + 0.05, z: hole[2] },
        velocity: { x: 0, y: 0, z: 0 },
        holed: true,
        hazard: false,
        resting: true,
      }
    }

    if (hazard || this.age >= MAX_AGE)
      return { position, velocity, holed: false, hazard, resting: true }

    if (speed < REST_SPEED)
      this.stillFor += dt
    else
      this.stillFor = 0

    return {
      position,
      velocity,
      holed: false,
      hazard: false,
      resting: this.stillFor >= REST_TIME,
    }
  }

  sample(): SimSample {
    return {
      position: roundVec(this.ball.position),
      velocity: roundVec(this.ball.velocity),
      holed: false,
      hazard: this.ball.position.y < -0.55,
      resting: false,
    }
  }

  private inCup(speed: number) {
    const [hx, hy, hz] = this.level.hole
    const dx = this.ball.position.x - hx
    const dz = this.ball.position.z - hz
    const dist = Math.hypot(dx, dz)
    const dy = Math.abs(this.ball.position.y - (hy + BALL_RADIUS))
    return dist < this.level.holeRadius && dy < 0.45 && speed < 1.25
  }

  private attract(dt: number) {
    const [hx, hy, hz] = this.level.hole
    const dx = hx - this.ball.position.x
    const dz = hz - this.ball.position.z
    const dist = Math.hypot(dx, dz)
    const dy = Math.abs(this.ball.position.y - (hy + BALL_RADIUS))
    if (dist > this.level.holeRadius || dist < 0.001 || dy > 0.45)
      return
    const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.z)
    if (speed > 1.25)
      return
    const pull = (1 - dist / this.level.holeRadius) * 8
    this.ball.velocity.x += (dx / dist) * pull * dt
    this.ball.velocity.z += (dz / dist) * pull * dt
  }

  private bounce(event: { body: CANNON.Body & { surface?: string } }) {
    const surface = event.body.surface
    if (surface !== 'wall' && surface !== 'bumper')
      return
    const flat = Math.hypot(this.incoming.x, this.incoming.z)
    if (flat < 0.65)
      return
    this.wallGlide = 0.22
  }
}

function wedgeBody(box: BoxDef, material: CANNON.Material) {
  const mesh = rampMesh(box.slope!)
  let cx = 0
  let cy = 0
  let cz = 0
  const count = mesh.positions.length / 3
  for (let i = 0; i < mesh.positions.length; i += 3) {
    cx += mesh.positions[i]!
    cy += mesh.positions[i + 1]!
    cz += mesh.positions[i + 2]!
  }
  cx /= count
  cy /= count
  cz /= count
  const vertices = []
  for (let i = 0; i < mesh.positions.length; i += 3) {
    vertices.push(new CANNON.Vec3(
      mesh.positions[i]! - cx,
      mesh.positions[i + 1]! - cy,
      mesh.positions[i + 2]! - cz,
    ))
  }
  const faces: number[][] = []
  for (let i = 0; i < mesh.indices.length; i += 3)
    faces.push([mesh.indices[i]!, mesh.indices[i + 1]!, mesh.indices[i + 2]!])
  return new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(cx, cy, cz),
    shape: new CANNON.ConvexPolyhedron({ vertices, faces }),
    material,
  })
}

function staticBox(box: BoxDef, material: CANNON.Material, surface: string) {
  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)),
    position: new CANNON.Vec3(box.position[0], box.position[1], box.position[2]),
    material,
  })
  if (box.rotation)
    body.quaternion.setFromEuler(box.rotation[0], box.rotation[1], box.rotation[2], 'XYZ')
  ;(body as CANNON.Body & { surface: string }).surface = surface
  return body
}

function vecFromTuple(tuple: [number, number, number]): GolfVec {
  return { x: tuple[0], y: tuple[1], z: tuple[2] }
}
