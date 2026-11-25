/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTownRebuild } from './townRebuild';
import { hazeSkyTexture } from './courtyardKit';
import { addTargetDepthDressing, buildBlasterViewmodel, buildStylizedTree } from './valorantKit';
import {
  ARENA,
  ColliderShape,
  computeLaserTrackSpecForDifficulty,
  computeTargetVisualEffectProfile,
  INDOOR_RANGE_WORLD,
  LASER_START_MARKER_RADIUS,
  LaserTrackDifficultySpec,
  PALETTE,
  TargetTypeId,
} from './rules';

let cachedGradientMap: THREE.DataTexture | null = null;
let cachedStuccoBumpTex: THREE.CanvasTexture | null = null;
let cachedRoughnessGrainTex: THREE.CanvasTexture | null = null;
let cachedContactShadowTex: THREE.CanvasTexture | null = null;
let cachedAoStripTex: THREE.CanvasTexture | null = null;
let cachedViperWallTex: THREE.CanvasTexture | null = null;
let cachedSkyBeamTex: THREE.CanvasTexture | null = null;
let cachedSkyTex: THREE.CanvasTexture | null = null;
let cachedCloudTex: THREE.CanvasTexture | null = null;
let cachedFloorTex: THREE.CanvasTexture | null = null;
let cachedPlayerZoneTex: THREE.CanvasTexture | null = null;
let cachedWallTex: THREE.CanvasTexture | null = null;
let cachedPillarTex: THREE.CanvasTexture | null = null;
let cachedCrateTex: THREE.CanvasTexture | null = null;
let cachedBannerTex: THREE.CanvasTexture | null = null;
let cachedIndoorPlasterTex: THREE.CanvasTexture | null = null;
let cachedIndoorWoodTex: THREE.CanvasTexture | null = null;
let cachedIndoorConcreteTex: THREE.CanvasTexture | null = null;
let cachedIndoorCrateTex: THREE.CanvasTexture | null = null;
let cachedAoStripGeo: THREE.PlaneGeometry | null = null;
const aoStripMatCache = new Map<number, THREE.MeshBasicMaterial>();

