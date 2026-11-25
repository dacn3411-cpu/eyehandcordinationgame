// =====================================================================
// Courtyard kit: an original Himalayan temple-style tactical courtyard.
//
//   createWatchtowerFacade     main two-storey tower front (centre)
//   createGlowingCrateCluster  gunmetal truss containers with a green core
//   createReinforcedCoverBox   taupe-framed mustard cover box with A braces
//   createCourtyardPerimeter   low left wall, left annex, building behind it
//   createDistantCliffs        cliffs, haze village, dome stupa, big tree
//   createCourtyardFloorDressing  concrete pads, curbs, moss, debris, cables
//
// Everything here is visual only. Gameplay colliders and raycast occluders
// stay exactly where worldBuilder put them; old meshes are only hidden, and
// new meshes either sit on the same planes or in places the player cannot
// reach (outside the play circle).
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addPaintedLook } from './propKit';
import { INDOOR_RANGE_WORLD } from './rules';

// ------------------------------------------------------------------ palette
export const COURTYARD_PALETTE = {
  plasterSun: '#E0BF94', // between #d8b282 and #e6cfb0
  plasterUpper: '#D2C6B4',
  shadedWall: '#9C9388',
  eaveWood: '#3A2920',
  outerFloor: '#73787D',
  centerPad: '#979CA0',
  glow: '#42FF9E',
  core: '#38FF9C',
  tarp: '#5B4F46',
};

// ------------------------------------------------------------------ textures
const texBase = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') + 'assets/textures/';
const loader = new THREE.TextureLoader();
const fileTex = new Map<string, THREE.Texture>();
const pendingSlots = new Map<string, Array<(t: THREE.Texture) => void>>();

/** Assign a shipped PBR map to a material slot once it has loaded (missing file = keep the flat look). */
function useMap(
  mat: THREE.MeshStandardMaterial,
  slot: 'map' | 'normalMap' | 'roughnessMap',
  file: string,
  opts: { normalScale?: number; srgb?: boolean } = {},
) {
  const apply = (t: THREE.Texture) => {
    mat[slot] = t;
    if (slot === 'normalMap') mat.normalScale.set(opts.normalScale ?? 1, opts.normalScale ?? 1);
    if (slot === 'roughnessMap') mat.roughness = 1;
    mat.needsUpdate = true;
  };
  const have = fileTex.get(file);
  if (have) return apply(have);
  const list = pendingSlots.get(file);
  if (list) return void list.push(apply);
  pendingSlots.set(file, [apply]);
  loader.load(
    texBase + file,
    (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
      fileTex.set(file, t);
      (pendingSlots.get(file) ?? []).forEach((f) => f(t));
      pendingSlots.delete(file);
    },
    undefined,
    () => pendingSlots.delete(file),
  );
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, srgb = true, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const rngOf = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const memo = new Map<string, THREE.Texture>();
function once(key: string, make: () => THREE.Texture) {
  let t = memo.get(key);
  if (!t) memo.set(key, (t = make()));
  return t;
}

/** Weathered plaster albedo (multiplied by the material colour): soft blotches + rain streaks. */
const plasterTex = () =>
  once('plaster', () =>
    canvasTex(512, 512, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 512, 512);
      const r = rngOf(17);
      for (let i = 0; i < 70; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const rad = 20 + r() * 90;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        const dark = r() < 0.6;
        g.addColorStop(0, dark ? `rgba(120,105,85,${0.05 + r() * 0.08})` : `rgba(255,250,240,${0.08 + r() * 0.1})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 40; i++) {
        const x = r() * 512;
        const y = r() * 300;
        const len = 60 + r() * 200;
        const g = c.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(90,80,70,0.10)');
        g.addColorStop(1, 'rgba(90,80,70,0)');
        c.fillStyle = g;
        c.fillRect(x, y, 2 + r() * 5, len);
      }
    }),
  );

/** Faded abstract wall mural: concentric rings and a band of stepped motifs, mostly worn away. */
const muralTex = () =>
  once('mural', () =>
    canvasTex(
      1024,
      256,
      (c) => {
        c.clearRect(0, 0, 1024, 256);
        const r = rngOf(5);
        c.globalAlpha = 0.22;
        for (let i = 0; i < 4; i++) {
          const x = 140 + i * 250;
          for (let k = 0; k < 4; k++) {
            c.strokeStyle = ['#8E3B2A', '#3F6C77', '#B5893A', '#8E3B2A'][k];
            c.lineWidth = 9;
            c.beginPath();
            c.arc(x, 120, 70 - k * 15, 0, Math.PI * 2);
            c.stroke();
          }
        }
        c.globalAlpha = 0.12;
        c.fillStyle = '#5A3F2E';
        for (let x = 0; x < 1024; x += 32) c.fillRect(x, 214 + ((x / 32) % 2) * 8, 20, 10);
        // wear: wipe most of it back to plaster
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 160; i++) {
          c.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.5})`;
          c.beginPath();
          c.ellipse(r() * 1024, r() * 256, 10 + r() * 60, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
      },
      true,
      false,
    ),
  );

/** Blue-grey geometric band under the lintel (original stepped-lozenge pattern). */
const bandTex = () =>
  once('band', () =>
    canvasTex(512, 64, (c) => {
      c.fillStyle = '#5E6E7A';
      c.fillRect(0, 0, 512, 64);
      c.fillStyle = '#C9D2D8';
      c.fillRect(0, 4, 512, 4);
      c.fillRect(0, 56, 512, 4);
      for (let x = 0; x < 512; x += 64) {
        c.fillStyle = '#8FA2AF';
        c.beginPath();
        c.moveTo(x + 32, 12);
        c.lineTo(x + 52, 32);
        c.lineTo(x + 32, 52);
        c.lineTo(x + 12, 32);
        c.closePath();
        c.fill();
        c.fillStyle = '#34414B';
        c.fillRect(x + 26, 26, 12, 12);
        c.fillStyle = '#C9D2D8';
        c.fillRect(x + 2, 28, 6, 8);
        c.fillRect(x + 56, 28, 6, 8);
      }
    }),
  );

/** Lattice window screen (dark wood grid over a dim interior). */
const latticeTex = () =>
  once('lattice', () =>
    canvasTex(128, 128, (c) => {
      c.fillStyle = '#1E1612';
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#5A3A26';
      c.lineWidth = 7;
      for (let i = 0; i <= 128; i += 32) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, 128);
        c.moveTo(0, i);
        c.lineTo(128, i);
        c.stroke();
      }
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(0, 64);
      c.lineTo(64, 0);
      c.lineTo(128, 64);
      c.lineTo(64, 128);
      c.closePath();
      c.stroke();
    }),
  );

/** Hazard markings for the underpass wall: white triangle + stripes (alpha). */
const markingTex = () =>
  once('marking', () =>
    canvasTex(
      256,
      256,
      (c) => {
        c.clearRect(0, 0, 256, 256);
        c.fillStyle = 'rgba(238,238,232,0.92)';
        c.beginPath();
        c.moveTo(128, 30);
        c.lineTo(210, 170);
        c.lineTo(46, 170);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(40,40,40,0.9)';
        c.beginPath();
        c.moveTo(128, 70);
        c.lineTo(178, 155);
        c.lineTo(78, 155);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(238,238,232,0.92)';
        c.fillRect(20, 196, 216, 12);
        c.fillRect(20, 222, 150, 8);
      },
      true,
      false,
    ),
  );

