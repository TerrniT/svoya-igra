import * as THREE from 'three'
import {
  FIGURE_RADIUS,
  PLATFORM_COUNT,
  PLATFORM_HEIGHT,
  PLATFORM_SIZE,
  cellCenter,
  figureColor,
  type Vec3,
} from './board'
import { PlatformSim, type SimSample } from './physics'

export interface PlatformAim {
  yaw: number
  power: number
  holdCamera?: boolean
}

export interface PlatformWorldHandlers {
  onSample: (sample: SimSample) => void
  onRest: (sample: SimSample) => void
  onFigure: (position: Vec3) => void
  aim: () => PlatformAim | null
}

const STEP = 1 / 60

export class PlatformWorld {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly sim = new PlatformSim()
  private readonly field = new THREE.Group()
  private readonly pads: THREE.Mesh[] = []
  private readonly stems: THREE.Mesh[] = []
  private readonly figures = new Map<string, THREE.Mesh>()
  private readonly aim = new THREE.Group()
  private readonly lamp: THREE.PointLight
  private readonly sharedMaterials: THREE.Material[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  private readonly ndc = new THREE.Vector2()
  private readonly toBall = new THREE.Vector3()
  private readonly closest = new THREE.Vector3()
  private readonly groundHit = new THREE.Vector3()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly desired = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly aimMaterial: THREE.MeshStandardMaterial
  private readonly stone: THREE.MeshStandardMaterial
  private readonly crack: THREE.MeshStandardMaterial
  private readonly voidMat: THREE.MeshStandardMaterial
  private currentId = ''
  private live = false
  private generation = 0
  private launchYaw = 0
  private orbitYaw = 0.7
  private orbitPitch = 0.62
  private orbitDist = 11
  private frame = 0
  private last = 0
  private acc = 0
  private sampleAt = 0
  private ballAt = 0
  private disposed = false
  private viewTarget: THREE.Vector3 | null = null

  constructor(
    canvas: HTMLCanvasElement,
    private readonly handlers: PlatformWorldHandlers,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setClearColor(0x0b0914)

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.12, 80)
    this.scene.fog = new THREE.FogExp2(0x0b0914, 0.045)
    this.scene.add(this.field)
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(48, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x120e1c, side: THREE.BackSide }),
    ))
    this.scene.add(starField())
    this.scene.add(new THREE.AmbientLight(0xc9c4d8, 0.42))
    this.scene.add(new THREE.HemisphereLight(0xffe2b0, 0x1a1430, 0.55))

    const key = new THREE.DirectionalLight(0xffe6c2, 2.2)
    key.position.set(-7, 14, -5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 40
    key.shadow.camera.left = -12
    key.shadow.camera.right = 12
    key.shadow.camera.top = 12
    key.shadow.camera.bottom = -12
    key.shadow.bias = -0.001
    this.scene.add(key, key.target)
    key.target.position.set(0, 0, 0)

    this.lamp = new THREE.PointLight(0xffc56b, 18, 14, 2)
    this.scene.add(this.lamp)

    const abyss = new THREE.Mesh(
      new THREE.CircleGeometry(18, 40),
      new THREE.MeshStandardMaterial({
        color: 0x05040a,
        roughness: 1,
        metalness: 0.1,
      }),
    )
    abyss.rotation.x = -Math.PI / 2
    abyss.position.y = -2.4
    this.scene.add(abyss)

    this.stone = new THREE.MeshStandardMaterial({
      color: 0x3a3550,
      roughness: 0.72,
      metalness: 0.12,
    })
    this.crack = new THREE.MeshStandardMaterial({
      color: 0xc45b3a,
      emissive: 0x8a2a12,
      emissiveIntensity: 0.7,
      roughness: 0.46,
    })
    this.voidMat = new THREE.MeshStandardMaterial({
      color: 0x161221,
      roughness: 1,
      transparent: true,
      opacity: 0.35,
    })
    this.sharedMaterials.push(this.stone, this.crack, this.voidMat)

    const padGeo = new THREE.BoxGeometry(PLATFORM_SIZE, PLATFORM_HEIGHT, PLATFORM_SIZE)
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.1, 8)
    for (let index = 0; index < PLATFORM_COUNT; index += 1) {
      const center = cellCenter(index)
      const pad = new THREE.Mesh(padGeo, this.stone)
      pad.castShadow = true
      pad.receiveShadow = true
      pad.position.set(center.x, 0, center.z)
      const stem = new THREE.Mesh(stemGeo, this.stone)
      stem.position.set(center.x, -1.2, center.z)
      stem.castShadow = true
      this.field.add(pad, stem)
      this.pads.push(pad)
      this.stems.push(stem)
    }

    this.aimMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0b429,
      emissive: 0x8a4e12,
      emissiveIntensity: 0.4,
      roughness: 0.32,
    })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), this.aimMaterial)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = 0.5
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 10), this.aimMaterial)
    head.rotation.x = Math.PI / 2
    head.position.z = 1.08
    this.aim.add(shaft, head)
    this.aim.visible = false
    this.scene.add(this.aim)
    this.sharedMaterials.push(this.aimMaterial)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
    this.last = performance.now()
    this.frame = requestAnimationFrame(now => this.loop(now))
  }

  sync(
    present: boolean[],
    marked: number[],
    figures: Record<string, Vec3>,
    living: string[],
    order: string[],
    turnId: string,
  ) {
    this.currentId = turnId
    for (let index = 0; index < PLATFORM_COUNT; index += 1) {
      const pad = this.pads[index]!
      const stem = this.stems[index]!
      const gone = !present[index]
      const hot = marked.includes(index)
      pad.visible = true
      stem.visible = !gone
      pad.material = gone ? this.voidMat : hot ? this.crack : this.stone
      pad.position.y = gone ? -0.08 : 0
      pad.scale.setScalar(gone ? 0.72 : 1)
    }

    const live = new Set(living)
    for (const [id, mesh] of this.figures) {
      if (!live.has(id)) {
        this.scene.remove(mesh)
        this.figures.delete(id)
      }
    }
    for (const id of living) {
      let mesh = this.figures.get(id)
      if (!mesh) {
        const color = new THREE.Color(figureColor(order, id))
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.12,
          roughness: 0.32,
          metalness: 0.18,
        })
        mesh = new THREE.Mesh(new THREE.SphereGeometry(FIGURE_RADIUS, 28, 20), mat)
        mesh.castShadow = true
        this.scene.add(mesh)
        this.figures.set(id, mesh)
        this.sharedMaterials.push(mat)
      }
      const pos = figures[id]
      if (pos && !this.live)
        mesh.position.set(pos.x, pos.y, pos.z)
    }

    if (!this.live)
      this.sim.load(present, figures, living)
  }

  place(id: string, position: Vec3) {
    this.generation += 1
    this.live = false
    this.viewTarget = null
    this.currentId = id
    this.sim.place(id, position)
    this.figures.get(id)?.position.set(position.x, position.y, position.z)
  }

  launch(id: string, yaw: number, power: number, from: Vec3) {
    this.generation += 1
    this.live = true
    this.currentId = id
    this.launchYaw = yaw
    this.orbitYaw = yaw
    this.viewTarget = null
    this.acc = 0
    this.sampleAt = 0
    this.sim.launch(id, yaw, power, from)
    this.figures.get(id)?.position.set(from.x, from.y, from.z)
  }

  showFigure(id: string, position: Vec3, snap = false) {
    this.currentId = id
    if (!this.viewTarget)
      this.viewTarget = new THREE.Vector3()
    this.viewTarget.set(position.x, position.y, position.z)
    const mesh = this.figures.get(id)
    if (!mesh)
      return
    if (snap || mesh.position.distanceTo(this.viewTarget) > 2.4)
      mesh.position.copy(this.viewTarget)
  }

  projectFigure() {
    const mesh = this.figures.get(this.currentId)
    if (!mesh)
      return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.groundHit.copy(mesh.position).project(this.camera)
    return {
      x: rect.left + (this.groundHit.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-this.groundHit.y * 0.5 + 0.5) * rect.height,
    }
  }

  readPointer(clientX: number, clientY: number) {
    const mesh = this.figures.get(this.currentId)
    if (!mesh)
      return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1)
      return null
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const ball = mesh.position
    this.toBall.copy(ball).sub(this.raycaster.ray.origin)
    const along = this.toBall.dot(this.raycaster.ray.direction)
    this.closest.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, along)
    const hitsFigure = along > 0 && this.closest.distanceTo(ball) < FIGURE_RADIUS * 2.8
    this.groundPlane.constant = -ball.y
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit))
      return { hitsFigure, x: ball.x, z: ball.z }
    return { hitsFigure, x: this.groundHit.x, z: this.groundHit.z }
  }

  orbitBy(dx: number, dy: number) {
    this.orbitYaw -= dx * 0.007
    this.orbitPitch = Math.min(1.15, Math.max(0.22, this.orbitPitch + dy * 0.005))
  }

  zoomBy(delta: number) {
    this.orbitDist = Math.min(18, Math.max(6.5, this.orbitDist + delta * 0.01))
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh)
        obj.geometry.dispose()
    })
    for (const material of this.sharedMaterials)
      material.dispose()
    this.renderer.dispose()
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
    this.frameCamera(dt)
    this.renderer.render(this.scene, this.camera)
    if (now - this.ballAt > 40) {
      this.ballAt = now
      const mesh = this.figures.get(this.currentId)
      if (mesh)
        this.handlers.onFigure({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z })
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
      this.applySample(sample)
      if (sample.resting) {
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

  private applySample(sample: SimSample) {
    for (const [id, pos] of Object.entries(sample.figures))
      this.figures.get(id)?.position.set(pos.x, pos.y, pos.z)
  }

  private followView(dt: number) {
    if (!this.viewTarget)
      return
    const mesh = this.figures.get(this.currentId)
    mesh?.position.lerp(this.viewTarget, 1 - Math.exp(-14 * dt))
  }

  private frameAim() {
    const mesh = this.figures.get(this.currentId)
    const aim = this.live ? null : this.handlers.aim()
    if (!aim || !mesh) {
      this.aim.visible = false
      return
    }
    this.aim.visible = true
    this.aim.position.copy(mesh.position)
    this.aim.rotation.y = aim.yaw
    this.aim.scale.set(1, 1, 0.42 + aim.power * 3.8)
    this.aimMaterial.emissiveIntensity = 0.22 + aim.power * 0.95
    if (!aim.holdCamera)
      this.orbitYaw = aim.yaw
  }

  private frameCamera(dt: number) {
    const mesh = this.figures.get(this.currentId)
    const target = mesh?.position ?? this.look.set(0, 0.4, 0)
    if (this.live)
      this.orbitYaw = this.launchYaw
    const pitch = this.orbitPitch
    const dist = this.orbitDist
    this.desired.set(
      target.x - Math.sin(this.orbitYaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z - Math.cos(this.orbitYaw) * Math.cos(pitch) * dist,
    )
    this.camera.position.lerp(this.desired, 1 - Math.exp(-3.2 * dt))
    this.camera.lookAt(target.x, target.y + 0.15, target.z)
    this.lamp.position.set(target.x, target.y + 1.5, target.z)
  }
}

function starField() {
  const count = 140
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = 16 + Math.random() * 18
    const theta = Math.random() * Math.PI * 2
    const lift = 0.2 + Math.random() * 0.7
    positions[i * 3] = Math.cos(theta) * radius
    positions[i * 3 + 1] = 6 + lift * 18
    positions[i * 3 + 2] = Math.sin(theta) * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xf6f1e4, size: 0.1, sizeAttenuation: true }),
  )
}
