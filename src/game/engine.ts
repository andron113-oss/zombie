import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { soundSystem } from './sounds';

// ============= TYPES =============
export interface GameState {
  squadCount: number;
  maxSquad: number;
  weapon: WeaponType;
  wave: number;
  score: number;
  health: number;
  maxHealth: number;
  shieldActive: boolean;
  shieldTimer: number;
  speedBoost: boolean;
  speedBoostTimer: number;
  gameOver: boolean;
  paused: boolean;
}

export enum WeaponType {
  PISTOL = 'pistol',
  RIFLE = 'rifle',
  SHOTGUN = 'shotgun',
  SNIPER = 'sniper',
  FLAMETHROWER = 'flamethrower',
}

export interface WeaponStats {
  damage: number;
  fireRate: number;
  range: number;
  spread: number;
  name: string;
  icon: string;
}

export const WEAPON_STATS: Record<WeaponType, WeaponStats> = {
  [WeaponType.PISTOL]: { damage: 10, fireRate: 0.4, range: 50, spread: 0.02, name: 'Пистолет', icon: '🔫' },
  [WeaponType.RIFLE]: { damage: 15, fireRate: 0.15, range: 60, spread: 0.03, name: 'Автомат', icon: '🔫' },
  [WeaponType.SHOTGUN]: { damage: 40, fireRate: 0.8, range: 20, spread: 0.1, name: 'Дробовик', icon: '💥' },
  [WeaponType.SNIPER]: { damage: 80, fireRate: 1.2, range: 100, spread: 0.005, name: 'Снайперская', icon: '🎯' },
  [WeaponType.FLAMETHROWER]: { damage: 25, fireRate: 0.05, range: 15, spread: 0.15, name: 'Огнемёт', icon: '🔥' },
};