/** Leaf cluster with alpha for hanging vines. */
const vineTex = () =>
  once('vine', () =>
    canvasTex(
      128,
      512,
      (c) => {
        c.clearRect(0, 0, 128, 512);
        const r = rngOf(9);
        c.strokeStyle = '#3B4A24';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(64, 0);
        for (let y = 0; y < 512; y += 32) c.lineTo(64 + Math.sin(y * 0.03) * 18, y);
        c.stroke();
        for (let i = 0; i < 220; i++) {
          const y = Math.pow(r(), 0.7) * 500;
          const spread = 18 + (1 - y / 512) * 40;
          const x = 64 + Math.sin(y * 0.03) * 18 + (r() - 0.5) * spread * 2;
          c.fillStyle = ['#4E7A34', '#3E6A2C', '#6E9446', '#5A8A3A'][Math.floor(r() * 4)];
          c.beginPath();
          c.ellipse(x, y, 5 + r() * 6, 3 + r() * 4, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
      },
      true,
      false,
    ),
  );

/** Floor decal sheet: 4 cells (crack, leaves, debris, moss). */
const decalTex = () =>
  once('decal', () =>
    canvasTex(
      512,
      512,
      (c) => {
        c.clearRect(0, 0, 512, 512);
        const r = rngOf(31);
        // 0: cracks
        c.strokeStyle = 'rgba(30,30,32,0.75)';
        for (let k = 0; k < 3; k++) {
          c.lineWidth = 2.5 - k * 0.6;
          c.beginPath();
          let x = 20 + r() * 40;
          let y = 40 + r() * 170;
          c.moveTo(x, y);
          for (let i = 0; i < 12; i++) {
            x += 14 + r() * 10;
            y += (r() - 0.5) * 30;
            c.lineTo(x, y);
          }
          c.stroke();
        }
        // 1: leaves
        for (let i = 0; i < 70; i++) {
          c.fillStyle = ['#8A6A2E', '#A57D35', '#6E5A2A', '#7B8A3A', '#5E4A26'][Math.floor(r() * 5)];
          c.beginPath();
          c.ellipse(276 + r() * 216, 20 + r() * 216, 4 + r() * 6, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
          c.fill();
        }
        // 2: debris (grit, chips, dust)
        const g = c.createRadialGradient(128, 384, 10, 128, 384, 120);
        g.addColorStop(0, 'rgba(110,100,88,0.45)');
        g.addColorStop(1, 'rgba(110,100,88,0)');
        c.fillStyle = g;
        c.fillRect(0, 256, 256, 256);
        for (let i = 0; i < 140; i++) {
          c.fillStyle = ['#5E5850', '#8C857A', '#3E3A36', '#A79C8C'][Math.floor(r() * 4)];
          const s = 1 + r() * 5;
          c.fillRect(20 + r() * 216, 276 + r() * 216, s, s * (0.5 + r()));
        }
        // 3: moss
        for (let i = 0; i < 260; i++) {
          const a = r() * Math.PI * 2;
          const d = Math.pow(r(), 0.6) * 100;
          c.fillStyle = ['#4F6A2C', '#3E5824', '#64803A', '#2F4420'][Math.floor(r() * 4)];
          c.globalAlpha = 0.5 + r() * 0.5;
          c.beginPath();
          c.arc(384 + Math.cos(a) * d, 384 + Math.sin(a) * d * 0.6, 2 + r() * 5, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
      },
      true,
      false,
    ),
  );

/** Smooth concrete with faint trowel marks and pores. */
const concreteTex = () =>
  once('concrete', () =>
    canvasTex(512, 512, (c) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 512, 512);
      const r = rngOf(77);
      for (let i = 0; i < 50; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const rad = 30 + r() * 120;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(90,95,100,${0.04 + r() * 0.06})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = `rgba(60,62,66,${0.08 + r() * 0.12})`;
        c.fillRect(r() * 512, r() * 512, 1.5, 1.5);
      }
      // saw-cut joint every half tile
      c.fillStyle = 'rgba(50,52,56,0.35)';
      c.fillRect(0, 254, 512, 3);
      c.fillRect(254, 0, 3, 512);
    }),
  );

/** Hazy sky dome gradient (pale blue-grey). */
export function hazeSkyTexture() {
  return once('sky', () =>
    canvasTex(
      16,
      512,
      (c) => {
        const g = c.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#8FA6BC');
        g.addColorStop(0.35, '#AFC0CF');
        g.addColorStop(0.5, '#CCD5DC');
        g.addColorStop(0.56, '#D6DCDF');
        g.addColorStop(1, '#C9CFD3');
        c.fillStyle = g;
        c.fillRect(0, 0, 16, 512);
      },
      true,
      false,
    ),
  );
}

// ------------------------------------------------------------------ materials
type Mats = Record<string, THREE.MeshStandardMaterial>;
let matsCache: Mats | null = null;
function M(): Mats {
  if (matsCache) return matsCache;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}, paint = 0.08) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, envMapIntensity: 0.5, ...extra });
    if (paint > 0) addPaintedLook(m, paint);
    return m;
  };
  const plaster = (color: string) => {
    const m = std(color, { map: plasterTex() }, 0.1);
    useMap(m, 'normalMap', 'plaster_normal.jpg', { normalScale: 0.8 });
    useMap(m, 'roughnessMap', 'plaster_rough.jpg');
    return m;
  };
  const brick = std('#FFFFFF', { roughness: 0.92 }, 0.05);
  useMap(brick, 'map', 'brick_albedo.jpg', { srgb: true });
  useMap(brick, 'normalMap', 'brick_normal.jpg', { normalScale: 1.2 });
  const flag = std('#C9C6C0', { roughness: 0.95 }, 0);
  useMap(flag, 'map', 'flagstone_albedo.jpg', { srgb: true });
  useMap(flag, 'normalMap', 'flagstone_normal.jpg', { normalScale: 1.4 });
  useMap(flag, 'roughnessMap', 'flagstone_rough.jpg');
  const concrete = std(COURTYARD_PALETTE.centerPad, { map: concreteTex(), roughness: 0.82 }, 0.04);
  useMap(concrete, 'normalMap', 'plaster_normal.jpg', { normalScale: 0.25 });
  const decal = (extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({
      map: decalTex(),
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      ...extra,
    });
  matsCache = {
    plasterSun: plaster(COURTYARD_PALETTE.plasterSun),
    plasterUpper: plaster(COURTYARD_PALETTE.plasterUpper),
    plasterLeft: plaster('#D9C7A8'),
    plasterAnnex: plaster('#CDBFA8'),
    plasterFar: plaster('#E6DCCB'),
    mural: (() => {
      const m = new THREE.MeshStandardMaterial({
        map: muralTex(),
        transparent: true,
        roughness: 0.9,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      return m;
    })(),
    brick,
    flag,
    concrete,
    curb: std('#8E9296', { map: concreteTex(), roughness: 0.85 }, 0.04),
    eave: std(COURTYARD_PALETTE.eaveWood, { roughness: 0.8 }),
    woodMid: std('#5C4030', { roughness: 0.8 }),
    woodLight: std('#7A5A3E', { roughness: 0.82 }),
    rafterRed: std('#7A3324', { roughness: 0.75 }),
    gold: std('#B88A3A', { roughness: 0.35, metalness: 0.75, envMapIntensity: 0.9 }, 0),
    shingle: std('#4A403A', { roughness: 0.9 }),
    interior: std('#5E3F22', { roughness: 1 }, 0),
    dark: std('#1C1714', { roughness: 1 }, 0),
    gunmetal: std('#3B4046', { roughness: 0.42, metalness: 0.65, envMapIntensity: 0.8 }, 0),
    steel: std('#8A9096', { roughness: 0.45, metalness: 0.55, envMapIntensity: 0.8 }, 0),
    conduit: std('#8C9296', { roughness: 0.5, metalness: 0.4 }, 0),
    olive: std('#5E6646', { roughness: 0.7, metalness: 0.15 }),
    oliveDark: std('#4A5238', { roughness: 0.7, metalness: 0.15 }),
    greyCase: std('#6E7378', { roughness: 0.6, metalness: 0.25 }),
    cable: std('#141414', { roughness: 0.55 }, 0),
    tarp: std(COURTYARD_PALETTE.tarp, { side: THREE.DoubleSide, roughness: 0.95, flatShading: true }),
    core: new THREE.MeshStandardMaterial({
      color: '#1C5E40',
      emissive: COURTYARD_PALETTE.core,
      emissiveIntensity: 1.25,
      roughness: 0.3,
      metalness: 0.1,
    }),
    glowGlass: new THREE.MeshStandardMaterial({
      color: '#2D7A55',
      emissive: COURTYARD_PALETTE.glow,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    }),
    lightPanel: new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: '#F4F6FF', emissiveIntensity: 1.6 }),
    band: std('#FFFFFF', { map: bandTex(), roughness: 0.7 }, 0),
    lattice: std('#FFFFFF', { map: latticeTex(), roughness: 0.85 }, 0),
    cloth: std('#C9502C', { side: THREE.DoubleSide, roughness: 0.95 }),
    clothB: std('#D98A2B', { side: THREE.DoubleSide, roughness: 0.95 }),
    stoneDark: std('#4B4744', { roughness: 0.9 }),
    coverFrame: std('#8C8277', { roughness: 0.78 }),
    coverPanel: std('#C49A3A', { roughness: 0.72 }),
    seam: std('#5C4A2A', { roughness: 0.8 }, 0),
    leaf: std('#4E7A34', { roughness: 0.95 }),
    leafB: std('#3D6A2E', { roughness: 0.95 }),
    leafC: std('#6A8F42', { roughness: 0.95 }),
    trunk: std('#4A3A2E', { roughness: 0.95 }),
    vine: new THREE.MeshStandardMaterial({ map: vineTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }),
    marking: new THREE.MeshStandardMaterial({
      map: markingTex(),
      transparent: true,
      depthWrite: false,
      roughness: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    decal: decal(),
    cliff: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, envMapIntensity: 0.25 }),
    farRoof: std('#4C4038', { roughness: 0.95 }, 0),
    whitewash: std('#EDE6DA', { roughness: 0.9 }, 0),
  };
  return matsCache;
}

