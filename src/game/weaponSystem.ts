import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export const VIEWMODEL_LAYER = 1;
const DRACO_DECODER_CDN_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

export type WeaponId = 'pistol' | 'rifle' | 'sniper';
export type WeaponCategory = '보조 무기' | '소총' | '저격소총';
export type FireMode = 'AUTO' | 'SEMI';

/** Instant cycle order requested: AR-47 -> Pistol -> Sniper -> AR-47 */
export const WEAPON_CYCLE_ORDER: WeaponId[] = ['rifle', 'pistol', 'sniper'];

export interface WeaponGlbTransform {
  file: string;
  fallbackUrl?: string;
  targetLength: number;
  rotY: number;
  rotX?: number;
  rotZ?: number;
  posOffset: [number, number, number];
  muzzleOffset: [number, number, number];
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  codeName: string;
  category: WeaponCategory;
  description: string;
  fireRateMs: number;
  automatic: boolean;
  damage: number;
  magazineSize: number;
  reloadMs: number;
  recoilKickZ: number;
  recoilPitch: number;
  spread: number;
  hasScope: boolean;
  scopeFov: number;
  stats: {
    power: number;
    fireRate: number;
    control: number;
  };
  glb: WeaponGlbTransform;
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'MK-1 택티컬',
    codeName: 'SIDEARM // SEMI-AUTO',
    category: '보조 무기',
    description: '빠른 조준 전환과 높은 정밀도를 갖춘 단발 전술 권총',
    fireRateMs: 200,
    automatic: false,
    damage: 32,
    magazineSize: 12,
    reloadMs: 1250,
    recoilKickZ: 0.045,
    recoilPitch: 0.045,
    spread: 0.005,
    hasScope: false,
    scopeFov: 75,
    stats: { power: 50, fireRate: 64, control: 90 },
    glb: {
      file: 'pistol_opt.glb',
      fallbackUrl: 'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/pistol_opt.glb',
      targetLength: 0.30,
      rotY: 0,
      posOffset: [-0.02, 0.01, 0.08],
      muzzleOffset: [0, 0.057, -0.16],
    },
  },
  rifle: {
    id: 'rifle',
    name: 'AR-47 스트라이커',
    codeName: 'ASSAULT RIFLE // AUTO',
    category: '소총',
    description: '중·장거리에서 안정적인 화력을 발휘하는 표준 자동 소총',
    fireRateMs: 105,
    automatic: true,
    damage: 42,
    magazineSize: 25,
    reloadMs: 1850,
    recoilKickZ: 0.062,
    recoilPitch: 0.058,
    spread: 0.011,
    hasScope: false,
    scopeFov: 75,
    stats: { power: 80, fireRate: 78, control: 68 },
    glb: {
      file: 'ar47_opt.glb',
      fallbackUrl: 'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/ar47_opt.glb',
      targetLength: 0.75,
      rotY: 0,
      posOffset: [0, 0, 0],
      muzzleOffset: [0, 0.07, -0.39],
    },
  },
  sniper: {
    id: 'sniper',
    name: 'SR-90 롱샷',
    codeName: 'SNIPER RIFLE // SCOPE',
    category: '저격소총',
    description: '우클릭 고배율 스코프로 단일 목표를 정확히 제압하는 대구경 저격총',
    fireRateMs: 1250,
    automatic: false,
    damage: 150,
    magazineSize: 5,
    reloadMs: 2350,
    recoilKickZ: 0.16,
    recoilPitch: 0.145,
    spread: 0.001,
    hasScope: true,
    scopeFov: 22,
    stats: { power: 100, fireRate: 22, control: 60 },
    glb: {
      file: 'sniper_opt.glb',
      fallbackUrl: 'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/sniper_opt.glb',
      targetLength: 1.20,
      rotY: 0,
      posOffset: [0.02, -0.02, -0.14],
      muzzleOffset: [0, 0.048, -0.62],
    },
  },
};

export function normalizeWeaponId(id: string): WeaponId {
  if (id === 'pistol' || id === 'rifle' || id === 'sniper') return id;
  return 'rifle';
}

export interface WeaponHudState {
  weaponId: WeaponId;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  isScoped: boolean;
  isAds: boolean;
  fireMode: FireMode;
}

export interface ShotResult {
  hitObject: THREE.Object3D | null;
  hitPoint: THREE.Vector3;
  damage: number;
}

// ==========================================
// 1. GLB 로더 (Draco CDN 디코더 포함), 사용자 직접 업로드 & 방향 보정 관리
// ==========================================
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(DRACO_DECODER_CDN_URL);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
const loadedGlbCache = new Map<WeaponId, Promise<THREE.Group | null>>();
const customUploadedScenes = new Map<WeaponId, THREE.Group>();
const customUploadedNames = new Map<WeaponId, string>();
const customRotYOverrides = new Map<WeaponId, number>();

