// =====================================================================
// Town rebuild: replaces the old flat courtyard walls with full 3D
// Himalayan temple-style houses (original design, Blender-made town.glb),
// and adds the courtyard kit: tower facade, crate cluster, left perimeter,
// floor dressing and the distant cliffs.
//
// Everything is purely visual. Gameplay colliders and raycast occluders
// from the original walls are kept (the old meshes are only hidden), and
// the new facades sit on the same planes, so movement and shot blocking
// behave exactly as before.
//
// Static geometry is merged per material, so the whole town costs only a
// few dozen draw calls.
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addPaintedLook } from './propKit';
import {
  createCourtyardFloorDressing,
  createCourtyardPerimeter,
  createDistantCliffs,
  createWatchtowerFacade,
  dressCrateBank,
} from './courtyardKit';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface TownRebuildOptions {
  lowQuality: boolean;
}

// --------------------------------------------------------------------- utils
const makeRng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
};

const texBase = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') + 'assets/textures/';
const texLoader = new THREE.TextureLoader();

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Weathered lime plaster: mottled wash, faint patches and rain streaks.
function plasterAlbedo(seed: number) {
  const rng = makeRng(seed);
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = '#F4EEE4';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
      const x = rng() * 512;
      const y = rng() * 512;
      const r = 20 + rng() * 90;
      const light = rng() > 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, light ? 'rgba(255,252,244,0.22)' : 'rgba(150,120,90,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.restore();
      }
    }
    // rain streaks
    for (let i = 0; i < 60; i++) {
      const x = rng() * 512;
      const len = 40 + rng() * 200;
      const y = rng() * 512;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(110,95,80,0.10)');
      g.addColorStop(1, 'rgba(110,95,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 2 + rng() * 5, len);
    }
    // small chips showing the stone underneath
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(190,165,130,${0.25 + rng() * 0.25})`;
      ctx.beginPath();
      const x = rng() * 512;
      const y = rng() * 512;
      ctx.ellipse(x, y, 3 + rng() * 10, 2 + rng() * 6, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Rows of curved clay roof tiles.
function roofTileTex() {
  const rng = makeRng(77);
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#7A3A22';
    ctx.fillRect(0, 0, 256, 256);
    const rows = 8;
    const cols = 8;
    const rh = 256 / rows;
    const cw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + (r % 2 ? cw / 2 : 0);
        const y = r * rh;
        const base = [178 + rng() * 40, 86 + rng() * 30, 52 + rng() * 20];
        for (const ox of [0, -256]) {
          const g = ctx.createLinearGradient(x + ox, 0, x + ox + cw, 0);
          g.addColorStop(0, `rgb(${base[0] * 0.55},${base[1] * 0.55},${base[2] * 0.55})`);
          g.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
          g.addColorStop(1, `rgb(${base[0] * 0.5},${base[1] * 0.5},${base[2] * 0.5})`);
          ctx.fillStyle = g;
          ctx.fillRect(x + ox + 1, y, cw - 2, rh - 3);
        }
        // shadow at the tile's lower lip
        ctx.fillStyle = 'rgba(40,15,8,0.45)';
        ctx.fillRect(x + 1, y + rh - 4, cw - 2, 4);
        if (rng() < 0.18) {
          ctx.fillStyle = 'rgba(90,100,60,0.35)'; // lichen
          ctx.fillRect(x + rng() * cw * 0.6, y + rng() * rh * 0.6, 6, 4);
        }
      }
    }
  });
}

// Louvred shutter slats (tinted by material colour).
function louverTex() {
  return canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = '#E8E8E8';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 64, 6);
    ctx.fillRect(0, 122, 64, 6);
    ctx.fillRect(0, 0, 6, 128);
    ctx.fillRect(58, 0, 6, 128);
    for (let y = 10; y < 120; y += 7) {
      ctx.fillStyle = '#9A9A9A';
      ctx.fillRect(6, y + 4, 52, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(6, y, 52, 2);
    }
    ctx.fillStyle = '#B5B5B5';
    ctx.fillRect(30, 6, 4, 116);
  });
}

// Facade of a distant house: plaster with a grid of shuttered windows.
function distantFacadeTex() {
  const rng = makeRng(5);
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#F2EBDF';
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = 30 + c * 80;
        const y = 34 + r * 76;
        if (rng() < 0.15) continue;
        ctx.fillStyle = '#3A3430';
        ctx.fillRect(x, y, 22, 38);
        const sh = ['#4F7B74', '#6C8DA8', '#8B5A3C', '#7A8F52'][Math.floor(rng() * 4)];
        ctx.fillStyle = sh;
        if (rng() < 0.5) ctx.fillRect(x, y, 22, 38);
        else {
          ctx.fillRect(x - 12, y, 11, 38);
          ctx.fillRect(x + 23, y, 11, 38);
        }
        ctx.fillStyle = 'rgba(200,185,160,0.9)';
        ctx.fillRect(x - 3, y + 38, 28, 4);
      }
    }
    ctx.fillStyle = 'rgba(120,100,80,0.18)';
    ctx.fillRect(0, 236, 256, 20);
  });
}

function stripeTex(a: string, b: string) {
  return canvasTexture(128, 32, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? a : b;
      ctx.fillRect(i * 16, 0, 16, 32);
    }
  });
}

// Soft vertical dirt gradient used for the damp skirt at each wall's foot.
function skirtTex() {
  return canvasTexture(
    8,
    128,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, 'rgba(60,48,36,0)');
      g.addColorStop(0.55, 'rgba(60,48,36,0.18)');
      g.addColorStop(1, 'rgba(50,40,30,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 128);
    },
    true,
  );
}

// Box whose UVs are in metres / uvScale, so textures keep a constant size.
function boxUV(w: number, h: number, d: number, uvScale: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / uvScale, (uv.getY(i) * dims[f][1]) / uvScale);
    }
  }
  return g;
}

// --------------------------------------------------------------------- batcher
class Batcher {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  frame = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  setFrame(x: number, z: number, rotY: number, parent?: THREE.Matrix4) {
    this.frame.makeRotationY(rotY).setPosition(x, 0, z);
    if (parent) this.frame.premultiply(parent);
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
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.tmp.compose(this.p, this.q, this.s).premultiply(this.frame);
    this.putMatrix(geo, mat, this.tmp);
  }

  putMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    g.applyMatrix4(m);
    let list = this.buckets.get(mat);
    if (!list) {
      list = [];
      this.buckets.set(mat, list);
    }
    list.push(g);
  }

  build(parent: THREE.Object3D, shadows: boolean) {
    for (const [mat, list] of this.buckets) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const transparent = (mat as THREE.Material).transparent;
      mesh.castShadow = shadows && !transparent;
      mesh.receiveShadow = !transparent;
      mesh.name = 'town-batch';
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

// --------------------------------------------------------------------- house spec
interface HouseSpec {
  x0: number; // start along the street (local x)
  len: number;
  height: number;
  depth: number;
  wall: number; // wall material index
  shutter: number; // shutter material index
  ground: 'arcade' | 'shop' | 'door';
  balconies: boolean;
  laundry?: boolean;
  /** end walls that face open space and need windows */
  ends?: Array<'start' | 'end'>;
  seed: number;
  /** distant houses: fewer small parts */
  lite?: boolean;
}

export function buildTownRebuild(scene: THREE.Scene, opts: TownRebuildOptions) {
  const { lowQuality } = opts;
  const root = new THREE.Group();
  root.name = 'town-rebuild';
  // procedural houses: shown until the Blender-made town.glb has loaded (and kept if it fails)
  const procRoot = new THREE.Group();
  procRoot.name = 'town-procedural';

  // ---------------------------------------------------------------- hide old architecture
  for (const name of ['legacy-city', 'legacy-citadel', 'legacy-right-wall']) {
    const o = scene.getObjectByName(name);
    if (o) o.visible = false;
  }
  // small legacy clutter that clashes with the clean style (visual only; colliders stay)
  scene.traverse((o) => {
    if (o.name === 'legacy-clutter' || o.name === 'legacy-left-barrier') o.visible = false;
  });
  dressCrateBank(scene, lowQuality);
  const oldLeft = scene.getObjectByName('legacy-left-building');
  if (oldLeft) {
    oldLeft.children.forEach((c) => {
      if (c.name !== 'legacy-left-barrier') c.visible = false;
    });
  }

  // ---------------------------------------------------------------- materials
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, envMapIntensity: 0.55, ...extra });

  const plasterMaps = [plasterAlbedo(11), plasterAlbedo(12), plasterAlbedo(13)];
  const wallColors = ['#F0D2A6', '#F6EBD8', '#E8AE8C', '#E9C98F', '#D9DCC8', '#F2C9A8'];
  const wallMats = wallColors.map((c, i) => std(c, { map: plasterMaps[i % 3] }));
  const stone = std('#E2D3B6', { map: plasterMaps[1] });
  const stoneDark = std('#B9A88E', { map: plasterMaps[2] });
  const roofMap = roofTileTex();
  const roof = std('#FFFFFF', { map: roofMap, roughness: 0.82 });
  const tileEdge = std('#B0603A', { roughness: 0.8 });
  const wood = std('#7A5236');
  const woodDark = std('#4A3020');
  const iron = std('#2B2826', { roughness: 0.5, metalness: 0.55 });
  const glass = std('#22303C', { roughness: 0.12, metalness: 0.6, envMapIntensity: 1.2 });
  const interior = std('#2C241E', { roughness: 1 });
  const louver = louverTex();
  const shutterColors = ['#3F7A72', '#5E86A8', '#8A4E34', '#6E8A4C', '#2F5E7A'];
  const shutterMats = shutterColors.map((c) => std(c, { map: louver, roughness: 0.75 }));
  const terracotta = std('#B4603A');
  const leafA = std('#4E7D3A', { roughness: 0.95 });
  const leafB = std('#6A9442', { roughness: 0.95 });
  const flowerR = std('#D8434E', { roughness: 0.7 });
  const flowerP = std('#E889B2', { roughness: 0.7 });
  const flowerW = std('#F4EFE6', { roughness: 0.7 });
  const clothMats = ['#F4F1EA', '#7FA7C9', '#E5C454', '#C9636B', '#9FC49A'].map((c) =>
    std(c, { side: THREE.DoubleSide, roughness: 0.95 }),
  );
  const awningMats = [stripeTex('#2F6E7A', '#F1E9DA'), stripeTex('#B8452E', '#F3E6CF'), stripeTex('#5C7F3C', '#F1E9DA')].map(
    (t) => std('#FFFFFF', { map: t, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  const lampGlass = std('#FFE2A6', { emissive: '#FFB65A', emissiveIntensity: 1.4, roughness: 0.3 });
  const skirt = new THREE.MeshBasicMaterial({
    map: skirtTex(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // plaster relief normal map (generated texture shipped with the game)
  texLoader.load(
    texBase + 'plaster_normal.jpg',
    (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      for (const m of [...wallMats, stone, stoneDark]) {
        m.normalMap = t;
        m.normalScale.set(0.9, 0.9);
        m.needsUpdate = true;
      }
    },
    undefined,
    () => {},
  );

  // ---------------------------------------------------------------- shared geometry
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
    cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    halfTile: new THREE.CylinderGeometry(0.1, 0.12, 0.5, 6, 1, true, 0, Math.PI),
    sphere: new THREE.IcosahedronGeometry(0.5, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    pot: new THREE.CylinderGeometry(0.17, 0.12, 0.28, 10),
    archRing: new THREE.TorusGeometry(1, 0.13, 6, 14, Math.PI),
    cone: new THREE.ConeGeometry(0.5, 1, 8),
  };
  // flat arch-shaped opening (rect + semicircle), 1 m wide, 1 m to springing
  const archShape = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.5, 0);
    s.lineTo(0.5, 0);
    s.lineTo(0.5, 1);
    s.absarc(0, 1, 0.5, 0, Math.PI, false);
    s.lineTo(-0.5, 0);
    return new THREE.ShapeGeometry(s, 10);
  })();

  // near houses cast sun shadows; the far rows, tower and skyline do not (they sit
  // outside the shadow camera and would only cost an extra shadow draw)
  let B = new Batcher();
  const lampSpots: THREE.Vector3[] = [];

  // ---------------------------------------------------------------- facade pieces (local frame:
  // street runs along +x, facade plane at z = 0 facing +z, y up)
  const windowAt = (cx: number, y: number, h: number, sh: number, rng: () => number, opts: { balcony: boolean; lite: boolean }) => {
    const w = 0.95;
    // stone surround and sill
    B.put(G.box, stone, cx, y + h / 2, 0.03, 0, 0, 0, w + 0.3, h + 0.28, 0.08);
    B.put(G.box, stone, cx, y - 0.06, 0.1, 0, 0, 0, w + 0.45, 0.1, 0.24);
    // lintel keystone
    B.put(G.box, stone, cx, y + h + 0.1, 0.09, 0, 0, 0, 0.24, 0.3, 0.1);
    // glass + frame
    B.put(G.box, glass, cx, y + h / 2, 0.06, 0, 0, 0, w, h, 0.04);
    if (!opts.lite) {
      B.put(G.box, wood, cx, y + h / 2, 0.09, 0, 0, 0, 0.05, h, 0.03);
      B.put(G.box, wood, cx, y + h * 0.66, 0.09, 0, 0, 0, w, 0.05, 0.03);
      B.put(G.box, wood, cx, y + h / 2, 0.08, 0, 0, 0, w + 0.04, h + 0.04, 0.012);
    }
    // shutters: some closed, most swung open against the wall
    const mode = rng();
    const smat = shutterMats[sh];
    if (mode < 0.18) {
      B.put(G.box, smat, cx - w / 4, y + h / 2, 0.1, 0, 0, 0, w / 2 - 0.01, h, 0.05);
      B.put(G.box, smat, cx + w / 4, y + h / 2, 0.1, 0, 0, 0, w / 2 - 0.01, h, 0.05);
    } else {
      for (const side of [-1, 1]) {
        const ang = mode < 0.35 ? 1.2 : 0.18; // half open or flat against the wall
        const hx = cx + side * (w / 2 + 0.02);
        const px = hx + side * Math.cos(ang) * (w / 4);
        const pz = 0.08 + Math.sin(ang) * (w / 4);
        B.put(G.box, smat, px, y + h / 2, pz, 0, -side * ang, 0, w / 2, h, 0.045);
      }
    }
    if (opts.balcony) {
      // stone slab on consoles with a wrought-iron railing and pots
      const bw = w + 1.0;
      B.put(G.box, stone, cx, y - 0.1, 0.36, 0, 0, 0, bw, 0.14, 0.72);
      for (const s of [-1, 1]) B.put(G.box, stoneDark, cx + s * (bw / 2 - 0.15), y - 0.32, 0.25, 0, 0, 0, 0.14, 0.3, 0.5);
      B.put(G.box, iron, cx, y + 0.9, 0.7, 0, 0, 0, bw, 0.05, 0.05);
      B.put(G.box, iron, cx, y + 0.1, 0.7, 0, 0, 0, bw, 0.035, 0.035);
      for (const s of [-1, 1]) {
        B.put(G.box, iron, cx + s * (bw / 2 - 0.02), y + 0.9, 0.36, 0, 0, 0, 0.05, 0.05, 0.72);
        B.put(G.box, iron, cx + s * (bw / 2 - 0.02), y + 0.48, 0.7, 0, 0, 0, 0.04, 0.84, 0.04);
      }
      if (!opts.lite && !lowQuality) {
        for (let bx = -bw / 2 + 0.12; bx < bw / 2 - 0.05; bx += 0.12) {
          B.put(G.box, iron, cx + bx, y + 0.5, 0.7, 0, 0, 0, 0.018, 0.8, 0.018);
        }
        // a little scroll in the middle
        B.put(G.archRing, iron, cx, y + 0.5, 0.7, 0, 0, 0, 0.18, 0.18, 0.15);
        B.put(G.archRing, iron, cx, y + 0.5, 0.7, Math.PI, 0, 0, 0.18, 0.18, 0.15);
      }
      // potted flowers on the balcony
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * 0.45;
        B.put(G.pot, terracotta, px, y + 0.11, 0.5);
        B.put(G.sphere, i % 2 ? leafA : leafB, px, y + 0.38, 0.5, 0, 0, 0, 0.42, 0.34, 0.42);
        const fm = [flowerR, flowerP, flowerW][Math.floor(rng() * 3)];
        for (let k = 0; k < 4; k++) {
          B.put(G.sphere, fm, px + (rng() - 0.5) * 0.3, y + 0.45 + rng() * 0.1, 0.5 + (rng() - 0.5) * 0.25, 0, 0, 0, 0.09, 0.09, 0.09);
        }
      }
    } else if (!opts.lite && rng() < 0.45) {
      // flower box under the window
      B.put(G.box, terracotta, cx, y - 0.25, 0.2, 0, 0, 0, w + 0.1, 0.2, 0.24);
      B.put(G.sphere, leafA, cx, y - 0.08, 0.22, 0, 0, 0, w + 0.05, 0.25, 0.3);
      const fm = [flowerR, flowerP, flowerW][Math.floor(rng() * 3)];
      for (let k = 0; k < 6; k++) {
        B.put(G.sphere, fm, cx + (rng() - 0.5) * w, y + 0.02 + rng() * 0.06, 0.25 + rng() * 0.1, 0, 0, 0, 0.08, 0.08, 0.08);
      }
      // trailing geranium
      if (rng() < 0.5) {
        for (let k = 0; k < 3; k++) {
          B.put(G.sphere, leafB, cx + (rng() - 0.5) * w, y - 0.45 - k * 0.12, 0.32, 0, 0, 0, 0.18, 0.2, 0.14);
        }
      }
    }
  };

  const archAt = (cx: number, span: number, spring: number, kind: 'arcade' | 'shop', awning: number, rng: () => number) => {
    // dark opening (reads as a deep recess) + stone voussoir ring + jambs
    B.put(archShape, interior, cx, 0, 0.012, 0, 0, 0, span, spring, 1);
    B.put(G.archRing, stone, cx, spring * 1, 0.07, 0, 0, 0, span / 2 + 0.06, span / 2 + 0.06, 1);
    for (const s of [-1, 1]) {
      B.put(G.box, stone, cx + s * (span / 2 + 0.06), spring / 2, 0.07, 0, 0, 0, 0.26, spring, 0.14);
      B.put(G.box, stoneDark, cx + s * (span / 2 + 0.06), 0.25, 0.1, 0, 0, 0, 0.32, 0.5, 0.2);
    }
    B.put(G.box, stone, cx, spring + span / 2 + 0.12, 0.1, 0, 0, 0, 0.26, 0.36, 0.12);
    if (kind === 'shop') {
      // shop window with a door and fanlight
      B.put(G.box, glass, cx - span * 0.18, spring * 0.55, 0.04, 0, 0, 0, span * 0.55, spring * 0.7, 0.03);
      B.put(G.box, wood, cx - span * 0.18, spring * 0.18, 0.05, 0, 0, 0, span * 0.58, 0.36, 0.05);
      B.put(G.box, wood, cx + span * 0.3, spring * 0.5, 0.05, 0, 0, 0, span * 0.34, spring, 0.06);
      B.put(G.box, woodDark, cx + span * 0.3, spring * 0.5, 0.09, 0, 0, 0, span * 0.26, spring * 0.86, 0.02);
      B.put(G.box, wood, cx, spring + 0.02, 0.05, 0, 0, 0, span, 0.07, 0.05);
      for (let k = -1; k <= 1; k++) {
        B.put(G.box, wood, cx + k * span * 0.22, spring + span * 0.22, 0.05, 0, 0, k * 0.6, 0.04, span * 0.42, 0.03);
      }
      // canvas awning
      if (awning >= 0) {
        const aw = span + 0.5;
        B.put(G.plane, awningMats[awning], cx, spring - 0.1, 0.62, -1.05, 0, 0, aw, 1.3, 1);
        B.put(G.plane, awningMats[awning], cx, spring - 0.42, 1.18, 0, 0, 0, aw, 0.22, 1);
        for (const s of [-1, 1]) B.put(G.box, iron, cx + s * (aw / 2 - 0.05), spring - 0.18, 0.6, 1.05, 0, 0, 0.025, 0.025, 1.3);
      }
      // goods / crates by the door
      if (rng() < 0.7) {
        B.put(G.box, wood, cx - span * 0.3, 0.22, 0.45, 0, rng() * 0.4, 0, 0.55, 0.44, 0.4);
        B.put(G.sphere, [flowerR, leafB, flowerW][Math.floor(rng() * 3)], cx - span * 0.3, 0.48, 0.45, 0, 0, 0, 0.5, 0.18, 0.36);
      }
    } else {
      // arcade: dim back wall with a door inside
      B.put(G.box, woodDark, cx, spring * 0.45, 0.02, 0, 0, 0, span * 0.45, spring * 0.9, 0.02);
    }
  };

  const doorAt = (cx: number, rng: () => number, lite: boolean) => {
    const w = 1.25;
    const h = 2.45;
    B.put(G.box, stone, cx, h / 2 + 0.05, 0.05, 0, 0, 0, w + 0.42, h + 0.4, 0.1);
    B.put(G.box, wood, cx, h / 2, 0.09, 0, 0, 0, w, h, 0.06);
    if (!lite) {
      for (let k = -2; k <= 2; k++) B.put(G.box, woodDark, cx + k * (w / 5), h / 2, 0.125, 0, 0, 0, 0.02, h - 0.1, 0.012);
      B.put(G.box, iron, cx + w * 0.3, h * 0.48, 0.15, 0, 0, 0, 0.06, 0.06, 0.04);
      B.put(G.box, glass, cx, h + 0.32, 0.06, 0, 0, 0, w - 0.1, 0.3, 0.03);
    }
    // step + potted plants either side
    B.put(G.box, stone, cx, 0.07, 0.3, 0, 0, 0, w + 0.7, 0.14, 0.5);
    if (rng() < 0.8) {
      for (const s of [-1, 1]) {
        B.put(G.cyl, terracotta, cx + s * (w / 2 + 0.55), 0.28, 0.35, 0, 0, 0, 0.5, 0.56, 0.5);
        B.put(G.sphere, s > 0 ? leafA : leafB, cx + s * (w / 2 + 0.55), 0.78, 0.35, 0, 0, 0, 0.7, 0.8, 0.7);
      }
    }
    lampSpots.push(new THREE.Vector3(cx + w / 2 + 0.45, h + 0.2, 0));
  };

  const lampAt = (x: number, y: number) => {
    B.put(G.box, iron, x, y + 0.25, 0.18, 0, 0, 0, 0.04, 0.04, 0.36);
    B.put(G.box, iron, x, y + 0.2, 0.02, 0, 0, 0, 0.12, 0.2, 0.04);
    B.put(G.cyl6, lampGlass, x, y - 0.02, 0.34, 0, 0, 0, 0.2, 0.3, 0.2);
    B.put(G.cone, iron, x, y + 0.2, 0.34, 0, 0, 0, 0.3, 0.16, 0.3);
    B.put(G.cyl6, iron, x, y - 0.19, 0.34, 0, 0, 0, 0.16, 0.04, 0.16);
  };

  const house = (h: HouseSpec) => {
    const rng = makeRng(h.seed);
    const { x0, len, height: H, depth: D, lite } = h;
    const cx = x0 + len / 2;
    const wallM = wallMats[h.wall];
    // body
    B.put(boxUV(len, H, D, 3.2), wallM, cx, H / 2, -D / 2);
    // damp skirt + rusticated stone base
    B.put(G.plane, skirt, cx, 0.9, 0.005, 0, 0, 0, len, 1.8, 1);
    B.put(boxUV(len, 0.75, 0.12, 1.6), stoneDark, cx, 0.375, 0.06);
    if (!lite) {
      for (let x = x0 + 0.6; x < x0 + len - 0.2; x += 0.6 + rng() * 0.3) {
        B.put(G.box, stoneDark, x, 0.375, 0.125, 0, 0, 0, 0.02, 0.72, 0.01);
      }
    }
    // corner quoins
    for (const ex of [x0 + 0.22, x0 + len - 0.22]) {
      for (let y = 0.9, k = 0; y < H - 0.6; y += 0.5, k++) {
        const qw = k % 2 ? 0.44 : 0.6;
        B.put(G.box, stone, ex + (ex < cx ? qw / 2 - 0.22 : -qw / 2 + 0.22), y + 0.22, 0.03, 0, 0, 0, qw, 0.42, 0.07);
      }
    }
    // floors
    const groundH = 4.0;
    const upperH = 3.3;
    const floors: number[] = [];
    for (let y = groundH; y + upperH <= H - 0.4; y += upperH) floors.push(y);
    // string courses
    for (const fy of floors) {
      B.put(G.box, stone, cx, fy - 0.05, 0.08, 0, 0, 0, len, 0.2, 0.16);
      B.put(G.box, stone, cx, fy + 0.07, 0.05, 0, 0, 0, len, 0.06, 0.1);
    }
    // cornice + dentils
    B.put(G.box, stone, cx, H - 0.15, 0.1, 0, 0, 0, len + 0.1, 0.3, 0.2);
    B.put(G.box, stone, cx, H + 0.04, 0.24, 0, 0, 0, len + 0.3, 0.14, 0.48);
    if (!lite) {
      for (let x = x0 + 0.2; x < x0 + len - 0.1; x += 0.32) {
        B.put(G.box, stoneDark, x, H - 0.38, 0.12, 0, 0, 0, 0.14, 0.16, 0.18);
      }
    }
    // pitched tiled roof (eave toward the street, ridge at mid depth)
    const rise = D * 0.24;
    const run = D / 2 + 0.7;
    const slope = Math.atan2(rise, run);
    const slen = Math.hypot(rise, run);
    const ey = H + 0.12;
    const roofGeo = new THREE.PlaneGeometry(len + 0.5, slen);
    const ruv = roofGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, (ruv.getX(i) * (len + 0.5)) / 1.6, (ruv.getY(i) * slen) / 1.6);
    // front slope
    B.put(roofGeo, roof, cx, ey + rise / 2, 0.7 - run / 2, -Math.PI / 2 + slope, 0, 0);
    // back slope
    B.put(roofGeo, roof, cx, ey + rise / 2, -D - 0.7 + run / 2, -Math.PI / 2 - slope, 0, 0, 1, 1, 1);
    // gable ends
    const gable = new THREE.Shape();
    gable.moveTo(-D / 2 - 0.2, 0);
    gable.lineTo(D / 2 + 0.2, 0);
    gable.lineTo(0, rise + 0.05);
    gable.lineTo(-D / 2 - 0.2, 0);
    const gGeo = new THREE.ShapeGeometry(gable);
    B.put(gGeo, wallM, x0 + 0.01, ey, -D / 2, 0, -Math.PI / 2, 0);
    B.put(gGeo, wallM, x0 + len - 0.01, ey, -D / 2, 0, Math.PI / 2, 0);
    // ridge
    B.put(G.cyl6, tileEdge, cx, ey + rise + 0.04, -D / 2, 0, 0, Math.PI / 2, 0.22, len + 0.5, 0.22);
    // eave tile row + rafter tails (gives the roof a real 3D lip)
    for (let x = x0 - 0.2; x < x0 + len + 0.25; x += 0.25) {
      B.put(G.halfTile, tileEdge, x, ey + 0.08, 0.62, Math.PI / 2 + slope, 0, 0);
      if (!lite && Math.round((x - x0) / 0.25) % 3 === 0) {
        B.put(G.box, woodDark, x, ey - 0.06, 0.42, slope, 0, 0, 0.09, 0.12, 0.6);
      }
    }
    // chimneys
    const nCh = lite ? 1 : 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nCh; i++) {
      const chx = x0 + 0.8 + rng() * (len - 1.6);
      const chz = -D * (0.3 + rng() * 0.4);
      B.put(boxUV(0.7, 1.9, 0.7, 1.5), wallM, chx, ey + rise * 0.6 + 0.6, chz);
      B.put(G.box, stone, chx, ey + rise * 0.6 + 1.6, chz, 0, 0, 0, 0.86, 0.12, 0.86);
      B.put(G.halfTile, tileEdge, chx, ey + rise * 0.6 + 1.72, chz, 0, 0, Math.PI / 2, 1.4, 1.2, 1.4);
    }

    // ground floor bays
    const bays = Math.max(1, Math.floor(len / 2.9));
    const bayW = len / bays;
    const doorBay = Math.floor(rng() * bays);
    for (let b = 0; b < bays; b++) {
      const bx = x0 + bayW * (b + 0.5);
      if (h.ground === 'door' || (h.ground === 'shop' && b === doorBay)) {
        if (b === doorBay) doorAt(bx, rng, !!lite);
        else windowAt(bx, 1.3, 1.6, h.shutter, rng, { balcony: false, lite: !!lite });
      } else {
        const span = Math.min(2.3, bayW - 0.7);
        const awning = h.ground === 'shop' && !lite ? Math.floor(rng() * awningMats.length) : -1;
        archAt(bx, span, 2.2, h.ground, rng() < 0.75 ? awning : -1, rng);
      }
    }
    // upper floor windows
    const balconyFloor = h.balconies ? floors[0] : -1;
    floors.forEach((fy, fi) => {
      const wins = Math.max(1, Math.floor(len / 2.4));
      const ww = len / wins;
      for (let k = 0; k < wins; k++) {
        const wx = x0 + ww * (k + 0.5);
        const isBalc = fy === balconyFloor && (k % 2 === 0 || wins <= 2) && rng() < 0.85;
        const wh = isBalc ? 2.25 : fi === floors.length - 1 ? 1.35 : 1.65;
        const wy = isBalc ? fy + 0.25 : fy + 0.95;
        windowAt(wx, wy, wh, h.shutter, rng, { balcony: isBalc, lite: !!lite });
      }
    });
    // laundry line between two upper windows
    if (h.laundry && floors.length >= 2 && !lite) {
      const ly = floors[1] + 0.55;
      const lx0 = x0 + 0.8;
      const lx1 = x0 + len - 0.8;
      B.put(G.box, iron, (lx0 + lx1) / 2, ly, 0.55, 0, 0, 0, lx1 - lx0, 0.012, 0.012);
      for (const lx of [lx0, lx1]) B.put(G.box, iron, lx, ly, 0.28, 0, 0, 0, 0.03, 0.03, 0.56);
      for (let x = lx0 + 0.3; x < lx1 - 0.4; x += 0.55 + rng() * 0.3) {
        const cw = 0.35 + rng() * 0.3;
        const ch = 0.4 + rng() * 0.45;
        B.put(G.plane, clothMats[Math.floor(rng() * clothMats.length)], x + cw / 2, ly - ch / 2, 0.55, 0, (rng() - 0.5) * 0.3, 0, cw, ch, 1);
      }
    }
    // downpipe at the house edge
    if (!lite) {
      const px = x0 + len - 0.08;
      B.put(G.cyl, iron, px, H / 2, 0.14, 0, 0, 0, 0.11, H, 0.11);
      B.put(G.box, tileEdge, cx, H + 0.02, 0.5, 0, 0, 0, len + 0.3, 0.08, 0.08);
      for (let y = 1.2; y < H; y += 1.8) B.put(G.box, iron, px, y, 0.1, 0, 0, 0, 0.16, 0.05, 0.1);
      // creeping ivy on some houses: a spreading patch that thins out as it climbs
      if (rng() < 0.55) {
        const ix = x0 + 0.6 + rng() * (len - 1.2);
        const top = H * (0.4 + rng() * 0.4);
        const ivyM = [leafA, leafB, leafA];
        for (let y = 0.3; y < top; y += 0.2) {
          const t = y / top;
          const spread = 0.25 + Math.sin(t * Math.PI) * 0.9;
          const n = 2 + Math.floor((1 - t * 0.5) * 3 * rng());
          for (let k = 0; k < n; k++) {
            const s = (0.24 + rng() * 0.2) * (1 - t * 0.35);
            const lx = ix + (rng() - 0.5) * 1.6 * spread + Math.sin(y * 1.7) * 0.25;
            B.put(G.sphere, ivyM[Math.floor(rng() * 3)], lx, y, 0.03 + rng() * 0.04, rng(), rng(), rng(), s * 1.3, s, 0.1);
          }
        }
      }
    }
    // windows on an exposed end wall
    for (const end of h.ends ?? []) {
      const saved = B.frame.clone();
      const ox = end === 'start' ? x0 : x0 + len;
      const sub = new THREE.Matrix4().makeRotationY(end === 'start' ? -Math.PI / 2 : Math.PI / 2).setPosition(ox, 0, -D / 2);
      B.frame.multiply(sub);
      // wrap the base course, string courses and cornice around the corner
      B.put(G.box, stoneDark, 0, 0.375, 0.06, 0, 0, 0, D, 0.75, 0.12);
      for (const fy of floors) B.put(G.box, stone, 0, fy - 0.05, 0.08, 0, 0, 0, D, 0.2, 0.16);
      B.put(G.box, stone, 0, H - 0.15, 0.1, 0, 0, 0, D, 0.3, 0.2);
      const cols = D > 5 ? [-D / 4, D / 4] : [0];
      windowAt(0, 1.3, 1.5, h.shutter, rng, { balcony: false, lite: true });
      floors.forEach((fy) => cols.forEach((wx) => windowAt(wx, fy + 0.95, 1.5, h.shutter, rng, { balcony: false, lite: !!lite })));
      B.frame.copy(saved);
    }
    // lamps beside doors
    for (const l of lampSpots.splice(0)) lampAt(l.x, l.y);
    if (h.ground !== 'door' && !lite) lampAt(x0 + 0.55, 3.0);
  };

  const street = (frame: { x: number; z: number; rotY: number }, houses: HouseSpec[]) => {
    B.setFrame(frame.x, frame.z, frame.rotY);
    houses.forEach(house);
  };

  // ---------------------------------------------------------------- 1. East street (replaces the right wall)
  // facade plane x = 4.85 facing -X, running from z = -18.6 to +8.8
  street({ x: 4.85, z: -18.6, rotY: -Math.PI / 2 }, [
    { x0: 0, len: 7.6, height: 12.6, depth: 7, wall: 0, shutter: 0, ground: 'arcade', balconies: true, seed: 101 },
    { x0: 7.6, len: 6.2, height: 10.0, depth: 6.5, wall: 1, shutter: 1, ground: 'shop', balconies: false, laundry: true, seed: 102 },
    { x0: 13.8, len: 7.4, height: 12.0, depth: 7, wall: 2, shutter: 4, ground: 'shop', balconies: true, seed: 103 },
    { x0: 21.2, len: 6.2, height: 10.6, depth: 6.5, wall: 3, shutter: 2, ground: 'door', balconies: true, seed: 104, ends: ['end'] },
  ]);

  // 2. West side: replaced by the low courtyard wall + annex (courtyardKit.createCourtyardPerimeter)

  B.build(procRoot, !lowQuality);
  B = new Batcher();

  // ---------------------------------------------------------------- 3. Outer rows seen over walls and through gaps
  street({ x: -24.6, z: 16, rotY: Math.PI / 2 }, [
    { x0: 0, len: 7, height: 9.5, depth: 6, wall: 2, shutter: 1, ground: 'door', balconies: true, seed: 301, lite: true },
    { x0: 7, len: 6, height: 11.5, depth: 6, wall: 4, shutter: 0, ground: 'shop', balconies: false, seed: 302, lite: true },
  ]);
  street({ x: -24.6, z: -2.2, rotY: Math.PI / 2 }, [
    { x0: 0, len: 6.5, height: 10.5, depth: 6, wall: 0, shutter: 2, ground: 'door', balconies: true, seed: 303, lite: true },
  ]);
  street({ x: 20.5, z: 6.6, rotY: -Math.PI / 2 }, [
    { x0: 0, len: 7, height: 10.5, depth: 6, wall: 5, shutter: 4, ground: 'shop', balconies: true, seed: 401, lite: true },
    { x0: 7, len: 6.5, height: 12.5, depth: 6, wall: 1, shutter: 3, ground: 'door', balconies: true, seed: 402, lite: true },
  ]);
  // behind the start position, facing the courtyard
  street({ x: 13, z: 27, rotY: Math.PI }, [
    { x0: 0, len: 8, height: 10.5, depth: 6, wall: 3, shutter: 0, ground: 'shop', balconies: true, seed: 501, lite: true },
    { x0: 8, len: 7, height: 12.5, depth: 6, wall: 0, shutter: 2, ground: 'door', balconies: true, seed: 502, lite: true },
    { x0: 15, len: 4.5, height: 9, depth: 6, wall: 1, shutter: 1, ground: 'door', balconies: false, seed: 503, lite: true },
    { x0: 19.5, len: 7, height: 11.5, depth: 6, wall: 5, shutter: 4, ground: 'shop', balconies: true, seed: 504, lite: true },
  ]);

  // 4./5. Distant skyline: sheer cliffs, haze village and a dome stupa
  root.add(createDistantCliffs({ lowQuality }));
  // main tower front, perimeter and floor dressing (visual only)
  root.add(createWatchtowerFacade(scene, { lowQuality }));
  root.add(createCourtyardPerimeter(scene, { lowQuality }));
  root.add(createCourtyardFloorDressing({ lowQuality }));

  B.build(root, false);
  for (const g of [root, procRoot]) {
    g.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    scene.add(g);
  }
  loadBlenderTown(scene, procRoot, lowQuality);
  return root;
}

// ---------------------------------------------------------------------------
// Blender-made stylized houses (tools/blender/build_town.py -> town.glb).
// Each variant is placed on the same street frames as the procedural houses,
// so facades stay on the collider planes. Shared geometry, 3 draw calls/house.
// ---------------------------------------------------------------------------
const modelBase = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') + 'assets/models/';

interface Placement {
  variant: string;
  frame: THREE.Matrix4;
  x0: number;
  shadows: boolean;
}

function streetFrame(x: number, z: number, rotY: number, parent?: THREE.Matrix4) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  if (parent) m.premultiply(parent);
  return m;
}

function townPlacements(): Placement[] {
  const east = streetFrame(4.85, -18.6, -Math.PI / 2);
  const farW1 = streetFrame(-24.6, 16, Math.PI / 2);
  const farW2 = streetFrame(-24.6, -2.2, Math.PI / 2);
  const farE = streetFrame(20.5, 6.6, -Math.PI / 2);
  const south = streetFrame(13, 27, Math.PI);
  const near = (variant: string, frame: THREE.Matrix4, x0: number) => ({ variant, frame, x0, shadows: true });
  const far = (variant: string, frame: THREE.Matrix4, x0: number) => ({ variant, frame, x0, shadows: false });
  return [
    near('east_0', east, 0),
    near('east_1', east, 7.6),
    near('east_2', east, 13.8),
    near('east_3', east, 21.2),
    far('far_0', farW1, 0),
    far('west_2', farW1, 7),
    far('far_1', farW2, 0),
    far('far_1', farE, 0),
    far('east_2', farE, 6.6),
    far('east_1', south, 0),
    far('west_1', south, 6.4),
    far('far_0', south, 13.4),
    far('east_0', south, 20.6),
    far('bell_tower', streetFrame(-8.5, -33, 0.15), 0),
  ];
}

function loadBlenderTown(scene: THREE.Scene, procRoot: THREE.Group, lowQuality: boolean) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    modelBase + 'town.glb',
    (gltf) => {
      const town = new THREE.Group();
      town.name = 'town-blender';
      const tuned = new Set<THREE.Material>();
      // town.glb ships without normals (smaller download): rebuild them once per shared geometry
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
      });
      for (const p of townPlacements()) {
        const src = gltf.scene.getObjectByName(p.variant);
        if (!src) continue;
        const inst = src.clone(true);
        const m = p.frame.clone().multiply(new THREE.Matrix4().makeTranslation(p.x0, 0, 0));
        inst.matrixAutoUpdate = false;
        inst.matrix.copy(m);
        inst.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = p.shadows;
          mesh.receiveShadow = true;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!tuned.has(mat)) {
            tuned.add(mat);
            if (mat.name === 'town_glass') mat.envMapIntensity = 1.3;
            else if (mat.name === 'town_glow') mat.emissiveIntensity = 1.6;
            else {
              mat.envMapIntensity = 0.45;
              addPaintedLook(mat, 0.1);
            }
          }
          if (o !== inst) {
            o.updateMatrix();
            o.matrixAutoUpdate = false;
          }
        });
        town.add(inst);
      }
      scene.add(town);
      // retire the procedural stand-ins
      scene.remove(procRoot);
      procRoot.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    undefined,
    () => {
      /* model missing: keep the procedural houses */
    },
  );
}