// ------------------------------------------------------------------ geometry helpers
/** Box whose UVs are in metres / tile, so world-scale textures line up. */
function box(w: number, h: number, d: number, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x -x +y -y +z -z, 4 verts each
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
    }
  }
  return g;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const UNIT_CYL_LO = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

/** Collects geometry per material and merges it into one mesh per material. */
class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(private frame?: THREE.Matrix4) {}
  putM(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) {
      g = g.clone();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    const mm = this.frame ? this.frame.clone().multiply(m) : m;
    g.applyMatrix4(mm);
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }
  put(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    this.m4.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.s.set(sx, sy, sz));
    this.putM(geo, mat, this.m4);
  }
  /** Axis-aligned box from min/max corners (world-scale UVs). */
  aabb(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tile = 2) {
    this.put(box(x1 - x0, y1 - y0, z1 - z0, tile), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  /** Unit box scaled (no UV care: trims, beams). */
  cube(mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    this.put(UNIT_BOX, mat, x, y, z, rx, ry, rz, sx, sy, sz);
  }
  build(parent: THREE.Object3D, castShadow = true, receiveShadow = true) {
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const transparent = (mat as THREE.MeshStandardMaterial).transparent;
      mesh.castShadow = castShadow && !transparent && mat !== matsCache?.lightPanel;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

/** Beam between two points (unit box stretched along the segment). */
function beamBetween(B: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, tw: number, td: number) {
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(tw, len, td));
  B.putM(UNIT_BOX, mat, m);
}

function hangingVine(B: Batch, x: number, yTop: number, z: number, len: number, ry: number, w = 0.55) {
  const g = new THREE.PlaneGeometry(w, len);
  g.translate(0, -len / 2, 0);
  B.put(g, M().vine, x, yTop, z, 0, ry, 0);
}

// =====================================================================
// 1. Main tower facade (front plane z = -18.5, between the two piers)
// =====================================================================
const F = -18.5;

/** Hide the old centre-building dressing (front pieces only; interior and occluders untouched). */
function hideOldCenterFront(scene: THREE.Scene) {
  const grp = scene.getObjectByName('legacy-center-building');
  if (!grp) return;
  grp.updateMatrixWorld(true);
  const bb = new THREE.Box3();
  grp.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    bb.setFromObject(mesh);
    // thin pieces sitting on or in front of the facade plane (piers, upper wall, window dressing,
    // lanterns, plaque, pots, ornaments). Deep interior pieces start further back and are kept.
    if (bb.max.z > -18.95 && bb.min.z > -20.3) mesh.visible = false;
  });
}