// ============= GAME ENGINE =============
export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  // Game objects
  private squadMembers: THREE.Group[] = [];
  private zombies: ZombieData[] = [];
  private bonusBlocks: BonusBlockData[] = [];
  private bullets: BulletData[] = [];
  private particles: ParticleData[] = [];
  private bloodSplatters: THREE.Mesh[] = [];

  // Game state
  public state: GameState;
  private onStateChange: (state: GameState) => void;
  private lastFireTime = 0;
  private squadFireTimers: number[] = [];
  private waveTimer = 0;
  private zombiesInWave = 0;
  private zombiesSpawned = 0;
  private blockSpawnTimer = 0;
  private crosshairTarget = new THREE.Vector3(0, 2, -20);
  private crosshairMesh!: THREE.Mesh;
  private cameraShake = 0;
  private animationId: number | null = null;

  // Object pools
  private zombiePool: THREE.Group[] = [];
  private bulletPool: THREE.Mesh[] = [];

  // Environment
  private water!: THREE.Mesh;
  private waterTime = 0;
  private sunLight!: THREE.DirectionalLight;
  private composer!: EffectComposer;

  constructor(container: HTMLElement, onStateChange: (state: GameState) => void) {
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onStateChange = onStateChange;

    this.state = {
      squadCount: 5,
      maxSquad: 100,
      weapon: WeaponType.RIFLE,
      wave: 1,
      score: 0,
      health: 100,
      maxHealth: 100,
      shieldActive: false,
      shieldTimer: 0,
      speedBoost: false,
      speedBoostTimer: 0,
      gameOver: false,
      paused: false,
    };

    this.initRenderer(container);
    this.initScene();
    this.initPostProcessing(container); // Must be AFTER initScene (needs scene & camera)
    this.initEnvironment();
    this.initLighting();
    this.initSquad();
    this.initCrosshair();
    this.initEventListeners(container);
    this.startWave();
    this.animate();
  }

  private initRenderer(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.8;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => {
      if (!this.camera || !this.renderer || !this.composer) return;
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.composer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  private initPostProcessing(container: HTMLElement) {
    // Post-processing - must be called AFTER initScene (scene & camera must exist)
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.8, // strength
      0.5, // radius
      0.7 // threshold
    );
    this.composer.addPass(bloomPass);

    // Vignette + color grading shader
    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 0.6 },
        offset: { value: 1.2 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
          texel.rgb *= 1.0 - dot(uv, uv) * darkness;
          // Color grading - slight blue tint in shadows, warm highlights
          texel.rgb = pow(texel.rgb, vec3(0.95, 1.0, 1.05));
          gl_FragColor = texel;
        }
      `,
    };
    const vignettePass = new ShaderPass(vignetteShader);
    this.composer.addPass(vignettePass);
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x667788, 0.008);

    // Sky gradient - sunset/dawn atmosphere
    const skyGeo = new THREE.SphereGeometry(200, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4477aa) },
        bottomColor: { value: new THREE.Color(0xffaa66) },
        offset: { value: 20 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, -15);
  }

  private initEnvironment() {
    // Road
    const roadGeo = new THREE.PlaneGeometry(12, 120);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.75,
      metalness: 0.05,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -40);
    road.receiveShadow = true;
    this.scene.add(road);

    // Road markings
    for (let i = 0; i < 30; i++) {
      const markGeo = new THREE.PlaneGeometry(0.2, 2);
      const markMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0x444400 });
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.01, -i * 4 + 10);
      this.scene.add(mark);
    }

    // Road edges / barriers
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 20; i++) {
        const barrierGeo = new THREE.BoxGeometry(0.3, 0.8, 3);
        const barrierMat = new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.6,
          metalness: 0.3,
        });
        const barrier = new THREE.Mesh(barrierGeo, barrierMat);
        barrier.position.set(side * 6.2, 0.4, -i * 6 + 10);
        barrier.castShadow = true;
        barrier.receiveShadow = true;
        this.scene.add(barrier);
      }
    }

    // Water on both sides
    const waterGeo = new THREE.PlaneGeometry(40, 120, 64, 64);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x1a5a8a) },
        foamColor: { value: new THREE.Color(0x3a8aba) },
      },
      vertexShader: `
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave = sin(pos.x * 2.0 + time * 2.0) * 0.15 + 
                       cos(pos.y * 1.5 + time * 1.5) * 0.1;
          pos.z += wave;
          vWave = wave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 foamColor;
        uniform float time;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          float foam = smoothstep(0.1, 0.15, vWave);
          vec3 color = mix(waterColor, foamColor, foam * 0.5);
          float spec = pow(max(0.0, sin(vUv.x * 20.0 + time) * sin(vUv.y * 15.0 + time * 0.7)), 8.0);
          color += vec3(spec * 0.3);
          gl_FragColor = vec4(color, 0.9);
        }
      `,
      transparent: true,
    });

    // Left water
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(-26, -0.5, -40);
    this.scene.add(this.water);

    // Right water
    const water2 = new THREE.Mesh(waterGeo.clone(), waterMat.clone());
    water2.rotation.x = -Math.PI / 2;
    water2.position.set(26, -0.5, -40);
    this.scene.add(water2);

    // Street lights
    for (let i = 0; i < 8; i++) {
      for (let side = -1; side <= 1; side += 2) {
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 5);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(side * 7, 2.5, -i * 15 + 5);
        pole.castShadow = true;
        this.scene.add(pole);

        const lightGeo = new THREE.SphereGeometry(0.2);
        const lightMat = new THREE.MeshStandardMaterial({
          color: 0xffaa44,
          emissive: 0xffaa44,
          emissiveIntensity: 2,
        });
        const lightMesh = new THREE.Mesh(lightGeo, lightMat);
        lightMesh.position.set(side * 7, 5, -i * 15 + 5);
        this.scene.add(lightMesh);

        const pointLight = new THREE.PointLight(0xffaa44, 3, 15);
        pointLight.position.copy(lightMesh.position);
        this.scene.add(pointLight);
      }
    }

    // Ground plane (far)
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Decorations - barrels, crates, debris
    this.addDecorations();

    // Smoke/atmosphere particles
    this.addAtmosphereParticles();
  }

  private addDecorations() {
    // Barrels along the road
    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.8, 12);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.8, metalness: 0.2 });
    
    for (let i = 0; i < 6; i++) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      const side = i % 2 === 0 ? -1 : 1;
      barrel.position.set(side * (5 + Math.random()), 0.4, -i * 12 - 5 + Math.random() * 3);
      barrel.rotation.z = Math.random() * 0.3 - 0.15;
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.scene.add(barrel);
    }

    // Crates
    const crateGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 });
    
    for (let i = 0; i < 4; i++) {
      const crate = new THREE.Mesh(crateGeo, crateMat);
      const side = i % 2 === 0 ? -1 : 1;
      crate.position.set(side * (4.5 + Math.random() * 0.5), 0.35, -i * 15 - 8);
      crate.rotation.y = Math.random() * Math.PI;
      crate.castShadow = true;
      crate.receiveShadow = true;
      this.scene.add(crate);
    }

    // Sandbag barriers near squad
    const sandbagGeo = new THREE.BoxGeometry(1.2, 0.4, 0.5);
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
    
    for (let i = 0; i < 5; i++) {
      const sandbag = new THREE.Mesh(sandbagGeo, sandbagMat);
      sandbag.position.set(-3 + i * 1.5, 0.2, 3);
      sandbag.castShadow = true;
      sandbag.receiveShadow = true;
      this.scene.add(sandbag);
    }
    // Second row
    for (let i = 0; i < 4; i++) {
      const sandbag = new THREE.Mesh(sandbagGeo, sandbagMat);
      sandbag.position.set(-2.25 + i * 1.5, 0.6, 2.7);
      sandbag.castShadow = true;
      sandbag.receiveShadow = true;
      this.scene.add(sandbag);
    }

    // Destroyed vehicles in distance
    const vehicleBody = new THREE.BoxGeometry(2, 1, 4);
    const vehicleMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7, metalness: 0.5 });
    
    const car1 = new THREE.Mesh(vehicleBody, vehicleMat);
    car1.position.set(-3, 0.5, -35);
    car1.rotation.y = 0.3;
    car1.castShadow = true;
    this.scene.add(car1);

    const car2 = new THREE.Mesh(vehicleBody, vehicleMat.clone());
    (car2.material as THREE.MeshStandardMaterial).color.setHex(0x442222);
    car2.position.set(2, 0.5, -50);
    car2.rotation.y = -0.5;
    car2.rotation.z = 0.1;
    car2.castShadow = true;
    this.scene.add(car2);

    // Fire on destroyed car
    const fireLight = new THREE.PointLight(0xff4400, 2, 8);
    fireLight.position.set(2, 1.5, -50);
    this.scene.add(fireLight);
  }

  private addAtmosphereParticles() {
    // Floating dust/ash particles
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = Math.random() * -60;
      sizes[i] = Math.random() * 0.1 + 0.02;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const particleMat = new THREE.PointsMaterial({
      color: 0x888888,
      size: 0.08,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(particles);

    // Volumetric light beams (fake god rays)
    for (let i = 0; i < 3; i++) {
      const beamGeo = new THREE.CylinderGeometry(0.1, 2, 15, 8, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x4466aa,
        transparent: true,
        opacity: 0.03,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(-5 + i * 5, 7, -20 - i * 10);
      beam.rotation.z = 0.3 - i * 0.2;
      beam.rotation.x = 0.2;
      this.scene.add(beam);
    }

    // Smoke columns from destroyed vehicles
    const smokePositions = [
      new THREE.Vector3(2, 0, -50),
      new THREE.Vector3(-3, 0, -35),
    ];
    smokePositions.forEach(pos => {
      const smokeCount = 30;
      const smokePos = new Float32Array(smokeCount * 3);
      for (let i = 0; i < smokeCount; i++) {
        smokePos[i * 3] = pos.x + (Math.random() - 0.5) * 0.5;
        smokePos[i * 3 + 1] = pos.y + Math.random() * 5 + 1;
        smokePos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.5;
      }
      const smokeGeo = new THREE.BufferGeometry();
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      const smokeMat = new THREE.PointsMaterial({
        color: 0x333333,
        size: 0.4,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const smoke = new THREE.Points(smokeGeo, smokeMat);
      this.scene.add(smoke);
    });
  }

  private initLighting() {
    // Ambient - much brighter
    const ambient = new THREE.AmbientLight(0x8899bb, 1.2);
    this.scene.add(ambient);

    // Hemisphere - bright sky
    const hemi = new THREE.HemisphereLight(0x99bbff, 0x445566, 1.5);
    this.scene.add(hemi);

    // Main sun - warm directional light
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
    this.sunLight.position.set(-15, 30, 10);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 100;
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight);

    // Fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x88aaff, 1.0);
    fillLight.position.set(10, 15, 5);
    this.scene.add(fillLight);

    // Rim light - dramatic back light
    const rimLight = new THREE.DirectionalLight(0xff6644, 1.2);
    rimLight.position.set(5, 10, -20);
    this.scene.add(rimLight);

    // Ground bounce light
    const bounceLight = new THREE.DirectionalLight(0x667788, 0.5);
    bounceLight.position.set(0, -5, 0);
    this.scene.add(bounceLight);
  }

  private createCharacterModel(isZombie: boolean, zombieType: string = 'normal'): THREE.Group {
    const group = new THREE.Group();

    if (isZombie) {
      this.createDetailedZombie(group, zombieType);
    } else {
      this.createDetailedSoldier(group);
    }

    return group;
  }

  private createDetailedZombie(group: THREE.Group, zombieType: string) {
    const configs: Record<string, { body: number; skin: number; scale: number; pants: number }> = {
      normal: { body: 0x3d5a2d, skin: 0x5a7b4a, scale: 1, pants: 0x2a3a1a },
      fast: { body: 0x5a3d2d, skin: 0x7b5a4a, scale: 0.85, pants: 0x3a2a1a },
      tank: { body: 0x2d3d5a, skin: 0x4a5a7b, scale: 1.4, pants: 0x1a2a3a },
      armored: { body: 0x5a5a5a, skin: 0x7b7b7b, scale: 1.2, pants: 0x3a3a3a },
      exploder: { body: 0x5a2d2d, skin: 0x7b4a4a, scale: 1.1, pants: 0x3a1a1a },
    };
    const cfg = configs[zombieType] || configs.normal;
    const s = cfg.scale;

    // Torso - upper body with torn shirt
    const torsoGeo = new THREE.BoxGeometry(0.6 * s, 0.7 * s, 0.35 * s, 2, 2, 2);
    const torsoMat = new THREE.MeshStandardMaterial({ color: cfg.body, roughness: 0.95 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.3 * s;
    torso.castShadow = true;
    group.add(torso);

    // Lower torso / hips
    const hipsGeo = new THREE.BoxGeometry(0.5 * s, 0.3 * s, 0.3 * s);
    const hipsMat = new THREE.MeshStandardMaterial({ color: cfg.pants, roughness: 0.9 });
    const hips = new THREE.Mesh(hipsGeo, hipsMat);
    hips.position.y = 0.85 * s;
    hips.castShadow = true;
    group.add(hips);

    // Head - slightly deformed sphere
    const headGeo = new THREE.SphereGeometry(0.22 * s, 16, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.85 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.85 * s;
    head.scale.set(1, 1.1, 0.95);
    head.castShadow = true;
    group.add(head);

    // Jaw / lower face
    const jawGeo = new THREE.SphereGeometry(0.15 * s, 10, 8);
    const jaw = new THREE.Mesh(jawGeo, headMat);
    jaw.position.set(0, 1.72 * s, -0.08 * s);
    jaw.scale.set(1, 0.7, 0.8);
    group.add(jaw);

    // Eyes - glowing red
    const eyeGeo = new THREE.SphereGeometry(0.04 * s, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff2200,
      emissiveIntensity: 4,
    });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08 * s, 1.88 * s, -0.18 * s);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08 * s, 1.88 * s, -0.18 * s);
    group.add(eyeR);

    // Mouth - open with teeth
    const mouthGeo = new THREE.BoxGeometry(0.12 * s, 0.04 * s, 0.05 * s);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x220000 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 1.75 * s, -0.2 * s);
    group.add(mouth);

    // Teeth
    for (let i = 0; i < 4; i++) {
      const toothGeo = new THREE.BoxGeometry(0.015 * s, 0.02 * s, 0.01 * s);
      const toothMat = new THREE.MeshStandardMaterial({ color: 0xccccaa });
      const tooth = new THREE.Mesh(toothGeo, toothMat);
      tooth.position.set((i - 1.5) * 0.025 * s, 1.74 * s, -0.21 * s);
      group.add(tooth);
    }

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08 * s, 0.1 * s, 0.15 * s, 8);
    const neck = new THREE.Mesh(neckGeo, headMat);
    neck.position.y = 1.65 * s;
    group.add(neck);

    // Upper arms
    const upperArmGeo = new THREE.CylinderGeometry(0.08 * s, 0.07 * s, 0.35 * s, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.85 });
    
    const upperArmL = new THREE.Mesh(upperArmGeo, armMat);
    upperArmL.position.set(-0.38 * s, 1.35 * s, -0.1 * s);
    upperArmL.rotation.z = 0.3;
    upperArmL.rotation.x = -0.8;
    upperArmL.castShadow = true;
    group.add(upperArmL);

    const upperArmR = new THREE.Mesh(upperArmGeo, armMat);
    upperArmR.position.set(0.38 * s, 1.35 * s, -0.1 * s);
    upperArmR.rotation.z = -0.3;
    upperArmR.rotation.x = -0.8;
    upperArmR.castShadow = true;
    group.add(upperArmR);

    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.3 * s, 8);
    const forearmL = new THREE.Mesh(forearmGeo, armMat);
    forearmL.position.set(-0.45 * s, 1.1 * s, -0.35 * s);
    forearmL.rotation.x = -0.5;
    forearmL.castShadow = true;
    group.add(forearmL);

    const forearmR = new THREE.Mesh(forearmGeo, armMat);
    forearmR.position.set(0.45 * s, 1.1 * s, -0.35 * s);
    forearmR.rotation.x = -0.5;
    forearmR.castShadow = true;
    group.add(forearmR);

    // Hands - claws
    const handGeo = new THREE.SphereGeometry(0.06 * s, 8, 6);
    const handMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.9 });
    const handL = new THREE.Mesh(handGeo, handMat);
    handL.position.set(-0.45 * s, 0.95 * s, -0.5 * s);
    handL.scale.set(1, 0.7, 1.3);
    group.add(handL);
    const handR = new THREE.Mesh(handGeo, handMat);
    handR.position.set(0.45 * s, 0.95 * s, -0.5 * s);
    handR.scale.set(1, 0.7, 1.3);
    group.add(handR);

    // Fingers/claws
    for (let i = 0; i < 3; i++) {
      const clawGeo = new THREE.ConeGeometry(0.015 * s, 0.06 * s, 4);
      const clawMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const clawL = new THREE.Mesh(clawGeo, clawMat);
      clawL.position.set(-0.45 * s + (i - 1) * 0.02 * s, 0.92 * s, -0.55 * s);
      clawL.rotation.x = Math.PI;
      group.add(clawL);
      const clawR = new THREE.Mesh(clawGeo, clawMat);
      clawR.position.set(0.45 * s + (i - 1) * 0.02 * s, 0.92 * s, -0.55 * s);
      clawR.rotation.x = Math.PI;
      group.add(clawR);
    }

    // Upper legs
    const upperLegGeo = new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.4 * s, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: cfg.pants, roughness: 0.9 });
    
    const upperLegL = new THREE.Mesh(upperLegGeo, legMat);
    upperLegL.position.set(-0.15 * s, 0.55 * s, 0);
    upperLegL.castShadow = true;
    group.add(upperLegL);

    const upperLegR = new THREE.Mesh(upperLegGeo, legMat);
    upperLegR.position.set(0.15 * s, 0.55 * s, 0);
    upperLegR.castShadow = true;
    group.add(upperLegR);

    // Lower legs
    const lowerLegGeo = new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.35 * s, 8);
    const lowerLegL = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLegL.position.set(-0.15 * s, 0.2 * s, 0.05 * s);
    lowerLegL.rotation.x = 0.1;
    lowerLegL.castShadow = true;
    group.add(lowerLegL);

    const lowerLegR = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLegR.position.set(0.15 * s, 0.2 * s, 0.05 * s);
    lowerLegR.rotation.x = 0.1;
    lowerLegR.castShadow = true;
    group.add(lowerLegR);

    // Feet
    const footGeo = new THREE.BoxGeometry(0.1 * s, 0.06 * s, 0.18 * s);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const footL = new THREE.Mesh(footGeo, footMat);
    footL.position.set(-0.15 * s, 0.03 * s, -0.02 * s);
    footL.castShadow = true;
    group.add(footL);
    const footR = new THREE.Mesh(footGeo, footMat);
    footR.position.set(0.15 * s, 0.03 * s, -0.02 * s);
    footR.castShadow = true;
    group.add(footR);

    // Wounds / blood patches
    const woundGeo = new THREE.CircleGeometry(0.05 * s, 8);
    const woundMat = new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const wound = new THREE.Mesh(woundGeo, woundMat);
      wound.position.set(
        (Math.random() - 0.5) * 0.4 * s,
        1.0 * s + Math.random() * 0.5 * s,
        -0.18 * s
      );
      wound.rotation.y = Math.random() * Math.PI;
      group.add(wound);
    }

    // Type-specific details
    if (zombieType === 'tank') {
      // Extra muscle mass
      const muscleGeo = new THREE.SphereGeometry(0.2 * s, 10, 8);
      const muscleMat = new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.85 });
      const shoulderL = new THREE.Mesh(muscleGeo, muscleMat);
      shoulderL.position.set(-0.35 * s, 1.5 * s, 0);
      shoulderL.scale.set(1.2, 0.8, 1);
      group.add(shoulderL);
      const shoulderR = new THREE.Mesh(muscleGeo, muscleMat);
      shoulderR.position.set(0.35 * s, 1.5 * s, 0);
      shoulderR.scale.set(1.2, 0.8, 1);
      group.add(shoulderR);
    }

    if (zombieType === 'armored') {
      // Metal plates
      const plateMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.3 });
      
      const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.5 * s, 0.08 * s), plateMat);
      chestPlate.position.set(0, 1.3 * s, -0.2 * s);
      chestPlate.castShadow = true;
      group.add(chestPlate);

      // Shoulder pads
      const shoulderGeo = new THREE.BoxGeometry(0.2 * s, 0.15 * s, 0.2 * s);
      const shoulderL = new THREE.Mesh(shoulderGeo, plateMat);
      shoulderL.position.set(-0.35 * s, 1.55 * s, 0);
      shoulderL.castShadow = true;
      group.add(shoulderL);
      const shoulderR = new THREE.Mesh(shoulderGeo, plateMat);
      shoulderR.position.set(0.35 * s, 1.55 * s, 0);
      shoulderR.castShadow = true;
      group.add(shoulderR);

      // Helmet
      const helmetGeo = new THREE.SphereGeometry(0.25 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const helmet = new THREE.Mesh(helmetGeo, plateMat);
      helmet.position.y = 1.9 * s;
      helmet.castShadow = true;
      group.add(helmet);
    }

    if (zombieType === 'exploder') {
      // Glowing belly
      const bellyGeo = new THREE.SphereGeometry(0.25 * s, 12, 10);
      const bellyMat = new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff4400,
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.7,
      });
      const belly = new THREE.Mesh(bellyGeo, bellyMat);
      belly.position.set(0, 1.1 * s, -0.15 * s);
      belly.scale.set(1.2, 1, 0.8);
      group.add(belly);

      // Pulsing light
      const glowLight = new THREE.PointLight(0xff4400, 2, 3);
      glowLight.position.set(0, 1.1 * s, -0.2 * s);
      group.add(glowLight);
    }

    if (zombieType === 'fast') {
      // Leaner pose - arms more forward
      group.children.forEach(child => {
        if (child.position.z < -0.3) {
          child.position.z -= 0.1;
        }
      });
    }
  }

  private createDetailedSoldier(group: THREE.Group) {
    // Torso - tactical uniform
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.6, 0.3, 2, 2, 2);
    const uniformMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2d, roughness: 0.75 });
    const torso = new THREE.Mesh(torsoGeo, uniformMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    // Tactical vest
    const vestGeo = new THREE.BoxGeometry(0.48, 0.45, 0.35);
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x2d3a1d, roughness: 0.8 });
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.set(0, 1.2, 0);
    vest.castShadow = true;
    group.add(vest);

    // Vest pouches
    const pouchMat = new THREE.MeshStandardMaterial({ color: 0x1d2a0d, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
      const pouchGeo = new THREE.BoxGeometry(0.08, 0.1, 0.06);
      const pouch = new THREE.Mesh(pouchGeo, pouchMat);
      pouch.position.set(-0.12 + i * 0.12, 1.05, -0.18);
      group.add(pouch);
    }

    // Belt
    const beltGeo = new THREE.BoxGeometry(0.52, 0.06, 0.32);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.88;
    group.add(belt);

    // Belt buckle
    const buckleGeo = new THREE.BoxGeometry(0.06, 0.05, 0.02);
    const buckleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
    const buckle = new THREE.Mesh(buckleGeo, buckleMat);
    buckle.position.set(0, 0.88, -0.17);
    group.add(buckle);

    // Hips / pants
    const hipsGeo = new THREE.BoxGeometry(0.45, 0.25, 0.28);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2d3a1d, roughness: 0.85 });
    const hips = new THREE.Mesh(hipsGeo, pantsMat);
    hips.position.y = 0.75;
    hips.castShadow = true;
    group.add(hips);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.07, 0.09, 0.12, 8);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.7 });
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 1.52;
    group.add(neck);

    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 16, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.72;
    head.scale.set(1, 1.05, 0.95);
    head.castShadow = true;
    group.add(head);

    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.21, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2d3a1d, roughness: 0.6, metalness: 0.3 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.78;
    helmet.castShadow = true;
    group.add(helmet);

    // Helmet strap
    const strapGeo = new THREE.TorusGeometry(0.15, 0.01, 4, 12, Math.PI);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const strap = new THREE.Mesh(strapGeo, strapMat);
    strap.position.set(0, 1.68, -0.05);
    strap.rotation.x = Math.PI / 2;
    group.add(strap);

    // Goggles on helmet
    const goggleGeo = new THREE.TorusGeometry(0.04, 0.015, 6, 8);
    const goggleMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 });
    const goggleL = new THREE.Mesh(goggleGeo, goggleMat);
    goggleL.position.set(-0.06, 1.85, -0.15);
    goggleL.rotation.x = Math.PI / 2;
    group.add(goggleL);
    const goggleR = new THREE.Mesh(goggleGeo, goggleMat);
    goggleR.position.set(0.06, 1.85, -0.15);
    goggleR.rotation.x = Math.PI / 2;
    group.add(goggleR);

    // Goggle lenses
    const lensGeo = new THREE.CircleGeometry(0.035, 8);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x446688, metalness: 0.8, roughness: 0.1 });
    const lensL = new THREE.Mesh(lensGeo, lensMat);
    lensL.position.set(-0.06, 1.85, -0.16);
    group.add(lensL);
    const lensR = new THREE.Mesh(lensGeo, lensMat);
    lensR.position.set(0.06, 1.85, -0.16);
    group.add(lensR);

    // Upper arms
    const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.3, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x3d4a2d, roughness: 0.75 });
    
    const upperArmL = new THREE.Mesh(upperArmGeo, armMat);
    upperArmL.position.set(-0.32, 1.25, -0.1);
    upperArmL.rotation.z = 0.2;
    upperArmL.rotation.x = -1.0;
    upperArmL.castShadow = true;
    group.add(upperArmL);

    const upperArmR = new THREE.Mesh(upperArmGeo, armMat);
    upperArmR.position.set(0.32, 1.25, -0.1);
    upperArmR.rotation.z = -0.2;
    upperArmR.rotation.x = -1.0;
    upperArmR.castShadow = true;
    group.add(upperArmR);

    // Forearms
    const forearmGeo = new THREE.CylinderGeometry(0.055, 0.05, 0.28, 8);
    const forearmL = new THREE.Mesh(forearmGeo, armMat);
    forearmL.position.set(-0.35, 1.05, -0.35);
    forearmL.rotation.x = -0.3;
    forearmL.castShadow = true;
    group.add(forearmL);

    const forearmR = new THREE.Mesh(forearmGeo, armMat);
    forearmR.position.set(0.2, 1.05, -0.35);
    forearmR.rotation.x = -0.3;
    forearmR.castShadow = true;
    group.add(forearmR);

    // Gloves
    const gloveGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const gloveL = new THREE.Mesh(gloveGeo, gloveMat);
    gloveL.position.set(-0.35, 0.9, -0.45);
    gloveL.scale.set(1, 0.8, 1.2);
    group.add(gloveL);
    const gloveR = new THREE.Mesh(gloveGeo, gloveMat);
    gloveR.position.set(0.2, 0.9, -0.45);
    gloveR.scale.set(1, 0.8, 1.2);
    group.add(gloveR);

    // Upper legs
    const upperLegGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.35, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2d3a1d, roughness: 0.85 });
    
    const upperLegL = new THREE.Mesh(upperLegGeo, legMat);
    upperLegL.position.set(-0.13, 0.48, 0);
    upperLegL.castShadow = true;
    group.add(upperLegL);

    const upperLegR = new THREE.Mesh(upperLegGeo, legMat);
    upperLegR.position.set(0.13, 0.48, 0);
    upperLegR.castShadow = true;
    group.add(upperLegR);

    // Knee pads
    const kneeGeo = new THREE.SphereGeometry(0.06, 8, 6);
    const kneeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const kneeL = new THREE.Mesh(kneeGeo, kneeMat);
    kneeL.position.set(-0.13, 0.32, -0.08);
    kneeL.scale.set(1, 0.8, 0.8);
    group.add(kneeL);
    const kneeR = new THREE.Mesh(kneeGeo, kneeMat);
    kneeR.position.set(0.13, 0.32, -0.08);
    kneeR.scale.set(1, 0.8, 0.8);
    group.add(kneeR);

    // Lower legs
    const lowerLegGeo = new THREE.CylinderGeometry(0.065, 0.06, 0.3, 8);
    const lowerLegL = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLegL.position.set(-0.13, 0.18, 0.02);
    lowerLegL.castShadow = true;
    group.add(lowerLegL);

    const lowerLegR = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLegR.position.set(0.13, 0.18, 0.02);
    lowerLegR.castShadow = true;
    group.add(lowerLegR);

    // Boots
    const bootGeo = new THREE.BoxGeometry(0.1, 0.08, 0.18);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a0a, roughness: 0.8 });
    const bootL = new THREE.Mesh(bootGeo, bootMat);
    bootL.position.set(-0.13, 0.04, -0.02);
    bootL.castShadow = true;
    group.add(bootL);
    const bootR = new THREE.Mesh(bootGeo, bootMat);
    bootR.position.set(0.13, 0.04, -0.02);
    bootR.castShadow = true;
    group.add(bootR);

    // Weapon - detailed assault rifle
    this.createWeapon(group);

    // Backpack
    const backpackGeo = new THREE.BoxGeometry(0.3, 0.35, 0.15);
    const backpackMat = new THREE.MeshStandardMaterial({ color: 0x2d3a1d, roughness: 0.85 });
    const backpack = new THREE.Mesh(backpackGeo, backpackMat);
    backpack.position.set(0, 1.2, 0.2);
    backpack.castShadow = true;
    group.add(backpack);

    // Backpack straps
    const strapGeo2 = new THREE.BoxGeometry(0.04, 0.3, 0.02);
    const strapL = new THREE.Mesh(strapGeo2, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    strapL.position.set(-0.1, 1.25, 0.1);
    group.add(strapL);
    const strapR = new THREE.Mesh(strapGeo2, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    strapR.position.set(0.1, 1.25, 0.1);
    group.add(strapR);
  }

  private createWeapon(group: THREE.Group) {
    const gunGroup = new THREE.Group();
    gunGroup.position.set(0.15, 1.0, -0.4);
    gunGroup.rotation.y = 0;

    // Receiver / body
    const receiverGeo = new THREE.BoxGeometry(0.05, 0.06, 0.35);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.3 });
    const receiver = new THREE.Mesh(receiverGeo, metalMat);
    gunGroup.add(receiver);

    // Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.28;
    gunGroup.add(barrel);

    // Barrel shroud
    const shroudGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 8);
    const shroud = new THREE.Mesh(shroudGeo, metalMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.z = -0.22;
    gunGroup.add(shroud);

    // Magazine
    const magGeo = new THREE.BoxGeometry(0.03, 0.12, 0.04);
    const magMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 });
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0, -0.08, 0.05);
    mag.rotation.x = 0.1;
    gunGroup.add(mag);

    // Stock
    const stockGeo = new THREE.BoxGeometry(0.04, 0.05, 0.15);
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.z = 0.22;
    gunGroup.add(stock);

    // Grip
    const gripGeo = new THREE.BoxGeometry(0.03, 0.08, 0.03);
    const grip = new THREE.Mesh(gripGeo, stockMat);
    grip.position.set(0, -0.06, 0.12);
    grip.rotation.x = -0.2;
    gunGroup.add(grip);

    // Sight / rail
    const railGeo = new THREE.BoxGeometry(0.02, 0.015, 0.12);
    const rail = new THREE.Mesh(railGeo, metalMat);
    rail.position.set(0, 0.04, -0.05);
    gunGroup.add(rail);

    // Red dot sight
    const sightGeo = new THREE.BoxGeometry(0.025, 0.03, 0.04);
    const sightMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
    const sight = new THREE.Mesh(sightGeo, sightMat);
    sight.position.set(0, 0.06, -0.05);
    gunGroup.add(sight);

    // Red dot lens
    const lensGeo = new THREE.CircleGeometry(0.008, 8);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 0.06, -0.07);
    gunGroup.add(lens);

    // Foregrip
    const foregripGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.05, 6);
    const foregrip = new THREE.Mesh(foregripGeo, stockMat);
    foregrip.position.set(0, -0.05, -0.15);
    gunGroup.add(foregrip);

    group.add(gunGroup);
  }

  private initSquad() {
    this.updateSquadVisuals();
  }

  private updateSquadVisuals() {
    // Remove old squad
    this.squadMembers.forEach(m => this.scene.remove(m));
    this.squadMembers = [];
    this.squadFireTimers = [];

    const count = Math.min(this.state.squadCount, 20); // Visual limit
    const rows = Math.ceil(count / 5);

    for (let i = 0; i < count; i++) {
      const soldier = this.createCharacterModel(false);
      const row = Math.floor(i / 5);
      const col = i % 5;
      const spacing = 1.5;
      const xOffset = (col - Math.min(count - row * 5, 4) / 2) * spacing;
      soldier.position.set(xOffset, 0, 5 + row * 1.5);
      soldier.rotation.y = Math.PI;
      this.scene.add(soldier);
      this.squadMembers.push(soldier);
      this.squadFireTimers.push(Math.random() * 0.5);
    }
  }

  private initCrosshair() {
    const crossGeo = new THREE.RingGeometry(0.3, 0.35, 16);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    this.crosshairMesh = new THREE.Mesh(crossGeo, crossMat);
    this.crosshairMesh.rotation.x = -Math.PI / 2;
    this.crosshairMesh.position.set(0, 0.1, -15);
    this.scene.add(this.crosshairMesh);

    // Crosshair dot
    const dotGeo = new THREE.CircleGeometry(0.05, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.y = 0.01;
    this.crosshairMesh.add(dot);
  }

  private initEventListeners(container: HTMLElement) {
    const handleInteraction = (clientX: number, clientY: number) => {
      if (this.state.gameOver) return;
      soundSystem.init();
      const rect = container.getBoundingClientRect();
      this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Check bonus blocks
      const blockMeshes = this.bonusBlocks.map(b => b.mesh);
      const blockHits = this.raycaster.intersectObjects(blockMeshes, true);
      if (blockHits.length > 0) {
        const hitObj = blockHits[0].object;
        const hitBlock = this.bonusBlocks.find(b => {
          let obj: THREE.Object3D | null = hitObj;
          while (obj) {
            if (obj === b.mesh) return true;
            obj = obj.parent;
          }
          return false;
        });
        if (hitBlock) {
          this.collectBonus(hitBlock);
          return;
        }
      }

      // Check zombies
      const zombieMeshes = this.zombies.map(z => z.mesh);
      const zombieHits = this.raycaster.intersectObjects(zombieMeshes, true);
      if (zombieHits.length > 0) {
        const hitObj = zombieHits[0].object;
        const hitZombie = this.zombies.find(z => {
          let obj: THREE.Object3D | null = hitObj;
          while (obj) {
            if (obj === z.mesh) return true;
            obj = obj.parent;
          }
          return false;
        });
        if (hitZombie) {
          this.playerShoot(hitZombie);
          return;
        }
      }

      // Shoot at ground position
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(groundPlane, intersection);
      if (intersection) {
        this.crosshairTarget.copy(intersection);
        this.crosshairTarget.y = 0.1;
        this.playerShoot(null);
      }
    };

    container.addEventListener('click', (e) => handleInteraction(e.clientX, e.clientY));
    container.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleInteraction(touch.clientX, touch.clientY);
    });

    container.addEventListener('mousemove', (e) => {
      if (!this.camera || !this.raycaster) return; // Safety
      const rect = container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      try {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(groundPlane, intersection);
        if (intersection && !isNaN(intersection.x)) {
          this.crosshairTarget.lerp(intersection, 0.3);
          this.crosshairTarget.y = 0.1;
        }
      } catch (_e) { /* ignore raycast errors */ }
    });
  }

  private playerShoot(targetZombie: ZombieData | null) {
    const now = this.clock.getElapsedTime();
    const stats = WEAPON_STATS[this.state.weapon];
    const fireRate = this.state.speedBoost ? stats.fireRate * 0.5 : stats.fireRate;

    if (now - this.lastFireTime < fireRate) return;
    this.lastFireTime = now;

    // Validate target still exists
    if (targetZombie && (!targetZombie.mesh || !targetZombie.mesh.parent)) {
      targetZombie = null;
    }

    // Camera shake
    this.cameraShake = 0.1;

    // Sound
    if (this.state.weapon === WeaponType.SHOTGUN) soundSystem.shootShotgun();
    else if (this.state.weapon === WeaponType.SNIPER) soundSystem.shootSniper();
    else soundSystem.shoot();

    // Create bullet
    this.createBullet(
      new THREE.Vector3(0, 1.2, 8),
      targetZombie ? targetZombie.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)) : this.crosshairTarget.clone(),
      stats.damage,
      true
    );

    // Muzzle flash
    this.createMuzzleFlash(new THREE.Vector3(0, 1.2, 7.5));

    if (targetZombie) {
      this.damageZombie(targetZombie, stats.damage);
    }
  }

  private createBullet(from: THREE.Vector3, to: THREE.Vector3, damage: number, isPlayer: boolean) {
    if (!from || !to || isNaN(from.x) || isNaN(to.x)) return; // Safety check
    const direction = to.clone().sub(from).normalize();
    const distance = from.distanceTo(to);
    if (distance < 0.01 || isNaN(distance)) return; // Invalid direction

    const bulletGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const bulletMat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0xffff00 : 0xff4444,
    });
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.copy(from);
    this.scene.add(bullet);

    // Trail
    const trailGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4);
    const trailMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0xffaa00 : 0xff2222, transparent: true, opacity: 0.6 });
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.position.copy(from);
    this.scene.add(trail);

    this.bullets.push({
      mesh: bullet,
      trail,
      direction,
      speed: 80,
      distance: 0,
      maxDistance: distance,
      damage,
      isPlayer,
    });
  }

  private createMuzzleFlash(position: THREE.Vector3) {
    if (!position || isNaN(position.x)) return; // Safety check
    const flashGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 1,
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.copy(position);
    this.scene.add(flash);

    // Light flash
    const light = new THREE.PointLight(0xffaa00, 5, 8);
    light.position.copy(position);
    this.scene.add(light);

    this.particles.push({
      mesh: flash,
      light,
      life: 0.1,
      maxLife: 0.1,
      type: 'flash',
    });
  }

  private createBloodEffect(position: THREE.Vector3) {
    if (!position || isNaN(position.x)) return; // Safety check
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: 0x880000 });
      const particle = new THREE.Mesh(geo, mat);
      particle.position.copy(position);
      this.scene.add(particle);

      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          Math.random() * 3,
          (Math.random() - 0.5) * 3
        ),
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        type: 'blood',
      });
    }

    // Blood splatter on ground
    if (Math.random() > 0.5) {
      const splatGeo = new THREE.CircleGeometry(0.15 + Math.random() * 0.15, 8);
      const splatMat = new THREE.MeshBasicMaterial({
        color: 0x440000,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const splat = new THREE.Mesh(splatGeo, splatMat);
      splat.rotation.x = -Math.PI / 2;
      splat.position.set(position.x, 0.02, position.z);
      this.scene.add(splat);
      this.bloodSplatters.push(splat);

      // Limit blood splatters
      if (this.bloodSplatters.length > 50) {
        const old = this.bloodSplatters.shift();
        if (old) this.scene.remove(old);
      }
    }
  }

  private createExplosionEffect(position: THREE.Vector3) {
    if (!position || isNaN(position.x)) return; // Safety check
    for (let i = 0; i < 15; i++) {
      const geo = new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00,
        transparent: true,
        opacity: 1,
      });
      const particle = new THREE.Mesh(geo, mat);
      particle.position.copy(position);
      this.scene.add(particle);

      this.particles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 5 + 2,
          (Math.random() - 0.5) * 5
        ),
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        type: 'explosion',
      });
    }

    // Explosion light
    const light = new THREE.PointLight(0xff4400, 10, 15);
    light.position.copy(position);
    this.scene.add(light);
    this.particles.push({
      mesh: new THREE.Mesh(), // dummy
      light,
      life: 0.3,
      maxLife: 0.3,
      type: 'light',
    });
  }

  private damageZombie(zombie: ZombieData, damage: number) {
    zombie.health -= damage;
    if (!zombie.mesh || !zombie.mesh.parent) return; // Already removed
    this.createBloodEffect(zombie.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)));
    soundSystem.zombieHit();

    // Hit flash effect - make zombie flash white briefly
    // Store refs to safely restore after timeout (zombie might be killed)
    const flashTargets: { material: THREE.MeshStandardMaterial; originalEmissive: THREE.Color }[] = [];
    zombie.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const originalEmissive = child.material.emissive.clone();
        child.material.emissive.setHex(0xffffff);
        child.material.emissiveIntensity = 2;
        flashTargets.push({ material: child.material, originalEmissive });
      }
    });
    setTimeout(() => {
      flashTargets.forEach(({ material, originalEmissive }) => {
        try {
          material.emissive.copy(originalEmissive);
          material.emissiveIntensity = 0;
        } catch (_e) { /* material may be disposed */ }
      });
    }, 80);

    // Update health bar
    const healthBar = zombie.mesh.children.find(c => c instanceof THREE.Group) as THREE.Group | undefined;
    if (healthBar) {
      const fill = healthBar.children.find(c => c.name === 'healthFill') as THREE.Mesh | undefined;
      if (fill) {
        const ratio = Math.max(0, zombie.health / zombie.maxHealth);
        fill.scale.x = ratio;
        fill.position.x = -(1 - ratio) * 0.39;
        // Color based on health
        const mat = fill.material as THREE.MeshBasicMaterial;
        if (ratio > 0.6) mat.color.setHex(0x00ff00);
        else if (ratio > 0.3) mat.color.setHex(0xffaa00);
        else mat.color.setHex(0xff0000);
      }
      // Make health bar face camera
      healthBar.lookAt(this.camera.position);
    }

    if (zombie.health <= 0) {
      this.killZombie(zombie);
    }
  }

  private killZombie(zombie: ZombieData) {
    if (!zombie.mesh) return; // Already removed
    soundSystem.zombieDeath();
    this.state.score++;

    const zombiePos = zombie.mesh.position.clone();

    // Explosion for exploder type
    if (zombie.type === 'exploder') {
      soundSystem.explosion();
      this.createExplosionEffect(zombiePos);
      // Damage nearby squad members
      this.squadMembers.forEach(s => {
        if (s && s.position.distanceTo(zombiePos) < 3) {
          this.state.health -= 5;
        }
      });
    }

    // Death effect
    this.createBloodEffect(zombiePos.add(new THREE.Vector3(0, 1, 0)));

    // Safe removal
    if (zombie.mesh.parent) {
      this.scene.remove(zombie.mesh);
    }
    this.zombies = this.zombies.filter(z => z !== zombie);
    this.notifyState();
  }

  private collectBonus(block: BonusBlockData) {
    if (!block.mesh || !block.mesh.parent) return; // Already collected/removed
    soundSystem.collectBonus();
    const type = block.type;

    switch (type) {
      case 'squad':
        if (this.state.squadCount < this.state.maxSquad) {
          this.state.squadCount++;
          this.updateSquadVisuals();
        }
        break;
      case 'weapon_rifle':
        this.state.weapon = WeaponType.RIFLE;
        break;
      case 'weapon_shotgun':
        this.state.weapon = WeaponType.SHOTGUN;
        break;
      case 'weapon_sniper':
        this.state.weapon = WeaponType.SNIPER;
        break;
      case 'weapon_flame':
        this.state.weapon = WeaponType.FLAMETHROWER;
        break;
      case 'health':
        this.state.health = Math.min(this.state.maxHealth, this.state.health + 30);
        break;
      case 'shield':
        this.state.shieldActive = true;
        this.state.shieldTimer = 10;
        break;
      case 'speed':
        this.state.speedBoost = true;
        this.state.speedBoostTimer = 10;
        break;
    }

    // Collection effect
    this.createExplosionEffect(block.mesh.position.clone());
    this.scene.remove(block.mesh);
    this.bonusBlocks = this.bonusBlocks.filter(b => b !== block);
    this.notifyState();
  }

  private startWave() {
    this.zombiesInWave = 5 + this.state.wave * 3;
    this.zombiesSpawned = 0;
    this.waveTimer = 0;
  }

  private createHealthBar(): THREE.Group {
    const group = new THREE.Group();
    
    // Background
    const bgGeo = new THREE.PlaneGeometry(0.8, 0.08);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    group.add(bg);
    
    // Health fill
    const fillGeo = new THREE.PlaneGeometry(0.78, 0.06);
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.z = 0.001;
    fill.name = 'healthFill';
    group.add(fill);
    
    return group;
  }

  private spawnZombie() {
    const types = ['normal', 'normal', 'normal', 'fast', 'tank', 'armored', 'exploder'];
    const waveTypes = types.slice(0, Math.min(3 + Math.floor(this.state.wave / 2), types.length));
    const type = waveTypes[Math.floor(Math.random() * waveTypes.length)];

    const mesh = this.createCharacterModel(true, type);
    const lane = (Math.random() - 0.5) * 8;
    mesh.position.set(lane, 0, -60 - Math.random() * 20);
    
    // Add health bar
    const healthBar = this.createHealthBar();
    const scaleByType: Record<string, number> = { normal: 1, fast: 0.8, tank: 1.5, armored: 1.2, exploder: 1.1 };
    healthBar.position.y = 2.5 * (scaleByType[type] || 1);
    healthBar.lookAt(this.camera.position);
    mesh.add(healthBar);
    
    this.scene.add(mesh);

    const healthByType: Record<string, number> = {
      normal: 30 + this.state.wave * 5,
      fast: 15 + this.state.wave * 3,
      tank: 150 + this.state.wave * 20,
      armored: 80 + this.state.wave * 10,
      exploder: 25 + this.state.wave * 5,
    };

    const speedByType: Record<string, number> = {
      normal: 3 + this.state.wave * 0.1,
      fast: 6 + this.state.wave * 0.15,
      tank: 1.5 + this.state.wave * 0.05,
      armored: 2 + this.state.wave * 0.08,
      exploder: 4 + this.state.wave * 0.1,
    };

    this.zombies.push({
      mesh,
      type,
      health: healthByType[type] || 30,
      maxHealth: healthByType[type] || 30,
      speed: speedByType[type] || 3,
      attackTimer: 0,
      animTime: Math.random() * Math.PI * 2,
    });

    this.zombiesSpawned++;
  }

  private spawnBonusBlock() {
    const types: BonusBlockData['type'][] = ['squad', 'squad', 'squad', 'weapon_rifle', 'weapon_shotgun', 'weapon_sniper', 'weapon_flame', 'health', 'shield', 'speed'];
    const type = types[Math.floor(Math.random() * types.length)];

    const colors: Record<string, number> = {
      squad: 0x2244ff,
      weapon_rifle: 0x22ff22,
      weapon_shotgun: 0xff2222,
      weapon_sniper: 0x8822ff,
      weapon_flame: 0xffaa00,
      health: 0xff4444,
      shield: 0x4488ff,
      speed: 0xffff00,
    };

    const icons: Record<string, string> = {
      squad: '+1',
      weapon_rifle: '🔫',
      weapon_shotgun: '💥',
      weapon_sniper: '🎯',
      weapon_flame: '🔥',
      health: '❤️',
      shield: '🛡️',
      speed: '⚡',
    };

    const geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const mat = new THREE.MeshStandardMaterial({
      color: colors[type],
      emissive: colors[type],
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(3.5, 0.75, -50);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Glow
    const glowGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: colors[type],
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    mesh.add(glow);

    this.bonusBlocks.push({
      mesh,
      type,
      speed: 4 + this.state.wave * 0.2,
      icon: icons[type],
    });
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    
    // Safety check - ensure everything is initialized
    if (!this.scene || !this.camera || !this.renderer || !this.composer) return;
    
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    if (this.state.gameOver || this.state.paused) {
      try { this.composer.render(); } catch (_e) {}
      return;
    }

    // Update water
    this.waterTime += delta;
    if (this.water.material instanceof THREE.ShaderMaterial) {
      (this.water.material.uniforms.time as { value: number }).value = this.waterTime;
    }

    // Camera shake
    if (this.cameraShake > 0) {
      this.camera.position.x = (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y = 8 + (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake *= 0.9;
      if (this.cameraShake < 0.01) {
        this.cameraShake = 0;
        this.camera.position.set(0, 8, 12);
      }
    }

    // Crosshair
    this.crosshairMesh.position.lerp(this.crosshairTarget, 0.15);
    this.crosshairMesh.rotation.z = elapsed * 2;

    // Spawn zombies
    this.waveTimer += delta;
    if (this.zombiesSpawned < this.zombiesInWave && this.waveTimer > 0.8 - this.state.wave * 0.02) {
      this.spawnZombie();
      this.waveTimer = 0;
    }

    // Check wave complete
    if (this.zombiesSpawned >= this.zombiesInWave && this.zombies.length === 0) {
      soundSystem.waveComplete();
      this.state.wave++;
      this.startWave();
      this.notifyState();
    }

    // Spawn bonus blocks
    this.blockSpawnTimer += delta;
    if (this.blockSpawnTimer > 3) {
      this.spawnBonusBlock();
      this.blockSpawnTimer = 0;
    }

    // Update zombies
    this.zombies.forEach(zombie => {
      if (!zombie.mesh || !zombie.mesh.parent) return; // Safety check
      zombie.animTime += delta * zombie.speed;

      // Move towards squad
      const targetZ = 6;
      zombie.mesh.position.z += zombie.speed * delta;

      // Wobble animation
      zombie.mesh.position.y = Math.abs(Math.sin(zombie.animTime * 3)) * 0.1;
      zombie.mesh.rotation.z = Math.sin(zombie.animTime * 3) * 0.1;

      // Attack squad
      if (zombie.mesh.position.z >= targetZ) {
        zombie.attackTimer += delta;
        if (zombie.attackTimer > 1) {
          zombie.attackTimer = 0;
          if (!this.state.shieldActive) {
            this.state.health -= 5;
            this.cameraShake = 0.2;
          }
          // Zombie attack animation - lunge forward (safe ref)
          const attackMesh = zombie.mesh;
          attackMesh.position.z -= 0.3;
          setTimeout(() => {
            try {
              if (attackMesh && attackMesh.parent) {
                attackMesh.position.z += 0.3;
              }
            } catch (_e) { /* object removed */ }
          }, 150);
          this.notifyState();
        }
      }
    });

    // Squad auto-fire
    this.squadMembers.forEach((soldier, i) => {
      this.squadFireTimers[i] += delta;
      const fireRate = this.state.speedBoost ? 0.3 : 0.6;

      if (this.squadFireTimers[i] > fireRate && this.zombies.length > 0) {
        this.squadFireTimers[i] = 0;

        // Find nearest zombie
        let nearestZombie: ZombieData | null = null;
        let nearestDist = Infinity;
        this.zombies.forEach(z => {
          const dist = soldier.position.distanceTo(z.mesh.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestZombie = z;
          }
        });

        if (nearestZombie && nearestDist < 40) {
          const from = soldier.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const to = (nearestZombie as ZombieData).mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
          this.createBullet(from, to, WEAPON_STATS[this.state.weapon].damage * 0.5, false);
          this.createMuzzleFlash(from.add(new THREE.Vector3(0, 0, -0.5)));

          // Damage
          this.damageZombie(nearestZombie, WEAPON_STATS[this.state.weapon].damage * 0.5);
        }
      }

      // Soldier bob animation
      soldier.position.y = Math.sin(elapsed * 2 + i) * 0.02;
    });

    // Update bonus blocks
    this.bonusBlocks.forEach(block => {
      if (!block.mesh || !block.mesh.parent) return; // Safety check
      block.mesh.position.z += block.speed * delta;
      block.mesh.rotation.y += delta * 2;
      block.mesh.position.y = 0.75 + Math.sin(elapsed * 3) * 0.2;
    });
    // Remove blocks that passed
    this.bonusBlocks = this.bonusBlocks.filter((b: BonusBlockData) => {
      if (!b.mesh || !b.mesh.parent) return false; // Already removed
      if (b.mesh.position.z > 15) {
        this.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    // Update bullets
    this.bullets.forEach(bullet => {
      if (!bullet.mesh || !bullet.trail) return; // Safety
      const move = bullet.direction.clone().multiplyScalar(bullet.speed * delta);
      bullet.mesh.position.add(move);
      bullet.trail.position.copy(bullet.mesh.position);
      bullet.trail.lookAt(bullet.mesh.position.clone().add(bullet.direction));
      bullet.distance += bullet.speed * delta;
    });
    // Remove old bullets
    this.bullets = this.bullets.filter(b => {
      if (b.distance > b.maxDistance || b.mesh.position.z > 20 || b.mesh.position.z < -80) {
        try {
          if (b.mesh.parent) this.scene.remove(b.mesh);
          if (b.trail.parent) this.scene.remove(b.trail);
        } catch (_e) { /* already removed */ }
        return false;
      }
      return true;
    });

    // Update particles
    this.particles.forEach(p => {
      p.life -= delta;
      if (!p.mesh) return; // Safety
      if (p.type === 'blood' || p.type === 'explosion') {
        if (p.velocity && p.mesh.position) {
          p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
          p.velocity.y -= 9.8 * delta;
        }
        if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
          p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
        }
      } else if (p.type === 'flash') {
        const scale = Math.max(0, p.life / p.maxLife);
        if (p.mesh.scale) p.mesh.scale.setScalar(scale * 2);
        if (p.mesh.material instanceof THREE.MeshBasicMaterial) {
          p.mesh.material.opacity = scale;
        }
      } else if (p.type === 'light' && p.light) {
        p.light.intensity = Math.max(0, (p.life / p.maxLife) * 10);
      }
    });
    // Remove dead particles
    this.particles = this.particles.filter(p => {
      if (p.life <= 0) {
        try {
          if (p.mesh && p.mesh.parent) this.scene.remove(p.mesh);
          if (p.light && p.light.parent) this.scene.remove(p.light);
        } catch (_e) { /* already removed */ }
        return false;
      }
      return true;
    });

    // Timers
    if (this.state.shieldActive) {
      this.state.shieldTimer -= delta;
      if (this.state.shieldTimer <= 0) {
        this.state.shieldActive = false;
      }
      this.notifyState();
    }

    // Shield visual effect
    if (this.state.shieldActive) {
      let shield = this.scene.getObjectByName('shieldDome') as THREE.Mesh | undefined;
      if (!shield) {
        const shieldGeo = new THREE.SphereGeometry(5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const shieldMat = new THREE.MeshBasicMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.name = 'shieldDome';
        shield.position.set(0, 0, 5);
        this.scene.add(shield);
      }
      if (shield && shield.parent) {
        shield.rotation.y += delta * 0.5;
        const mat = shield.material as THREE.MeshBasicMaterial;
        if (mat) mat.opacity = 0.1 + Math.sin(elapsed * 3) * 0.05;
      }
    } else {
      const shield = this.scene.getObjectByName('shieldDome');
      if (shield && shield.parent) this.scene.remove(shield);
    }
    if (this.state.speedBoost) {
      this.state.speedBoostTimer -= delta;
      if (this.state.speedBoostTimer <= 0) {
        this.state.speedBoost = false;
      }
      // Speed boost visual - golden particles around squad
      if (Math.random() > 0.7 && this.squadMembers.length > 0) {
        const randomSoldier = this.squadMembers[Math.floor(Math.random() * this.squadMembers.length)];
        const sparkGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const sparkMat = new THREE.MeshBasicMaterial({
          color: 0xffdd00,
          transparent: true,
          opacity: 0.8,
        });
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.position.copy(randomSoldier.position);
        spark.position.y += Math.random() * 2;
        spark.position.x += (Math.random() - 0.5) * 0.5;
        this.scene.add(spark);
        this.particles.push({
          mesh: spark,
          velocity: new THREE.Vector3(0, 2, 0),
          life: 0.5,
          maxLife: 0.5,
          type: 'flash',
        });
      }
      this.notifyState();
    }

    // Check game over
    if (this.state.health <= 0) {
      this.state.health = 0;
      this.state.gameOver = true;
      this.notifyState();
    }

    try { this.composer.render(); } catch (_e) { /* render error */ }
  };

  private notifyState() {
    this.onStateChange({ ...this.state });
  }

  public restart() {
    // Safe cleanup
    this.zombies.forEach(z => {
      try { if (z.mesh && z.mesh.parent) this.scene.remove(z.mesh); } catch (_e) {}
    });
    this.bonusBlocks.forEach(b => {
      try { if (b.mesh && b.mesh.parent) this.scene.remove(b.mesh); } catch (_e) {}
    });
    this.bullets.forEach(b => {
      try {
        if (b.mesh && b.mesh.parent) this.scene.remove(b.mesh);
        if (b.trail && b.trail.parent) this.scene.remove(b.trail);
      } catch (_e) {}
    });
    this.particles.forEach(p => {
      try {
        if (p.mesh && p.mesh.parent) this.scene.remove(p.mesh);
        if (p.light && p.light.parent) this.scene.remove(p.light);
      } catch (_e) {}
    });

    // Remove shield if present
    const shield = this.scene.getObjectByName('shieldDome');
    if (shield && shield.parent) this.scene.remove(shield);

    this.zombies = [];
    this.bonusBlocks = [];
    this.bullets = [];
    this.particles = [];

    this.state = {
      squadCount: 5,
      maxSquad: 100,
      weapon: WeaponType.RIFLE,
      wave: 1,
      score: 0,
      health: 100,
      maxHealth: 100,
      shieldActive: false,
      shieldTimer: 0,
      speedBoost: false,
      speedBoostTimer: 0,
      gameOver: false,
      paused: false,
    };

    this.updateSquadVisuals();
    this.startWave();
    this.notifyState();
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    try {
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.remove();
        }
      }
    } catch (_e) { /* ignore cleanup errors */ }
  }
}

// Internal types
interface ZombieData {
  mesh: THREE.Group;
  type: string;
  health: number;
  maxHealth: number;
  speed: number;
  attackTimer: number;
  animTime: number;
}

interface BonusBlockData {
  mesh: THREE.Mesh;
  type: string;
  speed: number;
  icon: string;
}

interface BulletData {
  mesh: THREE.Mesh;
  trail: THREE.Mesh;
  direction: THREE.Vector3;
  speed: number;
  distance: number;
  maxDistance: number;
  damage: number;
  isPlayer: boolean;
}

interface ParticleData {
  mesh: THREE.Mesh;
  light?: THREE.PointLight;
  velocity?: THREE.Vector3;
  life: number;
  maxLife: number;
  type: string;
}
