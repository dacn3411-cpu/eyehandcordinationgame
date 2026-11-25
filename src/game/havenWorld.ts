/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { ColliderShape } from './rules';
import {
  buildHavenColliders,
  HAVEN_PHYSICS,
  HAVEN_WALKABLE_RECTS,
} from './havenRules';

export interface BuiltHavenWorld {
  root: THREE.Group;
  colliders: ColliderShape[];
  setVisible: (visible: boolean) => void;
}

// Cached procedural textures & shared materials for tablet 60fps
let cachedPlasterTex: THREE.CanvasTexture | null = null;
let cachedStoneTileTex: THREE.CanvasTexture | null = null;
let cachedWoodPlankTex: THREE.CanvasTexture | null = null;
let cachedDarkTileTex: THREE.CanvasTexture | null = null;
let cachedMossFloorTex: THREE.CanvasTexture | null = null;
let cachedDirtGrassTex: THREE.CanvasTexture | null = null;
let cachedRadianiteTex: THREE.CanvasTexture | null = null;
let cachedGraffitiTex: THREE.CanvasTexture | null = null;
const cachedSignTexMap = new Map<string, THREE.CanvasTexture>();

function createPlasterTex(): THREE.CanvasTexture {
  if (cachedPlasterTex) return cachedPlasterTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#AEA08E');
  g.addColorStop(0.25, '#CFC4B2');
  g.addColorStop(0.75, '#C4B7A4');
  g.addColorStop(1, '#8D8070');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 80; i++) {
    const x = (i * 137) % 490;
    const y = (i * 199) % 490;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(246,240,228,0.10)' : 'rgba(60,52,44,0.09)';
    ctx.fillRect(x, y, 36, 10);
  }
  ctx.fillStyle = 'rgba(72,64,56,0.28)';
  ctx.fillRect(0, 476, 512, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedPlasterTex = tex;
  return tex;
}