type ModelUpdateListener = (id: WeaponId) => void;
const modelListeners = new Set<ModelUpdateListener>();

export function subscribeWeaponModelUpdate(listener: ModelUpdateListener): () => void {
  modelListeners.add(listener);
  return () => modelListeners.delete(listener);
}

function notifyWeaponModelUpdate(id: WeaponId) {
  modelListeners.forEach((fn) => fn(id));
}

export function getUploadedGlbFileName(id: WeaponId): string | null {
  return customUploadedNames.get(id) ?? null;
}

export function getWeaponRotY(id: WeaponId): number {
  return customRotYOverrides.get(id) ?? WEAPON_SPECS[id].glb.rotY;
}

/** UI에서 90도씩 모델 방향 회전 보정 */
export function rotateWeaponModel90(id: WeaponId): number {
  const next = (getWeaponRotY(id) + Math.PI / 2) % (Math.PI * 2);
  customRotYOverrides.set(id, next);
  notifyWeaponModelUpdate(id);
  return next;
}

/** 사용자가 로컬에서 선택한 .glb 파일을 파싱하여 해당 무기 슬롯에 즉시 적용 */
export async function uploadCustomWeaponGlb(id: WeaponId, file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer();
    const scene = await new Promise<THREE.Group>((resolve, reject) => {
      gltfLoader.parse(
        buffer,
        '',
        (gltf) => resolve(gltf.scene),
        (err) => reject(err)
      );
    });
    customUploadedScenes.set(id, scene);
    customUploadedNames.set(id, file.name);
    notifyWeaponModelUpdate(id);
    return true;
  } catch (err) {
    console.error('[WeaponSystem] GLB 파일 파싱 실패:', err);
    return false;
  }
}