export function createWatchtowerFacade(scene: THREE.Scene, opts: { lowQuality: boolean }): THREE.Group {
  hideOldCenterFront(scene);
  const K = M();
  const root = new THREE.Group();
  root.name = 'watchtower-facade';
  const B = new Batch();
  const P = { x0: -3.8, x1: 6.1, lowTop: 3.5 };

  // --- wall masses (same volumes as the hidden piers / upper wall) ---
  // lower storey: warm ochre
  B.aabb(K.plasterSun, -3.8, -1.95, 0, P.lowTop, -19.9, F);
  B.aabb(K.plasterSun, 2.4, 5.85, 0, P.lowTop, -19.9, F);
  // plinth course
  B.aabb(K.stoneDark, -3.85, -1.93, 0, 0.32, -19.9, F + 0.06);
  B.aabb(K.stoneDark, 2.38, 5.9, 0, 0.32, -19.9, F + 0.06);
  // upper storey: grey-beige
  B.aabb(K.plasterUpper, -3.8, -1.95, P.lowTop, 6.75, -19.9, F);
  B.aabb(K.plasterUpper, 2.4, 5.85, P.lowTop, 6.75, -19.9, F);
  // thin strips beside the window (kept shallow so they never reach into the 2F room)
  B.aabb(K.plasterUpper, -1.95, -1.75, P.lowTop, 6.75, -18.95, F);
  B.aabb(K.plasterUpper, 2.15, 2.4, P.lowTop, 6.75, -18.95, F);
  B.aabb(K.plasterUpper, -1.75, 2.15, P.lowTop, 4.05, -19.3, F); // spandrel
  B.aabb(K.plasterUpper, P.x0, P.x1, 6.75, 23, -19.9, F);
  // storey line between ochre and grey (thin timber band)
  B.aabb(K.eave, P.x0 - 0.04, 5.9, P.lowTop - 0.06, P.lowTop + 0.1, F, F + 0.1);

  // --- exposed brick where the plaster has fallen off (irregular patches) ---
  const brickPatch = (cx: number, cy: number, w: number, h: number, seed: number) => {
    const r = rngOf(seed);
    const s = new THREE.Shape();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.75 + r() * 0.35;
      const x = Math.cos(a) * (w / 2) * k;
      const y = Math.sin(a) * (h / 2) * k;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    const g = new THREE.ShapeGeometry(s);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + cx) / 1.6, (uv.getY(i) + cy) / 1.6);
    B.put(g, K.brick, cx, cy, F + 0.012);
  };
  brickPatch(3.25, 2.75, 1.4, 0.8, 1); // lower right, above the cover stack
  brickPatch(-3.35, 2.9, 0.8, 0.9, 2); // left corner
  brickPatch(4.3, 8.1, 1.0, 1.3, 3); // upper right corner
  brickPatch(-3.2, 7.6, 0.9, 1.0, 4);

  // --- 1F underpass: thick dark lintel + rafter ends + patterned band ---
  B.aabb(K.eave, -2.3, 2.75, 3.06, 3.55, -19.05, F + 0.22);
  for (let x = -2.15; x <= 2.65; x += 0.32) {
    B.cube(K.eave, x, 3.66, F + 0.32, 0.14, 0.16, 0.5);
    B.cube(K.rafterRed, x, 3.66, F + 0.58, 0.145, 0.165, 0.03);
  }
  B.cube(K.eave, 0.22, 3.79, F + 0.22, 5.2, 0.1, 0.6);
  {
    const band = new THREE.PlaneGeometry(4.9, 0.24);
    const uv = band.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6);
    B.put(band, K.band, 0.22, 3.2, F + 0.225);
  }
  // inside: two square recessed ceiling lights under the 2F slab
  for (const z of [-19.7, -21.6]) {
    B.cube(K.steel, 0.22, 3.09, z, 0.72, 0.04, 0.72);
    B.cube(K.lightPanel, 0.22, 3.065, z, 0.56, 0.02, 0.56);
  }
  // diagonal support post on the inner left wall
  beamBetween(B, K.woodMid, new THREE.Vector3(-1.87, 0.05, -19.3), new THREE.Vector3(-1.87, 3.0, -21.5), 0.12, 0.16);
  B.cube(K.woodMid, -1.87, 3.0, -21.0, 0.12, 0.14, 1.6);
  // white triangle + line markings on the inner left wall
  B.put(new THREE.PlaneGeometry(1.2, 1.2), K.marking, -1.935, 1.5, -22.4, 0, Math.PI / 2, 0);
  // green glowing glass panel at the far inner right
  B.cube(K.gunmetal, 1.55, 1.55, -26.17, 1.1, 2.1, 0.06);
  B.cube(K.glowGlass, 1.55, 1.55, -26.13, 0.92, 1.92, 0.03);

  // --- electrical cabinet + fan box right of the underpass ---
  {
    const x = 4.35;
    B.cube(K.oliveDark, x, 1.65, F + 0.2, 0.8, 1.7, 0.4);
    for (let i = 0; i < 6; i++) B.cube(K.steel, x, 2.32 + i * 0.065, F + 0.41, 0.7, 0.03, 0.05, -0.5, 0, 0); // louvres on top
    for (let i = 0; i < 3; i++) B.cube(K.olive, x - 0.24 + i * 0.24, 1.35, F + 0.405, 0.2, 0.95, 0.02); // vertical panels
    B.cube(K.gunmetal, x, 2.56, F + 0.22, 0.86, 0.06, 0.46);
    // fan box
    B.cube(K.greyCase, x, 0.48, F + 0.2, 0.8, 0.62, 0.4);
    B.put(new THREE.TorusGeometry(0.22, 0.03, 6, 20), K.gunmetal, x, 0.48, F + 0.41);
    B.put(new THREE.CircleGeometry(0.21, 20), K.dark, x, 0.48, F + 0.402);
    for (let i = 0; i < 3; i++) B.cube(K.steel, x, 0.48, F + 0.42, 0.42, 0.025, 0.02, 0, 0, (i * Math.PI) / 3);
    // conduit from the cabinet up into the wall
    B.put(UNIT_CYL_LO, K.conduit, x - 0.25, 3.05, F + 0.12, 0, 0, 0, 0.07, 0.9, 0.07);
  }

  // --- 2F window: deep wood frame, sliding plank shutter parked on the left, shelf ---
  {
    const wx0 = -1.75;
    const wx1 = 2.15;
    const top = 6.75;
    const sill = 4.05;
    B.aabb(K.eave, wx0 - 0.25, wx1 + 0.25, top, top + 0.26, F - 0.15, F + 0.22); // head
    B.aabb(K.eave, wx0 - 0.25, wx0, sill, top, F - 0.45, F + 0.22); // jambs (deep reveal)
    B.aabb(K.eave, wx1, wx1 + 0.25, sill, top, F - 0.45, F + 0.22);
    B.aabb(K.woodMid, wx0 - 0.35, wx1 + 0.35, sill - 0.1, sill, F - 0.4, F + 0.34); // shelf ledge
    for (const x of [wx0 + 0.2, (wx0 + wx1) / 2, wx1 - 0.2]) B.cube(K.eave, x, sill - 0.26, F + 0.15, 0.08, 0.32, 0.3, 0.6, 0, 0); // shelf brackets
    // interior back wall tinted dark ochre (seen through the open window)
    B.put(new THREE.PlaneGeometry(4.5, 3.8), K.interior, 0.25, 5.3, -22.9);
    // sliding shutter: vertical planks on a top rail, parked over the left wall so the opening stays clear
    B.cube(K.gunmetal, -0.9, top + 0.36, F + 0.24, 4.6, 0.05, 0.05);
    const shX = -2.85;
    for (let i = 0; i < 9; i++) {
      B.cube(i % 2 ? K.woodMid : K.woodLight, shX - 0.8 + i * 0.2, (sill + top) / 2, F + 0.3, 0.19, top - sill + 0.1, 0.06);
    }
    for (const y of [sill + 0.3, top - 0.3]) B.cube(K.eave, shX, y, F + 0.35, 1.8, 0.1, 0.04);
    // wood canopy with dense dentils
    B.aabb(K.eave, wx0 - 0.55, wx1 + 0.75, top + 0.42, top + 0.6, F, F + 1.0);
    B.aabb(K.woodMid, wx0 - 0.5, wx1 + 0.7, top + 0.6, top + 0.66, F, F + 0.92);
    for (let x = wx0 - 0.45; x <= wx1 + 0.66; x += 0.17) B.cube(K.woodMid, x, top + 0.34, F + 0.88, 0.09, 0.12, 0.12);
    for (let x = wx0 - 0.4; x <= wx1 + 0.6; x += 0.5) B.cube(K.eave, x, top + 0.34, F + 0.45, 0.1, 0.12, 0.9);
    // equipment on the canopy: vent canisters grouped as a pair + trio on a shared skid
    const y0 = top + 0.66;
    B.cube(K.gunmetal, -0.4, y0 + 0.03, F + 0.5, 2.4, 0.06, 0.5);
    [
      [-1.3, 0.5, 0.17],
      [-0.95, 0.42, 0.15],
      [-0.2, 0.56, 0.19],
      [0.18, 0.48, 0.16],
      [0.5, 0.36, 0.13],
    ].forEach(([x, h, r]) => {
      B.put(UNIT_CYL, K.steel, x, y0 + 0.06 + h / 2, F + 0.5, 0, 0, 0, r * 2, h, r * 2);
      B.put(UNIT_CYL, K.gunmetal, x, y0 + 0.08 + h, F + 0.5, 0, 0, 0, r * 2.15, 0.05, r * 2.15);
    });
    B.put(UNIT_CYL_LO, K.conduit, -0.57, y0 + 0.3, F + 0.5, 0, 0, Math.PI / 2, 0.06, 1.0, 0.06);
    // small dish antenna on a bracket at the right end
    const dx = wx1 + 0.55;
    B.cube(K.gunmetal, dx, y0 + 0.35, F + 0.6, 0.05, 0.7, 0.05);
    B.cube(K.gunmetal, dx, y0 + 0.66, F + 0.68, 0.05, 0.05, 0.2);
    const dish = new THREE.SphereGeometry(0.26, 16, 6, 0, Math.PI * 2, 0, Math.PI / 3.2);
    B.put(dish, K.steel, dx, y0 + 0.74, F + 0.82, -1.15, 0.35, 0);
    B.put(UNIT_CYL_LO, K.gunmetal, dx + 0.07, y0 + 0.82, F + 0.98, -1.15, 0.35, 0, 0.025, 0.3, 0.025);
    // conduit bending down the left of the window into a cylindrical junction box
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.25, top + 0.5, F + 0.08),
      new THREE.Vector3(-2.25, 5.4, F + 0.08),
      new THREE.Vector3(-2.35, 5.0, F + 0.08),
      new THREE.Vector3(-2.75, 4.85, F + 0.08),
      new THREE.Vector3(-3.05, 4.85, F + 0.08),
    ]);
    B.put(new THREE.TubeGeometry(path, 24, 0.045, 6), K.conduit, 0, 0, 0);
    B.put(UNIT_CYL, K.oliveDark, -3.2, 4.85, F + 0.14, Math.PI / 2, 0, 0, 0.34, 0.2, 0.34);
    B.put(UNIT_CYL, K.steel, -3.2, 4.85, F + 0.25, Math.PI / 2, 0, 0, 0.26, 0.04, 0.26);
    // thin vertical blade-sign bracket on the left corner
    B.cube(K.gunmetal, -3.79, 5.6, F + 0.35, 0.05, 0.05, 0.7);
    B.cube(K.gunmetal, -3.79, 4.2, F + 0.35, 0.05, 0.05, 0.7);
    B.cube(K.eave, -3.79, 4.9, F + 0.62, 0.06, 1.6, 0.3);
    B.cube(K.band, -3.75, 4.9, F + 0.62, 0.01, 1.4, 0.22);
  }

  // --- upper wall: moulding band, three medallions (arched arrangement), corner bracket ---
  {
    B.aabb(K.woodMid, P.x0 - 0.05, P.x1 + 0.05, 11.3, 11.5, F, F + 0.16);
    B.aabb(K.plasterSun, P.x0 - 0.05, P.x1 + 0.05, 11.5, 11.62, F, F + 0.1);
    // dark plank the medallions hang from
    B.aabb(K.eave, -2.6, 3.0, 10.55, 10.75, F, F + 0.1);
    const med = (x: number, y: number, r: number) => {
      B.put(UNIT_CYL, K.eave, x, y, F + 0.08, Math.PI / 2, 0, 0, r * 2.3, 0.16, r * 2.3);
      B.put(UNIT_CYL, K.gold, x, y, F + 0.2, Math.PI / 2, 0, 0, r * 2, 0.12, r * 2);
      B.put(new THREE.TorusGeometry(r * 0.72, r * 0.08, 6, 24), K.eave, x, y, F + 0.27);
      // eight raised petals
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        B.put(new THREE.SphereGeometry(r * 0.17, 8, 6), K.gold, x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, F + 0.27, 0, 0, 0, 1, 1, 0.5);
      }
      B.put(new THREE.SphereGeometry(r * 0.22, 10, 8), K.rafterRed, x, y, F + 0.29, 0, 0, 0, 1, 1, 0.6);
    };
    med(-1.85, 9.6, 0.42);
    med(0.2, 9.95, 0.62);
    med(2.25, 9.6, 0.42);
    // wood bracket + small finial at the top-left corner
    B.cube(K.eave, -3.55, 12.4, F + 0.3, 0.3, 0.3, 0.6);
    beamBetween(B, K.eave, new THREE.Vector3(-3.55, 11.75, F + 0.05), new THREE.Vector3(-3.55, 12.3, F + 0.55), 0.16, 0.16);
    B.put(new THREE.ConeGeometry(0.14, 0.4, 8), K.gold, -3.55, 12.75, F + 0.45);
    B.put(new THREE.SphereGeometry(0.1, 8, 6), K.gold, -3.55, 12.58, F + 0.45);
  }

  // --- deep top-right eave with dense rafters, cloth, vines, heavy stone block ---
  {
    const ex0 = 0.9;
    const ex1 = 6.1;
    const ey = 13.2;
    B.aabb(K.eave, ex0, ex1 + 0.2, ey, ey + 0.22, F, F + 1.7); // eave board
    B.aabb(K.woodMid, ex0 - 0.1, ex1 + 0.3, ey + 0.22, ey + 0.32, F, F + 1.85);
    B.aabb(K.shingle, ex0 - 0.15, ex1 + 0.35, ey + 0.32, ey + 0.55, F - 0.2, F + 1.95);
    for (let x = ex0 + 0.1; x <= ex1; x += 0.2) {
      B.cube(K.eave, x, ey - 0.12, F + 0.85, 0.1, 0.14, 1.7);
      B.cube(K.rafterRed, x, ey - 0.12, F + 1.71, 0.105, 0.145, 0.03);
    }
    for (let x = ex0 + 0.2; x <= ex1; x += 0.45) B.cube(K.woodMid, x, ey - 0.33, F + 0.5, 0.12, 0.16, 1.0);
    // heavy dark stone / equipment block under the eave
    B.aabb(K.stoneDark, 2.9, 4.6, 11.75, 12.95, F, F + 0.85);
    B.aabb(K.gunmetal, 2.95, 4.55, 12.95, 13.0, F, F + 0.8);
    B.cube(K.steel, 3.75, 12.35, F + 0.87, 1.0, 0.5, 0.04);
    // orange-red cloth hanging from the corner
    {
      const g = new THREE.PlaneGeometry(0.9, 2.2, 6, 10);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 7 + y * 2) * 0.06 + (1.1 - y) * 0.08);
      }
      g.computeVertexNormals();
      B.put(g, K.cloth, 4.5, ey - 1.25, F + 1.55, 0, -0.25, 0.04);
      const g2 = new THREE.PlaneGeometry(0.5, 1.5, 4, 8);
      B.put(g2, K.clothB, 4.0, ey - 0.9, F + 1.6, 0, 0.15, -0.05);
    }
    for (const [x, len] of [
      [1.4, 2.4],
      [2.1, 3.6],
      [2.9, 1.8],
      [3.5, 2.9],
    ] as const)
      hangingVine(B, x, ey - 0.15, F + 1.55, len, 0.1);
    // top crown of the tower
    B.aabb(K.eave, P.x0 - 0.3, P.x1 + 0.3, 22.7, 23.05, F - 1.6, F + 0.6);
    for (let x = P.x0 - 0.2; x <= P.x1 + 0.2; x += 0.24) B.cube(K.rafterRed, x, 22.6, F + 0.5, 0.1, 0.12, 0.25);
    B.aabb(K.shingle, P.x0 - 0.45, P.x1 + 0.45, 23.05, 23.3, F - 1.8, F + 0.8);
    B.put(new THREE.ConeGeometry(0.35, 1.3, 8), K.gold, 1.15, 23.95, -19.2);
  }

  // --- reinforced cover stacks flanking the entrance (outside the play circle: unreachable) ---
  const stack = (cx: number, w: number, seed: number) => {
    for (let i = 0; i < 2; i++) {
      const b = createReinforcedCoverBox(w, 1.08, 1.0, { seed: seed + i });
      b.position.set(cx + (i ? 0.06 : 0), i * 1.08, -17.92);
      b.rotation.y = i ? 0.04 : 0;
      root.add(b);
    }
  };
  stack(-3.3, 1.7, 10);
  stack(3.2, 1.3, 20);

  B.build(root);
  if (!opts.lowQuality) {
    const l = new THREE.PointLight('#EEF3FF', 2.2, 6, 1.6);
    l.position.set(0.22, 2.7, -20.6);
    root.add(l);
  }
  return root;
}