export function getToonGradientMap(): THREE.DataTexture {
  if (cachedGradientMap) return cachedGradientMap;
  const data = new Uint8Array([140, 190, 232, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cachedGradientMap = tex;
  return tex;
}

/**
 * Soft organic stucco/stone/metal micro-relief bump texture so surfaces have smooth tactile depth
 */
function getSoftBumpTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedStuccoBumpTex) return cachedStuccoBumpTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  // Macro plaster & stone relief waves
  for (let i = 0; i < 680; i++) {
    const x = (i * 97) % 512;
    const y = (i * 163) % 512;
    const r = 8 + (i % 28);
    const val = i % 2 === 0 ? 168 : 92;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, `rgba(${val}, ${val}, ${val}, 0.24)`);
    grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Micro stone pores & trowel grain
  for (let i = 0; i < 1800; i++) {
    const gx = (i * 53 + 17) % 512;
    const gy = (i * 113 + 31) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(210,210,210,0.18)' : 'rgba(55,55,55,0.18)';
    ctx.fillRect(gx, gy, 2 + (i % 3), 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cachedStuccoBumpTex = tex;
  return tex;
}

/**
 * Linear grayscale painterly roughness modulation map (values 216..255 so multiplied matte roughness stays strictly 0.74..0.90)
 */
function getMatteRoughnessTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedRoughnessGrainTex) return cachedRoughnessGrainTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgb(242, 242, 242)';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 420; i++) {
    const x = (i * 131 + 19) % 512;
    const y = (i * 197 + 43) % 512;
    const w = 18 + (i % 34);
    const h = 8 + ((i * 3) % 16);
    const v = 216 + (i % 38);
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.32)`;
    ctx.fillRect(x, y, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cachedRoughnessGrainTex = tex;
  return tex;
}

/**
 * Soft radial ground contact shadow texture for grounding characters, vehicles, crates, and pillars
 */
function getContactShadowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedContactShadowTex) return cachedContactShadowTex;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(20, 24, 32, 0.56)');
  grad.addColorStop(0.55, 'rgba(24, 28, 36, 0.26)');
  grad.addColorStop(1, 'rgba(24, 28, 36, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedContactShadowTex = tex;
  return tex;
}

/**
 * Linear wall-floor seam Ambient Occlusion gradient texture (dark cool-slate at seam edge fading cleanly outward)
 */
function getAoStripTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedAoStripTex) return cachedAoStripTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 128);
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0.0, 'rgba(18, 22, 32, 0.86)');
  grad.addColorStop(0.32, 'rgba(22, 27, 38, 0.44)');
  grad.addColorStop(0.7, 'rgba(24, 30, 42, 0.14)');
  grad.addColorStop(1.0, 'rgba(24, 30, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedAoStripTex = tex;
  return tex;
}

function createWallFloorAoStrip(
  length: number,
  width: number,
  opacity = 0.48,
): THREE.Mesh {
  if (!cachedAoStripGeo) {
    cachedAoStripGeo = new THREE.PlaneGeometry(1, 1);
  }
  const key = Math.round(opacity * 100);
  let mat = aoStripMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: getAoStripTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    aoStripMatCache.set(key, mat);
  }
  const mesh = new THREE.Mesh(cachedAoStripGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(length, width, 1);
  mesh.position.y = 0.018;
  return mesh;
}

function createContactShadowMesh(w: number, d: number, y = 0.025, opacity = 0.72): THREE.Mesh {
  const tex = getContactShadowTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/**
 * Smooth chamfered/beveled 3D box geometry so architectural walls, columns, crates, and hulls
 * catch soft Valorant specular highlights along rounded edges instead of sharp 90° Roblox corners
 */
function createBeveledBoxGeometry(
  w: number,
  h: number,
  d: number,
  bevel = 0.06,
  bevelSegments = 3,
): THREE.BufferGeometry {
  const b = Math.min(bevel, w * 0.2, h * 0.2, d * 0.2);
  const iw = Math.max(0.02, w - b * 2);
  const ih = Math.max(0.02, h - b * 2);
  const id = Math.max(0.02, d - b * 2);

  const shape = new THREE.Shape();
  const hw = iw * 0.5;
  const hh = ih * 0.5;
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: id,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments,
    curveSegments: bevelSegments,
  });
  geo.center();
  geo.computeVertexNormals();

  // Normalize UVs into [0..1] per dominant normal axis so textures (crates, REACTOR A, murals, pillars)
  // map cleanly onto every face without ExtrudeGeometry world-unit stretching
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  if (posAttr && normAttr && uvAttr) {
    const safeW = Math.max(0.001, w);
    const safeH = Math.max(0.001, h);
    const safeD = Math.max(0.001, d);
    for (let i = 0; i < posAttr.count; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      const nx = Math.abs(normAttr.getX(i));
      const ny = Math.abs(normAttr.getY(i));
      const nz = Math.abs(normAttr.getZ(i));
      let u = 0.5;
      let v = 0.5;
      if (nz >= nx && nz >= ny) {
        u = px / safeW + 0.5;
        v = py / safeH + 0.5;
      } else if (nx >= ny && nx >= nz) {
        u = pz / safeD + 0.5;
        v = py / safeH + 0.5;
      } else {
        u = px / safeW + 0.5;
        v = pz / safeD + 0.5;
      }
      uvAttr.setXY(i, Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)));
    }
    uvAttr.needsUpdate = true;
  }

  return geo;
}

export function createToonMat(
  color: string | number,
  options: {
    emissive?: string | number;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
    map?: THREE.Texture;
    side?: THREE.Side;
    lowQuality?: boolean;
    roughness?: number;
    metalness?: number;
    bumpScale?: number;
    envMapIntensity?: number;
    useRoughnessMap?: boolean;
  } = {},
): THREE.Material {
  const bumpTex = getSoftBumpTexture();
  const roughnessVal = options.roughness ?? 0.86;
  const metalnessVal = options.metalness ?? 0.03;
  const envMapVal = options.envMapIntensity ?? (metalnessVal > 0.35 ? 0.88 : 0.38);
  const roughnessTex =
    options.useRoughnessMap !== false && metalnessVal < 0.25 && roughnessVal >= 0.65
      ? getMatteRoughnessTexture()
      : null;

  if (options.map) {
    options.map.anisotropy = 4;
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: roughnessVal,
    metalness: metalnessVal,
    envMapIntensity: envMapVal,
    roughnessMap: roughnessTex,
    bumpMap: bumpTex,
    bumpScale: bumpTex ? (options.bumpScale ?? (options.map ? 0.016 : 0.024)) : 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    map: options.map ?? null,
    side: options.side ?? THREE.FrontSide,
  });
}

export function addCartoonOutline(
  mesh: THREE.Mesh,
  thickness: number = 1.008,
  color: string = '#141B24',
): THREE.Mesh {
  const outlineMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.16,
  });
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  outlineMesh.scale.setScalar(Math.min(thickness, 1.012));
  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Valorant Ascent / Sunset Rift Sky Gradient (Azure left sky + warm golden-orange upper-right rift glow)
 */
function createSkyTexture(): THREE.CanvasTexture {
  if (cachedSkyTex) return cachedSkyTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2F6FB8');
  grad.addColorStop(0.26, '#5C9AD6');
  grad.addColorStop(0.54, '#A3C8E4');
  grad.addColorStop(0.78, '#CDCAC0');
  grad.addColorStop(0.92, '#D8C7B4');
  grad.addColorStop(1.0, '#CEC6B8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Golden-hour volumetric sun scattering & sunlit cloud banks
  const sunGlow = ctx.createRadialGradient(340, 175, 12, 340, 175, 240);
  sunGlow.addColorStop(0, 'rgba(255, 244, 214, 0.65)');
  sunGlow.addColorStop(0.38, 'rgba(255, 198, 128, 0.28)');
  sunGlow.addColorStop(0.75, 'rgba(255, 152, 88, 0.10)');
  sunGlow.addColorStop(1, 'rgba(255, 152, 88, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 18; i++) {
    const cx = (i * 79 + 40) % 512;
    const cy = 190 + (i % 5) * 32;
    const rx = 55 + (i % 4) * 26;
    const ry = 18 + (i % 3) * 8;
    const cGrad = ctx.createRadialGradient(cx, cy - 6, 4, cx, cy, rx);
    cGrad.addColorStop(0, 'rgba(255, 248, 236, 0.26)');
    cGrad.addColorStop(0.55, 'rgba(236, 218, 198, 0.12)');
    cGrad.addColorStop(1, 'rgba(236, 218, 198, 0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedSkyTex = tex;
  return tex;
}

function createCloudTexture(): THREE.CanvasTexture {
  if (cachedCloudTex) return cachedCloudTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 128);
  const puffs = [
    [64, 72, 38],
    [104, 54, 46],
    [152, 58, 42],
    [194, 72, 36],
    [128, 78, 40],
  ];
  for (const [cx, cy, r] of puffs) {
    const pGrad = ctx.createRadialGradient(cx, cy - 8, 4, cx, cy, r);
    pGrad.addColorStop(0, 'rgba(255, 248, 240, 0.56)');
    pGrad.addColorStop(0.6, 'rgba(235, 225, 215, 0.26)');
    pGrad.addColorStop(1, 'rgba(225, 215, 205, 0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedCloudTex = tex;
  return tex;
}

/**
 * Valorant Ascent/Range Desaturated Slate Courtyard Stone Pavement
 * with Painterly Brushstrokes, Subtle Grout Cracks & Tactical Range Lane Markings
 */
/**
 * Shared weathered-stone slab painter: muted grey-beige slabs, shallow grout, worn edges, grime and
 * grass in the cracks. Paints colour into `ctx` and a matching height map into `bctx` (used as bumpMap).
 */
function paintStoneSlabs(
  ctx: CanvasRenderingContext2D,
  bctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: { seed: number; rowMin: number; rowMax: number; colMin: number; colMax: number; warm: number },
): void {
  const h2 = (x: number, y: number) => {
    const v = Math.sin((x + opts.seed) * 127.1 + (y - opts.seed) * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  // grout / gaps
  ctx.fillStyle = '#5E5952';
  ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#202020';
  bctx.fillRect(0, 0, W, H);

  const grout = 2;
  let y = 0;
  let row = 0;
  while (y < H) {
    const rh = Math.round(opts.rowMin + h2(row, 1) * (opts.rowMax - opts.rowMin));
    let x = -Math.round(h2(row, 2) * opts.colMax);
    let col = 0;
    while (x < W) {
      const cw = Math.round(opts.colMin + h2(row * 31 + col, 3) * (opts.colMax - opts.colMin));
      const r0 = h2(x, y);
      // muted grey-beige stone, slight warm/cool drift per slab
      const base = 128 + (r0 - 0.5) * 20;
      const warmShift = opts.warm + (h2(x + 5, y) - 0.5) * 8;
      const rr = base + warmShift;
      const gg = base + warmShift * 0.55;
      const bb = base - warmShift * 0.35 - 4;
      const g = ctx.createLinearGradient(x, y, x + cw, y + rh);
      g.addColorStop(0, `rgb(${rr + 6}, ${gg + 6}, ${bb + 5})`);
      g.addColorStop(1, `rgb(${rr - 7}, ${gg - 7}, ${bb - 6})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + grout, y + grout, cw - grout * 2, rh - grout * 2);
      // height: slabs raised, slight random tilt
      const hb = 190 + Math.round((h2(x, y + 7) - 0.5) * 40);
      bctx.fillStyle = `rgb(${hb},${hb},${hb})`;
      bctx.fillRect(x + grout, y + grout, cw - grout * 2, rh - grout * 2);
      // worn, rounded edges (lighter in colour, lower in height)
      ctx.strokeStyle = 'rgba(200, 192, 178, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + grout + 1, y + grout + 1, cw - grout * 2 - 2, rh - grout * 2 - 2);
      bctx.strokeStyle = 'rgba(110,110,110,0.7)';
      bctx.lineWidth = 2;
      bctx.strokeRect(x + grout + 1, y + grout + 1, cw - grout * 2 - 2, rh - grout * 2 - 2);
      // occasional crack across a slab
      if (h2(x + 3, y + 3) > 0.82) {
        ctx.strokeStyle = 'rgba(90, 84, 76, 0.45)';
        bctx.strokeStyle = 'rgba(40,40,40,0.9)';
        ctx.lineWidth = 1;
        bctx.lineWidth = 1.5;
        const sx = x + cw * h2(x, 9);
        ctx.beginPath();
        bctx.beginPath();
        ctx.moveTo(sx, y + grout);
        bctx.moveTo(sx, y + grout);
        const mx = sx + (h2(x, 10) - 0.5) * cw * 0.5;
        ctx.lineTo(mx, y + rh * 0.5);
        bctx.lineTo(mx, y + rh * 0.5);
        ctx.lineTo(mx + (h2(x, 11) - 0.5) * cw * 0.4, y + rh - grout);
        bctx.lineTo(mx + (h2(x, 11) - 0.5) * cw * 0.4, y + rh - grout);
        ctx.stroke();
        bctx.stroke();
      }
      x += cw;
      col++;
    }
    y += rh;
    row++;
  }

  // broad grime / damp patches and sun-bleached areas
  for (let i = 0; i < Math.round((W * H) / 30000); i++) {
    const cx = h2(i, 21) * W;
    const cy = h2(i, 22) * H;
    const cr = 30 + h2(i, 23) * 160;
    const dark = h2(i, 24) > 0.4;
    const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, cr);
    rg.addColorStop(0, dark ? 'rgba(70, 64, 56, 0.16)' : 'rgba(236, 228, 212, 0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
  }
  // fine pitted grain (colour + height)
  const n = Math.round((W * H) / 90);
  for (let i = 0; i < n; i++) {
    const px = h2(i, 31) * W;
    const py = h2(i, 32) * H;
    const d = h2(i, 33) > 0.5;
    ctx.fillStyle = d ? 'rgba(60, 54, 46, 0.14)' : 'rgba(240, 234, 222, 0.10)';
    ctx.fillRect(px, py, 1.5, 1.5);
    if (d) {
      bctx.fillStyle = 'rgba(60,60,60,0.35)';
      bctx.fillRect(px, py, 1.5, 1.5);
    }
  }
  // grass tufts growing out of some gaps
  for (let i = 0; i < Math.round((W * H) / 70000); i++) {
    const cx = h2(i, 41) * W;
    const cy = h2(i, 42) * H;
    for (let k = 0; k < 18; k++) {
      const gx = cx + (h2(i * 17 + k, 43) - 0.5) * 26;
      const gy = cy + (h2(i * 17 + k, 44) - 0.5) * 12;
      const gr = 2 + h2(i * 17 + k, 46) * 4;
      ctx.fillStyle = h2(i * 17 + k, 45) > 0.5 ? 'rgba(86, 110, 54, 0.55)' : 'rgba(112, 134, 66, 0.5)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, gr, gr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function createFloorGridTexture(): THREE.CanvasTexture {
  if (cachedFloorTex) return cachedFloorTex;
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = S;
  bumpCanvas.height = S;
  const bctx = bumpCanvas.getContext('2d')!;
  // 2048px over 72m: slabs ~1.0-1.6m deep, 1.2-2.8m wide
  paintStoneSlabs(ctx, bctx, S, S, { seed: 3, rowMin: 30, rowMax: 46, colMin: 34, colMax: 80, warm: 6 });

  // subdued range lane markings + worn amber firing line (painted on stone, low contrast)
  ctx.save();
  ctx.fillStyle = 'rgba(226, 222, 210, 0.30)';
  for (const laneX of [680, 1024, 1368]) {
    for (let ly = 420; ly < 1240; ly += 56) {
      if (((laneX + ly) / 2) % 5 === 0) continue;
      ctx.fillRect(laneX - 4, ly, 8, 32);
    }
  }
  ctx.fillStyle = 'rgba(196, 150, 74, 0.34)';
  ctx.fillRect(380, 1244, 1288, 10);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cachedFloorTex = tex;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.anisotropy = 8;
  cachedFloorBump = bump;
  return tex;
}

let cachedFloorBump: THREE.CanvasTexture | null = null;
let cachedPadBump: THREE.CanvasTexture | null = null;
export function getFloorBumpTexture(): THREE.CanvasTexture | null {
  return cachedFloorBump;
}

/**
 * Foreground Grey-Slate Cobblestone Pad with Chiseled Relief & Weathered Range Bracket Lines
 */
function createPlayerZoneTexture(): THREE.CanvasTexture {
  if (cachedPlayerZoneTex) return cachedPlayerZoneTex;
  // Player standing pad: same weathered stone, slightly larger and cooler slabs with a worn stone kerb.
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = W;
  bumpCanvas.height = H;
  const bctx = bumpCanvas.getContext('2d')!;
  // 1024px over 22m: slabs ~1.1-1.5m
  paintStoneSlabs(ctx, bctx, W, H, { seed: 17, rowMin: 50, rowMax: 68, colMin: 56, colMax: 120, warm: 2 });
  ctx.strokeStyle = 'rgba(214, 206, 190, 0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 26, W - 80, H - 52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cachedPlayerZoneTex = tex;
  cachedPadBump = new THREE.CanvasTexture(bumpCanvas);
  return tex;
}

function applySlabBump(mat: THREE.Material, bump: THREE.Texture | null, scale: number): void {
  const m = mat as THREE.MeshStandardMaterial;
  if (!bump || !('bumpMap' in m)) return;
  m.bumpMap = bump;
  m.bumpScale = scale;
  m.needsUpdate = true;
}

/**
 * 1024x1024 Desaturated Venetian Limestone & Plaster Stucco Texture
 * (Hand-painted brushstrokes, top cornice weathering, bottom ground splash & subtle exposed brick)
 */
function createCourtyardWallTexture(): THREE.CanvasTexture {
  if (cachedWallTex) return cachedWallTex;
  // Warm cream plaster over sandstone: hand-painted mottling, exposed ashlar patches, stone plinth.
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const h2 = (x: number, y: number) => {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0.0, '#A69478');
  g.addColorStop(0.12, '#C2B094');
  g.addColorStop(0.55, '#C8B79A');
  g.addColorStop(0.8, '#B6A386');
  g.addColorStop(1.0, '#9C8A70');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // painterly plaster mottling (warm lights / cool shadows)
  for (let i = 0; i < 160; i++) {
    const x = h2(i, 1) * S;
    const y = h2(i, 2) * S;
    const r = 40 + h2(i, 3) * 140;
    const warm = h2(i, 4) > 0.5;
    const rg = ctx.createRadialGradient(x, y, 4, x, y, r);
    rg.addColorStop(0, warm ? 'rgba(255, 244, 222, 0.22)' : 'rgba(150, 128, 104, 0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // horizontal trowel strokes
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = h2(i, 5) > 0.5 ? 'rgba(255, 248, 232, 0.10)' : 'rgba(120, 98, 74, 0.08)';
    ctx.fillRect(h2(i, 6) * S, h2(i, 7) * S, 30 + h2(i, 8) * 90, 3 + h2(i, 9) * 4);
  }

  // exposed sandstone ashlar where plaster has fallen away (irregular edges)
  const stoneCols = ['#B39773', '#A88B68', '#BA9F7B', '#A0835F', '#AE916D'];
  const patches: Array<[number, number, number, number]> = [
    [90, 640, 200, 130],
    [640, 200, 170, 110],
    [720, 680, 160, 110],
  ];
  for (const [px, py, pw, ph] of patches) {
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    // plaster edge shadow (chipped lip)
    ctx.fillStyle = 'rgba(130, 104, 78, 0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, pw * 0.52, ph * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let row = 0, y = py; y < py + ph; row++, y += 20) {
      const off = (row % 2) * 22;
      for (let x = px - 44; x < px + pw; x += 44) {
        const bx = x + off;
        const nx = (bx + 22 - cx) / (pw * 0.5);
        const ny = (y + 10 - cy) / (ph * 0.5);
        if (nx * nx + ny * ny > 0.85 + h2(bx, y) * 0.25) continue;
        ctx.fillStyle = '#A88E72';
        ctx.fillRect(bx, y, 44, 20);
        ctx.fillStyle = stoneCols[Math.floor(h2(bx, y + 1) * stoneCols.length)];
        ctx.fillRect(bx + 2, y + 2, 40, 16);
        ctx.fillStyle = 'rgba(255, 244, 224, 0.25)';
        ctx.fillRect(bx + 2, y + 2, 40, 2);
        ctx.fillStyle = 'rgba(90, 66, 44, 0.18)';
        ctx.fillRect(bx + 2, y + 15, 40, 3);
      }
    }
  }

  // roof-drip streaks under the cornice
  for (const sx of [180, 470, 820]) {
    const sg = ctx.createLinearGradient(0, 0, 0, 520);
    sg.addColorStop(0, 'rgba(100, 82, 62, 0.26)');
    sg.addColorStop(1, 'rgba(100, 82, 62, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 18, 0, 36, 520);
  }
  const top = ctx.createLinearGradient(0, 0, 0, 110);
  top.addColorStop(0, 'rgba(70, 54, 40, 0.32)');
  top.addColorStop(1, 'rgba(70, 54, 40, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, S, 110);

  // stone plinth with block joints
  ctx.fillStyle = '#9A9084';
  ctx.fillRect(0, 900, S, 124);
  for (let x = 0; x < S; x += 128) {
    ctx.fillStyle = 'rgba(70, 50, 34, 0.45)';
    ctx.fillRect(x, 900, 3, 124);
    ctx.fillStyle = 'rgba(255, 236, 206, 0.16)';
    ctx.fillRect(x + 3, 904, 122, 4);
  }
  ctx.fillStyle = 'rgba(255, 240, 214, 0.45)';
  ctx.fillRect(0, 896, S, 6);
  ctx.fillStyle = 'rgba(60, 42, 28, 0.35)';
  ctx.fillRect(0, 1004, S, 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  cachedWallTex = tex;
  return tex;
}

/**
 * Desaturated Limestone Pillar Texture with Classical Fluting, Painterly Grain & Top/Bottom Weathering
 */
function createSandstonePillarTexture(): THREE.CanvasTexture {
  if (cachedPillarTex) return cachedPillarTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const hGrad = ctx.createLinearGradient(0, 0, 512, 0);
  hGrad.addColorStop(0.0, '#9E9284');
  hGrad.addColorStop(0.18, '#C6BAB0');
  hGrad.addColorStop(0.5, '#D8CFC2');
  hGrad.addColorStop(0.82, '#C2B6A8');
  hGrad.addColorStop(1.0, '#968A7C');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle vertical painterly chisel texture
  for (let i = 0; i < 80; i++) {
    const px = (i * 59 + 13) % 490;
    const py = (i * 97 + 19) % 470;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(244, 240, 232, 0.12)' : 'rgba(68, 62, 56, 0.10)';
    ctx.fillRect(px, py, 8, 32 + (i % 24));
  }

  for (let y = 64; y < 512; y += 64) {
    ctx.fillStyle = 'rgba(76, 68, 60, 0.20)';
    ctx.fillRect(0, y, 512, 3);
    ctx.fillStyle = 'rgba(248, 244, 236, 0.22)';
    ctx.fillRect(0, y + 3, 512, 2);
  }

  // Top & bottom weathering gradients
  const topAO = ctx.createLinearGradient(0, 0, 0, 56);
  topAO.addColorStop(0, 'rgba(38, 34, 30, 0.28)');
  topAO.addColorStop(1, 'rgba(38, 34, 30, 0)');
  ctx.fillStyle = topAO;
  ctx.fillRect(0, 0, 512, 56);

  const botAO = ctx.createLinearGradient(0, 448, 0, 512);
  botAO.addColorStop(0, 'rgba(34, 32, 28, 0)');
  botAO.addColorStop(1, 'rgba(34, 32, 28, 0.34)');
  ctx.fillStyle = botAO;
  ctx.fillRect(0, 448, 512, 64);

  ctx.strokeStyle = 'rgba(92, 82, 72, 0.22)';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 20, 456, 472);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedPillarTex = tex;
  return tex;
}

/**
 * Industrial Sign Texture
 */
function createReactorSignTexture(label: string = 'REACTOR A'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#58524C';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#F8F5F0';
  ctx.font = '900 48px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * High-Detail Orange-Terracotta & Riveted Dark-Slate Steel X-Braced Tactical Crate Texture
 */
function createTacticalCrateTexture(): THREE.CanvasTexture {
  if (cachedCrateTex) return cachedCrateTex;
  // Original design: sun-faded horizontal planks inside a darker board frame, stencil ID band, nail heads.
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const h2 = (x: number, y: number) => {
    const v = Math.sin(x * 61.7 + y * 157.3) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.fillStyle = '#4A3628';
  ctx.fillRect(0, 0, S, S);
  // planks
  const plankH = 64;
  for (let i = 0, y = 0; y < S; i++, y += plankH) {
    const t = (h2(i, 1) - 0.5) * 18;
    const g = ctx.createLinearGradient(0, y, 0, y + plankH);
    g.addColorStop(0, `rgb(${168 + t}, ${128 + t}, ${88 + t})`);
    g.addColorStop(1, `rgb(${146 + t}, ${108 + t}, ${72 + t})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y + 3, S, plankH - 6);
    // grain streaks
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = h2(i * 40 + k, 2) > 0.5 ? 'rgba(96, 64, 40, 0.20)' : 'rgba(214, 178, 132, 0.16)';
      ctx.fillRect(h2(i * 40 + k, 3) * S, y + 6 + h2(i * 40 + k, 4) * (plankH - 14), 40 + h2(i * 40 + k, 5) * 160, 2);
    }
  }
  // darker frame boards around the face
  ctx.fillStyle = '#6E4E34';
  const fb = 44;
  ctx.fillRect(0, 0, S, fb);
  ctx.fillRect(0, S - fb, S, fb);
  ctx.fillRect(0, 0, fb, S);
  ctx.fillRect(S - fb, 0, fb, S);
  ctx.strokeStyle = 'rgba(40, 26, 16, 0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(fb, fb, S - fb * 2, S - fb * 2);
  ctx.fillStyle = 'rgba(232, 200, 150, 0.18)';
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, 0, 3, S);
  // nail heads on the frame
  ctx.fillStyle = '#2E2A26';
  for (const [nx, ny] of [[22, 22], [S - 22, 22], [22, S - 22], [S - 22, S - 22], [S / 2, 22], [S / 2, S - 22], [22, S / 2], [S - 22, S / 2]]) {
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // painted stencil ID band (worn)
  ctx.fillStyle = 'rgba(220, 124, 52, 0.78)';
  ctx.fillRect(fb + 20, S * 0.42, S - fb * 2 - 40, 58);
  ctx.fillStyle = 'rgba(30, 22, 16, 0.85)';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EHM-07', S / 2, S * 0.42 + 30);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = 'rgba(160, 120, 80, 0.55)';
    ctx.fillRect(fb + 20 + h2(k, 7) * (S - fb * 2 - 40), S * 0.42 + h2(k, 8) * 58, 3 + h2(k, 9) * 6, 2);
  }
  // grime toward the bottom
  const gr = ctx.createLinearGradient(0, S * 0.7, 0, S);
  gr.addColorStop(0, 'rgba(40, 30, 20, 0)');
  gr.addColorStop(1, 'rgba(40, 30, 20, 0.32)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, S * 0.7, S, S * 0.3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cachedCrateTex = tex;
  return tex;
}

/**
 * Translucent Viper Energy Curtain Gradient Texture (Soft vertical energy wave fade, no hard box top!)
 */
function getViperEnergyWallTexture(): THREE.CanvasTexture {
  if (cachedViperWallTex) return cachedViperWallTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Vertical alpha fade from bright cyan-emerald base to soft wispy top
  const vGrad = ctx.createLinearGradient(0, 256, 0, 0);
  vGrad.addColorStop(0.0, 'rgba(0, 245, 212, 0.92)');
  vGrad.addColorStop(0.25, 'rgba(16, 232, 138, 0.76)');
  vGrad.addColorStop(0.72, 'rgba(16, 232, 138, 0.48)');
  vGrad.addColorStop(0.92, 'rgba(92, 255, 196, 0.18)');
  vGrad.addColorStop(1.0, 'rgba(92, 255, 196, 0.0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Soft vertical energy ripples
  for (let x = 16; x < 256; x += 32) {
    const rGrad = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
    rGrad.addColorStop(0, 'rgba(180, 255, 230, 0)');
    rGrad.addColorStop(0.5, 'rgba(200, 255, 238, 0.28)');
    rGrad.addColorStop(1, 'rgba(180, 255, 230, 0)');
    ctx.fillStyle = rGrad;
    ctx.fillRect(x - 10, 20, 20, 236);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedViperWallTex = tex;
  return tex;
}

/**
 * Golden Sky-Beacon Beam Gradient Texture (Reference 3 left vertical golden light beams!)
 */
function getGoldenSkyBeamTexture(): THREE.CanvasTexture {
  if (cachedSkyBeamTex) return cachedSkyBeamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 256);

  const hGrad = ctx.createLinearGradient(0, 0, 64, 0);
  hGrad.addColorStop(0, 'rgba(255, 180, 72, 0)');
  hGrad.addColorStop(0.35, 'rgba(255, 196, 92, 0.55)');
  hGrad.addColorStop(0.5, 'rgba(255, 244, 200, 0.95)');
  hGrad.addColorStop(0.65, 'rgba(255, 196, 92, 0.55)');
  hGrad.addColorStop(1, 'rgba(255, 180, 72, 0)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 64, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedSkyBeamTex = tex;
  return tex;
}

/**
 * Valorant Tactical Hanging Banner Texture
 */
function createBannerTexture(): THREE.CanvasTexture {
  if (cachedBannerTex) return cachedBannerTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#B83C4A');
  grad.addColorStop(0.7, '#9A2B38');
  grad.addColorStop(1, '#761E28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Soft cloth fold shading
  const foldGrad = ctx.createLinearGradient(0, 0, 256, 0);
  foldGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
  foldGrad.addColorStop(0.3, 'rgba(255,255,255,0.08)');
  foldGrad.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  foldGrad.addColorStop(0.75, 'rgba(255,255,255,0.08)');
  foldGrad.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = foldGrad;
  ctx.fillRect(0, 0, 256, 512);

  ctx.strokeStyle = 'rgba(236, 232, 225, 0.80)';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 220, 432);

  ctx.strokeStyle = '#ECE8E1';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 148);
  ctx.lineTo(192, 272);
  ctx.lineTo(64, 272);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = PALETTE.yellow;
  ctx.beginPath();
  ctx.moveTo(128, 186);
  ctx.lineTo(154, 242);
  ctx.lineTo(102, 242);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBannerTex = tex;
  return tex;
}

const targetReticleCache = new Map<string, THREE.CanvasTexture>();

export function getTargetReticleTexture(colorHex: string): THREE.Texture {
  if (targetReticleCache.has(colorHex)) {
    return targetReticleCache.get(colorHex)!;
  }
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;
  const maxR = 236;

  // Deep tactical slate-navy backing disc with vibrant radial glow
  const radGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, maxR);
  radGrad.addColorStop(0, '#FFFFFF');
  radGrad.addColorStop(0.18, colorHex);
  radGrad.addColorStop(0.36, 'rgba(14, 22, 32, 0.94)');
  radGrad.addColorStop(0.68, 'rgba(18, 28, 40, 0.92)');
  radGrad.addColorStop(0.88, colorHex + 'DD');
  radGrad.addColorStop(1, colorHex + '33');
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Outer crisp metallic rim
  ctx.strokeStyle = '#ECE8E1';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.95, 0, Math.PI * 2);
  ctx.stroke();

  // Precision radial degree tick marks around outer ring
  ctx.strokeStyle = 'rgba(236, 232, 225, 0.65)';
  for (let i = 0; i < 24; i++) {
    const ang = (i * Math.PI) / 12;
    const isMajor = i % 3 === 0;
    const r0 = maxR * (isMajor ? 0.76 : 0.82);
    const r1 = maxR * 0.90;
    ctx.lineWidth = isMajor ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.stroke();
  }

  // Middle segmented tactical ring
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  // Inner gold precision ring
  ctx.strokeStyle = '#FFD43B';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  // Bright bullseye core
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.21, 0, Math.PI * 2);
  ctx.fill();

  // Crosshair axis hairlines
  ctx.strokeStyle = 'rgba(236, 232, 225, 0.92)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - maxR * 0.92, cy);
  ctx.lineTo(cx - maxR * 0.30, cy);
  ctx.moveTo(cx + maxR * 0.30, cy);
  ctx.lineTo(cx + maxR * 0.92, cy);
  ctx.moveTo(cx, cy - maxR * 0.92);
  ctx.lineTo(cx, cy - maxR * 0.30);
  ctx.moveTo(cx, cy + maxR * 0.30);
  ctx.lineTo(cx, cy + maxR * 0.92);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  targetReticleCache.set(colorHex, tex);
  return tex;
}

let cachedGlowTexture: THREE.Texture | null = null;
export function getGlowTexture(): THREE.Texture {
  if (cachedGlowTexture) return cachedGlowTexture;
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;
    cachedGlowTexture = fallback;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.45, 'rgba(255, 230, 180, 0.38)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedGlowTexture = tex;
  return tex;
}

export interface SpawnAnchor {
  id: string;
  kind: 'stand' | 'balcony' | 'platform' | 'near' | 'air' | 'rear';
  sector: 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR';
  x: number;
  y: number;
  z: number;
  hasPedestal: boolean;
}

export interface AnimatedWorldAssets {
  skyRing: THREE.Object3D;
  clouds: Array<{ sprite: THREE.Sprite; speed: number }>;
  drones: Array<{ group: THREE.Group; baseY: number; phase: number; period: number }>;
  banners: THREE.Mesh[];
  boundaryWalls: THREE.Mesh[];
  blasterGroup: THREE.Group;
  blasterBeam: THREE.Mesh;
  blasterBeamMat: THREE.MeshBasicMaterial;
  blasterBeamCoreMat: THREE.MeshBasicMaterial;
  muzzleFlashGroup: THREE.Group;
}

export interface BuiltArenaWorld {
  environmentObstacles: THREE.Object3D[]; // For raycast occlusion
  indoorEnvironmentObstacles: THREE.Object3D[];
  colliders: ColliderShape[];
  anchors: SpawnAnchor[];
  animated: AnimatedWorldAssets;
  setIndoorRangeActive: (active: boolean) => void;
  updateIndoorScoreboard: (remainingTargets: number, remainingSec: number) => void;
}

export function buildArenaWorld(
  scene: THREE.Scene,
  _camera: THREE.Camera,
  lowQuality: boolean,
): BuiltArenaWorld {
  const environmentObstacles: THREE.Object3D[] = [];
  const colliders: ColliderShape[] = [];
  const anchors: SpawnAnchor[] = [];

  // Atmospheric perspective fog matching the bright daytime sky (#8ec5eb)
  scene.fog = new THREE.Fog('#8ec5eb', 140, 520);

  // All procedural default terrain, sky domes, floor planes, clouds, and legacy camera viewmodels removed
  const clouds: Array<{ sprite: THREE.Sprite; speed: number }> = [];
  const skyRingGroup = new THREE.Group();
  const drones: Array<{ group: THREE.Group; baseY: number; phase: number; period: number }> = [];
  const banners: THREE.Mesh[] = [];
  const boundaryWalls: THREE.Mesh[] = [];

  const blasterGroup = new THREE.Group();
  blasterGroup.visible = false;
  const blasterBeamMat = new THREE.MeshBasicMaterial({ visible: false });
  const blasterBeamCoreMat = new THREE.MeshBasicMaterial({ visible: false });
  const blasterBeam = new THREE.Mesh(new THREE.BufferGeometry(), blasterBeamMat);
  blasterBeam.visible = false;
  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.visible = false;

  const indoorBuilt = buildIndoorShootingRange(scene, lowQuality);

  return {
    environmentObstacles,
    indoorEnvironmentObstacles: indoorBuilt.obstacles,
    colliders,
    anchors,
    animated: {
      skyRing: skyRingGroup,
      clouds,
      drones,
      banners,
      boundaryWalls,
      blasterGroup,
      blasterBeam,
      blasterBeamMat,
      blasterBeamCoreMat,
      muzzleFlashGroup,
    },
    setIndoorRangeActive: indoorBuilt.setActive,
    updateIndoorScoreboard: indoorBuilt.updateScoreboard,
  };
}

function getIndoorPlasterTexture(): THREE.CanvasTexture {
  if (cachedIndoorPlasterTex) return cachedIndoorPlasterTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#DFC4A3');
  grad.addColorStop(0.65, '#CFB18E');
  grad.addColorStop(1, '#B69977');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle aged plaster patches & trowel texture
  for (let i = 0; i < 360; i++) {
    const x = (i * 113 + 29) % 512;
    const y = (i * 179 + 41) % 512;
    const r = 16 + (i % 38);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(242, 224, 198, 0.11)' : 'rgba(128, 102, 74, 0.1)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hairline masonry / stucco seams
  ctx.strokeStyle = 'rgba(110, 88, 66, 0.16)';
  ctx.lineWidth = 1.5;
  for (let y = 96; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cachedIndoorPlasterTex = tex;
  return tex;
}

function getIndoorWarmWoodTexture(): THREE.CanvasTexture {
  if (cachedIndoorWoodTex) return cachedIndoorWoodTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#744D2D';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 64; i++) {
    const y = i * 4;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 35, 19, 0.28)' : 'rgba(148, 104, 64, 0.16)';
    ctx.fillRect(0, y, 256, 2 + (i % 2));
  }
  ctx.strokeStyle = 'rgba(42, 25, 14, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cachedIndoorWoodTex = tex;
  return tex;
}

function getIndoorConcreteFloorTexture(): THREE.CanvasTexture {
  if (cachedIndoorConcreteTex) return cachedIndoorConcreteTex;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#C4B198';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 520; i++) {
    const x = (i * 89 + 13) % 512;
    const y = (i * 151 + 37) % 512;
    const r = 12 + (i % 34);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(218, 202, 180, 0.12)' : 'rgba(128, 112, 92, 0.11)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Concrete expansion slab lines
  ctx.strokeStyle = 'rgba(98, 84, 68, 0.24)';
  ctx.lineWidth = 2;
  for (let p = 0; p < 512; p += 128) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = 4;
  cachedIndoorConcreteTex = tex;
  return tex;
}

function getIndoorCrateTexture(): THREE.CanvasTexture {
  if (cachedIndoorCrateTex) return cachedIndoorCrateTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#A38C72';
  ctx.fillRect(0, 0, 256, 256);

  // Horizontal planks
  for (let y = 0; y < 256; y += 42) {
    ctx.fillStyle = y % 84 === 0 ? 'rgba(120, 100, 78, 0.25)' : 'rgba(210, 190, 165, 0.14)';
    ctx.fillRect(0, y, 256, 40);
    ctx.fillStyle = 'rgba(65, 52, 38, 0.42)';
    ctx.fillRect(0, y + 40, 256, 2);
  }
  // Outer crate border & diagonal cross beam
  ctx.strokeStyle = '#6E5B46';
  ctx.lineWidth = 20;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(22, 234);
  ctx.lineTo(234, 22);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cachedIndoorCrateTex = tex;
  return tex;
}

function buildBoardedArchedWindow(params: {
  width: number;
  height: number;
  recessMat: THREE.Material;
  trimMat: THREE.Material;
  plankMat: THREE.Material;
  boarded: boolean;
  daylightGlow?: boolean;
}): THREE.Group {
  const grp = new THREE.Group();
  const w = params.width;
  const rectH = params.height - w * 0.5;
  const r = w * 0.5;

  // Flat XY arch shape extruded along +Z (never tilted cylinder!)
  const archShape = new THREE.Shape();
  archShape.moveTo(-r, 0);
  archShape.lineTo(r, 0);
  archShape.lineTo(r, rectH);
  archShape.absarc(0, rectH, r, 0, Math.PI, false);
  archShape.closePath();

  const recessGeo = new THREE.ExtrudeGeometry(archShape, {
    depth: 0.22,
    bevelEnabled: false,
    curveSegments: 16,
  });
  const recessMesh = new THREE.Mesh(recessGeo, params.recessMat);
  recessMesh.position.z = -0.11;
  grp.add(recessMesh);

  // Outer stone/wood arch sill & border
  const sill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, 0.18, 0.3), params.trimMat);
  sill.position.set(0, -0.04, 0.04);
  grp.add(sill);

  if (params.daylightGlow) {
    const paneMat = new THREE.MeshBasicMaterial({ color: '#DCE6F5' });
    const paneMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape, { depth: 0.04, bevelEnabled: false, curveSegments: 14 }),
      paneMat,
    );
    paneMesh.scale.set(0.86, 0.9, 1);
    paneMesh.position.set(0, 0.08, 0.09);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, params.height * 0.88, 0.08), params.trimMat);
    vBar.position.set(0, params.height * 0.45, 0.13);
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.08, 0.08), params.trimMat);
    hBar.position.set(0, rectH * 0.65, 0.13);
    grp.add(paneMesh, vBar, hBar);
  }

  if (params.boarded) {
    const plankSpecs = [
      { x: -0.05, y: params.height * 0.72, rot: -0.08, pw: w + 0.35, ph: 0.22 },
      { x: 0.06, y: params.height * 0.56, rot: 0.07, pw: w + 0.28, ph: 0.2 },
      { x: -0.02, y: params.height * 0.34, rot: -0.04, pw: w + 0.32, ph: 0.22 },
    ];
    for (const ps of plankSpecs) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(ps.pw, ps.ph, 0.09), params.plankMat);
      plank.position.set(ps.x, ps.y, 0.15);
      plank.rotation.z = ps.rot;
      grp.add(plank);
    }
    const patchPanel = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, params.height * 0.48, 0.08),
      params.plankMat,
    );
    patchPanel.position.set(0.08, params.height * 0.44, 0.19);
    patchPanel.rotation.z = -0.09;
    grp.add(patchPanel);
  }

  return grp;
}

function buildIndoorShootingRange(scene: THREE.Scene, lowQuality: boolean): {
  obstacles: THREE.Object3D[];
  setActive: (active: boolean) => void;
  updateScoreboard: (remainingTargets: number, remainingSec: number) => void;
} {
  const root = new THREE.Group();
  root.position.set(INDOOR_RANGE_WORLD.centerX, 0, INDOOR_RANGE_WORLD.centerZ);
  root.visible = false;
  scene.add(root);

  const obstacles: THREE.Object3D[] = [];

  const roomW = 23.6; // local X: -11.8 .. +11.8
  const roomD = 24.4; // local Z: -12.2 .. +12.2
  const wallH = 8.4;

  // Cached textures & shared materials (tuned envMapIntensity 0.34~0.42 for authentic Valorant light/shadow contrast)
  const plasterMat = createToonMat('#E8D7C0', {
    map: getIndoorPlasterTexture(),
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.36,
    lowQuality,
  });
  const concreteFloorMat = createToonMat('#DFCFB8', {
    map: getIndoorConcreteFloorTexture(),
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.34,
    lowQuality,
  });
  const warmWoodMat = createToonMat('#B88E68', {
    map: getIndoorWarmWoodTexture(),
    roughness: 0.82,
    metalness: 0.04,
    envMapIntensity: 0.38,
    lowQuality,
  });
  const plankWoodMat = createToonMat('#BA9E7F', {
    map: getIndoorWarmWoodTexture(),
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.36,
    lowQuality,
  });
  const crateMat = createToonMat('#D8C8B4', {
    map: getIndoorCrateTexture(),
    roughness: 0.86,
    metalness: 0.03,
    envMapIntensity: 0.38,
    lowQuality,
  });
  const plinthStoneMat = createToonMat('#988E83', {
    roughness: 0.9,
    metalness: 0.03,
    envMapIntensity: 0.34,
    lowQuality,
  });
  const darkIronMat = createToonMat('#3E454D', {
    roughness: 0.45,
    metalness: 0.65,
    envMapIntensity: 0.78,
    lowQuality,
  });
  const cableGreyMat = createToonMat('#6D747C', {
    roughness: 0.72,
    metalness: 0.15,
    envMapIntensity: 0.42,
    lowQuality,
  });
  const darkRecessMat = new THREE.MeshBasicMaterial({ color: '#1E1A18' });

  // 1. Matte Beige Concrete Floor + 2 Glowing Orange-Gold Perspective Rails
  const floor = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.4, roomD), concreteFloorMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  root.add(floor);
  obstacles.push(floor);

  const grooveMat = new THREE.MeshBasicMaterial({ color: '#393028' });
  const railCoreMat = new THREE.MeshBasicMaterial({ color: '#FFA83A' });
  const railHaloMat = new THREE.MeshBasicMaterial({
    color: '#FF7D1E',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const railLength = 22.0;
  for (const rx of [-1.85, 1.85]) {
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, railLength), grooveMat);
    groove.position.set(rx, 0.008, -0.9);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.014, railLength), railCoreMat);
    core.position.set(rx, 0.017, -0.9);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.32, railLength), railHaloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(rx, 0.015, -0.9);
    root.add(groove, core, halo);
  }

  // 2. Front, Back, Left, Right Plaster Walls + Stone Wainscot Plinth + Floor Seam AO Strips
  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, wallH, 0.5), plasterMat);
  frontWall.position.set(0, wallH * 0.5, -roomD * 0.5);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(roomW, wallH, 0.5), plasterMat);
  backWall.position.set(0, wallH * 0.5, roomD * 0.5);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, roomD), plasterMat);
  leftWall.position.set(-roomW * 0.5, wallH * 0.5, 0);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, wallH, roomD), plasterMat);
  rightWall.position.set(roomW * 0.5, wallH * 0.5, 0);
  root.add(frontWall, backWall, leftWall, rightWall);
  obstacles.push(frontWall, backWall, leftWall, rightWall);

  // Stone baseboard plinths along front, left, back walls
  const frontPlinth = new THREE.Mesh(new THREE.BoxGeometry(roomW - 0.5, 0.88, 0.62), plinthStoneMat);
  frontPlinth.position.set(0, 0.44, -roomD * 0.5 + 0.08);
  const leftPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.88, roomD - 0.5), plinthStoneMat);
  leftPlinth.position.set(-roomW * 0.5 + 0.08, 0.44, 0);
  root.add(frontPlinth, leftPlinth);

  const frontAo = createWallFloorAoStrip(roomW, 1.35, 0.46);
  frontAo.position.set(0, 0.02, -roomD * 0.5 + 0.88);
  const leftAo = createWallFloorAoStrip(roomD, 1.25, 0.42);
  leftAo.rotation.z = -Math.PI / 2;
  leftAo.position.set(-roomW * 0.5 + 0.82, 0.02, 0);
  const rightAo = createWallFloorAoStrip(roomD, 1.25, 0.48);
  rightAo.rotation.z = Math.PI / 2;
  rightAo.position.set(roomW * 0.5 - 0.82, 0.02, 0);
  root.add(frontAo, leftAo, rightAo);

  // Front wall central & corner masonry pilasters
  for (const px of [-11.35, 0, 11.35]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.95, wallH, 0.52), plasterMat);
    pil.position.set(px, wallH * 0.5, -roomD * 0.5 + 0.25);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.0, 0.68), plinthStoneMat);
    base.position.set(px, 0.5, -roomD * 0.5 + 0.28);
    root.add(pil, base);
  }

  // 3. Front Wall: 2 Boarded Arched Windows + Wall Electrical Distribution Boxes
  for (const wx of [-4.25, 4.25]) {
    const archWin = buildBoardedArchedWindow({
      width: 2.35,
      height: 3.1,
      recessMat: darkRecessMat,
      trimMat: plinthStoneMat,
      plankMat: plankWoodMat,
      boarded: true,
    });
    archWin.position.set(wx, 2.25, -roomD * 0.5 + 0.26);
    root.add(archWin);
  }

  // Front upper-right industrial electrical distribution box & conduits
  const upperBreaker = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.75, 0.26), darkIronMat);
  upperBreaker.position.set(5.3, 6.2, -roomD * 0.5 + 0.34);
  const upperBreakerPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 0.08),
    createToonMat('#5B646E', { roughness: 0.5, metalness: 0.6, envMapIntensity: 0.72, lowQuality }),
  );
  upperBreakerPanel.position.set(4.5, 6.2, -roomD * 0.5 + 0.5);
  const lowerFuseBox = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.2), darkIronMat);
  lowerFuseBox.position.set(5.8, 2.35, -roomD * 0.5 + 0.34);
  const fuseDial = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.32),
    new THREE.MeshBasicMaterial({ color: '#DDE6F0' }),
  );
  fuseDial.position.set(5.8, 2.42, -roomD * 0.5 + 0.45);
  root.add(upperBreaker, upperBreakerPanel, lowerFuseBox, fuseDial);

  // 4. Heavy Timber Beams, Diagonal Knee Braces, Pitched Roof & Central Steel X-Trusses
  const bayZs = [-8.6, -3.2, 2.2, 7.6];
  const postGeo = new THREE.BoxGeometry(0.46, 7.4, 0.46);
  const braceGeo = new THREE.BoxGeometry(0.38, 3.2, 0.38);
  const tieBeamGeo = new THREE.BoxGeometry(roomW - 0.6, 0.48, 0.48);

  for (const bz of bayZs) {
    // Left & right vertical timber columns
    const postL = new THREE.Mesh(postGeo, warmWoodMat);
    postL.position.set(-11.2, 3.7, bz);
    const postR = new THREE.Mesh(postGeo, warmWoodMat);
    postR.position.set(11.2, 3.7, bz);
    root.add(postL, postR);

    // Heavy diagonal timber knee braces from side walls into ceiling beam
    const braceL = new THREE.Mesh(braceGeo, warmWoodMat);
    braceL.position.set(-9.95, 6.1, bz);
    braceL.rotation.z = -Math.PI * 0.26;
    const braceR = new THREE.Mesh(braceGeo, warmWoodMat);
    braceR.position.set(9.95, 6.1, bz);
    braceR.rotation.z = Math.PI * 0.26;
    root.add(braceL, braceR);

    // Horizontal main tie beam
    const tie = new THREE.Mesh(tieBeamGeo, warmWoodMat);
    tie.position.set(0, 7.35, bz);
    root.add(tie);

    // Vertical king post to pitched roof peak
    const kingPost = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.6, 0.42), warmWoodMat);
    kingPost.position.set(0, 8.75, bz);
    root.add(kingPost);
  }

  // Longitudinal timber purlins & ridge beam
  for (const px of [-7.5, -3.6, 0, 3.6, 7.5]) {
    const purlin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, roomD), warmWoodMat);
    purlin.position.set(px, px === 0 ? 7.75 : 7.45, 0);
    root.add(purlin);
  }

  // Pitched warm-wood roof slopes + soft warm clerestory glow strips between roof seams
  const roofPanelMat = createToonMat('#4F3623', {
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.3,
    lowQuality,
  });
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.28, roomD), roofPanelMat);
  roofL.position.set(-6.0, 9.0, 0);
  roofL.rotation.z = 0.22;
  const roofR = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.28, roomD), roofPanelMat);
  roofR.position.set(6.0, 9.0, 0);
  roofR.rotation.z = -0.22;
  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, roomD), warmWoodMat);
  ridgeCap.position.set(0, 10.35, 0);
  root.add(roofL, roofR, ridgeCap);

  // Warm clerestory daylight slits near upper eaves
  const skylightGlowMat = new THREE.MeshBasicMaterial({
    color: '#FFE0AE',
    transparent: true,
    opacity: 0.55,
  });
  for (const sx of [-3.6, 3.6]) {
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.55, roomD - 2), skylightGlowMat);
    slit.rotation.x = Math.PI / 2;
    slit.position.set(sx, 8.7, 0);
    root.add(slit);
  }

  // Central Steel Lattice X-Truss Frame (directly above firing lane & scoreboard)
  const trussFrameGroup = new THREE.Group();
  for (const tz of [-6.0, -0.5, 5.0]) {
    for (const tx of [-2.4, 2.4]) {
      const diagA = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.14), darkIronMat);
      diagA.position.set(tx * 0.5, 7.6, tz);
      diagA.rotation.z = 0.68;
      const diagB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.6, 0.14), darkIronMat);
      diagB.position.set(tx * 0.5, 7.6, tz);
      diagB.rotation.z = -0.68;
      trussFrameGroup.add(diagA, diagB);
    }
  }
  for (const tx of [-2.9, 2.9]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 15.5), darkIronMat);
    rail.position.set(tx, 6.95, 0.5);
    trussFrameGroup.add(rail);
  }
  for (const tz of [-6.8, -3.2, 0.4, 4.0, 7.6]) {
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.2, 0.2), darkIronMat);
    crossBar.position.set(0, 6.95, tz);
    trussFrameGroup.add(crossBar);
  }
  root.add(trussFrameGroup);

  // 5. Ceiling Central Suspended 3D Scoreboard (남음 / 시간) + Corner Bolts + Sagging Cables
  const scoreboardGroup = new THREE.Group();
  scoreboardGroup.position.set(0, 5.38, -5.2);

  // Steel suspension struts up to ceiling truss
  for (const hx of [-1.75, 1.75]) {
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 0.16), darkIronMat);
    hanger.position.set(hx, 1.55, 0);
    scoreboardGroup.add(hanger);
  }

  const boardBody = new THREE.Mesh(
    createBeveledBoxGeometry(5.1, 1.56, 0.34, 0.05, 2),
    createToonMat('#464E56', { roughness: 0.42, metalness: 0.62, envMapIntensity: 0.78, lowQuality }),
  );
  scoreboardGroup.add(boardBody);

  // Bottom conduit junction boxes under scoreboard
  for (const bx of [-1.95, 1.95]) {
    const jBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.28), darkIronMat);
    jBox.position.set(bx, -0.88, 0);
    scoreboardGroup.add(jBox);
  }

  // Corner hex bolts (8 bolts around scoreboard perimeter matching photo)
  const boltGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.08, 6);
  boltGeo.rotateX(Math.PI / 2);
  const boltMat = createToonMat('#7B848E', { roughness: 0.35, metalness: 0.8, envMapIntensity: 0.85, lowQuality });
  const boltPositions: Array<[number, number]> = [
    [-2.35, 0.62],
    [-2.35, -0.62],
    [2.35, 0.62],
    [2.35, -0.62],
    [-1.4, 0.62],
    [1.4, 0.62],
    [-1.4, -0.62],
    [1.4, -0.62],
  ];
  for (const [bx, by] of boltPositions) {
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.position.set(bx, by, 0.18);
    scoreboardGroup.add(bolt);
  }

  // Dynamic Scoreboard Screen CanvasTexture
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 1024;
  sbCanvas.height = 320;
  const sbCtx = sbCanvas.getContext('2d')!;
  const sbTex = new THREE.CanvasTexture(sbCanvas);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  sbTex.anisotropy = 4;

  const sbFace = new THREE.Mesh(
    new THREE.PlaneGeometry(4.78, 1.32),
    new THREE.MeshBasicMaterial({ map: sbTex }),
  );
  sbFace.position.z = 0.185;
  scoreboardGroup.add(sbFace);
  root.add(scoreboardGroup);

  let lastRenderedRem = -1;
  let lastRenderedSec = -1;
  const updateScoreboard = (remainingTargets: number, remainingSec: number) => {
    const rem = Math.max(0, Math.round(remainingTargets));
    const sec = Math.max(0, Math.ceil(remainingSec));
    if (rem === lastRenderedRem && sec === lastRenderedSec) return;
    lastRenderedRem = rem;
    lastRenderedSec = sec;

    sbCtx.fillStyle = '#3B4249';
    sbCtx.fillRect(0, 0, 1024, 320);

    sbCtx.strokeStyle = '#58626C';
    sbCtx.lineWidth = 8;
    sbCtx.strokeRect(8, 8, 1008, 304);

    // Subtle vertical divider
    sbCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    sbCtx.lineWidth = 4;
    sbCtx.beginPath();
    sbCtx.moveTo(512, 34);
    sbCtx.lineTo(512, 286);
    sbCtx.stroke();

    sbCtx.textAlign = 'center';
    sbCtx.fillStyle = '#B8C2CC';
    sbCtx.font = '700 40px "Noto Sans KR", system-ui, sans-serif';
    sbCtx.fillText('남음', 256, 86);
    sbCtx.fillText('시간', 768, 86);

    sbCtx.fillStyle = '#FFFFFF';
    sbCtx.font = '900 164px "Noto Sans KR", system-ui, sans-serif';
    sbCtx.fillText(String(rem).padStart(2, '0'), 256, 252);
    sbCtx.fillText(String(sec).padStart(2, '0'), 768, 252);

    sbTex.needsUpdate = true;
  };
  updateScoreboard(8, 10);

  // Hanging catenary grey power cables on left & right of scoreboard
  const addCable = (pts: THREE.Vector3[], radius = 0.045) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6, false), cableGreyMat);
    root.add(tube);
  };
  addCable([
    new THREE.Vector3(-1.95, 4.45, -5.2),
    new THREE.Vector3(-2.6, 3.35, -7.8),
    new THREE.Vector3(-4.6, 5.2, -11.4),
  ]);
  addCable([
    new THREE.Vector3(1.95, 4.45, -5.2),
    new THREE.Vector3(2.8, 3.4, -8.3),
    new THREE.Vector3(4.5, 5.6, -11.5),
  ]);
  addCable(
    [
      new THREE.Vector3(2.2, 4.55, -5.2),
      new THREE.Vector3(4.4, 3.65, -7.4),
      new THREE.Vector3(6.8, 5.8, -11.4),
    ],
    0.036,
  );

  // 6. Left Side: Twin-Arched Daylight Window + Wooden Crates + Leaning Boards & Ramp
  const leftTwinArch = new THREE.Group();
  leftTwinArch.rotation.y = Math.PI / 2;
  leftTwinArch.position.set(-roomW * 0.5 + 0.25, 2.2, -6.2);
  for (const offset of [-0.88, 0.88]) {
    const bay = buildBoardedArchedWindow({
      width: 1.48,
      height: 3.15,
      recessMat: darkRecessMat,
      trimMat: plinthStoneMat,
      plankMat: darkIronMat,
      boarded: false,
      daylightGlow: true,
    });
    bay.position.x = offset;
    leftTwinArch.add(bay);
  }
  root.add(leftTwinArch);

  // Warm floor light splash cast from left twin arched windows
  const windowSplash = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 4.4),
    new THREE.MeshBasicMaterial({
      color: '#FFE5BD',
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  windowSplash.rotation.x = -Math.PI / 2;
  windowSplash.position.set(-7.6, 0.022, -5.4);
  root.add(windowSplash);

  // Left crates & leaning barricade boards
  const createCrate = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(createBeveledBoxGeometry(w, h, d, 0.04, 2), crateMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    root.add(m);
    const ao = createContactShadowMesh(w * 1.25, d * 1.25, 0.02, 0.55);
    ao.position.set(x, 0.02, z);
    root.add(ao);
  };
  createCrate(1.45, 1.35, 1.45, -10.1, 0.675, -9.8, 0.06);
  createCrate(1.3, 1.18, 1.3, -9.9, 0.59, -6.6, -0.04);
  createCrate(1.05, 0.95, 1.05, -8.5, 0.475, -10.5, 0.22);

  // Foreground-left low wooden ramp prop
  const leftRamp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, 2.2), plankWoodMat);
  leftRamp.position.set(-10.1, 0.52, -2.6);
  leftRamp.rotation.z = -0.34;
  root.add(leftRamp);

  // Leaning wooden barricade planks against front-left stone plinth
  for (let i = 0; i < 3; i++) {
    const lean = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.85, 0.09), plankWoodMat);
    lean.position.set(-7.1 + i * 0.46, 0.9, -11.42);
    lean.rotation.x = -0.18;
    lean.rotation.z = (i - 1) * 0.08;
    root.add(lean);
  }

  // 7. Right Side: 2nd-Floor Mezzanine + Staircase & Railing + Wall Pipes + Architectural Recessed Alcove & Crates
  // Recessed dark storage alcove framed by warm timber beams against the right-rear corner
  const alcoveRecess = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 3.8, 0.35),
    createToonMat('#1D1714', { roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1, lowQuality }),
  );
  alcoveRecess.position.set(10.1, 1.9, -11.65);
  const alcoveLintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.38, 0.65), warmWoodMat);
  alcoveLintel.position.set(10.1, 3.95, -11.45);
  const alcovePostL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 4.1, 0.65), warmWoodMat);
  alcovePostL.position.set(8.45, 2.05, -11.45);
  const alcovePostR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 4.1, 0.65), warmWoodMat);
  alcovePostR.position.set(11.6, 2.05, -11.45);
  root.add(alcoveRecess, alcoveLintel, alcovePostL, alcovePostR);

  createCrate(1.45, 1.35, 1.45, 8.9, 0.675, -9.9, -0.1);
  createCrate(1.15, 1.05, 1.15, 10.4, 0.525, -8.8, 0.08);
  createCrate(0.95, 0.85, 0.95, 9.0, 1.77, -9.9, 0.14);

  // 2nd Floor Gallery Structure (right wall x = +8.5..+11.8, z = -2.0..+8.0)
  const mezzFloor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 9.6), plinthStoneMat);
  mezzFloor.position.set(10.1, 3.2, 2.8);
  const mezzFrontWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.2, 9.6), plasterMat);
  mezzFrontWall.position.set(8.6, 5.4, 2.8);
  const mezzUnderWall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.45), plasterMat);
  mezzUnderWall.position.set(10.1, 1.6, -2.0);
  const upperWindow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 2.2), darkRecessMat);
  upperWindow.position.set(8.42, 5.6, 1.2);
  root.add(mezzFloor, mezzFrontWall, mezzUnderWall, upperWindow);

  // Staircase ascending from z = -5.6 (y = 0) up to z = -1.8 (y = 3.2)
  const stepCount = 10;
  const stepGeo = new THREE.BoxGeometry(1.8, 0.24, 0.44);
  for (let s = 0; s < stepCount; s++) {
    const t = (s + 0.5) / stepCount;
    const step = new THREE.Mesh(stepGeo, plinthStoneMat);
    step.position.set(9.45, t * 3.1, -5.6 + t * 3.8);
    root.add(step);
  }
  const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 5.1), warmWoodMat);
  handrail.position.set(8.52, 2.45, -3.7);
  handrail.rotation.x = 0.67;
  root.add(handrail);
  for (const postT of [0.1, 0.5, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), warmWoodMat);
    post.position.set(8.52, postT * 3.1 + 0.55, -5.6 + postT * 3.8);
    root.add(post);
  }

  // Right wall conduit pipes
  const wallPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 16, 8), darkIronMat);
  wallPipe.rotation.x = Math.PI / 2;
  wallPipe.position.set(11.35, 1.25, -2.5);
  root.add(wallPipe);

  // 8. Warm Indoor Lighting & Feathered Diagonal Volumetric Sunlight Shafts
  const sunSkylight = new THREE.PointLight('#FFD89D', 3.4, 34, 1.1);
  sunSkylight.position.set(-4.5, 8.1, 1.0);
  const frontWarmBounce = new THREE.PointLight('#FFCB8E', 1.7, 28, 1.25);
  frontWarmBounce.position.set(0.5, 5.0, -5.8);
  const rightCoolFill = new THREE.PointLight('#7A92B4', 0.9, 22, 1.35);
  rightCoolFill.position.set(7.5, 4.2, 1.5);
  root.add(sunSkylight, frontWarmBounce, rightCoolFill);

  const shaftCanvas = document.createElement('canvas');
  shaftCanvas.width = 128;
  shaftCanvas.height = 256;
  const sCtx = shaftCanvas.getContext('2d')!;
  const hGrad = sCtx.createLinearGradient(0, 0, 128, 0);
  hGrad.addColorStop(0, 'rgba(255, 226, 178, 0)');
  hGrad.addColorStop(0.28, 'rgba(255, 226, 178, 0.28)');
  hGrad.addColorStop(0.5, 'rgba(255, 232, 190, 0.42)');
  hGrad.addColorStop(0.72, 'rgba(255, 226, 178, 0.28)');
  hGrad.addColorStop(1, 'rgba(255, 226, 178, 0)');
  sCtx.fillStyle = hGrad;
  sCtx.fillRect(0, 0, 128, 256);
  sCtx.globalCompositeOperation = 'destination-in';
  const vGrad = sCtx.createLinearGradient(0, 0, 0, 256);
  vGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  vGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.45)');
  vGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  sCtx.fillStyle = vGrad;
  sCtx.fillRect(0, 0, 128, 256);

  const shaftTex = new THREE.CanvasTexture(shaftCanvas);
  shaftTex.colorSpace = THREE.SRGBColorSpace;
  const sunShaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex,
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const [sx, sz] of [
    [-2.2, -2.5],
    [1.6, -4.2],
    [3.4, 0.4],
  ]) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 11.5), sunShaftMat);
    shaft.position.set(sx, 5.2, sz);
    shaft.rotation.z = -0.46;
    shaft.rotation.y = 0.25;
    root.add(shaft);
  }

  return {
    obstacles,
    setActive: (active: boolean) => {
      root.visible = active;
      // the outdoor skyline is huge (cliffs ~150 m out): keep it out of the indoor hall
      const cliffs = scene.getObjectByName('distant-cliffs');
      if (cliffs) cliffs.visible = !active;
    },
    updateScoreboard,
  };
}

// Target Hologram Panel Builder (Section 2.4 & Section 6)
export type FrameShapeKind =
  | 'shield'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'star'
  | 'bracket'
  | 'laser_track';

export function getShapeKindForType(type: TargetTypeId): FrameShapeKind {
  switch (type) {
    case 'A':
      return 'shield';
    case 'B':
      return 'circle';
    case 'C':
      return 'diamond';
    case 'E':
      return 'star';
    case 'G':
      return 'shield';
    case 'H':
      return 'laser_track';
  }
}

function createFrameExtrudeGeometry(shapeKind: FrameShapeKind): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  const hole = new THREE.Path();
  const rOut = 0.52;
  const rIn = 0.42;

  const drawPolygon = (path: THREE.Shape | THREE.Path, sides: number, radius: number, rot = 0) => {
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
  };

  if (shapeKind === 'circle') {
    outer.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    hole.absarc(0, 0, rIn, 0, Math.PI * 2, true);
  } else if (shapeKind === 'diamond') {
    drawPolygon(outer, 4, rOut * 1.08, 0);
    drawPolygon(hole, 4, rIn * 1.05, 0);
  } else if (shapeKind === 'hexagon') {
    drawPolygon(outer, 6, rOut, Math.PI / 6);
    drawPolygon(hole, 6, rIn, Math.PI / 6);
  } else if (shapeKind === 'star') {
    const pts = 5;
    for (let i = 0; i <= pts * 2; i++) {
      const rad = i % 2 === 0 ? rOut * 1.08 : rOut * 0.62;
      const a = Math.PI / 2 + (i / (pts * 2)) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) outer.moveTo(x, y);
      else outer.lineTo(x, y);
    }
    hole.absarc(0, 0, rIn * 0.72, 0, Math.PI * 2, true);
  } else {
    const s = rOut * 0.96;
    const c = 0.14;
    outer.moveTo(-s + c, s);
    outer.lineTo(s - c, s);
    outer.lineTo(s, s - c);
    outer.lineTo(s, -s + c);
    outer.lineTo(s - c, -s);
    outer.lineTo(-s + c, -s);
    outer.lineTo(-s, -s + c);
    outer.lineTo(-s, s - c);
    outer.closePath();

    const si = rIn * 0.94;
    const ci = 0.1;
    hole.moveTo(-si + ci, si);
    hole.lineTo(si - ci, si);
    hole.lineTo(si, si - ci);
    hole.lineTo(si, -si + ci);
    hole.lineTo(si - ci, -si);
    hole.lineTo(-si + ci, -si);
    hole.lineTo(-si, -si + ci);
    hole.lineTo(-si, si - ci);
    hole.closePath();
  }

  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
}

const frameGeoCache = new Map<FrameShapeKind, THREE.ExtrudeGeometry>();
export function getCachedFrameGeometry(kind: FrameShapeKind): THREE.ExtrudeGeometry {
  if (!frameGeoCache.has(kind)) {
    frameGeoCache.set(kind, createFrameExtrudeGeometry(kind));
  }
  return frameGeoCache.get(kind)!;
}

export interface TargetVisualBuild {
  root: THREE.Group;
  panelGroup: THREE.Group;
  frameMesh: THREE.Mesh;
  reticleMesh: THREE.Mesh;
  colliderMesh: THREE.Mesh;
  laserTrackGroup?: THREE.Group;
  laserCurve?: THREE.CatmullRomCurve3;
  laserCurveSamplesLocal?: THREE.Vector3[];
  laserTubularSegments?: number;
  laserRadialSegments?: number;
  progressTubeGeo?: THREE.TubeGeometry;
  progressTubeMat?: THREE.MeshBasicMaterial;
  startRingGroup?: THREE.Group;
  endRingGroup?: THREE.Group;
  laserCursorGroup?: THREE.Group;
  missionBracketMesh?: THREE.Mesh;
  missionBracketMat?: THREE.MeshBasicMaterial;
}

function createCornerBracketGeometry(radius: number): THREE.BufferGeometry {
  const e = radius * 1.24;
  const arm = Math.max(0.24, radius * 0.44);
  const t = Math.max(0.046, radius * 0.085);
  const parts: THREE.BufferGeometry[] = [];

  const addBar = (w: number, h: number, x: number, y: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(x, y, 0);
    parts.push(g);
  };

  // Top-Left corner
  addBar(arm, t, -e + arm * 0.5, e - t * 0.5);
  addBar(t, arm, -e + t * 0.5, e - arm * 0.5);
  // Top-Right corner
  addBar(arm, t, e - arm * 0.5, e - t * 0.5);
  addBar(t, arm, e - t * 0.5, e - arm * 0.5);
  // Bottom-Left corner
  addBar(arm, t, -e + arm * 0.5, -e + t * 0.5);
  addBar(t, arm, -e + t * 0.5, -e + arm * 0.5);
  // Bottom-Right corner
  addBar(arm, t, e - arm * 0.5, -e + t * 0.5);
  addBar(t, arm, e - t * 0.5, -e + arm * 0.5);

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function buildHologramTargetMesh(params: {
  instanceId: string;
  typeId: TargetTypeId;
  visualColor: string;
  shapeKind: FrameShapeKind;
  diameter: number;
  aimAssistMul: number;
  hasPedestal: boolean;
  lowQuality: boolean;
  difficulty?: number;
  isMissionCorrect?: boolean;
  laserTrackSpec?: LaserTrackDifficultySpec;
}): TargetVisualBuild {
  const root = new THREE.Group();
  const panelGroup = new THREE.Group();
  root.add(panelGroup);

  const isCorrect = params.isMissionCorrect ?? true;
  const isLaserTrack = params.typeId === 'H';
  const effProfile = computeTargetVisualEffectProfile({
    difficulty: params.difficulty ?? 1,
    typeId: params.typeId,
    isMissionCorrect: isCorrect,
  });

  const radius = params.diameter * 0.5;
  const frameGeo = getCachedFrameGeometry(params.shapeKind);
  const frameMat = new THREE.MeshStandardMaterial({
    color: params.visualColor,
    emissive: params.visualColor,
    emissiveIntensity: effProfile.emissiveIntensity,
    roughness: 0.32,
    metalness: 0.18,
    transparent: true,
    opacity: effProfile.frameOpacity,
  });

  const frameMesh = new THREE.Mesh(frameGeo, frameMat);
  frameMesh.position.z = -0.06;
  frameMesh.scale.setScalar(params.diameter);
  if (!isLaserTrack) {
    addCartoonOutline(frameMesh, 1.025, '#0F1923');
    panelGroup.add(frameMesh);
  } else {
    frameMesh.visible = false;
  }

  const reticleTex = getTargetReticleTexture(params.visualColor);
  const reticleMat = new THREE.MeshBasicMaterial({
    map: reticleTex,
    transparent: true,
    alphaTest: 0.08,
    opacity: 0.96,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const reticleMesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.88, 36),
    reticleMat,
  );
  reticleMesh.position.z = 0.08;
  if (!isLaserTrack) {
    panelGroup.add(reticleMesh);
  } else {
    reticleMesh.visible = false;
  }

  const backPlate = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.86, 32),
    new THREE.MeshBasicMaterial({
      color: '#0F1923',
      transparent: true,
      opacity: 0.88,
      depthWrite: true,
    }),
  );
  backPlate.position.z = -0.07;
  if (!isLaserTrack) {
    panelGroup.add(backPlate);
  } else {
    backPlate.visible = false;
  }

  if (!isLaserTrack) {
    // visual-only depth: dark metal backing in the frame's shape, emitter nubs and a soft hologram halo
    // (hit detection uses colliderMesh only, so none of this changes gameplay)
    addTargetDepthDressing(panelGroup, frameGeo, params.diameter, params.visualColor, params.shapeKind === 'circle', params.lowQuality);
  }

  let missionBracketMesh: THREE.Mesh | undefined;
  let missionBracketMat: THREE.MeshBasicMaterial | undefined;
  if (params.typeId === 'G' && isCorrect) {
    const bracketGeo = createCornerBracketGeometry(radius);
    missionBracketMat = new THREE.MeshBasicMaterial({
      color: '#FF3648',
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    missionBracketMesh = new THREE.Mesh(bracketGeo, missionBracketMat);
    missionBracketMesh.position.z = 0.11;
    panelGroup.add(missionBracketMesh);
  }

  if (!isLaserTrack) {
    if (params.hasPedestal) {
      const legL = new THREE.Mesh(
        createBeveledBoxGeometry(0.12, radius * 0.45, 0.12, 0.025, 2),
        createToonMat('#4A505A', { lowQuality: params.lowQuality, roughness: 0.36, metalness: 0.65, envMapIntensity: 0.88 }),
      );
      legL.position.set(-radius * 0.35, -radius * 0.62, 0);
      const legR = legL.clone();
      legR.position.set(radius * 0.35, -radius * 0.62, 0);
      const basePlate = new THREE.Mesh(
        createBeveledBoxGeometry(radius * 1.1, 0.12, 0.45, 0.03, 2),
        createToonMat('#343840', { lowQuality: params.lowQuality, roughness: 0.36, metalness: 0.65, envMapIntensity: 0.88 }),
      );
      basePlate.position.set(0, -radius * 0.82, 0);
      root.add(legL, legR, basePlate);
    } else {
      const hoverRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.38, 0.04, 8, 20),
        new THREE.MeshBasicMaterial({ color: params.visualColor }),
      );
      hoverRing.rotation.x = Math.PI / 2;
      hoverRing.position.set(0, -radius * 0.68, 0);
      root.add(hoverRing);
    }
  }

  let laserTrackGroup: THREE.Group | undefined;
  let laserCurve: THREE.CatmullRomCurve3 | undefined;
  let laserCurveSamplesLocal: THREE.Vector3[] | undefined;
  let laserTubularSegments: number | undefined;
  let laserRadialSegments: number | undefined;
  let progressTubeGeo: THREE.TubeGeometry | undefined;
  let progressTubeMat: THREE.MeshBasicMaterial | undefined;
  let startRingGroup: THREE.Group | undefined;
  let endRingGroup: THREE.Group | undefined;
  let laserCursorGroup: THREE.Group | undefined;
  let colliderMesh: THREE.Mesh;

  if (isLaserTrack) {
    const trackSpec =
      params.laserTrackSpec ?? computeLaserTrackSpecForDifficulty(params.difficulty ?? 1);
    laserTrackGroup = new THREE.Group();

    const curvePoints = trackSpec.points.map(
      (pt) => new THREE.Vector3(pt.x, pt.y, 0.04),
    );
    laserCurve = new THREE.CatmullRomCurve3(
      curvePoints,
      false,
      'centripetal',
      0.25,
    );

    laserTubularSegments = 80;
    laserRadialSegments = 12;
    laserCurveSamplesLocal = laserCurve.getSpacedPoints(79);

    // 1. Sleek, thin translucent hologram guide line (no thick dark pipe or intermediate spheres)
    const guideTubeGeo = new THREE.TubeGeometry(
      laserCurve,
      laserTubularSegments,
      trackSpec.tubeRadius,
      laserRadialSegments,
      false,
    );
    const guideTubeMat = new THREE.MeshBasicMaterial({
      color: '#2CE8F5',
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const guideTubeMesh = new THREE.Mesh(guideTubeGeo, guideTubeMat);
    guideTubeMesh.userData = {
      targetId: params.instanceId,
      visibleRadius: radius,
      isLaserTrackBody: true,
    };
    laserTrackGroup.add(guideTubeMesh);

    // 2. Real-time filled luminous trail (0% -> progress%), controlled seamlessly via drawRange
    progressTubeGeo = new THREE.TubeGeometry(
      laserCurve,
      laserTubularSegments,
      trackSpec.tubeRadius * 1.35,
      laserRadialSegments,
      false,
    );
    progressTubeGeo.setDrawRange(0, 0);
    progressTubeMat = new THREE.MeshBasicMaterial({
      color: '#3AF9FF',
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    const progressTubeMesh = new THREE.Mesh(progressTubeGeo, progressTubeMat);
    progressTubeMesh.position.z = 0.015;
    laserTrackGroup.add(progressTubeMesh);

    // 3. Clean Start Ring (subtle pulsing point) & End Ring (crisp target ring)
    const startPt = laserCurve.getPointAt(0);
    const endPt = laserCurve.getPointAt(1);

    startRingGroup = new THREE.Group();
    startRingGroup.position.set(startPt.x, startPt.y, 0.08);
    const startOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.11, 0.16, 28),
      new THREE.MeshBasicMaterial({
        color: '#3AF9FF',
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    const startCenterDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 20),
      new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      }),
    );
    startCenterDot.position.z = 0.01;
    startRingGroup.add(startOuterRing, startCenterDot);
    laserTrackGroup.add(startRingGroup);

    endRingGroup = new THREE.Group();
    endRingGroup.position.set(endPt.x, endPt.y, 0.08);
    const endOuterRing = new THREE.Mesh(
      new THREE.RingGeometry(0.125, 0.18, 28),
      new THREE.MeshBasicMaterial({
        color: '#FFD166',
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      }),
    );
    const endInnerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.082, 24),
      new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    );
    endInnerRing.position.z = 0.01;
    endRingGroup.add(endOuterRing, endInnerRing);
    laserTrackGroup.add(endRingGroup);

    // 4. Moving glowing cursor bead along active fill head
    laserCursorGroup = new THREE.Group();
    laserCursorGroup.position.set(startPt.x, startPt.y, 0.12);
    const cursorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.145, 24),
      new THREE.MeshBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    const cursorDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 16),
      new THREE.MeshBasicMaterial({
        color: '#3AF9FF',
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide,
      }),
    );
    cursorDot.position.z = 0.01;
    laserCursorGroup.add(cursorRing, cursorDot);
    laserCursorGroup.visible = false;
    laserTrackGroup.add(laserCursorGroup);

    panelGroup.add(laserTrackGroup);

    colliderMesh = new THREE.Mesh(
      new THREE.CircleGeometry(LASER_START_MARKER_RADIUS, 28),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    colliderMesh.position.set(startPt.x, startPt.y, 0.08);
  } else {
    const colliderRadius = radius * params.aimAssistMul;
    colliderMesh = new THREE.Mesh(
      new THREE.CircleGeometry(colliderRadius, 24),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    colliderMesh.position.z = 0.1;
  }

  colliderMesh.userData = {
    targetId: params.instanceId,
    visibleRadius: radius,
    startMarkerRadius: isLaserTrack ? LASER_START_MARKER_RADIUS : undefined,
    isTarget: true,
    isMissionTarget: Boolean(isCorrect),
  };
  panelGroup.add(colliderMesh);

  root.userData = {
    ...root.userData,
    targetId: params.instanceId,
    isTarget: true,
    isMissionTarget: Boolean(isCorrect),
  };
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.userData = {
        ...obj.userData,
        targetId: params.instanceId,
        isTarget: true,
        isMissionTarget: Boolean(isCorrect),
      };
    }
  });

  return {
    root,
    panelGroup,
    frameMesh,
    reticleMesh,
    colliderMesh,
    laserTrackGroup,
    laserCurve,
    laserCurveSamplesLocal,
    laserTubularSegments,
    laserRadialSegments,
    progressTubeGeo,
    progressTubeMat,
    startRingGroup,
    endRingGroup,
    laserCursorGroup,
    missionBracketMesh,
    missionBracketMat,
  };
}

// =====================================================================
// COURTYARD DETAIL PASS (맵 디테일 추가) - original environment dressing
// =====================================================================
import { RoundedBoxGeometry as CDRoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const addCourtyardDetailPass = (() => {

  interface CourtyardDetailOptions {
    lowQuality: boolean;
    environmentObstacles: THREE.Object3D[];
    colliders: ColliderShape[];
    /** Objects that must never cast shadows (e.g. the camera with the viewmodel) */
    shadowExclude?: THREE.Object3D[];
    /** Existing world pieces re-styled for the sunny stone-courtyard mood */
    mood?: {
      skyDome?: THREE.Mesh;
      mainFloor?: THREE.Mesh;
      playerPad?: THREE.Mesh;
      wallTexture?: THREE.Texture;
      skyRift?: THREE.Object3D;
    };
  }

  /** Set to false to bring back the orange sky rift above the central building */
  const HIDE_SKY_RIFT = true;

  // ---------------------------------------------------------------------------
  // Mood textures: cool grey-beige flagstones & clear azure sky
  // ---------------------------------------------------------------------------
  function flagstoneTex() {
    return canvasTex(
      'flagstone',
      1024,
      1024,
      (ctx) => {
        const rng = makeRng(1234);
        const S = 1024;
        ctx.fillStyle = '#5F5A52'; // grout
        ctx.fillRect(0, 0, S, S);
        const palette = ['#B4AEA2', '#ABA699', '#BDB6A8', '#A49E92', '#C3BAA8', '#B8AC98', '#9E9A90'];
        let y = 0;
        while (y < S) {
          const rh = 110 + Math.floor(rng() * 4) * 30;
          const h = Math.min(rh, S - y);
          let x = -Math.floor(rng() * 120);
          while (x < S) {
            const w = 130 + Math.floor(rng() * 5) * 40;
            const g = 5 + rng() * 3;
            const col = palette[Math.floor(rng() * palette.length)];
            const x0 = x + g;
            const y0 = y + g;
            const ww = w - g * 2;
            const hh = h - g * 2;
            // stone body with soft vertical value shift
            const lg = ctx.createLinearGradient(x0, y0, x0 + ww * 0.3, y0 + hh);
            lg.addColorStop(0, col);
            lg.addColorStop(1, shade(col, -14 - rng() * 10));
            ctx.fillStyle = lg;
            roundRect(ctx, x0, y0, ww, hh, 6 + rng() * 6);
            ctx.fill();
            // worn top-left highlight, bottom-right shadow lip
            ctx.fillStyle = 'rgba(255,250,240,0.16)';
            ctx.fillRect(x0 + 4, y0 + 3, ww - 8, 3);
            ctx.fillStyle = 'rgba(30,28,24,0.22)';
            ctx.fillRect(x0 + 4, y0 + hh - 5, ww - 8, 4);
            // grain speckle
            for (let k = 0; k < (ww * hh) / 260; k++) {
              ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(40,36,30,0.08)';
              ctx.fillRect(x0 + rng() * ww, y0 + rng() * hh, 2, 2);
            }
            // occasional crack
            if (rng() < 0.22) {
              ctx.strokeStyle = 'rgba(48,44,38,0.45)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              let cx = x0 + rng() * ww;
              let cy = y0;
              ctx.moveTo(cx, cy);
              for (let k = 0; k < 5; k++) {
                cx += (rng() - 0.5) * 30;
                cy += hh / 5;
                ctx.lineTo(cx, cy);
              }
              ctx.stroke();
            }
            x += w;
          }
          y += h;
        }
        // moss in the grout + broad sun-bleach / damp patches
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = `rgba(${70 + rng() * 30},${95 + rng() * 30},${50 + rng() * 20},${0.15 + rng() * 0.25})`;
          ctx.fillRect(rng() * S, rng() * S, 2 + rng() * 3, 2 + rng() * 3);
        }
        for (let i = 0; i < 26; i++) {
          const x = rng() * S;
          const yy = rng() * S;
          const r = 80 + rng() * 200;
          const g = ctx.createRadialGradient(x, yy, 0, x, yy, r);
          g.addColorStop(0, rng() > 0.5 ? 'rgba(255,246,228,0.10)' : 'rgba(60,64,70,0.10)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, yy - r, r * 2, r * 2);
        }
      },
      true,
    );
  }

  function shade(hex: string, amt: number) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function clearSkyTex() {
    return canvasTex('clearSky', 1024, 512, (ctx) => {
      const rng = makeRng(99);
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0.0, '#2A64AE');
      g.addColorStop(0.25, '#4C88CC');
      g.addColorStop(0.45, '#7FADDC');
      g.addColorStop(0.5, '#B7D1E8');
      g.addColorStop(0.56, '#DCE6EE');
      g.addColorStop(1.0, '#D6DEE4');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1024, 512);
      // soft fair-weather clouds in the upper hemisphere
      for (let i = 0; i < 26; i++) {
        const cx = rng() * 1024;
        const cy = 110 + rng() * 130;
        const puffs = 4 + Math.floor(rng() * 5);
        for (let k = 0; k < puffs; k++) {
          const px = cx + (rng() - 0.5) * 90;
          const py = cy + (rng() - 0.5) * 14;
          const r = 16 + rng() * 26;
          const cg = ctx.createRadialGradient(px, py - r * 0.3, 2, px, py, r);
          cg.addColorStop(0, 'rgba(255,255,255,0.55)');
          cg.addColorStop(0.6, 'rgba(240,244,250,0.22)');
          cg.addColorStop(1, 'rgba(240,244,250,0)');
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  /** Finds the existing courtyard pieces so only ONE call line is needed in worldBuilder.ts */
  function detectMood(scene: THREE.Scene): NonNullable<CourtyardDetailOptions['mood']> {
    const mood: NonNullable<CourtyardDetailOptions['mood']> = {};
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const g = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> };
        const prm = g.parameters;
        if (g.type === 'SphereGeometry' && prm && prm.radius >= 100 && !mood.skyDome) mood.skyDome = mesh;
        if (g.type === 'PlaneGeometry' && prm && prm.width === 72 && prm.height === 72 && !mood.mainFloor) mood.mainFloor = mesh;
        if (g.type === 'PlaneGeometry' && prm && prm.width === 22 && prm.height === 11 && !mood.playerPad) mood.playerPad = mesh;
      }
      const sp = o as THREE.Sprite;
      if (sp.isSprite && !mood.skyRift) {
        const c = (sp.material as THREE.SpriteMaterial).color;
        if (c && c.getHexString() === 'ff5412' && sp.parent) mood.skyRift = sp.parent;
      }
    });
    return mood;
  }

  /**
   * Sun / sky lighting re-balance done from here so App.tsx does not need edits:
   * less flat studio fill, stronger warm sun, cool shade, and real sun shadows
   * (also on 'low' quality, with a cheaper shadow map).
   */
  function applyLighting(scene: THREE.Scene, lowQuality: boolean) {
    scene.environmentIntensity = 0.45;
    if (scene.background instanceof THREE.Color) scene.background.set('#C6D0D8');

    let sun: THREE.DirectionalLight | null = null;
    scene.traverse((o) => {
      const hemi = o as THREE.HemisphereLight;
      if (hemi.isHemisphereLight) {
        // lower fill + stronger sun = clear light/shadow separation
        // cool blue-grey fill so the shadow side reads cool against the warm sun
        hemi.color.set('#A9BDD1');
        hemi.groundColor.set('#7E7A74');
        hemi.intensity = 0.78;
      }
      const dl = o as THREE.DirectionalLight;
      if (dl.isDirectionalLight && (!sun || dl.intensity > sun.intensity)) sun = dl;
    });
    const sunLight = sun as THREE.DirectionalLight | null;
    if (sunLight) {
      sunLight.color.set('#FFD7A3');
      sunLight.intensity = 3.3;
      // Late-afternoon sun from the front-left, fairly low: long diagonal shadows run
      // across the floor toward the back-right, the tower front and right wall catch
      // warm light and the low left wall sits in cool shade.
      sunLight.position.set(-17, 21, 13);
      sunLight.target.position.set(0, 0, -4);
      sunLight.target.updateMatrixWorld();
      const sc = sunLight.shadow.camera;
      sc.near = 5;
      sc.far = 82;
      sc.left = -24;
      sc.right = 24;
      sc.top = 24;
      sc.bottom = -24;
      sc.updateProjectionMatrix();
      sunLight.shadow.bias = -0.00045;
      sunLight.shadow.normalBias = 0.02;
      const size = lowQuality ? 1024 : 2048;
      sunLight.shadow.mapSize.set(size, size);
      sunLight.castShadow = true;
    }

    // Turn the renderer's shadow map on at the first frame (App.tsx disables it on 'low').
    const prev = scene.onBeforeRender;
    let checked = false;
    let lastShadowUpdate = -1e9;
    scene.onBeforeRender = function (renderer, ...rest) {
      if (!checked) {
        checked = true;
        renderer.toneMappingExposure = 0.85;
        if (!renderer.shadowMap.enabled && !isSoftwareRenderer(renderer)) {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = lowQuality ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
          scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => m && (m.needsUpdate = true));
          });
        }
        if (!renderer.shadowMap.enabled && sunLight) sunLight.castShadow = false;
      }
      // The sun never moves, so the shadow map does not need a redraw for every render
      // call (the AO pass renders the scene a second time each frame). Refresh it at
      // ~30 Hz, which keeps moving targets' shadows smooth at a fraction of the cost.
      if (renderer.shadowMap.enabled) {
        renderer.shadowMap.autoUpdate = false;
        const now = performance.now();
        if (now - lastShadowUpdate > 33) {
          lastShadowUpdate = now;
          renderer.shadowMap.needsUpdate = true;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prev as any).call(this, renderer, ...rest);
    };
  }

  function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name);
    } catch {
      return false;
    }
  }

  const pbrLoader = new THREE.TextureLoader();
  const pbrBase = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') + 'assets/textures/';
  function loadPbr(file: string, rx: number, ry: number, srgb: boolean, onLoad: (t: THREE.Texture) => void) {
    pbrLoader.load(
      pbrBase + file,
      (t) => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        onLoad(t);
      },
      undefined,
      () => {
        /* texture missing: keep the procedural fallback */
      },
    );
  }

  function applyMood(scene: THREE.Scene, mood: NonNullable<CourtyardDetailOptions['mood']>) {
    // Clear azure sky and a light blue-grey atmospheric haze instead of beige
    if (mood.skyDome) {
      const m = mood.skyDome.material as THREE.MeshBasicMaterial;
      m.map = hazeSkyTexture();
      m.needsUpdate = true;
    }
    // pale blue-grey haze: distant cliffs fade into it in layers
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set('#C6D0D8');
      scene.fog.near = 30;
      scene.fog.far = 240;
    }
    if (HIDE_SKY_RIFT && mood.skyRift) mood.skyRift.visible = false;

    // Cool grey-beige flagstones (sun patches read warm, shade reads cool)
    if (mood.mainFloor) {
      const tex = flagstoneTex();
      tex.repeat.set(12, 12);
      const m = mood.mainFloor.material as THREE.MeshStandardMaterial;
      m.map = tex;
      m.color.set('#EAE6E0');
      m.roughness = 0.92;
      m.needsUpdate = true;
    }
    if (mood.playerPad) {
      const tex = flagstoneTex().clone();
      tex.needsUpdate = true;
      tex.repeat.set(22 / 6, 11 / 6);
      const m = mood.playerPad.material as THREE.MeshStandardMaterial;
      m.map = tex;
      m.color.set('#FAF0E0');
      m.needsUpdate = true;
    }

    // Real-looking PBR surfaces (original generated textures in public/assets/textures).
    // Each map is swapped in once it has loaded, so a missing file simply keeps the procedural look.
    {
      const floors: Array<[THREE.Mesh | undefined, number, number, string]> = [
        [mood.mainFloor, 12, 12, '#A3A7AA'],
        [mood.playerPad, 22 / 6, 11 / 6, '#B9BCBE'],
      ];
      for (const [mesh, rx, ry, tint] of floors) {
        if (!mesh) continue;
        const m = mesh.material as THREE.MeshStandardMaterial;
        loadPbr('flagstone_albedo.jpg', rx, ry, true, (t) => {
          m.map = t;
          m.color.set(tint);
          m.needsUpdate = true;
        });
        loadPbr('flagstone_normal.jpg', rx, ry, false, (t) => {
          m.normalMap = t;
          m.normalScale.set(2.0, 2.0);
          m.bumpScale = 0;
          m.needsUpdate = true;
        });
        loadPbr('flagstone_rough.jpg', rx, ry, false, (t) => {
          m.roughnessMap = t;
          m.roughness = 1;
          m.needsUpdate = true;
        });
      }
    }

    // Warmer, more saturated sandstone plaster on every courtyard wall
    {
      const wt = mood.wallTexture;
      const tinted = new Set<THREE.Material>();
      const ws = new THREE.Vector3();
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh === mood.mainFloor || mesh === mood.playerPad || mesh === mood.skyDome) return;
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (!m || !m.isMeshStandardMaterial || !m.map || tinted.has(m)) return;
        let isWall = false;
        if (wt) {
          isWall = m.map === wt;
        } else {
          // auto-detect: large, untinted textured architecture in the outdoor courtyard
          if (m.color.getHex() !== 0xffffff) return;
          if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
          mesh.getWorldScale(ws);
          const r = mesh.geometry.boundingSphere!.radius * Math.max(ws.x, ws.y, ws.z);
          const p = mesh.getWorldPosition(new THREE.Vector3());
          isWall = r > 4 && Math.abs(p.x) < 60 && Math.abs(p.z) < 60 && p.y > 1;
        }
        if (isWall) {
          m.color.set('#FCE4BE');
          tinted.add(m);
          // plaster relief: repeat so one tile covers ~4 m of wall
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const sz = mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(mesh.getWorldScale(new THREE.Vector3()));
          const dims = [sz.x, sz.y, sz.z].sort((a, b) => b - a);
          const rx = Math.max(1, dims[0] / 4);
          const ry = Math.max(1, dims[1] / 4);
          loadPbr('plaster_normal.jpg', rx, ry, false, (t) => {
            m.normalMap = t;
            m.normalScale.set(0.9, 0.9);
            m.needsUpdate = true;
          });
        }
      });
    }

    // Grey-brown facades -> warm sun-baked sandstone (same shapes, warmer palette)
    const remap: Record<string, string> = {
      '8f8378': 'e3cba8',
      '7c7065': 'd6bb96',
      '63584e': 'a88d6c',
      'b6a898': 'e6d0b0',
    };
    const done = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        const m = mm as THREE.MeshStandardMaterial;
        if (!m || done.has(m) || !m.isMeshStandardMaterial || m.map) continue;
        done.add(m);
        const to = remap[m.color.getHexString()];
        if (to) m.color.set('#' + to);
      }
    });
    {
    }
  }

  // ---------------------------------------------------------------------------
  // Deterministic random so the map looks identical on every load
  // ---------------------------------------------------------------------------
  function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Procedural textures (cached)
  // ---------------------------------------------------------------------------
  const texCache = new Map<string, THREE.CanvasTexture>();

  function canvasTex(
    key: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
    repeat = false,
    srgb = true,
  ): THREE.CanvasTexture {
    const hit = texCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx);
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    tex.anisotropy = 4;
    texCache.set(key, tex);
    return tex;
  }

  function grimeTex() {
    return canvasTex('grime', 256, 256, (ctx) => {
      const rng = makeRng(7);
      ctx.clearRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) {
        const x = 128 + (rng() - 0.5) * 150;
        const y = 128 + (rng() - 0.5) * 150;
        const r = 18 + rng() * 46;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const a = 0.05 + rng() * 0.08;
        g.addColorStop(0, `rgba(48,38,28,${a})`);
        g.addColorStop(1, 'rgba(48,38,28,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // keep edges fully transparent
      const fade = ctx.createRadialGradient(128, 128, 70, 128, 128, 128);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 256, 256);
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  function grassTuftTex() {
    return canvasTex('grassTuft', 128, 128, (ctx) => {
      const rng = makeRng(21);
      ctx.clearRect(0, 0, 128, 128);
      for (let i = 0; i < 26; i++) {
        const bx = 20 + rng() * 88;
        const lean = (rng() - 0.5) * 40;
        const h = 50 + rng() * 70;
        const shade = Math.floor(70 + rng() * 60);
        ctx.strokeStyle = `rgb(${shade - 20},${shade + 40},${Math.floor(shade * 0.45)})`;
        ctx.lineWidth = 3 + rng() * 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, 128);
        ctx.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h);
        ctx.stroke();
      }
    });
  }

  function leafTex() {
    return canvasTex('leaf', 64, 64, (ctx) => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = '#B9822F';
      ctx.beginPath();
      ctx.ellipse(32, 32, 26, 13, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,52,18,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 44);
      ctx.lineTo(54, 20);
      ctx.stroke();
    });
  }

  function barrelTex() {
    return canvasTex(
      'barrel',
      256,
      256,
      (ctx) => {
        const rng = makeRng(33);
        const staves = 12;
        const sw = 256 / staves;
        for (let i = 0; i < staves; i++) {
          const v = 120 + Math.floor(rng() * 30);
          ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.66)},${Math.floor(v * 0.4)})`;
          ctx.fillRect(i * sw, 0, sw, 256);
          ctx.fillStyle = 'rgba(40,22,10,0.55)';
          ctx.fillRect(i * sw, 0, 2, 256);
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = 'rgba(60,34,16,0.18)';
            ctx.fillRect(i * sw + 4 + rng() * (sw - 8), rng() * 256, 1.5, 20 + rng() * 50);
          }
        }
        // iron hoops
        for (const y of [22, 92, 164, 234]) {
          ctx.fillStyle = '#3A3634';
          ctx.fillRect(0, y - 7, 256, 14);
          ctx.fillStyle = 'rgba(255,240,220,0.18)';
          ctx.fillRect(0, y - 7, 256, 3);
        }
      },
      true,
    );
  }

  function awningTex(a: string, b: string, key: string) {
    return canvasTex(key, 256, 256, (ctx) => {
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? a : b;
        ctx.fillRect((i * 256) / stripes, 0, 256 / stripes, 256);
      }
      // sun-fade + soft fold shading
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, 'rgba(255,250,235,0.18)');
      g.addColorStop(1, 'rgba(40,24,16,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      // scalloped bottom edge
      ctx.globalCompositeOperation = 'destination-out';
      for (let x = 0; x < 256; x += 32) {
        ctx.beginPath();
        ctx.arc(x + 16, 262, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    });
  }

  function stoneBlockTex() {
    return canvasTex(
      'stoneBlock',
      256,
      128,
      (ctx) => {
        const rng = makeRng(55);
        ctx.fillStyle = '#9A8E7E';
        ctx.fillRect(0, 0, 256, 128);
        const bh = 32;
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 32 : 0;
          for (let x = -64 + off; x < 256; x += 64) {
            const v = 140 + Math.floor(rng() * 40);
            ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.93)},${Math.floor(v * 0.82)})`;
            ctx.fillRect(x + 2, row * bh + 2, 60, bh - 4);
            ctx.fillStyle = 'rgba(255,248,232,0.16)';
            ctx.fillRect(x + 2, row * bh + 2, 60, 3);
          }
        }
        for (let i = 0; i < 300; i++) {
          ctx.fillStyle = `rgba(50,42,32,${0.05 + rng() * 0.1})`;
          ctx.fillRect(rng() * 256, rng() * 128, 2, 2);
        }
      },
      true,
    );
  }

  function sackTex() {
    return canvasTex('sack', 64, 64, (ctx) => {
      ctx.fillStyle = '#C6AE84';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = 'rgba(110,86,52,0.35)';
      for (let i = 0; i < 64; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 64);
        ctx.moveTo(0, i);
        ctx.lineTo(64, i);
        ctx.stroke();
      }
    }, true);
  }

  // ---------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------
  function mat(color: string, o: { map?: THREE.Texture; roughness?: number; metalness?: number; emissive?: string; emissiveIntensity?: number } = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      map: o.map ?? null,
      roughness: o.roughness ?? 0.88,
      metalness: o.metalness ?? 0.02,
      emissive: o.emissive ?? '#000000',
      emissiveIntensity: o.emissiveIntensity ?? 0,
      envMapIntensity: 0.38,
    });
  }

  let glowTexCache: THREE.CanvasTexture | null = null;
  function glowTex() {
    if (glowTexCache) return glowTexCache;
    glowTexCache = canvasTex('glow', 64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    return glowTexCache;
  }

  // ---------------------------------------------------------------------------
  // Main entry
  // ---------------------------------------------------------------------------
  function addCourtyardDetail(scene: THREE.Scene, opts: CourtyardDetailOptions): void {
    const { lowQuality, environmentObstacles, colliders } = opts;
    const root = new THREE.Group();
    root.name = 'courtyard-detail';
    // Clean stylized look: skip the small clutter passes (wall dressing, cart,
    // bunting, ground litter, pergola/puddles). Set to false to bring them back.
    const CLEAN_STYLE = true;

    // Full 3D town houses, bell tower and skyline replace the old flat walls
    buildTownRebuild(scene, { lowQuality });

    // Shared materials
    const M = {
      stone: mat('#FFFFFF', { map: stoneBlockTex() }),
      stoneCap: mat('#B8AB98'),
      darkStone: mat('#6F665C'),
      soil: mat('#4A3626'),
      bushA: mat('#4F7A3A', { roughness: 0.95 }),
      bushB: mat('#6B9443', { roughness: 0.95 }),
      bushC: mat('#3E6531', { roughness: 0.95 }),
      flowerPink: mat('#E07A8E', { roughness: 0.8 }),
      flowerYellow: mat('#F2C14E', { roughness: 0.8 }),
      barrel: mat('#FFFFFF', { map: barrelTex(), roughness: 0.82 }),
      barrelLid: mat('#7A5434'),
      terracotta: mat('#B8613A', { roughness: 0.9 }),
      terracottaDark: mat('#8E4A2C', { roughness: 0.9 }),
      wood: mat('#7B5636'),
      woodDark: mat('#4A3222'),
      iron: mat('#2E2C2B', { roughness: 0.55, metalness: 0.6 }),
      lampGlass: mat('#FFD58A', { emissive: '#FFB347', emissiveIntensity: 1.6, roughness: 0.3 }),
      sack: mat('#FFFFFF', { map: sackTex(), roughness: 0.98 }),
      cypress: mat('#3F7343', { roughness: 0.95 }),
      trunk: mat('#5A4030'),
    };

    const solid = (m: THREE.Mesh, occluder = false) => {
      m.castShadow = true;
      m.receiveShadow = true;
      if (occluder) environmentObstacles.push(m);
      return m;
    };

    const addAabb = (id: string, cx: number, cz: number, hw: number, hd: number, maxY?: number) => {
      colliders.push({
        id: `detail-${id}`,
        kind: 'aabb',
        minX: cx - hw,
        maxX: cx + hw,
        minZ: cz - hd,
        maxZ: cz + hd,
        ...(maxY !== undefined ? { minY: 0, maxY } : {}),
        isObstacle: true,
      });
    };

    // ------------------------------------------------------------------
    // Reusable prop builders
    // ------------------------------------------------------------------
    // lumpy foliage blob: subdivided icosahedron with deterministic vertex noise
    const bushGeo = (() => {
      // welded icosphere -> smooth, rounded foliage instead of faceted blobs
      const ico = new THREE.IcosahedronGeometry(1, 3);
      ico.deleteAttribute('normal');
      ico.deleteAttribute('uv');
      const geo = BufferGeometryUtils.mergeVertices(ico);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const k = 1 + 0.08 * Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7 - v.y * 1.9);
        v.multiplyScalar(k);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    })();
    // stone surfaces on props pick up the plaster relief map
    loadPbr('plaster_normal.jpg', 1.5, 1.5, false, (t) => {
      M.stone.normalMap = t;
      M.stone.needsUpdate = true;
      M.stoneCap.normalMap = t;
      M.stoneCap.needsUpdate = true;
    });

    const buildShrub = (scale: number, seed: number) => {
      const g = new THREE.Group();
      const rng = makeRng(seed);
      const mats = [M.bushA, M.bushB, M.bushC];
      const n = lowQuality ? 5 : 9;
      for (let i = 0; i < n; i++) {
        const s = (i < 5 ? 0.28 + rng() * 0.18 : 0.16 + rng() * 0.12) * scale;
        const b = new THREE.Mesh(bushGeo, mats[i % 3]);
        b.scale.set(s, s * 0.85, s);
        b.position.set((rng() - 0.5) * 0.55 * scale, s * 0.7 + rng() * 0.15 * scale, (rng() - 0.5) * 0.55 * scale);
        b.rotation.set(rng() * 3, rng() * 3, 0);
        g.add(solid(b));
      }
      if (!lowQuality) {
        for (let i = 0; i < 6; i++) {
          const f = new THREE.Mesh(bushGeo, rng() > 0.5 ? M.flowerPink : M.flowerYellow);
          f.scale.setScalar(0.045 * scale);
          const a = rng() * Math.PI * 2;
          f.position.set(Math.cos(a) * 0.3 * scale, (0.5 + rng() * 0.25) * scale, Math.sin(a) * 0.3 * scale);
          g.add(f);
        }
      }
      return g;
    };

    const buildPlanter = (len: number, seed: number) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new CDRoundedBoxGeometry(0.62, 0.55, len, 2, 0.04), M.stone);
      box.position.y = 0.275;
      g.add(solid(box, true));
      const cap = new THREE.Mesh(new CDRoundedBoxGeometry(0.72, 0.08, len + 0.1, 2, 0.02), M.stoneCap);
      cap.position.y = 0.58;
      g.add(solid(cap));
      const soil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, len - 0.12), M.soil);
      soil.position.y = 0.6;
      g.add(soil);
      const count = Math.max(1, Math.round(len / 0.7));
      for (let i = 0; i < count; i++) {
        const sh = buildShrub(1.0, seed + i * 13);
        sh.position.set(0, 0.55, -len / 2 + (i + 0.5) * (len / count));
        g.add(sh);
      }
      return g;
    };

    const barrelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.95, 18, 4, false);
    {
      // bulge the barrel belly
      const p = barrelGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = 1 + 0.12 * (1 - Math.pow(y / 0.475, 2));
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
      barrelGeo.computeVertexNormals();
    }
    const barrelLidGeo = new THREE.CircleGeometry(0.35, 18);

    const buildBarrel = (tilt = 0) => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(barrelGeo, M.barrel);
      b.position.y = 0.475;
      g.add(solid(b, true));
      const lid = new THREE.Mesh(barrelLidGeo, M.barrelLid);
      lid.rotation.x = -Math.PI / 2;
      lid.position.y = 0.951;
      g.add(lid);
      // raised iron hoops (real geometry, catches light & shadow)
      for (const hy of [-0.39, -0.14, 0.14, 0.39]) {
        const r = 0.36 * (1 + 0.12 * (1 - Math.pow(hy / 0.475, 2))) + 0.008;
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 6, 28), M.iron);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = 0.475 + hy;
        g.add(hoop);
      }
      g.rotation.y = tilt;
      return g;
    };

    // Clay pot via lathe
    const potProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.18, 0.0),
      new THREE.Vector2(0.3, 0.18),
      new THREE.Vector2(0.34, 0.42),
      new THREE.Vector2(0.27, 0.66),
      new THREE.Vector2(0.17, 0.76),
      new THREE.Vector2(0.2, 0.82),
      new THREE.Vector2(0.21, 0.86),
      new THREE.Vector2(0.15, 0.86),
    ];
    const potGeo = new THREE.LatheGeometry(potProfile, 20);
    const buildPot = (scale: number, withPlant: boolean, seed: number, dark = false) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(potGeo, dark ? M.terracottaDark : M.terracotta);
      g.add(solid(p));
      if (withPlant) {
        const sh = buildShrub(0.75, seed);
        sh.position.y = 0.7;
        g.add(sh);
      }
      g.scale.setScalar(scale);
      return g;
    };

    const buildSack = (seed: number) => {
      const rng = makeRng(seed);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), M.sack);
      s.scale.set(1 + rng() * 0.2, 0.62 + rng() * 0.15, 0.8 + rng() * 0.2);
      s.position.y = 0.17;
      s.rotation.y = rng() * Math.PI;
      return solid(s);
    };

    const glowMat = new THREE.SpriteMaterial({
      map: glowTex(),
      color: '#FFB862',
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Wall lantern facing -X (mounted on the east wall)
    const buildWallLantern = () => {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.16), M.iron);
      plate.position.set(0, 0, 0);
      g.add(plate);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.04), M.iron);
      arm.position.set(-0.22, 0.06, 0);
      g.add(arm);
      const curl = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 12, Math.PI * 1.3), M.iron);
      curl.position.set(-0.14, -0.04, 0);
      g.add(curl);
      const cage = new THREE.Group();
      cage.position.set(-0.4, -0.12, 0);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.12, 4), M.iron);
      top.position.y = 0.17;
      top.rotation.y = Math.PI / 4;
      cage.add(top);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.2, 4), M.lampGlass);
      glass.rotation.y = Math.PI / 4;
      cage.add(glass);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), M.iron);
      base.position.y = -0.11;
      cage.add(base);
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 4), M.iron);
      hook.position.y = 0.26;
      cage.add(hook);
      if (!lowQuality) {
        const glow = new THREE.Sprite(glowMat);
        glow.scale.set(0.7, 0.7, 1);
        cage.add(glow);
      }
      g.add(cage);
      return g;
    };

    // ------------------------------------------------------------------
    // A. East wall dressing (inner face around x = 4.9, z from +8.8 to -19)
    // ------------------------------------------------------------------
    if (!CLEAN_STYLE) {
      const wallX = 4.86;

      // Weathered stone plinth band along the wall foot
      const plinth = new THREE.Mesh(new CDRoundedBoxGeometry(0.16, 0.5, 27.6, 2, 0.03), M.stone);
      plinth.position.set(wallX - 0.04, 0.25, -5.2);
      root.add(solid(plinth));
      const plinthCap = new THREE.Mesh(new CDRoundedBoxGeometry(0.22, 0.06, 27.6, 2, 0.02), M.stoneCap);
      plinthCap.position.set(wallX - 0.05, 0.52, -5.2);
      root.add(solid(plinthCap));

      // Planters with shrubs
      const planterSpots: Array<[number, number]> = [
        [7.2, 2.2],
        [1.0, 1.8],
      ];
      planterSpots.forEach(([z, len], i) => {
        const p = buildPlanter(len, 100 + i * 31);
        p.position.set(wallX - 0.42, 0, z);
        root.add(p);
        addAabb(`east-planter-${i}`, wallX - 0.42, z, 0.36, len / 2 + 0.05);
      });

      // Barrel cluster
      const bc = new THREE.Group();
      bc.position.set(wallX - 0.55, 0, -1.9);
      const b1 = buildBarrel(0.3);
      b1.position.set(0.05, 0, 0);
      const b2 = buildBarrel(1.2);
      b2.position.set(0.1, 0, -0.82);
      const b3 = buildBarrel(0.7);
      b3.scale.setScalar(0.72);
      b3.position.set(-0.55, 0, -0.35);
      const sack1 = buildSack(4);
      sack1.position.set(-0.55, 0.0, 0.45);
      bc.add(b1, b2, b3, sack1);
      root.add(bc);
      addAabb('east-barrels', wallX - 0.75, -2.2, 0.65, 0.85);

      // Clay pots between the near target pedestals (kept short: < 1.3 m)
      const pots: Array<[number, number, boolean, number]> = [
        [-8.4, 1.25, true, 1],
        [-9.05, 0.85, false, 2],
        [-9.5, 1.05, true, 3],
      ];
      pots.forEach(([z, s, plant, seed]) => {
        const p = buildPot(s, plant, 300 + seed, seed === 2);
        p.position.set(wallX - 0.42, 0, z);
        root.add(p);
      });
      addAabb('east-pots', wallX - 0.42, -9.0, 0.42, 0.85);

      // Stone bench
      {
        const bench = new THREE.Group();
        bench.position.set(wallX - 0.45, 0, -14.4);
        const seat = new THREE.Mesh(new CDRoundedBoxGeometry(0.58, 0.12, 2.2, 2, 0.03), M.stoneCap);
        seat.position.y = 0.46;
        bench.add(solid(seat, true));
        for (const lz of [-0.8, 0.8]) {
          const leg = new THREE.Mesh(new CDRoundedBoxGeometry(0.46, 0.42, 0.24, 2, 0.03), M.stone);
          leg.position.set(0, 0.21, lz);
          bench.add(solid(leg));
        }
        root.add(bench);
        addAabb('east-bench', wallX - 0.45, -14.4, 0.3, 1.1);
      }
    }

    // ------------------------------------------------------------------
    // B. Market cart (west plaza, beside the left building)
    // ------------------------------------------------------------------
    if (!CLEAN_STYLE) {
      const cart = new THREE.Group();
      const cx = -7.4;
      const cz = 4.6;
      cart.position.set(cx, 0, cz);
      cart.rotation.y = 0.34;

      const bed = new THREE.Mesh(new CDRoundedBoxGeometry(1.3, 0.14, 2.3, 2, 0.03), M.wood);
      bed.position.y = 0.78;
      cart.add(solid(bed, true));
      // side boards
      for (const sx of [-0.62, 0.62]) {
        const sb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 2.3), M.woodDark);
        sb.position.set(sx, 0.95, 0);
        cart.add(solid(sb));
      }
      // wheels
      for (const sx of [-0.72, 0.72]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 18), M.woodDark);
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(sx, 0.42, 0.35);
        cart.add(solid(wheel));
        for (let k = 0; k < 4; k++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.78, 0.04), M.wood);
          spoke.rotation.x = (k * Math.PI) / 4;
          spoke.position.set(sx, 0.42, 0.35);
          cart.add(spoke);
        }
      }
      // front leg & handles
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), M.woodDark);
      leg.position.set(0, 0.36, -1.0);
      cart.add(solid(leg));
      for (const sx of [-0.45, 0.45]) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), M.wood);
        h.rotation.x = Math.PI / 2 - 0.12;
        h.position.set(sx, 0.86, -1.65);
        cart.add(h);
      }
      // canopy posts + striped canopy
      for (const [sx, sz] of [[-0.6, -1.05], [0.6, -1.05], [-0.6, 1.05], [0.6, 1.05]] as const) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 6), M.woodDark);
        post.position.set(sx, 1.62, sz);
        cart.add(post);
      }
      const canopyMat = new THREE.MeshStandardMaterial({
        map: awningTex('#2F7F88', '#F3E9D2', 'awningCart'),
        roughness: 0.95,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      });
      for (const side of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.85), canopyMat);
        half.rotation.set(0, Math.PI / 2, 0);
        half.rotateX(side * 1.12 - (side > 0 ? Math.PI : 0));
        half.position.set(side * 0.36, 2.52, 0);
        cart.add(solid(half));
      }
      // produce crates on the cart bed
      const produceColors = ['#E0682F', '#D8B43A', '#9BBF3B', '#C93E3E'];
      const rng = makeRng(808);
      for (let i = 0; i < 4; i++) {
        const crate = new THREE.Group();
        crate.position.set(i % 2 ? 0.28 : -0.28, 0.85, -0.6 + Math.floor(i / 2) * 1.0);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.62), M.wood);
        box.position.y = 0.1;
        crate.add(solid(box));
        const fm = mat(produceColors[i], { roughness: 0.6 });
        const fruitGeo = new THREE.SphereGeometry(0.07, 8, 6);
        const n = lowQuality ? 4 : 12;
        for (let k = 0; k < n; k++) {
          const f = new THREE.Mesh(fruitGeo, fm);
          f.position.set((rng() - 0.5) * 0.36, 0.22 + rng() * 0.05, (rng() - 0.5) * 0.48);
          crate.add(f);
        }
        cart.add(crate);
      }
      // sacks leaning on the cart
      for (let i = 0; i < 3; i++) {
        const s = buildSack(900 + i);
        s.position.set(0.95 + (i % 2) * 0.2, 0, -0.4 + i * 0.5);
        cart.add(s);
      }
      root.add(cart);
      addAabb('market-cart', cx + 0.1, cz - 0.2, 1.15, 1.55);
    }

    // ------------------------------------------------------------------
    // C. West parapet with cypress trees & pots (fills the empty west side)
    // ------------------------------------------------------------------
    {
      const px = -14.6;
      const segments: Array<[number, number]> = [
        [-5.5, -0.2],
        [4.4, 13.5],
      ];
      segments.forEach(([z0, z1], i) => {
        const len = z1 - z0;
        const zc = (z0 + z1) / 2;
        const wall = new THREE.Mesh(new CDRoundedBoxGeometry(0.7, 1.05, len, 2, 0.04), M.stone);
        wall.position.set(px, 0.525, zc);
        root.add(solid(wall, true));
        const cap = new THREE.Mesh(new CDRoundedBoxGeometry(0.86, 0.1, len + 0.1, 2, 0.03), M.stoneCap);
        cap.position.set(px, 1.1, zc);
        root.add(solid(cap));
        addAabb(`west-parapet-${i}`, px, zc, 0.45, len / 2);
      });
      // gate pillars marking the opening
      for (const z of [-0.2, 4.4]) {
        const pillar = new THREE.Mesh(new CDRoundedBoxGeometry(0.95, 1.9, 0.95, 2, 0.05), M.stone);
        pillar.position.set(px, 0.95, z);
        root.add(solid(pillar, true));
        const cap = new THREE.Mesh(new CDRoundedBoxGeometry(1.1, 0.14, 1.1, 2, 0.03), M.stoneCap);
        cap.position.set(px, 1.97, z);
        root.add(solid(cap));
        const pot = buildPot(0.7, true, 600 + Math.round(z * 10));
        pot.position.set(px, 2.04, z);
        root.add(pot);
      }
      // cypress trees just behind the parapet
      const cyGeo = new THREE.ConeGeometry(0.75, 4.6, 9);
      const cyTop = new THREE.SphereGeometry(0.62, 9, 7);
      for (const z of [-4.2, -1.6, 6.4, 9.6, 12.6]) {
        const t = new THREE.Group();
        t.position.set(px - 1.4, 0, z);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.8, 6), M.trunk);
        trunk.position.y = 0.4;
        t.add(solid(trunk));
        const body = new THREE.Mesh(cyGeo, M.cypress);
        body.position.y = 2.9;
        body.scale.set(1, 1, 1);
        t.add(solid(body));
        const bulge = new THREE.Mesh(cyTop, M.cypress);
        bulge.scale.set(1.05, 1.6, 1.05);
        bulge.position.y = 1.65;
        t.add(solid(bulge));
        const s = 0.85 + ((z * 7.31) % 1 + 1) % 1 * 0.35;
        t.scale.setScalar(s);
        root.add(t);
      }
    }

    // ------------------------------------------------------------------
    // D. Bunting lines strung high across the courtyard (> 6 m, above target sight-lines)
    // ------------------------------------------------------------------
    if (!CLEAN_STYLE) {
      const flagColors = ['#D9573E', '#F2C14E', '#2F8C8C', '#F3E9D2', '#7FA63A'];
      const flagMats = flagColors.map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }),
      );
      const flagGeo = new THREE.BufferGeometry();
      flagGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-0.16, 0, 0, 0.16, 0, 0, 0, -0.34, 0], 3),
      );
      flagGeo.computeVertexNormals();
      const ropeMat = new THREE.LineBasicMaterial({ color: '#3B2E24' });

      const lines: Array<{ a: THREE.Vector3; b: THREE.Vector3; sag: number; pole?: THREE.Vector3 }> = [
        { a: new THREE.Vector3(-6.9, 6.9, 4.0), b: new THREE.Vector3(4.82, 7.0, 4.0), sag: 0.7, pole: new THREE.Vector3(-6.9, 0, 4.0) },
        { a: new THREE.Vector3(-6.4, 7.2, -1.6), b: new THREE.Vector3(4.82, 7.3, -2.2), sag: 0.6, pole: new THREE.Vector3(-6.4, 0, -1.6) },
      ];
      lines.forEach((ln, li) => {
        const curve = new THREE.QuadraticBezierCurve3(
          ln.a,
          new THREE.Vector3((ln.a.x + ln.b.x) / 2, (ln.a.y + ln.b.y) / 2 - ln.sag * 2, (ln.a.z + ln.b.z) / 2),
          ln.b,
        );
        const pts = curve.getPoints(40);
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ropeMat));
        const count = lowQuality ? 10 : 22;
        for (let i = 1; i < count; i++) {
          const t = i / count;
          const p = curve.getPoint(t);
          const tan = curve.getTangent(t);
          const f = new THREE.Mesh(flagGeo, flagMats[(i + li) % flagMats.length]);
          f.position.copy(p);
          f.lookAt(p.clone().add(new THREE.Vector3(-tan.z, 0, tan.x)));
          f.rotateX(0.12);
          root.add(f);
        }
        if (ln.pole) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, ln.a.y + 0.2, 8), M.woodDark);
          pole.position.set(ln.pole.x, (ln.a.y + 0.2) / 2, ln.pole.z);
          root.add(solid(pole));
          const foot = new THREE.Mesh(new CDRoundedBoxGeometry(0.4, 0.3, 0.4, 2, 0.03), M.darkStone);
          foot.position.set(ln.pole.x, 0.15, ln.pole.z);
          root.add(solid(foot));
          addAabb(`bunting-pole-${li}`, ln.pole.x, ln.pole.z, 0.25, 0.25);
        }
        // wall hook on the east end
        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), M.iron);
        hook.position.copy(ln.b);
        root.add(hook);
      });
    }

    // ------------------------------------------------------------------
    // E. Ground detail: grime patches, grass tufts, fallen leaves
    // ------------------------------------------------------------------
    if (!CLEAN_STYLE) {
      const rng = makeRng(4242);
      // Grime / weathering patches (no depth write, polygon offset so no z-fighting)
      const grimeMat = new THREE.MeshBasicMaterial({
        map: grimeTex(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        opacity: 0.9,
      });
      const grimeGeo = new THREE.PlaneGeometry(1, 1);
      const grimeSpots: Array<[number, number, number]> = [
        // along east wall
        [4.1, 6.0, 2.6], [4.1, 0.5, 2.2], [3.9, -2.2, 2.4], [4.1, -8.8, 2.0], [4.0, -14.2, 2.6],
        // around the crate bank & cart
        [-5.0, -3.2, 3.2], [-7.4, 4.4, 3.0], [-2.0, -7.5, 2.0],
        // random in plaza
        [-10.5, 1.0, 3.5], [-12.0, 9.0, 3.0], [-9.0, -9.0, 3.5], [1.2, -12.5, 2.5], [-1.5, 2.2, 1.8],
        [7.5, 12.0, 3.0], [-4.5, 13.0, 3.2],
      ];
      for (const [x, z, s] of grimeSpots) {
        const m = new THREE.Mesh(grimeGeo, grimeMat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = rng() * Math.PI * 2;
        m.scale.set(s * (0.8 + rng() * 0.5), s, 1);
        m.position.set(x, 0.02, z);
        m.renderOrder = 1;
        root.add(m);
      }

      // Grass tufts (instanced crossed quads) along wall bases & paving seams
      const tuftMat = new THREE.MeshStandardMaterial({
        map: grassTuftTex(),
        alphaTest: 0.45,
        side: THREE.DoubleSide,
        roughness: 1,
        color: '#D8E8B0',
        emissive: '#24331A',
      });
      const tuftGeo = (() => {
        const a = new THREE.PlaneGeometry(0.42, 0.32);
        a.translate(0, 0.16, 0);
        const b = a.clone();
        b.rotateY(Math.PI / 2);
        const merged = new THREE.BufferGeometry();
        const pa = a.attributes.position.array as Float32Array;
        const pb = b.attributes.position.array as Float32Array;
        const ua = a.attributes.uv.array as Float32Array;
        const ia = a.index!.array;
        const pos = new Float32Array(pa.length * 2);
        pos.set(pa, 0);
        pos.set(pb, pa.length);
        const uv = new Float32Array(ua.length * 2);
        uv.set(ua, 0);
        uv.set(ua, ua.length);
        const idx: number[] = [];
        const vc = pa.length / 3;
        for (let i = 0; i < ia.length; i++) idx.push(ia[i]);
        for (let i = 0; i < ia.length; i++) idx.push(ia[i] + vc);
        merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        merged.setIndex(idx);
        const nrm = new Float32Array(pos.length);
        for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
        merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        return merged;
      })();
      const tuftCount = lowQuality ? 60 : 170;
      const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < tuftCount; i++) {
        let x: number;
        let z: number;
        const r = rng();
        if (r < 0.4) {
          // east wall seam
          x = 4.55 + rng() * 0.25;
          z = 8.5 - rng() * 27;
        } else if (r < 0.55) {
          // west parapet foot
          x = -14.1 + rng() * 0.35;
          z = -5.5 + rng() * 19;
        } else if (r < 0.8) {
          // around the left building base
          x = -9.2 + rng() * 1.2;
          z = -11 + rng() * 12;
        } else {
          // clumps around the bunting poles, cart and bench
          const spots = [[-6.9, 4.0], [-6.4, -1.6], [-6.2, 5.8], [4.2, -13.0], [4.3, -15.8]];
          const sp = spots[Math.floor(rng() * spots.length)];
          x = sp[0] + (rng() - 0.5) * 0.9;
          z = sp[1] + (rng() - 0.5) * 0.9;
        }
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, rng() * Math.PI, 0);
        const s = 0.6 + rng() * 0.9;
        dummy.scale.set(s, s * (0.8 + rng() * 0.5), s);
        dummy.updateMatrix();
        tufts.setMatrixAt(i, dummy.matrix);
      }
      tufts.instanceMatrix.needsUpdate = true;
      tufts.receiveShadow = !lowQuality;
      root.add(tufts);

      // Fallen leaves
      const leafMat = new THREE.MeshStandardMaterial({
        map: leafTex(),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const leafCount = lowQuality ? 40 : 140;
      const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), leafMat, leafCount);
      const leafColor = new THREE.Color();
      for (let i = 0; i < leafCount; i++) {
        // drift under the tree near the archway and along the walls
        const cluster = rng();
        let x: number;
        let z: number;
        if (cluster < 0.45) {
          x = -5.8 + (rng() - 0.5) * 7;
          z = -15.5 + (rng() - 0.5) * 6;
        } else if (cluster < 0.75) {
          x = 3.6 + rng() * 1.1;
          z = 8 - rng() * 26;
        } else {
          x = -16 + rng() * 22;
          z = -14 + rng() * 28;
        }
        dummy.position.set(x, 0.022, z);
        dummy.rotation.set(-Math.PI / 2, 0, rng() * Math.PI * 2);
        dummy.scale.setScalar(0.7 + rng() * 0.8);
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
        leafColor.setHSL(0.07 + rng() * 0.06, 0.55, 0.4 + rng() * 0.2);
        leaves.setColorAt(i, leafColor);
      }
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      leaves.receiveShadow = !lowQuality;
      root.add(leaves);
    }

    // ------------------------------------------------------------------
    // G. Tree planter + west (left) facade dressing
    // ------------------------------------------------------------------
    {
      // Raised round stone planter for the courtyard tree at (-9.4, -19.4)
      const tx = -9.4;
      const tz = -19.4;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.55, 20), M.stone);
      ring.position.set(tx, 0.275, tz);
      root.add(solid(ring, true));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.1, 6, 24), M.stoneCap);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(tx, 0.56, tz);
      root.add(solid(rim));
      const soilDisc = new THREE.Mesh(new THREE.CircleGeometry(1.08, 20), M.soil);
      soilDisc.rotation.x = -Math.PI / 2;
      soilDisc.position.set(tx, 0.56, tz);
      root.add(soilDisc);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const sh = buildShrub(0.55, 700 + i);
        sh.position.set(tx + Math.cos(a) * 0.72, 0.55, tz + Math.sin(a) * 0.72);
        root.add(sh);
      }
      addAabb('tree-planter', tx, tz, 1.25, 1.25);

      // West building facade: same transform as the existing left building
      const fac = new THREE.Group();
      fac.position.set(-10.8, 0, -5.2);
      fac.rotation.y = 0.34;
      const fx = 0.81; // wall face (local +X looks into the courtyard)

      // stacked crates and a bench along the facade foot
      {
        const c1 = new THREE.Mesh(new CDRoundedBoxGeometry(0.7, 0.6, 0.7, 2, 0.03), M.wood);
        c1.position.set(fx + 0.45, 0.3, -2.6);
        const c2 = c1.clone();
        c2.position.set(fx + 0.45, 0.3, -3.35);
        c2.rotation.y = 0.2;
        const c3 = new THREE.Mesh(new CDRoundedBoxGeometry(0.55, 0.45, 0.55, 2, 0.03), M.woodDark);
        c3.position.set(fx + 0.45, 0.83, -2.9);
        c3.rotation.y = -0.3;
        fac.add(solid(c1, true), solid(c2, true), solid(c3));
        const seat = new THREE.Mesh(new CDRoundedBoxGeometry(0.45, 0.1, 1.8, 2, 0.02), M.wood);
        seat.position.set(fx + 0.35, 0.45, -6.9);
        fac.add(solid(seat));
        for (const z of [-0.7, 0.7]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.08), M.woodDark);
          leg.position.set(fx + 0.35, 0.2, -6.9 + z);
          fac.add(solid(leg));
        }
      }

      root.add(fac);
      fac.updateMatrixWorld(true);
      const toWorld = (lx: number, lz: number) => new THREE.Vector3(lx, 0, lz).applyMatrix4(fac.matrixWorld);
      const cratesW = toWorld(fx + 0.45, -3.0);
      addAabb('west-crates', cratesW.x, cratesW.z, 0.6, 0.75);
      const benchW = toWorld(fx + 0.35, -6.9);
      addAabb('west-bench', benchW.x, benchW.z, 0.45, 0.95);
    }

    // ------------------------------------------------------------------
    // H. Extra architectural detail: exposed brick, timber ledge, downpipes,
    //    hanging sign, vine pergola over the start area, gutter & puddles
    // ------------------------------------------------------------------
    if (!CLEAN_STYLE) {
      const rng = makeRng(5150);
      // Vine-covered timber pergola over the start area (high above the sight-lines)
      {
        const pg = new THREE.Group();
        const y = 5.4;
        const x0 = -5.6;
        const x1 = 4.75;
        const zs = [5.0, 8.0];
        for (const z of zs) {
          const beam = new THREE.Mesh(new CDRoundedBoxGeometry(x1 - x0 + 0.4, 0.26, 0.2, 2, 0.03), M.woodDark);
          beam.position.set((x0 + x1) / 2, y, z);
          pg.add(solid(beam));
          const post = new THREE.Mesh(new CDRoundedBoxGeometry(0.24, y, 0.24, 2, 0.03), M.woodDark);
          post.position.set(x0, y / 2, z);
          pg.add(solid(post));
          const foot = new THREE.Mesh(new CDRoundedBoxGeometry(0.42, 0.3, 0.42, 2, 0.03), M.stone);
          foot.position.set(x0, 0.15, z);
          pg.add(solid(foot));
          const knee = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), M.woodDark);
          knee.rotation.z = Math.PI / 4;
          knee.position.set(x0 + 0.32, y - 0.32, z);
          pg.add(knee);
          addAabb(`pergola-post-${z}`, x0, z, 0.25, 0.25);
        }
        for (let x = x0 + 0.2; x <= x1; x += 0.75) {
          const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 3.7), M.wood);
          rafter.position.set(x, y + 0.2, 6.5);
          pg.add(solid(rafter));
        }
        // vines on top and hanging strands
        const vineMats = [M.bushA, M.bushB, M.bushC];
        const n = lowQuality ? 26 : 60;
        for (let i = 0; i < n; i++) {
          const leaf = new THREE.Mesh(bushGeo, vineMats[i % 3]);
          const s = 0.28 + rng() * 0.3;
          leaf.scale.set(s, s * 0.55, s);
          const along = rng();
          leaf.position.set(x0 + along * (x1 - x0), y + 0.35, 4.8 + rng() * 3.4);
          // denser towards the west post so it reads as growing up from it
          if (rng() < 0.35) leaf.position.x = x0 + rng() * 2.2;
          pg.add(solid(leaf));
        }
        for (let k = 0; k < (lowQuality ? 6 : 14); k++) {
          const hx = x0 + rng() * (x1 - x0);
          const hz = rng() < 0.5 ? 5.0 : 8.0;
          const len = 3 + Math.floor(rng() * 4);
          for (let j = 0; j < len; j++) {
            const leaf = new THREE.Mesh(bushGeo, vineMats[(k + j) % 3]);
            const s = 0.12 - j * 0.012;
            leaf.scale.set(s, s * 1.3, s);
            leaf.position.set(hx + (rng() - 0.5) * 0.1, y - 0.15 - j * 0.22, hz + (rng() - 0.5) * 0.1);
            pg.add(leaf);
          }
        }
        // vine climbing the west posts
        for (const z of zs) {
          for (let j = 0; j < 9; j++) {
            const leaf = new THREE.Mesh(bushGeo, vineMats[j % 3]);
            leaf.scale.setScalar(0.16 + rng() * 0.08);
            const a = j * 1.7;
            leaf.position.set(x0 + Math.cos(a) * 0.17, 0.5 + j * 0.55, z + Math.sin(a) * 0.17);
            pg.add(leaf);
          }
        }
        root.add(pg);
      }

      // Shallow stone gutter with iron grates along the east side of the lane
      {
        const gx = 3.75;
        const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 26.5), mat('#5C5850', { roughness: 0.95 }));
        gutter.position.set(gx, 0.012, -5.0);
        gutter.receiveShadow = true;
        root.add(gutter);
        for (let z = 7.5; z > -18; z -= 4.2) {
          const grate = new THREE.Group();
          grate.position.set(gx, 0.03, z);
          for (let k = -3; k <= 3; k++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.035), M.iron);
            bar.position.z = k * 0.07;
            grate.add(bar);
          }
          root.add(grate);
        }
      }

      // Puddles (glossy, reflect the sky through the scene environment)
      {
        const puddleMat = new THREE.MeshStandardMaterial({
          color: '#7C8894',
          roughness: 0.06,
          metalness: 0.55,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
        const spots: Array<[number, number, number, number]> = [
          [3.2, 1.6, 1.4, 0.8],
          [-3.4, -9.2, 1.1, 0.7],
          [-8.8, 9.5, 1.6, 0.9],
        ];
        for (const [x, z, sx, sz] of spots) {
          const p = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddleMat);
          p.rotation.x = -Math.PI / 2;
          p.scale.set(sx, sz, 1);
          p.position.set(x, 0.021, z);
          root.add(p);
        }
      }
    }

    scene.add(root);

    applyMood(scene, opts.mood ?? detectMood(scene));
    applyLighting(scene, lowQuality);

    // ------------------------------------------------------------------
    // F. Sun shadows for the whole outdoor courtyard (cheaper on low quality)
    //    Most existing architecture was built without castShadow, so the plaza
    //    looked flat. Enable it for every opaque, reasonably-sized mesh.
    // ------------------------------------------------------------------
    {
      const minCasterRadius = lowQuality ? 0.5 : 0.12;
      const excluded = new Set<THREE.Object3D>(opts.shadowExclude ?? []);
      const sphere = new THREE.Sphere();
      const walk = (obj: THREE.Object3D) => {
        if (excluded.has(obj) || obj instanceof THREE.Camera) return;
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) {
          const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          const isLit = m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial;
          const opaque = m && !m.transparent && m.side !== THREE.BackSide;
          if (isLit && opaque) {
            mesh.receiveShadow = true;
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            sphere.copy(mesh.geometry.boundingSphere!);
            const s = mesh.getWorldScale(new THREE.Vector3());
            const r = sphere.radius * Math.max(s.x, s.y, s.z);
            // skip tiny trinkets (keeps the shadow pass cheap on tablets)
            if (r > minCasterRadius) mesh.castShadow = true;
          }
        }
        for (const c of obj.children) walk(c);
      };
      scene.updateMatrixWorld(true);
      for (const c of scene.children) walk(c);
    }
  }

  return addCourtyardDetail;
})();
// ===================== COURTYARD DETAIL PASS 끝 =====================
