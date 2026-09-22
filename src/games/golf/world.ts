import * as THREE from 'three'
import { BALL_RADIUS, rampMesh, type GolfVec, type LevelDef } from './levels'
import { GolfSim, type SimSample } from './physics'

export interface GolfAim {
  yaw: number
  power: number
  holdCamera?: boolean
}

export interface GolfWorldHandlers {
  onSample: (sample: SimSample) => void
  onRest: (sample: SimSample) => void
  onBall: (position: GolfVec) => void
  aim: () => GolfAim | null
}

const STEP = 1 / 60

export class GolfWorld {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly sim = new GolfSim()
  private readonly course = new THREE.Group()
  private readonly ballRig = new THREE.Group()
  private readonly ball: THREE.Mesh
  private readonly aim = new THREE.Group()
  private readonly lamp: THREE.PointLight
  private readonly keyLight: THREE.DirectionalLight
  private readonly sharedMaterials: THREE.Material[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly reducedMotion: boolean
  private flag?: THREE.Object3D
  private level: LevelDef | null = null
  private frame = 0
  private last = 0
  private acc = 0
  private sampleAt = 0
  private ballAt = 0
  private live = false
  private generation = 0
  private launchYaw = 0
  private cameraYaw = 0
  private viewTarget: THREE.Vector3 | null = null
  private viewVelocity = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly toBall = new THREE.Vector3()
  private readonly closest = new THREE.Vector3()
  private readonly groundHit = new THREE.Vector3()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly aimMaterial: THREE.MeshStandardMaterial
  private disposed = false

  constructor(
    canvas: HTMLCanvasElement,
    private readonly handlers: GolfWorldHandlers,
  ) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x07140f)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
    this.scene.fog = new THREE.FogExp2(0x07140f, 0.038)
    this.scene.add(this.course)
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(70, 28, 18),
      new THREE.MeshBasicMaterial({ color: 0x10241c, side: THREE.BackSide }),
    ))

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xf4efe2 }),
    )
    moon.position.set(-18, 20, -16)
    this.scene.add(moon)
    this.scene.add(starField())
    this.scene.add(new THREE.AmbientLight(0xd5e2d4, 0.55))
    this.scene.add(new THREE.HemisphereLight(0xe7f2ff, 0x143028, 0.45))

    this.keyLight = new THREE.DirectionalLight(0xf7f1e4, 2.6)
    this.keyLight.position.set(-8, 16, -6)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(1024, 1024)
    this.keyLight.shadow.camera.near = 1
    this.keyLight.shadow.camera.far = 48
    const shadowCam = this.keyLight.shadow.camera
    shadowCam.left = -14
    shadowCam.right = 14
    shadowCam.top = 14
    shadowCam.bottom = -14
    this.keyLight.shadow.bias = -0.0012
    this.scene.add(this.keyLight, this.keyLight.target)

    this.lamp = new THREE.PointLight(0xffc56b, 28, 18, 2)
    this.scene.add(this.lamp)

    const ballMat = new THREE.MeshStandardMaterial({ color: 0xf7f3ea, roughness: 0.28, metalness: 0.05 })
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), ballMat)
    this.ball.castShadow = true
    this.ballRig.add(this.ball)
    this.scene.add(this.ballRig)
    this.sharedMaterials.push(ballMat)

    this.aimMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7a23a,
      emissive: 0x8a4e12,
      emissiveIntensity: 0.4,
      roughness: 0.32,
    })
    const brass = this.aimMaterial
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), brass)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = 0.5
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 10), brass)
    head.rotation.x = Math.PI / 2
    head.position.z = 1.05
    this.aim.add(shaft, head)
    this.aim.visible = false
    this.scene.add(this.aim)
    this.sharedMaterials.push(brass)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
    this.last = performance.now()
    this.frame = requestAnimationFrame(now => this.loop(now))
  }

  load(level: LevelDef) {
    this.level = level
    this.clearCourse()
    const grass = fairwayMaterial()
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.86 })
    const clay = new THREE.MeshStandardMaterial({ color: 0xc4553a, roughness: 0.42, metalness: 0.08 })
    this.sharedMaterials.push(grass, wood, clay)

    for (const body of level.bodies) {
      if (body.kind === 'ramp' && body.slope) {
        const data = rampMesh(body.slope)
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
        geometry.setIndex(data.indices)
        geometry.computeVertexNormals()
        const mesh = new THREE.Mesh(geometry, grass)
        mesh.receiveShadow = true
        mesh.castShadow = true
        this.course.add(mesh)
        continue
      }
      const material = body.kind === 'wall' ? wood : body.kind === 'bumper' ? clay : grass
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(body.size[0], body.size[1], body.size[2]),
        material,
      )
      mesh.position.set(body.position[0], body.position[1], body.position[2])
      if (body.rotation)
        mesh.rotation.set(body.rotation[0], body.rotation[1], body.rotation[2])
      mesh.receiveShadow = true
      mesh.castShadow = body.kind !== 'fairway'
      this.course.add(mesh)
    }

    this.addCup(level)
    if (level.water)
      this.addWater()
    this.sim.load(level)
    this.place({ x: level.tee[0], y: level.tee[1], z: level.tee[2] })
    this.keyLight.target.position.set(level.hole[0], level.hole[1], level.hole[2])
  }

  place(position: GolfVec) {
    this.generation += 1
    this.live = false
    this.viewTarget = null
    this.sim.place(position)
    this.ballRig.position.set(position.x, position.y, position.z)
  }

  launch(yaw: number, power: number, from: GolfVec) {
    this.generation += 1
    this.live = true
    this.launchYaw = yaw
    this.cameraYaw = yaw
    this.viewTarget = null
    this.acc = 0
    this.sampleAt = 0
    this.sim.launch(yaw, power, from)
    this.ballRig.position.set(from.x, from.y, from.z)
  }

  showBall(position: GolfVec, velocity: GolfVec, snap = false) {
    this.viewVelocity.set(velocity.x, velocity.y, velocity.z)
    if (!this.viewTarget)
      this.viewTarget = new THREE.Vector3()
    this.viewTarget.set(position.x, position.y, position.z)
    if (snap || this.ballRig.position.distanceTo(this.viewTarget) > 2.4)
      this.ballRig.position.copy(this.viewTarget)
  }

  projectBall() {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.groundHit.copy(this.ballRig.position).project(this.camera)
    return {
      x: rect.left + (this.groundHit.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-this.groundHit.y * 0.5 + 0.5) * rect.height,
    }
  }

  readPointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1)
      return null
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const ball = this.ballRig.position
    this.toBall.copy(ball).sub(this.raycaster.ray.origin)
    const along = this.toBall.dot(this.raycaster.ray.direction)
    this.closest.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, along)
    const hitsBall = along > 0 && this.closest.distanceTo(ball) < BALL_RADIUS * 2.6
    this.groundPlane.constant = -ball.y
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit))
      return { hitsBall, x: ball.x, z: ball.z }
    return { hitsBall, x: this.groundHit.x, z: this.groundHit.z }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.clearCourse()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh)
        obj.geometry.dispose()
    })
    for (const material of this.sharedMaterials)
      material.dispose()
    this.renderer.dispose()
  }

  private addCup(level: LevelDef) {
    const [x, y, z] = level.hole
    const cup = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 28),
      new THREE.MeshStandardMaterial({ color: 0x090c0b, roughness: 1 }),
    )
    cup.rotation.x = -Math.PI / 2
    cup.position.set(x, y + 0.03, z)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 28),
      new THREE.MeshStandardMaterial({
        color: 0xe7a23a,
        roughness: 0.35,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, y + 0.035, z)
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.4 }),
    )
    pole.position.set(x, y + 0.72, z)
    pole.castShadow = true
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xe7a23a, side: THREE.DoubleSide, roughness: 0.55 }),
    )
    cloth.position.set(x + 0.26, y + 1.22, z)
    this.flag = cloth
    const tee = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 20),
      new THREE.MeshBasicMaterial({ color: 0xf4efe4 }),
    )
    tee.rotation.x = -Math.PI / 2
    tee.position.set(level.tee[0], level.tee[1] - BALL_RADIUS + 0.025, level.tee[2])
    this.course.add(cup, ring, pole, cloth, tee)
  }

  private addWater() {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshStandardMaterial({
        color: 0x0c3a44,
        roughness: 0.16,
        metalness: 0.42,
        transparent: true,
        opacity: 0.9,
      }),
    )
    water.rotation.x = -Math.PI / 2
    water.position.y = -0.45
    this.course.add(water)
  }

  private clearCourse() {
    this.course.traverse((obj) => {
      if (obj instanceof THREE.Mesh)
        obj.geometry.dispose()
    })
    this.course.clear()
    this.flag = undefined
  }

  private resize() {
    const canvas = this.renderer.domElement
    const parent = canvas.parentElement ?? canvas
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private loop(now: number) {
    if (this.disposed)
      return
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (this.live)
      this.simulate(dt, now)
    else
      this.followView(dt)
    this.frameAim()
    this.frameCamera(dt, now)
    this.renderer.render(this.scene, this.camera)
    if (now - this.ballAt > 40) {
      this.ballAt = now
      const point = this.ballRig.position
      this.handlers.onBall({ x: point.x, y: point.y, z: point.z })
    }
    this.frame = requestAnimationFrame(time => this.loop(time))
  }

  private simulate(dt: number, now: number) {
    this.acc += dt
    while (this.acc >= STEP && this.live) {
      const gen = this.generation
      const sample = this.sim.step(STEP)
      this.acc -= STEP
      if (this.generation !== gen || !this.live)
        return
      this.ballRig.position.set(sample.position.x, sample.position.y, sample.position.z)
      if (sample.resting || sample.holed || sample.hazard) {
        this.live = false
        this.handlers.onRest(sample)
        return
      }
    }
    if (this.live && now - this.sampleAt > 120) {
      this.sampleAt = now
      this.handlers.onSample(this.sim.sample())
    }
  }

  private followView(dt: number) {
    if (!this.viewTarget)
      return
    this.ballRig.position.lerp(this.viewTarget, 1 - Math.exp(-14 * dt))
  }

  private frameAim() {
    const aim = this.live ? null : this.handlers.aim()
    if (!aim) {
      this.aim.visible = false
      return
    }
    this.aim.visible = true
    this.aim.position.copy(this.ballRig.position)
    this.aim.rotation.y = aim.yaw
    this.aim.scale.set(1, 1, 0.42 + aim.power * 4.15)
    this.aimMaterial.emissiveIntensity = 0.22 + aim.power * 0.95
    if (!aim.holdCamera)
      this.cameraYaw = aim.yaw
  }

  private frameCamera(dt: number, now: number) {
    const ball = this.ballRig.position
    if (this.live)
      this.cameraYaw = this.launchYaw
    else if (!this.handlers.aim()) {
      const speed = Math.hypot(this.viewVelocity.x, this.viewVelocity.z)
      if (speed > 0.45)
        this.cameraYaw = Math.atan2(this.viewVelocity.x, this.viewVelocity.z)
      else if (this.level)
        this.cameraYaw = Math.atan2(this.level.hole[0] - ball.x, this.level.hole[2] - ball.z)
    }

    const dist = 7.5
    this.desired.set(
      ball.x - Math.sin(this.cameraYaw) * dist,
      ball.y + 4.5,
      ball.z - Math.cos(this.cameraYaw) * dist,
    )
    this.camera.position.lerp(this.desired, 1 - Math.exp(-3.4 * dt))
    this.camera.lookAt(ball.x, ball.y + 0.2, ball.z)
    this.lamp.position.set(ball.x, ball.y + 1.6, ball.z)
    if (this.flag && !this.reducedMotion)
      this.flag.rotation.y = Math.sin(now / 380) * 0.35
  }
}

function fairwayMaterial() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    for (let row = 0; row < 8; row += 1) {
      context.fillStyle = row % 2 === 0 ? '#1c7342' : '#24864e'
      context.fillRect(0, row * 32, 64, 32)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 6)
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 })
}

function starField() {
  const count = 160
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = 28 + Math.random() * 18
    const theta = Math.random() * Math.PI * 2
    const lift = 0.25 + Math.random() * 0.7
    positions[i * 3] = Math.cos(theta) * radius
    positions[i * 3 + 1] = 8 + lift * 26
    positions[i * 3 + 2] = Math.sin(theta) * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xf6f1e4, size: 0.12, sizeAttenuation: true }),
  )
}