// =====================================================================
// 2. Reinforced cover box: taupe frame, recessed mustard panels with a '+'
//    seam, big protruding A braces on every side. Origin at bottom centre.
// =====================================================================
const coverCache = new Map<string, THREE.BufferGeometry[]>();
export function createReinforcedCoverBox(w: number, h: number, d: number, opts: { seed?: number } = {}): THREE.Group {
  const K = M();
  const g = new THREE.Group();
  g.name = 'reinforced-cover-box';
  const key = `${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)}`;
  void opts;
  let cached = coverCache.get(key);
  if (!cached) {
    const tmp = new THREE.Group();
    const B = new Batch();
    const t = Math.min(0.15, Math.min(w, h, d) * 0.12);
    // recessed core
    B.aabb(K.coverPanel, -w / 2 + 0.05, w / 2 - 0.05, 0.05, h - 0.05, -d / 2 + 0.05, d / 2 - 0.05, 1.2);
    // 12 frame beams
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) B.cube(K.coverFrame, sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2), t, h, t);
    for (const sy of [t / 2, h - t / 2]) {
      for (const sz of [-1, 1]) B.cube(K.coverFrame, 0, sy, sz * (d / 2 - t / 2), w, t, t);
      for (const sx of [-1, 1]) B.cube(K.coverFrame, sx * (w / 2 - t / 2), sy, 0, t, t, d - 2 * t);
    }
    // faces: '+' seam + A brace (two legs + crossbar), protruding past the frame
    const faces = [
      { ry: 0, span: w, depth: d },
      { ry: Math.PI, span: w, depth: d },
      { ry: Math.PI / 2, span: d, depth: w },
      { ry: -Math.PI / 2, span: d, depth: w },
    ];
    for (const f of faces) {
      const frame = new THREE.Matrix4().makeRotationY(f.ry);
      const FB = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
          new THREE.Vector3(sx, sy, sz),
        );
        B.putM(UNIT_BOX, sx < 0.03 || sy < 0.03 ? K.seam : K.coverFrame, frame.clone().multiply(m));
      };
      const z = f.depth / 2 - 0.045;
      const inner = f.span - 2 * t;
      const ih = h - 2 * t;
      FB(0, h / 2, z + 0.006, inner, 0.02, 0.01);
      FB(0, h / 2, z + 0.006, 0.02, ih, 0.01);
      // A brace
      const bw = t * 0.9;
      const zb = f.depth / 2 + 0.03;
      const legLen = Math.hypot(inner / 2, ih);
      const ang = Math.atan2(inner / 2, ih);
      for (const s of [-1, 1]) FB((s * inner) / 4, h / 2, zb, bw, legLen, 0.09, s * ang);
      FB(0, t + ih * 0.38, zb, inner * 0.62, bw * 0.85, 0.09);
      // bolts at the apex and feet
      FB(0, h - t * 0.9, zb + 0.05, 0.08, 0.08, 0.03);
    }
    B.build(tmp);
    cached = tmp.children.map((c) => {
      const mesh = c as THREE.Mesh;
      mesh.geometry.userData.mat = mesh.material;
      return mesh.geometry;
    });
    coverCache.set(key, cached);
  }
  for (const geo of cached) {
    const mesh = new THREE.Mesh(geo, geo.userData.mat as THREE.Material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// =====================================================================
// 3. Glowing crate cluster (replaces the crate bank's look, same footprint)
//    Local frame of the bank group: x in [-3.6, 3.6], z in [-1.07, 1.07].
// =====================================================================
function trussContainer(B: Batch, cx: number, y0: number, cz: number, L: number, H: number, D: number) {
  const K = M();
  const t = 0.11;
  // glowing core, inset
  B.aabb(K.core, cx - L / 2 + 0.12, cx + L / 2 - 0.12, y0 + 0.1, y0 + H - 0.1, cz - D / 2 + 0.12, cz + D / 2 - 0.12, 1);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) B.cube(K.gunmetal, cx + sx * (L / 2 - t / 2), y0 + H / 2, cz + sz * (D / 2 - t / 2), t, H, t);
  for (const sy of [y0 + t / 2, y0 + H - t / 2]) {
    for (const sz of [-1, 1]) B.cube(K.gunmetal, cx, sy, cz + sz * (D / 2 - t / 2), L, t, t);
    for (const sx of [-1, 1]) B.cube(K.gunmetal, cx + sx * (L / 2 - t / 2), sy, cz, t, t, D - 2 * t);
  }
  // long sides: X braces per bay; ends: V brace
  const bays = Math.max(1, Math.round(L / 1.25));
  const bw = L / bays;
  for (const sz of [-1, 1]) {
    const z = cz + sz * (D / 2 - t / 2);
    for (let b = 0; b < bays; b++) {
      const x0 = cx - L / 2 + b * bw + t / 2;
      const x1 = x0 + bw - t;
      if (b > 0) B.cube(K.gunmetal, x0 - t / 2, y0 + H / 2, z, t * 0.9, H, t * 0.9);
      beamBetween(B, K.gunmetal, new THREE.Vector3(x0, y0 + t, z), new THREE.Vector3(x1, y0 + H - t, z), 0.07, 0.07);
      beamBetween(B, K.gunmetal, new THREE.Vector3(x0, y0 + H - t, z), new THREE.Vector3(x1, y0 + t, z), 0.07, 0.07);
    }
  }
  for (const sx of [-1, 1]) {
    const x = cx + sx * (L / 2 - t / 2);
    beamBetween(B, K.gunmetal, new THREE.Vector3(x, y0 + H - t, cz - D / 2 + t), new THREE.Vector3(x, y0 + t, cz), 0.07, 0.07);
    beamBetween(B, K.gunmetal, new THREE.Vector3(x, y0 + t, cz), new THREE.Vector3(x, y0 + H - t, cz + D / 2 - t), 0.07, 0.07);
  }
}

function militaryCase(B: Batch, mat: THREE.Material, cx: number, y0: number, cz: number, w: number, h: number, d: number, ry = 0) {
  const K = M();
  const fr = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, y0, cz);
  const P = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    B.putM(geo, m, fr.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz))));
  P(UNIT_BOX, mat, 0, h / 2, 0, w, h, d);
  P(UNIT_BOX, K.gunmetal, 0, h * 0.72, 0, w + 0.02, 0.04, d + 0.02); // lid seam
  for (const sx of [-1, 1]) {
    P(UNIT_BOX, K.gunmetal, sx * (w / 2 - 0.08), h / 2, 0, 0.05, h + 0.01, d + 0.02); // corner straps
    P(UNIT_BOX, K.steel, sx * (w / 2 + 0.02), h * 0.55, 0, 0.03, 0.06, d * 0.35); // handles
  }
  P(UNIT_BOX, K.steel, 0, h * 0.62, d / 2 + 0.01, 0.12, 0.08, 0.02); // latch
}