function getWeaponGlbUrl(file: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}assets/models/weapons/${file}`;
}

function loadGlbFromUrl(url: string): Promise<THREE.Group | null> {
  return new Promise<THREE.Group | null>((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(null)
    );
  });
}

function loadRawWeaponGlb(id: WeaponId): Promise<THREE.Group | null> {
  const uploaded = customUploadedScenes.get(id);
  if (uploaded) {
    return Promise.resolve(uploaded);
  }

  const cached = loadedGlbCache.get(id);
  if (cached) return cached;

  const cfg = WEAPON_SPECS[id].glb;
  const localUrl = getWeaponGlbUrl(cfg.file);
  const promise = (async () => {
    const localScene = await loadGlbFromUrl(localUrl);
    if (localScene) return localScene;
    if (cfg.fallbackUrl) {
      return loadGlbFromUrl(cfg.fallbackUrl);
    }
    return null;
  })();

  loadedGlbCache.set(id, promise);
  return promise;
}

function createFallbackMesh(id: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.4, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7, metalness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2dd4bf,
    emissive: 0x0f766e,
    emissiveIntensity: 0.6,
    roughness: 0.3,
  });

  const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.userData.isFallbackMesh = true;
    g.add(mesh);
  };

  if (id === 'pistol') {
    add(0.05, 0.07, 0.24, 0, 0.04, 0, bodyMat);
    add(0.042, 0.13, 0.06, 0, -0.05, 0.07, darkMat);
    add(0.015, 0.015, 0.04, 0, 0.08, -0.09, accentMat);
  } else if (id === 'rifle') {
    add(0.06, 0.09, 0.56, 0, 0.03, 0, bodyMat);
    add(0.03, 0.03, 0.24, 0, 0.04, -0.36, darkMat);
    add(0.045, 0.18, 0.07, 0, -0.09, -0.06, darkMat);
    add(0.04, 0.025, 0.14, 0, 0.09, 0.04, accentMat);
  } else {
    add(0.065, 0.09, 0.62, 0, 0.03, 0.04, bodyMat);
    add(0.028, 0.028, 0.48, 0, 0.04, -0.46, darkMat);
    add(0.045, 0.045, 0.26, 0, 0.12, 0.0, darkMat);
    add(0.02, 0.02, 0.04, 0, 0.12, -0.14, accentMat);
  }
  return g;
}

export async function createNormalizedWeaponModel(
  id: WeaponId,
  overrideTargetLength?: number
): Promise<{ group: THREE.Group; isGlb: boolean; fileName: string | null }> {
  const safeId = normalizeWeaponId(id);
  const spec = WEAPON_SPECS[safeId];
  const cfg = spec.glb;
  const raw = await loadRawWeaponGlb(safeId);

  const wrapper = new THREE.Group();
  const content = raw ? raw.clone(true) : createFallbackMesh(safeId);

  content.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = false;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
    }
  });

  const pivot = new THREE.Group();
  content.rotation.set(cfg.rotX ?? 0, getWeaponRotY(safeId), cfg.rotZ ?? 0);
  pivot.add(content);
  pivot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(pivot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const targetLen = overrideTargetLength ?? cfg.targetLength;
  const scale = targetLen / maxDim;

  pivot.position.sub(center);
  const scaledHolder = new THREE.Group();
  scaledHolder.add(pivot);
  scaledHolder.scale.setScalar(scale);

  wrapper.add(scaledHolder);
  return {
    group: wrapper,
    isGlb: Boolean(raw),
    fileName: customUploadedNames.get(safeId) ?? (raw ? cfg.file : null),
  };
}

// ==========================================
// 2. 무기별 프로시저럴 Web Audio 사운드 엔진
//    - 권총: 발로란트 윙맨/셰리프 스타일 대구경 핸드캐논
//    - 저격총: 배틀그라운드 에땁(AWM) 스타일 초저음 폭발 + 1.1s 야외 잔향 + 0.45s 볼트액션
//    - 소총(AR-47): 연사/단발 타격감이 살아있는 경쾌한 중음역 사격음
// ==========================================
class WeaponAudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private distortionCurve: Float32Array<ArrayBuffer> | null = null;

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Master limiter/compressor so rapid full-auto sprays never clip or turn muddy
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-10, this.ctx.currentTime);
      comp.knee.setValueAtTime(14, this.ctx.currentTime);
      comp.ratio.setValueAtTime(8, this.ctx.currentTime);
      comp.attack.setValueAtTime(0.002, this.ctx.currentTime);
      comp.release.setValueAtTime(0.12, this.ctx.currentTime);

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.88, this.ctx.currentTime);
      master.connect(comp);
      comp.connect(this.ctx.destination);
      this.masterGain = master;
      this.compressor = comp;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const len = Math.floor(this.ctx.sampleRate * 1.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    if (!this.reverbConvolver && this.ctx) {
      // Synthesize a 1.1s outdoor plaza reverb impulse response (zero external audio files)
      const duration = 1.15;
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * duration);
      const ir = this.ctx.createBuffer(2, length, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const chData = ir.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          // Early slapback echo around 65ms + smooth outdoor exponential tail
          const slap = i > sampleRate * 0.055 && i < sampleRate * 0.085 ? 0.55 : 0;
          const env = Math.pow(1 - t, 2.35) + slap * Math.pow(1 - t, 1.5);
          chData[i] = (Math.random() * 2 - 1) * env * 0.45;
        }
      }
      const convolver = this.ctx.createConvolver();
      convolver.buffer = ir;
      const reverbFilter = this.ctx.createBiquadFilter();
      reverbFilter.type = 'lowpass';
      reverbFilter.frequency.setValueAtTime(1750, this.ctx.currentTime);
      convolver.connect(reverbFilter);
      if (this.masterGain) {
        reverbFilter.connect(this.masterGain);
      }
      this.reverbConvolver = convolver;
    }
    if (!this.distortionCurve) {
      const samples = 512;
      const curve = new Float32Array(new ArrayBuffer(samples * 4));
      const k = 28;
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
      }
      this.distortionCurve = curve;
    }
    return this.ctx;
  }

  public playShot(id: WeaponId) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || !this.masterGain) return;

    const now = ctx.currentTime;
    const out = this.masterGain;

    if (id === 'pistol') {
      // [권총 — 발로란트 윙맨 / 셰리프 스타일 대구경 핸드캐논]
      // 1) 날카롭고 단단한 고음 금속 파열음 (2.5kHz~5kHz 대역, 짧은 감쇠)
      const crackNoise = ctx.createBufferSource();
      crackNoise.buffer = this.noiseBuffer;
      const crackBp = ctx.createBiquadFilter();
      crackBp.type = 'bandpass';
      crackBp.frequency.setValueAtTime(4400, now);
      crackBp.frequency.exponentialRampToValueAtTime(2600, now + 0.085);
      crackBp.Q.setValueAtTime(1.6, now);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.56, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      crackNoise.connect(crackBp);
      crackBp.connect(crackGain);
      crackGain.connect(out);
      crackNoise.start(now);
      crackNoise.stop(now + 0.11);

      // 2) 묵직한 중저음 펀치 (190Hz -> 55Hz 급강하 파형 + 소프트 새추레이션)
      const punchOsc = ctx.createOscillator();
      punchOsc.type = 'triangle';
      punchOsc.frequency.setValueAtTime(190, now);
      punchOsc.frequency.exponentialRampToValueAtTime(55, now + 0.105);
      const punchShaper = ctx.createWaveShaper();
      if (this.distortionCurve) punchShaper.curve = this.distortionCurve;
      const punchGain = ctx.createGain();
      punchGain.gain.setValueAtTime(0.46, now);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      punchOsc.connect(punchShaper);
      punchShaper.connect(punchGain);
      punchGain.connect(out);
      punchOsc.start(now);
      punchOsc.stop(now + 0.13);

      // 3) 끝에 실린더/노리쇠가 잠기는 짤깍이는 금속 기계음 (+75ms)
      const clackTime = now + 0.075;
      const clackNoise = ctx.createBufferSource();
      clackNoise.buffer = this.noiseBuffer;
      const clackBp = ctx.createBiquadFilter();
      clackBp.type = 'bandpass';
      clackBp.frequency.setValueAtTime(3400, clackTime);
      clackBp.Q.setValueAtTime(3.2, clackTime);
      const clackGain = ctx.createGain();
      clackGain.gain.setValueAtTime(0.18, clackTime);
      clackGain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.032);
      clackNoise.connect(clackBp);
      clackBp.connect(clackGain);
      clackGain.connect(out);
      clackNoise.start(clackTime);
      clackNoise.stop(clackTime + 0.04);

      const latchOsc = ctx.createOscillator();
      latchOsc.type = 'square';
      latchOsc.frequency.setValueAtTime(1520, clackTime);
      latchOsc.frequency.exponentialRampToValueAtTime(640, clackTime + 0.028);
      const latchGain = ctx.createGain();
      latchGain.gain.setValueAtTime(0.075, clackTime);
      latchGain.gain.exponentialRampToValueAtTime(0.001, clackTime + 0.032);
      latchOsc.connect(latchGain);
      latchGain.connect(out);
      latchOsc.start(clackTime);
      latchOsc.stop(clackTime + 0.04);
      return;
    }

    if (id === 'rifle') {
      // [돌격소총 AR-47 — 연사 시 뭉개지지 않고 단발 타격감이 살아있는 중음역 사격음]
      // 1) 경쾌한 150Hz -> 48Hz 바디 펀치
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(150, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(48, now + 0.088);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.42, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.098);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(out);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.11);

      // 2) 1.6kHz 중심 크랙 노이즈 (짧고 명료한 감쇠)
      const crackNoise = ctx.createBufferSource();
      crackNoise.buffer = this.noiseBuffer;
      const crackBp = ctx.createBiquadFilter();
      crackBp.type = 'bandpass';
      crackBp.frequency.setValueAtTime(1600, now);
      crackBp.Q.setValueAtTime(1.15, now);
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.46, now);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      crackNoise.connect(crackBp);
      crackBp.connect(crackGain);
      crackGain.connect(out);
      crackNoise.start(now);
      crackNoise.stop(now + 0.125);

      // 3) 초단기 고역 어택 스냅 (연사 리듬 명료화)
      const snapNoise = ctx.createBufferSource();
      snapNoise.buffer = this.noiseBuffer;
      const snapHp = ctx.createBiquadFilter();
      snapHp.type = 'highpass';
      snapHp.frequency.setValueAtTime(3200, now);
      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.24, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
      snapNoise.connect(snapHp);
      snapHp.connect(snapGain);
      snapGain.connect(out);
      snapNoise.start(now);
      snapNoise.stop(now + 0.045);
      return;
    }

    // [저격총 — 배틀그라운드 에땁(AWM) 스타일]
    // 1) 가슴을 울리는 초저음 서브베이스 폭발음 (115Hz -> 26Hz + 디스토션)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(115, now);
    subOsc.frequency.exponentialRampToValueAtTime(26, now + 0.34);
    const subLp = ctx.createBiquadFilter();
    subLp.type = 'lowpass';
    subLp.frequency.setValueAtTime(320, now);
    const subShaper = ctx.createWaveShaper();
    if (this.distortionCurve) subShaper.curve = this.distortionCurve;
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.72, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    subOsc.connect(subLp);
    subLp.connect(subShaper);
    subShaper.connect(subGain);
    subGain.connect(out);
    subOsc.start(now);
    subOsc.stop(now + 0.42);

    // 2) 날카로운 초음속 파열음 + 1.1초 야외 잔향(Reverb Echo)
    const blastNoise = ctx.createBufferSource();
    blastNoise.buffer = this.noiseBuffer;
    const blastBp = ctx.createBiquadFilter();
    blastBp.type = 'bandpass';
    blastBp.frequency.setValueAtTime(2600, now);
    blastBp.frequency.exponentialRampToValueAtTime(750, now + 0.24);
    blastBp.Q.setValueAtTime(0.75, now);
    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.68, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    blastNoise.connect(blastBp);
    blastBp.connect(blastGain);
    blastGain.connect(out);

    // Reverb send (1.1s outdoor courtyard echo)
    if (this.reverbConvolver) {
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(0.55, now);
      blastGain.connect(wetGain);
      subGain.connect(wetGain);
      wetGain.connect(this.reverbConvolver);
    }
    blastNoise.start(now);
    blastNoise.stop(now + 0.3);

    // 3) 발사 0.45초 뒤 '철컥-찰칵' 볼트액션 노리쇠 장전 효과음
    const boltOpen = now + 0.45;
    const boltClose = now + 0.68;
    this.scheduleBoltStep(ctx, out, boltOpen, 2500, 940, 480, 0.16);
    this.scheduleBoltStep(ctx, out, boltClose, 3400, 1280, 560, 0.19);
  }

  private scheduleBoltStep(
    ctx: AudioContext,
    out: AudioNode,
    t: number,
    noiseFreq: number,
    oscStart: number,
    oscEnd: number,
    level: number,
  ) {
    if (!this.noiseBuffer) return;
    const scrape = ctx.createBufferSource();
    scrape.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(noiseFreq, t);
    bp.Q.setValueAtTime(3.0, t);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(level, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    scrape.connect(bp);
    bp.connect(nGain);
    nGain.connect(out);
    scrape.start(t);
    scrape.stop(t + 0.095);

    const clack = ctx.createOscillator();
    clack.type = 'square';
    clack.frequency.setValueAtTime(oscStart, t);
    clack.frequency.exponentialRampToValueAtTime(oscEnd, t + 0.045);
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(level * 0.42, t);
    cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    clack.connect(cGain);
    cGain.connect(out);
    clack.start(t);
    clack.stop(t + 0.06);
  }

  public playMechanicalClick(pitch = 620) {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, now + 0.05);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.07);
  }
}

const sharedWeaponAudio = new WeaponAudioSynth();

/** Call on first user touch/click/keydown so mobile Safari/Chrome AudioContext resumes immediately */
export function unlockWeaponAudio(): void {
  sharedWeaponAudio.unlock();
}

// ==========================================
// 3. 1인칭 무기 리그 컨트롤러
// ==========================================
interface WeaponSlot {
  container: THREE.Group;
  modelHolder: THREE.Group;
  muzzleAnchor: THREE.Object3D;
}

interface ActiveTracer {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

export class WeaponRigController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rigGroup: THREE.Group;
  private basePos = new THREE.Vector3(0.26, -0.24, -0.52);
  private adsPos = new THREE.Vector3(0, -0.15, -0.36);

  private slots: Record<WeaponId, WeaponSlot>;
  private audio = sharedWeaponAudio;
  private raycaster = new THREE.Raycaster();

  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashLight: THREE.PointLight;
  private muzzleFlashTimer = 0;
  private tracers: ActiveTracer[] = [];

  private currentId: WeaponId = 'rifle';
  private rifleFireMode: FireMode = 'AUTO';
  private ammoMap: Record<WeaponId, number>;
  private isFiring = false;
  private semiAutoConsumed = false;
  private lastFireTime = 0;
  private isReloading = false;
  private reloadRemaining = 0;
  private isScoped = false;
  private isAds = false;
  private adsProgress = 0;
  private defaultFov: number;
  private disposed = false;
  private unsubscribeModelUpdate: () => void;

  private recoilZ = 0;
  private recoilPitch = 0;
  private equipProgress = 1;
  private swayX = 0;
  private swayY = 0;
  private bobTime = 0;

  private onHudChange?: (state: WeaponHudState) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    onHudChange?: (state: WeaponHudState) => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.defaultFov = camera.fov;
    this.onHudChange = onHudChange;

    if (!camera.parent) {
      scene.add(camera);
    }

    this.rigGroup = new THREE.Group();
    this.rigGroup.position.copy(this.basePos);
    this.camera.add(this.rigGroup);

    const ids: WeaponId[] = ['pistol', 'rifle', 'sniper'];
    this.slots = {} as Record<WeaponId, WeaponSlot>;
    this.ammoMap = {
      pistol: WEAPON_SPECS.pistol.magazineSize,
      rifle: WEAPON_SPECS.rifle.magazineSize,
      sniper: WEAPON_SPECS.sniper.magazineSize,
    };

    ids.forEach((id) => {
      const container = new THREE.Group();
      const [ox, oy, oz] = WEAPON_SPECS[id].glb.posOffset;
      container.position.set(ox, oy, oz);
      container.visible = false;

      const modelHolder = new THREE.Group();
      container.add(modelHolder);

      const muzzleAnchor = new THREE.Object3D();
      const [mx, my, mz] = WEAPON_SPECS[id].glb.muzzleOffset;
      muzzleAnchor.position.set(mx, my, mz);
      container.add(muzzleAnchor);

      this.rigGroup.add(container);
      this.slots[id] = { container, modelHolder, muzzleAnchor };

      this.refreshSlotModel(id);
    });

    // UI에서 새 GLB 업로드 또는 90도 회전 시 1인칭 모델 즉시 갱신
    this.unsubscribeModelUpdate = subscribeWeaponModelUpdate((updatedId) => {
      this.refreshSlotModel(updatedId);
    });

    const flashGeo = new THREE.OctahedronGeometry(0.055, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashMesh.layers.set(VIEWMODEL_LAYER);
    this.muzzleFlashLight = new THREE.PointLight(0xffb84d, 0, 5);
    this.muzzleFlashLight.layers.enable(VIEWMODEL_LAYER);

    this.equip('rifle', false);
    this.setViewportAspect(camera.aspect || 16 / 9);
  }

  /** Adapt 1st-person viewmodel framing between landscape and narrow mobile portrait viewports */
  public setViewportAspect(aspect: number) {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    if (aspect >= 0.95) {
      this.basePos.set(0.26, -0.24, -0.52);
    } else {
      // Narrow portrait phone: pull weapon slightly inward & lower so barrel/body stay fully framed
      const t = THREE.MathUtils.clamp((0.95 - aspect) / 0.5, 0, 1);
      this.basePos.set(
        THREE.MathUtils.lerp(0.25, 0.145, t),
        THREE.MathUtils.lerp(-0.24, -0.275, t),
        THREE.MathUtils.lerp(-0.52, -0.57, t)
      );
    }
  }

  private refreshSlotModel(id: WeaponId) {
    createNormalizedWeaponModel(id).then(({ group }) => {
      if (this.disposed) return;
      group.traverse((obj) => {
        obj.layers.set(VIEWMODEL_LAYER);
      });
      const holder = this.slots[id].modelHolder;
      // Remove any previous model cleanly (never duplicate 3D models in a slot)
      while (holder.children.length > 0) {
        const old = holder.children[0];
        holder.remove(old);
        // Dispose only fallback procedural meshes (GLB clones share cached geometries/materials)
        old.traverse((node) => {
          if (node instanceof THREE.Mesh && node.userData?.isFallbackMesh) {
            node.geometry?.dispose();
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => m?.dispose());
          }
        });
      }
      holder.add(group);
    });
  }

  public getCurrentSpec(): WeaponSpec {
    return WEAPON_SPECS[this.currentId];
  }

  public getHudState(): WeaponHudState {
    const spec = this.getCurrentSpec();
    return {
      weaponId: this.currentId,
      ammo: this.ammoMap[this.currentId],
      maxAmmo: spec.magazineSize,
      isReloading: this.isReloading,
      isScoped: this.isScoped,
      isAds: this.isAds,
      fireMode: this.currentId === 'rifle' ? this.rifleFireMode : spec.automatic ? 'AUTO' : 'SEMI',
    };
  }

  private emitHud() {
    this.onHudChange?.(this.getHudState());
  }

  /** Instant weapon cycle: AR-47 -> Pistol -> Sniper -> AR-47 */
  public cycleNextWeapon(): WeaponId {
    const idx = WEAPON_CYCLE_ORDER.indexOf(this.currentId);
    const nextId = WEAPON_CYCLE_ORDER[(idx + 1) % WEAPON_CYCLE_ORDER.length];
    this.equip(nextId, true);
    return nextId;
  }

  /** Toggle AR-47 fire mode between AUTO and SEMI (only active while rifle is equipped) */
  public toggleRifleFireMode(): FireMode {
    if (this.currentId !== 'rifle') return this.getHudState().fireMode;
    this.rifleFireMode = this.rifleFireMode === 'AUTO' ? 'SEMI' : 'AUTO';
    this.semiAutoConsumed = false;
    this.audio.playMechanicalClick(this.rifleFireMode === 'AUTO' ? 780 : 610);
    this.emitHud();
    return this.rifleFireMode;
  }

  public equip(id: WeaponId, playSound = true) {
    const safeId = normalizeWeaponId(id);
    // Cancel any active ADS or sniper scope automatically on weapon switch
    this.setAds(false);
    this.setScope(false);
    this.adsProgress = 0;
    this.isReloading = false;
    this.reloadRemaining = 0;
    this.isFiring = false;
    this.semiAutoConsumed = false;

    (Object.keys(this.slots) as WeaponId[]).forEach((key) => {
      this.slots[key].container.visible = key === safeId;
    });

    this.currentId = safeId;
    this.ammoMap[safeId] = WEAPON_SPECS[safeId].magazineSize;
    this.equipProgress = 0;
    this.recoilZ = 0;
    this.recoilPitch = 0;
    this.muzzleFlashTimer = 0;
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashLight.intensity = 0;

    const anchor = this.slots[safeId].muzzleAnchor;
    anchor.add(this.muzzleFlashMesh);
    anchor.add(this.muzzleFlashLight);

    if (playSound) {
      this.audio.playMechanicalClick(540);
    }
    this.emitHud();
  }

  public setFiring(active: boolean) {
    this.isFiring = active;
    if (!active) {
      this.semiAutoConsumed = false;
    }
  }

  /** Unified ADS / Scope control: AR-47 zooms to FOV 52 & centers weapon; Sniper activates Scope */
  public setAds(active: boolean) {
    if (this.currentId === 'sniper') {
      this.isAds = false;
      this.setScope(active);
      return;
    }
    if (this.currentId === 'rifle') {
      const nextAds = active && !this.isReloading;
      if (this.isAds === nextAds) return;
      this.isAds = nextAds;
      this.audio.playMechanicalClick(nextAds ? 760 : 580);
      this.emitHud();
      return;
    }
    // Pistol has no ADS/scope zoom
    if (this.isAds || this.isScoped) {
      this.isAds = false;
      this.setScope(false);
      this.emitHud();
    }
  }

  public toggleAds() {
    if (this.currentId === 'sniper') {
      this.toggleScope();
    } else if (this.currentId === 'rifle') {
      this.setAds(!this.isAds);
    }
  }

  public setScope(active: boolean) {
    const spec = this.getCurrentSpec();
    const nextScope = active && spec.hasScope && !this.isReloading;
    if (this.isScoped === nextScope) return;

    this.isScoped = nextScope;
    this.rigGroup.visible = !nextScope;
    this.audio.playMechanicalClick(nextScope ? 820 : 640);
    this.emitHud();
  }

  public toggleScope() {
    this.setScope(!this.isScoped);
  }

  public reload() {
    const spec = this.getCurrentSpec();
    if (this.isReloading || this.ammoMap[this.currentId] >= spec.magazineSize) return;

    this.setAds(false);
    this.setScope(false);
    this.isReloading = true;
    this.reloadRemaining = spec.reloadMs / 1000;
    this.audio.playMechanicalClick(360);
    this.emitHud();
  }

  public tryFire(
    shootableObjects: THREE.Object3D[],
    onHit?: (result: ShotResult) => void
  ): ShotResult | null {
    if (!this.isFiring || this.isReloading) return null;

    const spec = this.getCurrentSpec();
    const isAuto = this.currentId === 'rifle' ? this.rifleFireMode === 'AUTO' : spec.automatic;
    if (!isAuto && this.semiAutoConsumed) return null;

    const now = performance.now();
    if (now - this.lastFireTime < spec.fireRateMs) return null;

    if (this.ammoMap[this.currentId] <= 0) {
      this.reload();
      return null;
    }

    this.lastFireTime = now;
    this.semiAutoConsumed = true;
    this.ammoMap[this.currentId] -= 1;

    // SEMI and ADS precision & recoil scaling for AR-47
    const isRifleSemi = this.currentId === 'rifle' && this.rifleFireMode === 'SEMI';
    let recoilMul = 1.0;
    let spreadFactor = this.isScoped ? 0 : spec.spread;
    if (this.currentId === 'rifle') {
      if (isRifleSemi && this.isAds) {
        recoilMul = 0.42;
        spreadFactor = 0.0005;
      } else if (isRifleSemi) {
        recoilMul = 0.58;
        spreadFactor = 0.0016;
      } else if (this.isAds) {
        recoilMul = 0.65;
        spreadFactor = 0.0032;
      }
    }

    this.recoilZ = Math.min(0.22, this.recoilZ + spec.recoilKickZ * recoilMul);
    this.recoilPitch = Math.min(0.28, this.recoilPitch + spec.recoilPitch * recoilMul);
    this.muzzleFlashTimer = 0.04;
    this.muzzleFlashMesh.visible = !this.isScoped;
    this.muzzleFlashMesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.muzzleFlashLight.intensity = 2.4;
    this.audio.playShot(this.currentId);

    const ndc = new THREE.Vector2(
      (Math.random() - 0.5) * 2 * spreadFactor,
      (Math.random() - 0.5) * 2 * spreadFactor
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(shootableObjects, true);

    const hitPoint =
      hits.length > 0
        ? hits[0].point.clone()
        : this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, 80);

    const muzzleWorld = new THREE.Vector3();
    this.slots[this.currentId].muzzleAnchor.getWorldPosition(muzzleWorld);
    this.spawnTracer(muzzleWorld, hitPoint);

    if (this.ammoMap[this.currentId] === 0) {
      this.reload();
    } else {
      this.emitHud();
    }

    const result: ShotResult = {
      hitObject: hits.length > 0 ? hits[0].object : null,
      hitPoint,
      damage: spec.damage,
    };
    onHit?.(result);
    return result;
  }

  private spawnTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.78,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, material: mat, life: 0.075, maxLife: 0.075 });
  }

  public update(dt: number, isMoving = false, mouseDeltaX = 0, mouseDeltaY = 0) {
    const safeDt = Math.min(dt, 0.05);

    if (this.equipProgress < 1) {
      this.equipProgress = Math.min(1, this.equipProgress + safeDt * 4.2);
    }

    if (this.isReloading) {
      this.reloadRemaining -= safeDt;
      if (this.reloadRemaining <= 0) {
        this.isReloading = false;
        this.ammoMap[this.currentId] = this.getCurrentSpec().magazineSize;
        this.audio.playMechanicalClick(720);
        this.emitHud();
      }
    }

    const targetAds = this.currentId === 'rifle' && this.isAds && !this.isReloading ? 1 : 0;
    this.adsProgress = THREE.MathUtils.lerp(this.adsProgress, targetAds, Math.min(1, safeDt * 14));

    const decay = Math.exp(-14 * safeDt);
    this.recoilZ *= decay;
    this.recoilPitch *= decay;

    const adsDamp = 1 - 0.72 * this.adsProgress;
    const targetSwayX = THREE.MathUtils.clamp(-mouseDeltaX * 0.0005, -0.025, 0.025) * adsDamp;
    const targetSwayY = THREE.MathUtils.clamp(mouseDeltaY * 0.0005, -0.02, 0.02) * adsDamp;
    this.swayX = THREE.MathUtils.lerp(this.swayX, targetSwayX, safeDt * 10);
    this.swayY = THREE.MathUtils.lerp(this.swayY, targetSwayY, safeDt * 10);

    this.bobTime += safeDt * (isMoving ? 10 : 1.8);
    const bobAmp = (isMoving ? 0.009 : 0.002) * adsDamp;
    const bobX = Math.cos(this.bobTime) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobTime)) * bobAmp;

    const equipOffsetY = (1 - this.equipProgress) * -0.22;
    const reloadOffsetY = this.isReloading ? -0.1 : 0;

    const curBaseX = THREE.MathUtils.lerp(this.basePos.x, this.adsPos.x, this.adsProgress);
    const curBaseY = THREE.MathUtils.lerp(this.basePos.y, this.adsPos.y, this.adsProgress);
    const curBaseZ = THREE.MathUtils.lerp(this.basePos.z, this.adsPos.z, this.adsProgress);

    this.rigGroup.position.set(
      curBaseX + this.swayX + bobX,
      curBaseY + this.swayY - bobY + equipOffsetY + reloadOffsetY,
      curBaseZ + this.recoilZ
    );

    const targetReloadRotX = this.isReloading ? -0.45 : 0;
    const targetReloadRotZ = this.isReloading ? 0.35 : 0;
    this.rigGroup.rotation.x = THREE.MathUtils.lerp(
      this.rigGroup.rotation.x,
      this.recoilPitch + targetReloadRotX,
      safeDt * 18
    );
    this.rigGroup.rotation.z = THREE.MathUtils.lerp(
      this.rigGroup.rotation.z,
      -this.swayX * 1.5 + targetReloadRotZ,
      safeDt * 14
    );

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= safeDt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashMesh.visible = false;
        this.muzzleFlashLight.intensity = 0;
      }
    }

    const rifleAdsFov = Math.min(52, this.defaultFov * 0.72);
    const targetFov = this.isScoped
      ? this.getCurrentSpec().scopeFov
      : this.currentId === 'rifle' && this.isAds
        ? rifleAdsFov
        : this.defaultFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, safeDt * 14);
      this.camera.updateProjectionMatrix();
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= safeDt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.material.opacity = (t.life / t.maxLife) * 0.78;
      }
    }
  }

  public dispose() {
    this.disposed = true;
    this.unsubscribeModelUpdate();
    this.camera.remove(this.rigGroup);
    this.tracers.forEach((t) => {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      t.material.dispose();
    });
    this.tracers = [];
  }
}