function createStoneTileTex(): THREE.CanvasTexture {
  if (cachedStoneTileTex) return cachedStoneTileTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6B707A';
  ctx.fillRect(0, 0, 512, 512);
  const s = 64;
  for (let y = 0; y < 512; y += s) {
    const off = ((y / s) % 2) * 32;
    for (let x = -s; x < 512; x += s) {
      const hash = ((x * 29 + y * 53) & 63) - 32;
      const v = 108 + Math.round(hash * 0.35);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
      ctx.fillRect(x + off + 2, y + 2, s - 4, s - 4);
      ctx.fillStyle = 'rgba(235,232,224,0.12)';
      ctx.fillRect(x + off + 2, y + 2, s - 4, 2);
      ctx.fillStyle = 'rgba(24,28,36,0.34)';
      ctx.fillRect(x + off + 2, y + s - 3, s - 4, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedStoneTileTex = tex;
  return tex;
}

function createWoodPlankTex(): THREE.CanvasTexture {
  if (cachedWoodPlankTex) return cachedWoodPlankTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6B4D38';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const shade = ((y * 17) % 20) - 10;
    ctx.fillStyle = `rgb(${108 + shade}, ${76 + shade}, ${54 + Math.round(shade * 0.7)})`;
    ctx.fillRect(0, y + 1, 256, 30);
    ctx.fillStyle = 'rgba(28,18,12,0.45)';
    ctx.fillRect(0, y + 30, 256, 2);
    ctx.fillStyle = 'rgba(230,198,162,0.10)';
    ctx.fillRect(0, y + 2, 256, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedWoodPlankTex = tex;
  return tex;
}

function createDarkTileTex(): THREE.CanvasTexture {
  if (cachedDarkTileTex) return cachedDarkTileTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#363C44';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      const v = 54 + (((x + y) * 11) % 12);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
      ctx.fillRect(x + 1.5, y + 1.5, 29, 29);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedDarkTileTex = tex;
  return tex;
}

function createMossFloorTex(): THREE.CanvasTexture {
  if (cachedMossFloorTex) return cachedMossFloorTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5E6658';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 42) {
    for (let x = 0; x < 256; x += 42) {
      ctx.fillStyle = 'rgba(116,120,112,0.75)';
      ctx.fillRect(x + 3, y + 3, 36, 36);
      ctx.fillStyle = 'rgba(66,94,48,0.45)';
      ctx.fillRect(x, y, 42, 4);
      ctx.fillRect(x, y, 4, 42);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedMossFloorTex = tex;
  return tex;
}

function createDirtGrassTex(): THREE.CanvasTexture {
  if (cachedDirtGrassTex) return cachedDirtGrassTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6D6250';
  ctx.fillRect(0, 0, 256, 256);
  // Grass shoulders along left/right edges
  const lg = ctx.createLinearGradient(0, 0, 68, 0);
  lg.addColorStop(0, '#4E6A3A');
  lg.addColorStop(1, 'rgba(78,106,58,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, 68, 256);
  const rg = ctx.createLinearGradient(188, 0, 256, 0);
  rg.addColorStop(0, 'rgba(78,106,58,0)');
  rg.addColorStop(1, '#4E6A3A');
  ctx.fillStyle = rg;
  ctx.fillRect(188, 0, 68, 256);
  for (let i = 0; i < 90; i++) {
    const px = (i * 67) % 240;
    const py = (i * 113) % 240;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(78,108,56,0.35)' : 'rgba(128,114,92,0.26)';
    ctx.fillRect(px, py, 14, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  cachedDirtGrassTex = tex;
  return tex;
}

function createRadianiteCrateTex(): THREE.CanvasTexture {
  if (cachedRadianiteTex) return cachedRadianiteTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 150);
  grad.addColorStop(0, '#58FFD2');
  grad.addColorStop(0.55, '#12B886');
  grad.addColorStop(1, '#0B5A44');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#1E2730';
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, 234, 234);
  ctx.beginPath();
  ctx.moveTo(16, 16);
  ctx.lineTo(240, 240);
  ctx.moveTo(240, 16);
  ctx.lineTo(16, 240);
  ctx.stroke();
  ctx.fillStyle = '#1E2730';
  ctx.fillRect(114, 0, 28, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedRadianiteTex = tex;
  return tex;
}

function createGraffitiTex(): THREE.CanvasTexture {
  if (cachedGraffitiTex) return cachedGraffitiTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#B8AB98';
  ctx.fillRect(0, 0, 256, 256);
  // Stylized geometric street mural
  ctx.fillStyle = '#E05348';
  ctx.beginPath();
  ctx.moveTo(40, 190);
  ctx.lineTo(128, 42);
  ctx.lineTo(216, 190);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#19C2B6';
  ctx.beginPath();
  ctx.arc(128, 134, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#18202B';
  ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 208, 208);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedGraffitiTex = tex;
  return tex;
}

function createLetterMarkTex(letter: string, bgColor: string, fgColor: string): THREE.CanvasTexture {
  const key = `${letter}_${bgColor}_${fgColor}`;
  const existing = cachedSignTexMap.get(key);
  if (existing) return existing;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.fillStyle = fgColor;
  ctx.font = '900 154px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedSignTexMap.set(key, tex);
  return tex;
}

/**
 * Builds the full Valorant Haven 3-site Map Exploration World (Stage 1 + Stage 2 + Stage 3).
 * Completely isolated from the training arena world.
 */
export function buildHavenExploreWorld(
  scene: THREE.Scene,
  lowQuality: boolean,
): BuiltHavenWorld {
  const root = new THREE.Group();
  root.name = 'haven-explore-world';
  root.visible = false;

  const colliders = buildHavenColliders();

  // Shared cached PBR materials
  const plasterTex = createPlasterTex();
  const stoneTex = createStoneTileTex();
  const woodTex = createWoodPlankTex();
  const darkTileTex = createDarkTileTex();
  const mossTex = createMossFloorTex();
  const dirtGrassTex = createDirtGrassTex();

  const plasterMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: plasterTex,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.36,
  });
  const shadedInteriorMat = new THREE.MeshStandardMaterial({
    color: '#7E7469',
    map: plasterTex,
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.28,
  });
  const stoneFloorMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: stoneTex,
    roughness: 0.86,
    metalness: 0.03,
    envMapIntensity: 0.35,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: woodTex,
    roughness: 0.84,
    metalness: 0.04,
    envMapIntensity: 0.36,
  });
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: '#463326',
    roughness: 0.86,
    metalness: 0.04,
    envMapIntensity: 0.34,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: '#343D48',
    roughness: 0.42,
    metalness: 0.62,
    envMapIntensity: 0.82,
  });
  const oliveMetalMat = new THREE.MeshStandardMaterial({
    color: '#526249',
    roughness: 0.56,
    metalness: 0.38,
    envMapIntensity: 0.55,
  });
  const darkGarageMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: darkTileTex,
    roughness: 0.82,
    metalness: 0.06,
    envMapIntensity: 0.38,
  });
  const mossFloorMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: mossTex,
    roughness: 0.9,
    metalness: 0.02,
    envMapIntensity: 0.32,
  });
  const dirtGrassMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: dirtGrassTex,
    roughness: 0.92,
    metalness: 0.02,
    envMapIntensity: 0.32,
  });
  const roofTileMat = new THREE.MeshStandardMaterial({
    color: '#3A4654',
    roughness: 0.82,
    metalness: 0.08,
    envMapIntensity: 0.38,
  });
  const radianiteMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    map: createRadianiteCrateTex(),
    emissive: '#14C892',
    emissiveIntensity: 0.22,
    roughness: 0.45,
    metalness: 0.32,
    envMapIntensity: 0.65,
  });
  const ceilingLightMat = new THREE.MeshBasicMaterial({ color: '#FFF0C8' });

  const addBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    receiveShadow = !lowQuality,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = receiveShadow;
    root.add(mesh);
    return mesh;
  };

  // ==================== 1. CONTINUOUS FLOORS & RAMPS ====================
  // Base stone ground plane covering entire Haven bounds
  const baseFloor = new THREE.Mesh(new THREE.PlaneGeometry(108, 114), stoneFloorMat);
  baseFloor.rotation.x = -Math.PI / 2;
  baseFloor.position.set(-3, -0.02, 5);
  baseFloor.receiveShadow = !lowQuality;
  root.add(baseFloor);

  // Distinct zone floor finishes layered slightly above baseFloor (Y=+0.01)
  addBox(12.5, 0.02, 10.0, 7.75, 0.01, 39.0, mossFloorMat); // A Garden mossy stone
  addBox(7.2, 0.02, 28.0, -39.5, 0.01, 16.0, dirtGrassMat); // C Long dirt + grass
  addBox(9.5, 0.02, 14.0, -19.75, 0.01, 9.0, darkGarageMat); // C Garage dark tile

  // A Ramp (Z: 4..14, sloping 0.0 -> 0.85m up to Z=12) + A Long Stone Steps + Central Smooth Ramp
  const rampSlopeLen = Math.hypot(8.0, HAVEN_PHYSICS.rampTopY);
  const rampAngle = Math.atan2(HAVEN_PHYSICS.rampTopY, 8.0);
  const aRampMesh = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.16, rampSlopeLen), stoneFloorMat);
  aRampMesh.position.set(30.0, HAVEN_PHYSICS.rampTopY * 0.5 - 0.06, 8.0);
  aRampMesh.rotation.x = -rampAngle;
  aRampMesh.receiveShadow = !lowQuality;
  root.add(aRampMesh);
  addBox(10.0, HAVEN_PHYSICS.rampTopY, 2.2, 30.0, HAVEN_PHYSICS.rampTopY * 0.5, 13.0, stoneFloorMat);

  // A Long: flanking stone steps + smooth central ramp (Z: 14 -> 23 descending 0.85m -> 0.0m)
  const aLongCentralAngle = Math.atan2(HAVEN_PHYSICS.rampTopY, 9.0);
  const aLongCentralRamp = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 0.18, Math.hypot(9.0, HAVEN_PHYSICS.rampTopY)),
    stoneFloorMat,
  );
  aLongCentralRamp.position.set(30.5, HAVEN_PHYSICS.rampTopY * 0.5 - 0.06, 18.5);
  aLongCentralRamp.rotation.x = aLongCentralAngle;
  root.add(aLongCentralRamp);
  for (let s = 0; s < 7; s++) {
    const t = (s + 0.5) / 7;
    const h = (1 - t) * HAVEN_PHYSICS.rampTopY;
    const sz = 14.2 + t * 8.6;
    addBox(3.8, Math.max(0.08, h), 1.25, 26.2, h * 0.5, sz, stoneFloorMat);
    addBox(3.8, Math.max(0.08, h), 1.25, 34.6, h * 0.5, sz, stoneFloorMat);
  }

  // ==================== 2. OUTER PERIMETER BOUNDARY WALLS ====================
  // Automatically seal every exterior border of Haven without blocking any interior connection
  const cellW = 1.0;
  const gridMinX = -46;
  const gridMaxX = 40;
  const gridMinZ = -45;
  const gridMaxZ = 57;
  const isWalk = (x: number, z: number) =>
    HAVEN_WALKABLE_RECTS.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);

  // Build coarse exterior wall segments around outer edges so outer perimeter is 100% solid
  for (let z = gridMinZ; z < gridMaxZ; z += 1) {
    let runStart: number | null = null;
    for (let x = gridMinX; x <= gridMaxX; x += 1) {
      const solidEdge = !isWalk(x + 0.5, z + 0.5) && (isWalk(x + 0.5, z - 0.5) || isWalk(x + 0.5, z + 1.5) || isWalk(x - 0.5, z + 0.5) || isWalk(x + 1.5, z + 0.5));
      if (solidEdge && runStart === null) {
        runStart = x;
      } else if ((!solidEdge || x === gridMaxX) && runStart !== null) {
        const endX = solidEdge ? x + 1 : x;
        const w = endX - runStart;
        addBox(w * cellW, 6.8, 1.0, (runStart + endX) * 0.5, 3.4, z + 0.5, plasterMat, false);
        runStart = null;
      }
    }
  }

  // ==================== 3. INTERIOR DIVIDERS, HEIGHT PORTALS & WINDOWS ====================
  // Render visual walls for thin interior partitions & height-layered portals (thick non-walkable islands are already walled by Section 2)
  for (const col of colliders) {
    if (col.kind !== 'aabb') continue;
    if (
      col.id.includes('radianite') ||
      col.id.includes('container') ||
      col.id.includes('centerpiece') ||
      col.id.includes('logs') ||
      col.id.includes('platform-face') ||
      col.id.includes('back-screen') ||
      col.id.includes('window-sill') ||
      col.id.includes('stair-1f-lip')
    ) {
      continue;
    }
    const w = col.maxX - col.minX;
    const d = col.maxZ - col.minZ;
    const isHeightLayered = col.minY !== undefined || col.maxY !== undefined;
    // Skip thick void-island blocks (>1.8m on both axes) since Section 2 already builds their exact perimeter walls
    if (!isHeightLayered && w > 1.8 && d > 1.8) {
      continue;
    }
    const minY = col.minY ?? 0;
    const maxY = col.maxY ?? 6.84;
    const h = Math.min(7.4, maxY) - minY;
    if (h <= 0.1) continue;
    addBox(
      Math.max(0.18, w - 0.04),
      h,
      Math.max(0.18, d - 0.04),
      (col.minX + col.maxX) * 0.5,
      minY + h * 0.5,
      (col.minZ + col.maxZ) * 0.5,
      shadedInteriorMat,
    );
  }

  // ==================== 4. STAGE 1: A SITE, A HELL, A HEAVEN STAIRS, A TOWER, A SHORT, A GARDEN ====================
  // 2F A Tower Floor Slab (wood plank floor at Y = 3.5m) + Open 2F Window (Z = -14, X: 25.1..31.8)
  addBox(9.0, 0.22, 11.0, 28.5, HAVEN_PHYSICS.tower2FY - 0.11, -19.5, woodMat);
  // Window sill (0.70m high above 3.5m floor) + header above window (Y=6.75..7.5)
  addBox(6.8, HAVEN_PHYSICS.towerSillHeight, 0.65, 28.45, HAVEN_PHYSICS.tower2FY + HAVEN_PHYSICS.towerSillHeight * 0.5, -14.0, darkTimberMat);
  addBox(9.2, 0.9, 0.75, 28.5, 7.15, -14.0, plasterMat);
  // A Tower Ceiling + Small Orange Digital Scoreboard Monitor
  addBox(9.4, 0.35, 11.2, 28.5, 7.55, -19.5, darkTimberMat);
  const towerBoard = addBox(1.65, 0.85, 0.14, 32.85, 5.2, -19.2, darkMetalMat);
  const orangeScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 0.62),
    new THREE.MeshBasicMaterial({ color: '#FF7B29' }),
  );
  orangeScreen.rotation.y = -Math.PI / 2;
  orangeScreen.position.set(32.77, 5.2, -19.2);
  root.add(towerBoard, orangeScreen);

  // A Hell (1F under A Tower): Grey Metal Wall with crisp 'A' Mark + Low Ceiling Strip Light
  const aSignPanel = addBox(
    2.4,
    2.4,
    0.16,
    28.5,
    1.85,
    -20.66,
    new THREE.MeshStandardMaterial({
      map: createLetterMarkTex('A', '#4D5661', '#ECE8E1'),
      roughness: 0.55,
      metalness: 0.35,
    }),
  );
  root.add(aSignPanel);
  addBox(3.2, 0.08, 0.32, 28.5, 3.22, -17.5, ceilingLightMat, false);

  // West A Heaven Stairs (X: 16.5 -> 24.0, Z: -25.0 .. -21.0, climbing 0.0 -> 3.5m)
  const stairSteps = 14;
  const stairRun = (24.0 - 16.5) / stairSteps;
  const stairRise = HAVEN_PHYSICS.tower2FY / stairSteps;
  for (let i = 0; i < stairSteps; i++) {
    const topY = (i + 1) * stairRise;
    const cx = 16.5 + (i + 0.5) * stairRun;
    addBox(stairRun + 0.03, topY, 3.85, cx, topY * 0.5, -23.0, woodMat);
    addBox(0.06, 0.04, 3.85, cx - stairRun * 0.45, topY - 0.01, -23.0, darkTimberMat);
  }
  // West Stairwell ceiling + warm wall light
  addBox(8.2, 0.35, 4.4, 20.25, 7.5, -23.0, darkTimberMat);
  addBox(1.8, 0.08, 0.25, 20.2, 6.9, -23.0, ceilingLightMat, false);

  // East A Tower Stairwell (1F A Hell -> Right turn X: 33.0..37.2 -> climb North Z: -16.8 -> -22.2 -> 2F landing Z: -25.0..-22.2)
  const eastSteps = 12;
  const eastRun = (-16.8 - -22.2) / eastSteps;
  const eastRise = HAVEN_PHYSICS.tower2FY / eastSteps;
  for (let i = 0; i < eastSteps; i++) {
    const topY = (i + 1) * eastRise;
    const cz = -16.8 - (i + 0.5) * eastRun;
    addBox(4.0, topY, eastRun + 0.03, 35.1, topY * 0.5, cz, woodMat);
    addBox(4.0, 0.04, 0.06, 35.1, topY - 0.01, cz + eastRun * 0.45, darkTimberMat);
  }
  // East 2F top landing slab (X: 33.0..37.2, Z: -25.0..-22.2, Y = 3.5m) + ceiling & guide light
  addBox(4.2, 0.22, 2.8, 35.1, HAVEN_PHYSICS.tower2FY - 0.11, -23.6, woodMat);
  addBox(4.4, 0.35, 11.2, 35.1, 7.55, -19.5, darkTimberMat);
  addBox(0.32, 0.08, 2.8, 35.1, 6.95, -20.5, ceilingLightMat, false);

  // A Site Props: Central Emerald Radianite Box + 2-Tier Olive Green Metal Container + Floor Cables
  addBox(2.1, 1.55, 2.1, 27.85, 0.775, -5.75, radianiteMat);
  addBox(3.2, 1.65, 3.0, 34.0, 0.825, -2.95, oliveMetalMat); // Tier 1 container
  addBox(3.0, 1.5, 2.8, 34.1, 2.4, -2.95, oliveMetalMat); // Tier 2 stacked container
  const cableMat = new THREE.MeshStandardMaterial({ color: '#1F242B', roughness: 0.65, metalness: 0.25 });
  const cableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(27.8, 0.04, -4.6),
    new THREE.Vector3(25.8, 0.04, -3.2),
    new THREE.Vector3(22.5, 0.04, -5.4),
    new THREE.Vector3(19.0, 0.04, -8.5),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 24, 0.045, 7, false), cableMat));

  // A Graffiti Mural on West Wall of A Graffiti alcove
  const graffitiMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 3.4),
    new THREE.MeshStandardMaterial({ map: createGraffitiTex(), roughness: 0.88, metalness: 0.02 }),
  );
  graffitiMesh.rotation.y = Math.PI / 2;
  graffitiMesh.position.set(14.08, 2.1, -9.5);
  root.add(graffitiMesh);

  // A Short: Timber Ceiling Beams & Arched Stone Doorway
  addBox(14.0, 0.25, 3.8, 18.0, 4.4, 1.95, woodMat);
  for (let bx = 12.2; bx <= 23.8; bx += 2.2) {
    addBox(0.28, 0.35, 3.6, bx, 4.1, 1.95, darkTimberMat);
  }
  addBox(0.65, 1.15, 3.6, 24.4, 3.85, 1.95, plasterMat); // Stone archway lintel at A Short -> A Site

  // A Main: Overhead Steel Ceiling Trusses (X: 4..17, Z: 21..34)
  for (let tz = 22.5; tz <= 32.5; tz += 3.2) {
    addBox(12.6, 0.22, 0.22, 10.5, 5.2, tz, darkMetalMat, false);
    addBox(0.22, 1.2, 0.22, 6.5, 5.7, tz, darkMetalMat, false);
    addBox(0.22, 1.2, 0.22, 14.5, 5.7, tz, darkMetalMat, false);
  }
  addBox(13.0, 0.3, 13.0, 10.5, 6.4, 27.5, roofTileMat, false);

  // A Garden: Overhead String Bulb Lights (Catenary Bulb Wires)
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#FFE08A' });
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 8);
  for (const [sz, ez] of [
    [35.2, 37.0],
    [39.2, 41.0],
  ]) {
    const wire = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.2, 4.4, sz),
      new THREE.Vector3(7.8, 3.65, (sz + ez) * 0.5),
      new THREE.Vector3(13.5, 4.4, ez),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(wire, 16, 0.02, 5, false), cableMat));
    for (let bi = 1; bi <= 5; bi++) {
      const pt = wire.getPointAt(bi / 6);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(pt).setY(pt.y - 0.12);
      root.add(bulb);
    }
  }

  // ==================== 5. STAGE 2: B SITE, B BACK, MID & BOTH SPAWNS ====================
  // B Site Ceiling + Stone 'B' Mark over South Entrance
  addBox(18.0, 0.35, 22.0, -1.0, 6.7, -8.5, darkTimberMat, false);
  const bSign = addBox(
    1.8,
    1.4,
    0.22,
    -1.75,
    4.65,
    1.95,
    new THREE.MeshStandardMaterial({
      map: createLetterMarkTex('B', '#7B7266', '#ECE8E1'),
      roughness: 0.85,
    }),
  );
  root.add(bSign);

  // B Site Centerpiece Structure (Large grey metal & emerald Radianite centerpiece)
  addBox(3.4, 1.35, 3.6, -1.0, 0.675, -6.1, darkMetalMat);
  addBox(2.2, 2.3, 2.2, -1.0, 2.45, -6.1, radianiteMat);
  addBox(3.6, 0.6, 3.8, -1.0, 3.85, -6.1, darkMetalMat);

  // B Back: Circular-Motif Wooden Partition Screen (X: -3.4..1.4, Z: -16.55)
  addBox(4.8, 3.1, 0.36, -1.0, 1.55, -16.55, woodMat);
  const screenRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 10, 24), darkTimberMat);
  screenRing.position.set(-1.0, 1.85, -16.32);
  root.add(screenRing);

  // Mid Courtyard: Traditional Overhanging Eaves Roofs along East & West flanks
  const midEaveW = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 17.5), roofTileMat);
  midEaveW.position.set(-10.1, 4.7, 11.0);
  midEaveW.rotation.z = -0.36;
  const midEaveE = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 17.5), roofTileMat);
  midEaveE.position.set(3.1, 4.7, 11.0);
  midEaveE.rotation.z = 0.36;
  root.add(midEaveW, midEaveE);

  // Mid Window (Z=20, X: -6.5..-1.5): Jumpable Sill (0.68m) + Colorful 5-Color Hanging Banners
  addBox(5.0, HAVEN_PHYSICS.windowSillHeight, 0.7, -4.0, HAVEN_PHYSICS.windowSillHeight * 0.5, 20.0, darkTimberMat);
  addBox(5.4, 2.2, 0.75, -4.0, 5.2, 20.0, plasterMat); // Header above Mid Window
  const bannerPalette = ['#E0434B', '#F4C430', '#18B89E', '#3A7BD5', '#9A5CE8'];
  bannerPalette.forEach((col, bi) => {
    const bMesh = addBox(
      0.55,
      1.25,
      0.08,
      -5.8 + bi * 0.9,
      3.55,
      19.55,
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }),
      false,
    );
    root.add(bMesh);
  });
  addBox(11.0, 0.3, 13.5, -4.0, 5.8, 26.75, woodMat, false);

  // Defender Side Spawn & Attacker Side Spawn Architectural Colonnades
  for (const sx of [-13.5, -4.5, 4.5, 12.0]) {
    addBox(0.85, 5.2, 0.85, sx, 2.6, -35.5, darkTimberMat);
  }
  addBox(34.0, 0.35, 15.0, -1.0, 5.35, -35.5, roofTileMat, false);

  for (const ax of [-14.0, -5.0, 4.5]) {
    addBox(0.85, 4.8, 0.85, ax, 2.4, 48.0, darkTimberMat);
  }

  // ==================== 6. STAGE 3: C GARAGE, C DOOR, C WINDOW, C CONNECTOR, C SITE, C LONG ====================
  // C Garage Roof + C Window Sill (Z=2, X: -21..-16, sill 0.68m) + C Door (X=-24.5, Z: 5..10.5)
  addBox(9.5, 0.3, 14.0, -19.75, 5.2, 9.0, roofTileMat, false);
  addBox(5.0, HAVEN_PHYSICS.windowSillHeight, 0.6, -18.5, HAVEN_PHYSICS.windowSillHeight * 0.5, 2.0, darkTimberMat);
  addBox(5.2, 2.4, 0.65, -18.5, 4.6, 2.0, shadedInteriorMat);
  addBox(2.4, 0.08, 0.3, -19.75, 4.95, 9.0, ceilingLightMat, false);

  // C Door: Traditional patterned timber frame + Open Double Metal Doors
  addBox(0.7, 0.65, 5.7, -24.5, 3.85, 7.75, darkTimberMat); // Carved top lintel
  const openDoorN = addBox(1.9, 3.4, 0.14, -25.4, 1.7, 5.25, darkMetalMat);
  openDoorN.rotation.y = 0.25;
  const openDoorS = addBox(1.9, 3.4, 0.14, -25.4, 1.7, 10.25, darkMetalMat);
  openDoorS.rotation.y = -0.25;

  // C Connector: Narrow hallway with traditional wooden beam ceiling (X: -32..-24.5, Z: -2..10.5)
  addBox(7.6, 0.28, 12.6, -28.25, 4.45, 4.25, woodMat, false);
  for (let cz = -0.5; cz <= 9.5; cz += 2.0) {
    addBox(7.4, 0.28, 0.26, -28.25, 4.2, cz, darkTimberMat, false);
  }

  // C Site: 2-Tier Emerald Radianite Stack + C Platform (1.05m + East Ramp) + C Logs
  addBox(2.2, 1.5, 2.2, -33.5, 0.75, -6.1, radianiteMat);
  addBox(1.9, 1.35, 1.9, -33.4, 2.15, -6.1, radianiteMat);

  // C Platform + Smooth East Ramp
  addBox(6.5, HAVEN_PHYSICS.cPlatformY, 10.0, -40.75, HAVEN_PHYSICS.cPlatformY * 0.5, -9.5, stoneFloorMat);
  const cRampAngle = Math.atan2(HAVEN_PHYSICS.cPlatformY, 2.5);
  const cRampMesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.hypot(2.5, HAVEN_PHYSICS.cPlatformY), 0.16, 6.0),
    stoneFloorMat,
  );
  cRampMesh.position.set(-36.25, HAVEN_PHYSICS.cPlatformY * 0.5 - 0.05, -8.5);
  cRampMesh.rotation.z = -cRampAngle;
  root.add(cRampMesh);

  // C Logs: Stacked Timber Logs at X: -32.4..-29.0, Z: -13.4..-11.4
  const logGeo = new THREE.CylinderGeometry(0.36, 0.38, 3.3, 12);
  for (const [lx, ly, lz] of [
    [-30.7, 0.36, -12.8],
    [-30.7, 0.36, -12.0],
    [-30.7, 0.96, -12.4],
  ]) {
    const log = new THREE.Mesh(logGeo, darkTimberMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(lx, ly, lz);
    root.add(log);
  }

  // C Cubby: Raised Stone Ledge (0.52m) + Traditional Double Wooden Shrine Gate
  addBox(4.2, HAVEN_PHYSICS.cCubbyStepY, 8.0, -32.1, HAVEN_PHYSICS.cCubbyStepY * 0.5, 24.0, stoneFloorMat);
  addBox(1.2, 0.26, 8.0, -34.8, 0.13, 24.0, stoneFloorMat);
  addBox(0.35, 3.4, 0.35, -31.0, 2.2, 22.0, darkTimberMat);
  addBox(0.35, 3.4, 0.35, -31.0, 2.2, 26.0, darkTimberMat);
  addBox(0.5, 0.45, 5.2, -31.0, 3.9, 24.0, roofTileMat);

  scene.add(root);

  return {
    root,
    colliders,
    setVisible: (visible: boolean) => {
      root.visible = visible;
    },
  };
}