/** Draped tarp: a height field over the supports with angular folds and triangular rips. */
function buildTarp(supports: Array<{ x0: number; x1: number; z0: number; z1: number; top: number }>, area: { x0: number; x1: number; z0: number; z1: number }, seed: number) {
  const r = rngOf(seed);
  const nx = 26;
  const nz = 11;
  const pts: THREE.Vector3[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = area.x0 + ((area.x1 - area.x0) * i) / nx;
      const z = area.z0 + ((area.z1 - area.z0) * j) / nz;
      let y = 0.03;
      for (const s of supports) {
        const dx = Math.max(s.x0 - x, 0, x - s.x1);
        const dz = Math.max(s.z0 - z, 0, z - s.z1);
        const dist = Math.hypot(dx, dz);
        y = Math.max(y, s.top + 0.03 - dist * 2.1);
      }
      y += (r() - 0.5) * 0.07;
      // pull hanging cloth slightly inwards so it hugs the sides
      pts.push(new THREE.Vector3(x, Math.max(0.03, y), z));
    }
  }
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx = (i: number, j: number) => j * (nx + 1) + i;
  const tri = (a: number, b: number, c: number) => {
    // rips: drop a few triangles on the hanging sides to reveal the green truss
    const ya = (pts[a].y + pts[b].y + pts[c].y) / 3;
    const hanging = ya > 0.25 && ya < 1.6;
    if (hanging && r() < 0.09) return;
    for (const k of [a, b, c]) {
      pos.push(pts[k].x, pts[k].y, pts[k].z);
      uvs.push(pts[k].x * 0.5, pts[k].z * 0.5);
    }
  };
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      tri(idx(i, j), idx(i, j + 1), idx(i + 1, j));
      tri(idx(i + 1, j), idx(i, j + 1), idx(i + 1, j + 1));
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

export function createGlowingCrateCluster(opts: { lowQuality: boolean }): THREE.Group {
  const K = M();
  const root = new THREE.Group();
  root.name = 'glowing-crate-cluster';
  const B = new Batch();
  // two long containers side by side
  trussContainer(B, -1.6, 0, -0.53, 3.9, 1.15, 1.0);
  trussContainer(B, -1.6, 0, 0.53, 3.9, 1.15, 1.0);
  // one stacked on top, toward the left
  trussContainer(B, -2.25, 1.15, 0, 2.55, 1.22, 1.75);
  // stepped platform on the right with olive / grey military cases
  B.aabb(K.curb, 0.55, 3.55, 0, 0.42, -1.0, 1.0, 1);
  B.aabb(K.gunmetal, 0.5, 3.6, 0.42, 0.46, -1.04, 1.04);
  militaryCase(B, K.olive, 1.3, 0.46, -0.42, 1.2, 0.56, 0.86);
  militaryCase(B, K.oliveDark, 1.3, 0.46, 0.5, 1.1, 0.5, 0.8, 0.05);
  militaryCase(B, K.greyCase, 1.28, 1.02, -0.4, 0.95, 0.42, 0.7, -0.06);
  militaryCase(B, K.olive, 2.75, 0.46, -0.2, 1.3, 0.62, 1.1, 0.03);
  militaryCase(B, K.greyCase, 2.8, 1.08, -0.25, 0.8, 0.36, 0.55, -0.1);
  militaryCase(B, K.oliveDark, 3.15, 0.46, 0.72, 0.6, 0.4, 0.45, 0.2);
  // tarp over the stacked container and part of the right step
  const tarp = buildTarp(
    [
      { x0: -3.5, x1: -1.0, z0: -0.85, z1: 0.85, top: 2.37 },
      { x0: -3.55, x1: 0.35, z0: -1.03, z1: 1.03, top: 1.15 },
      { x0: 0.7, x1: 1.9, z0: -0.85, z1: 0.0, top: 1.44 },
      { x0: 0.7, x1: 1.85, z0: 0.1, z1: 0.9, top: 0.96 },
    ],
    { x0: -3.75, x1: 2.0, z0: -1.12, z1: 1.12 },
    7,
  );
  B.put(tarp, K.tarp, 0, 0, 0);
  // tie-down straps over the tarp
  for (const x of [-2.9, -1.6]) B.cube(K.oliveDark, x, 2.41, 0, 0.07, 0.02, 1.8);
  B.build(root);
  if (!opts.lowQuality) {
    const glow = new THREE.PointLight(COURTYARD_PALETTE.glow, 1.8, 5, 2);
    glow.position.set(-0.6, 0.9, 1.9);
    root.add(glow);
  }
  return root;
}

/** Hide the old crate bank meshes (they still occlude shots) and dress it with the cluster. */
export function dressCrateBank(scene: THREE.Scene, lowQuality: boolean) {
  const bank = scene.getObjectByName('legacy-crate-bank');
  if (!bank) return;
  bank.children.forEach((c) => (c.visible = false));
  bank.add(createGlowingCrateCluster({ lowQuality }));
}

// =====================================================================
// 4. Courtyard perimeter: low left wall, annex in the rear-left corner,
//    a two-storey building and a big tree behind the wall.
// =====================================================================
/** Frame of the old left building: facade plane at local x = 0.81 facing +x, wall runs along local z. */
const leftFrame = () => new THREE.Matrix4().makeRotationY(0.34).setPosition(-10.8, 0, -5.2);

function steppedEave(B: Batch, x0: number, x1: number, y: number, depth: number, rafterStep = 0.26) {
  // two tiers of dark boards with rafter ends between them; built along x, facing +z
  const K = M();
  B.aabb(K.eave, x0, x1, y, y + 0.14, 0, depth * 0.6);
  for (let x = x0 + 0.1; x < x1; x += rafterStep) {
    B.cube(K.eave, x, y + 0.22, depth * 0.45, 0.09, 0.1, depth * 0.9);
    B.cube(K.rafterRed, x, y + 0.22, depth * 0.9 + 0.01, 0.092, 0.102, 0.02);
  }
  B.aabb(K.eave, x0 - 0.1, x1 + 0.1, y + 0.27, y + 0.42, -0.1, depth + 0.05);
  B.aabb(K.shingle, x0 - 0.15, x1 + 0.15, y + 0.42, y + 0.58, -0.2, depth + 0.12);
}

export function createCourtyardPerimeter(scene: THREE.Scene, opts: { lowQuality: boolean }): THREE.Group {
  void scene;
  const K = M();
  const root = new THREE.Group();
  root.name = 'courtyard-perimeter';

  // ---------------- low left wall (in the old left building's frame) ----------------
  {
    // Inside the eave helper, x runs along the wall and +z faces the courtyard, so rotate
    // local (x along wall, z out) into the left frame (wall along local z, facing +x).
    const along = leftFrame().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.81));
    // after that rotation: local x -> -z of the left frame, local z -> +x (courtyard side)
    const B = new Batch(along);
    const z0 = -7; // wall from left-frame z +7 (front) ...
    const z1 = 13.2; // ... to -13.2 (rear): in 'along' x = -z
    const H = 3.4;
    B.aabb(K.plasterLeft, z0, z1, 0, H, -0.85, 0);
    B.aabb(K.stoneDark, z0, z1, 0, 0.35, -0.85, 0.06);
    // faint mural stains (two long panels)
    for (const [cx, w] of [
      [-1.5, 6.5],
      [7.2, 6.0],
    ] as const) {
      B.put(new THREE.PlaneGeometry(w, 1.6), K.mural, cx, 1.9, 0.012);
    }
    steppedEave(B, z0, z1, H, 0.75);
    // timber posts every few metres + brick where plaster has fallen
    for (let x = z0 + 2.5; x < z1; x += 4.2) B.aabb(K.eave, x - 0.12, x + 0.12, 0.35, H, 0, 0.1);
    for (const [cx, cy, w, h] of [
      [2.3, 0.9, 1.2, 0.7],
      [10.4, 2.4, 0.9, 0.8],
    ] as const) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 1.6, (uv.getY(i) * h) / 1.6);
      B.put(g, K.brick, cx, cy, 0.011);
    }
    // vines spilling over the eave
    const r = rngOf(41);
    for (let i = 0; i < 9; i++) {
      const x = z0 + 1 + r() * (z1 - z0 - 2);
      hangingVine(B, x, H + 0.35, 0.82, 1.2 + r() * 1.8, r() * 0.3, 0.5 + r() * 0.3);
    }
    B.build(root);
  }

  // ---------------- two-storey building behind the left wall ----------------
  {
    // building frame: front faces the courtyard, 6 m behind the wall line
    const fr = leftFrame().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(6, 0, -6.2));
    const B = new Batch(fr);
    const w = 9.5;
    const d = 6;
    const h1 = 3.6;
    const h2 = 3.2;
    B.aabb(K.plasterFar, -w / 2, w / 2, 0, h1, -d, 0);
    B.aabb(K.eave, -w / 2 - 0.1, w / 2 + 0.1, h1 - 0.05, h1 + 0.25, -d, 0.15);
    for (let x = -w / 2; x <= w / 2; x += 0.3) B.cube(K.rafterRed, x, h1 + 0.1, 0.22, 0.1, 0.12, 0.14);
    B.aabb(K.plasterUpper, -w / 2, w / 2, h1 + 0.25, h1 + h2, -d, -0.9); // upper storey set back behind a gallery
    // gallery: dark wood railing + posts + lattice windows
    B.aabb(K.woodMid, -w / 2, w / 2, h1 + 0.25, h1 + 0.35, -0.95, 0.2);
    for (let x = -w / 2 + 0.1; x <= w / 2; x += 0.16) B.cube(K.eave, x, h1 + 0.75, 0.12, 0.05, 0.75, 0.05);
    B.aabb(K.eave, -w / 2, w / 2, h1 + 1.1, h1 + 1.2, 0.02, 0.22);
    for (let x = -w / 2 + 0.15; x <= w / 2; x += 1.55) B.cube(K.eave, x, h1 + h2 / 2 + 0.15, 0.1, 0.16, h2 - 0.1, 0.16);
    for (const x of [-3.1, -0.8, 1.5, 3.6]) {
      B.aabb(K.eave, x - 0.62, x + 0.62, h1 + 0.9, h1 + 2.6, -0.92, -0.86);
      B.put(new THREE.PlaneGeometry(1.0, 1.5), K.lattice, x, h1 + 1.75, -0.85);
    }
    // ground-floor windows and door
    for (const x of [-3, 2.6]) B.aabb(K.dark, x - 0.5, x + 0.5, 1.1, 2.4, -0.05, 0.01);
    B.aabb(K.woodMid, -0.6, 0.6, 0, 2.4, -0.05, 0.02);
    // pitched roof with deep eaves
    const roof = new THREE.Shape();
    roof.moveTo(-d / 2 - 1.3, 0);
    roof.lineTo(d / 2 + 1.3, 0);
    roof.lineTo(0, 2.2);
    roof.closePath();
    const rg = new THREE.ExtrudeGeometry(roof, { depth: w + 2.4, bevelEnabled: false });
    rg.translate(0, 0, -(w + 2.4) / 2);
    B.put(rg, K.shingle, 0, h1 + h2, -d / 2, 0, Math.PI / 2, 0);
    B.aabb(K.eave, -w / 2 - 1.2, w / 2 + 1.2, h1 + h2 - 0.18, h1 + h2, -d - 1.3, 1.3);
    // faint red-brown circular motif on the side wall
    const ring = new THREE.RingGeometry(0.75, 0.95, 32);
    B.put(ring, K.rafterRed, w / 2 + 0.012, h1 + 1.6, -d / 2, 0, Math.PI / 2, 0);
    B.put(new THREE.CircleGeometry(0.35, 24), K.rafterRed, w / 2 + 0.012, h1 + 1.6, -d / 2, 0, Math.PI / 2, 0);
    B.build(root, !opts.lowQuality);
  }

  // ---------------- big tree behind the left wall ----------------
  {
    const p = new THREE.Vector3(-3.6, 0, -1).applyMatrix4(leftFrame());
    const B = new Batch();
    B.put(new THREE.CylinderGeometry(0.28, 0.5, 5.5, 10), K.trunk, p.x, 2.75, p.z, 0, 0, 0.06);
    beamBetween(B, K.trunk, new THREE.Vector3(p.x + 0.1, 4.2, p.z), new THREE.Vector3(p.x + 1.6, 6.4, p.z + 0.6), 0.22, 0.22);
    beamBetween(B, K.trunk, new THREE.Vector3(p.x, 4.6, p.z), new THREE.Vector3(p.x - 1.3, 6.6, p.z - 0.5), 0.2, 0.2);
    const blob = new THREE.IcosahedronGeometry(1, 2);
    const r = rngOf(12);
    const leaves = [K.leaf, K.leafB, K.leafC];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const rr = r() * 2.4;
      const s = 1.4 + r() * 1.2;
      B.put(blob, leaves[i % 3], p.x + Math.cos(a) * rr, 6.6 + r() * 2.6, p.z + Math.sin(a) * rr, 0, 0, 0, s, s * 0.85, s);
    }
    B.build(root, true);
  }

  // ---------------- 1F annex in the rear-left inner corner ----------------
  {
    // front faces +z on the centre building's facade line (outside the play circle)
    const B = new Batch(new THREE.Matrix4().makeTranslation(0, 0, F));
    const x0 = -14.6;
    const x1 = -3.85;
    const H = 3.5;
    B.aabb(K.plasterAnnex, x0, x1, 0, H, -3.5, 0);
    B.aabb(K.stoneDark, x0, x1, 0, 0.3, -3.5, 0.06);
    steppedEave(B, x0, x1, H, 0.95, 0.22);
    // second, higher roof step behind
    B.aabb(K.plasterAnnex, x0, x1, H + 0.58, H + 1.5, -3.5, -1.2);
    B.aabb(K.eave, x0 - 0.1, x1 + 0.1, H + 1.5, H + 1.65, -3.6, -0.6);
    for (let x = x0; x < x1; x += 0.24) B.cube(K.rafterRed, x, H + 1.45, -0.62, 0.09, 0.1, 0.06);
    B.aabb(K.shingle, x0 - 0.15, x1 + 0.15, H + 1.65, H + 1.8, -3.7, -0.5);
    // five small dark niches under the eave
    for (let i = 0; i < 5; i++) {
      const x = -12.9 + i * 0.62;
      B.aabb(K.dark, x - 0.2, x + 0.2, 2.55, 3.05, -0.12, 0.005);
      B.aabb(K.eave, x - 0.26, x + 0.26, 2.48, 2.55, -0.05, 0.08);
    }
    // recessed wooden door with a heavy frame
    B.aabb(K.eave, -8.25, -6.55, 0, 2.6, -0.04, 0.14);
    B.aabb(K.woodMid, -8.0, -6.8, 0, 2.35, -0.3, -0.04);
    for (let x = -7.95; x < -6.8; x += 0.2) B.cube(K.eave, x, 1.17, -0.035, 0.02, 2.3, 0.01);
    B.aabb(K.eave, -8.4, -6.4, 2.6, 2.78, -0.04, 0.22);
    // a small window with lattice
    B.aabb(K.eave, -11.1, -10.0, 1.2, 2.2, -0.04, 0.1);
    B.put(new THREE.PlaneGeometry(0.9, 0.8), K.lattice, -10.55, 1.7, -0.03);
    // vines
    const r = rngOf(77);
    for (let i = 0; i < 6; i++) hangingVine(B, x0 + 0.8 + r() * (x1 - x0 - 1.6), H + 0.4, 1.0, 1.2 + r() * 1.6, 0);
    // pallet / ladder frame leaning in the shaded corner
    {
      const lx = -12.4;
      const lean = 0.28;
      for (const sx of [-0.28, 0.28]) B.put(UNIT_BOX, K.woodLight, lx + sx, 1.25, 0.42, lean, 0, 0, 0.08, 2.6, 0.08);
      for (let k = 0; k < 7; k++) {
        const y = 0.25 + k * 0.33;
        B.put(UNIT_BOX, K.woodMid, lx, y, 0.42 + (1.25 - y) * Math.tan(lean), lean, 0, 0, 0.6, 0.05, 0.06);
      }
      // a pallet on its side next to it
      for (let k = 0; k < 5; k++) B.put(UNIT_BOX, K.woodLight, lx + 1.3, 0.55, 0.25 + k * 0.0, 0.15, 0, 0, 1.1, 0.1, 0.03);
      for (let k = 0; k < 3; k++) B.cube(K.woodMid, lx + 0.85 + k * 0.45, 0.55, 0.32, 0.1, 1.1, 0.1);
    }
    B.build(root, true);
  }
  return root;
}

// =====================================================================
// 5. Distant cliffs, haze village and a small dome stupa
// =====================================================================
export function createDistantCliffs(opts: { lowQuality: boolean }): THREE.Group {
  const K = M();
  const root = new THREE.Group();
  root.name = 'distant-cliffs';
  const r = rngOf(2024);

  // huge vertical cliff silhouettes on a ring, tallest behind the tower
  {
    const parts: THREE.BufferGeometry[] = [];
    const low = new THREE.Color('#6E7C89');
    const high = new THREE.Color('#B4BFC9');
    const snow = new THREE.Color('#E4E9ED');
    const count = opts.lowQuality ? 18 : 28;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.15;
      // bias: mostly in the -z half (behind the tower) and the sides
      const back = Math.max(0, -Math.sin(a));
      const R = 135 + r() * 40;
      const H = 45 + back * 85 + r() * 30;
      const W = 14 + r() * 16;
      // the indoor range hall sits at (150, 0): never let a cliff cut through it
      if (Math.hypot(Math.cos(a) * R - INDOOR_RANGE_WORLD.centerX, Math.sin(a) * R - INDOOR_RANGE_WORLD.centerZ) < W * 1.3 + 45) continue;
      const g = new THREE.CylinderGeometry(W * (0.35 + r() * 0.2), W, H, 7, 6);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const cols: number[] = [];
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k) / H + 0.5; // 0..1
        const jit = (Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1;
        pos.setX(k, pos.getX(k) * (1 + jit * 0.25));
        pos.setZ(k, pos.getZ(k) * (1 + jit * 0.18));
        pos.setY(k, pos.getY(k) + (y > 0.99 ? jit * 6 : 0));
        const c = low.clone().lerp(high, Math.min(1, y * 1.1));
        if (y > 0.86 && back > 0.4) c.lerp(snow, 0.6);
        cols.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.translate(0, H / 2 - 4, 0);
      g.rotateY(r() * Math.PI);
      g.translate(Math.cos(a) * R, 0, Math.sin(a) * R);
      parts.push(g.toNonIndexed());
    }
    const merged = mergeGeometries(parts, false)!;
    merged.computeVertexNormals();
    const cliffs = new THREE.Mesh(merged, K.cliff);
    cliffs.name = 'cliffs';
    root.add(cliffs);
  }

  // haze village: low flat-roofed houses with dark parapet bands
  {
    const B = new Batch();
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2;
      const R = 42 + r() * 45;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      if (Math.abs(x) < 26 && z > -36 && z < 32) continue;
      const w = 4 + r() * 6;
      const d = 4 + r() * 5;
      const h = 4 + r() * 6;
      const yaw = Math.atan2(-x, -z) + (r() - 0.5) * 0.5;
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, h / 2 - 0.4, z);
      B.putM(box(w, h, d, 3), r() < 0.7 ? K.whitewash : K.plasterFar, m);
      const m2 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, h - 0.2, z).multiply(new THREE.Matrix4().makeScale(w + 0.3, 0.5, d + 0.3));
      B.putM(UNIT_BOX, K.farRoof, m2);
      const m3 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, h - 0.75, z).multiply(new THREE.Matrix4().makeScale(w + 0.05, 0.35, d + 0.05));
      B.putM(UNIT_BOX, K.rafterRed, m3);
    }
    // small spherical dome (stupa) over the low roofs, back right
    const sx = 36;
    const sz = -64;
    B.put(new THREE.CylinderGeometry(7, 8, 3, 20), K.whitewash, sx, 1.5, sz);
    B.put(new THREE.CylinderGeometry(5.5, 5.8, 2.2, 20), K.whitewash, sx, 4.1, sz);
    B.put(new THREE.SphereGeometry(5.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), K.whitewash, sx, 5.2, sz);
    B.put(box(2.4, 1.6, 2.4, 2), K.gold, sx, 11.2, sz);
    B.put(new THREE.ConeGeometry(1.1, 5, 12), K.gold, sx, 14.4, sz);
    B.build(root, false, false);
  }
  root.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  return root;
}

// =====================================================================
// 6. Floor dressing: concrete pads with curbs, moss, debris, leaves, cables
// =====================================================================
export function createCourtyardFloorDressing(opts: { lowQuality: boolean }): THREE.Group {
  const K = M();
  const root = new THREE.Group();
  root.name = 'courtyard-floor-dressing';
  const B = new Batch();
  const pad = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 4, (uv.getY(i) * (z1 - z0)) / 4);
    B.put(g, K.concrete, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, -Math.PI / 2, 0, 0);
    const c = 0.14;
    const ch = 0.045;
    B.aabb(K.curb, x0 - c, x1 + c, 0, ch, z0 - c, z0, 1);
    B.aabb(K.curb, x0 - c, x1 + c, 0, ch, z1, z1 + c, 1);
    B.aabb(K.curb, x0 - c, x0, 0, ch, z0, z1, 1);
    B.aabb(K.curb, x1, x1 + c, 0, ch, z0, z1, 1);
  };
  pad(-9.6, -0.6, -7.0, -2.6); // around the crate cluster
  pad(-3.1, 3.5, -18.0, -14.2); // in front of the underpass

  // decals: cell 0 crack, 1 leaves, 2 debris, 3 moss (uv sub-rects of the decal sheet)
  const decal = (cell: number, x: number, z: number, s: number, rot: number) => {
    const g = new THREE.PlaneGeometry(s, s);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const cu = (cell % 2) * 0.5;
    const cv = cell < 2 ? 0.5 : 0; // canvas y is flipped in uv space
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + uv.getX(i) * 0.5, cv + uv.getY(i) * 0.5);
    B.put(g, K.decal, x, 0.02, z, -Math.PI / 2, 0, rot);
  };
  const r = rngOf(99);
  // in front of the underpass: debris, leaves, cracks
  for (let i = 0; i < 10; i++) decal(i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2, -2.6 + r() * 6, -17.6 + r() * 3.2, 0.9 + r() * 1.1, r() * 6.3);
  // right wall base
  for (let i = 0; i < 9; i++) decal([2, 1, 0][i % 3], 4.2 - r() * 0.6, -14 + r() * 20, 0.8 + r() * 1.0, r() * 6.3);
  // moss / weeds in shaded cracks, bottom right of the view
  for (let i = 0; i < 12; i++) decal(3, 2.2 + r() * 2.4, 2 + r() * 7, 0.5 + r() * 0.7, r() * 6.3);
  // weed tufts (crossed blades) on the moss
  if (!opts.lowQuality) {
    const blade = new THREE.ConeGeometry(0.02, 0.14, 3);
    for (let i = 0; i < 40; i++) {
      const x = 2.6 + r() * 2.0;
      const z = 2.5 + r() * 6.5;
      for (let k = 0; k < 4; k++)
        B.put(blade, k % 2 ? K.leafB : K.leafC, x + (r() - 0.5) * 0.12, 0.06, z + (r() - 0.5) * 0.12, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
    }
  }

  // black cables from the crate cluster snaking toward the front-left
  const cable = (pts: Array<[number, number]>, rad: number) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, rad, z)));
    B.put(new THREE.TubeGeometry(curve, 64, rad, 6), K.cable, 0, 0, 0);
  };
  cable([[-4.2, -3.55], [-4.6, -2.4], [-5.6, -1.2], [-5.3, 0.4], [-6.6, 1.6], [-8.4, 2.6]], 0.035);
  cable([[-3.4, -3.55], [-3.5, -2.2], [-4.4, -0.8], [-4.2, 0.6], [-5.2, 2.2], [-6.0, 4.6]], 0.03);
  cable([[-6.8, -3.55], [-7.3, -2.6], [-8.6, -2.2], [-9.4, -0.6]], 0.04);
  B.build(root, false, true);
  return root;
}
