/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ColliderShape, SpawnDirectionSector } from './rules';
import { SpawnAnchor } from './worldBuilder';

/**
 * Meshopt-compressed copy of the same map (16.6 MB instead of 51 MB), loaded first. If it can't be loaded
 * or decoded, the original file below is used.
 */
export const PROJECT_C_GLB_COMPRESSED_URL =
  'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/project%20C123.meshopt.glb';
/** Approximate download sizes, for the progress bar when the server sends no length. */
const PROJECT_C_GLB_COMPRESSED_BYTES = 16556024;
const PROJECT_C_GLB_ORIGINAL_BYTES = 51749776;
export const PROJECT_C_GLB_PRIMARY_URL =
  'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/project%20C123.glb';
export const PROJECT_C_GLB_FALLBACK_URL =
  'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/Project%20C123.glb';
export const DRACO_DECODER_CDN_URL =
  'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

export const PLAYER_EYE_HEIGHT = 1.7;
/** 1F -> 2F floor height the A Tower map was first tuned to (x PLAYER scale). */
export const ATOWER_BASE_FLOOR_HEIGHT = 3.6;
/**
 * The A Tower map is shown this much larger than that first tuning (1F -> 2F = 3.6 x 1.4 = 5.04 m), so
 * rooms, corridors and the plaza have room for flying targets. Target sizes and distances stay in meters.
 */
export const ATOWER_MAP_SCALE_BOOST = 1.4;
/** Walking speed on the loaded map (the built-in arena uses 6.0 m/s); a little faster for the larger map. */
export const MAP_WALK_SPEED = 7.0;
export const MIN_HEADROOM_UNITS = 2.5;
export const SPAWN_SEARCH_RADIUS = 15;

/**
 * Playable keep region matching the red minimap border (world meters relative to anchorOrigin O):
 * - West (minX): behind player start left outer wall (-23m)
 * - East (maxX): outer wall of right plaza corridor (+22m)
 * - North (minZ): outer wall of 2F A Tower & upper marker building (-21m)
 * - South (maxZ): south courtyard boundary wall (+30m)
 * - Height (Y): underground floor (-12m) up past the damaged A Tower spire roof (+45m)
 */
export const MAP_KEEP_BOX_BOUNDS = {
  minX: -23,
  maxX: 22,
  minY: -12,
  maxY: 45,
  minZ: -21,
  maxZ: 30,
} as const;

export interface MapOptimizationStats {
  beforeMeshCount: number;
  afterMeshCount: number;
  removedMeshCount: number;
  clippedMeshCount: number;
  disposedGeometries: number;
  disposedMaterials: number;
  disposedTextures: number;
}

export interface LoadedGlbMapRuntime {
  mapRoot: THREE.Group;
  /** Invisible sill + jamb colliders for the A Tower 2F front window. */
  aTowerRouteGroup: THREE.Group;
  /** World-space keep region used to prune out-of-bounds meshes, terrain, colliders, shadows & radar. */
  keepBox: THREE.Box3;
  optimizationStats: MapOptimizationStats;
  /** Where the 2F front window is (unscaled r/u/f units). */
  aTowerWindow: ATowerWindowSpec;
  anchorOrigin: THREE.Vector3;
  basisF: THREE.Vector3;
  basisR: THREE.Vector3;
  basisU: THREE.Vector3;
  unitScale: number;
  pos: (r: number, u: number, f: number) => THREE.Vector3;
  allMeshes: THREE.Mesh[];
  solidMeshes: THREE.Mesh[];
  colliders: ColliderShape[];
  anchors: SpawnAnchor[];
  autoScale: number;
  denseCenterRaw: THREE.Vector3;
  spawnPoint: {
    x: number;
    floorY: number;
    eyeY: number;
    z: number;
    yaw: number;
  };
  mapBounds: THREE.Box3;
  mapMinY: number;
  getFloorSupportY: (x: number, z: number, currentFeetY: number) => number;
  resolveHorizontalMove: (
    curX: number,
    curZ: number,
    dx: number,
    dz: number,
    feetY: number,
    radius?: number,
  ) => { x: number; z: number; hitEnv: boolean };
  isBelowVoidThreshold: (feetY: number) => boolean;
}

interface MeshEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  isNonSolidDecor: boolean;
  isVistaBackdrop: boolean;
  isWalkableFloorNamed: boolean;
  isCustomCollider: boolean;
}

const NON_SOLID_NAME_RE =
  /Plant_|GroundLeaves|Papers_|Wires_|StringWire|CanopyFoliage|Bomb_Site_Outline|Flag_|Decal|AshPowderAlpha|PlantAlpha|Grass|Leaf|Leaves|Sticker|Graffiti|Sign_|Bulb|Glow/i;
const HIDDEN_HELPER_NAME_RE =
  /Fog|Decal|Blocker|LightLeak|Volume|Trigger|Shadow|Collision|Bomb_Site_Outline|BombsiteMarker|LightShaft|VentSmoke|SimpleCircle|FirePlane|Floater/i;
const ALPHA_CUTOUT_NAME_RE =
  /Plant_|GroundLeaves|CanopyFoliage|AshPowderAlpha|PlantAlpha|Grass|Leaf|Leaves|Wires_|StringWire|Flag_|SmallFlags/i;
const VISTA_BACKDROP_RE = /Vista_|Mountains|Sky|Horizon|Cloud|Backdrop/i;
const FLOOR_NAME_RE =
  /Floor|Ground|Site|Spawn|Bridge|Courtyard|Road|Path|Stair|Step|Ramp|Cellar|Candles/i;

function computeWorldFaceNormal(
  hit: THREE.Intersection,
  rayDir: THREE.Vector3,
  tmpNormalMatrix: THREE.Matrix3,
): THREE.Vector3 {
  if (!hit.face) {
    return new THREE.Vector3(0, 1, 0);
  }
  tmpNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
  const worldNormal = hit.face.normal.clone().applyMatrix3(tmpNormalMatrix).normalize();
  if (worldNormal.dot(rayDir) > 0) {
    worldNormal.negate();
  }
  return worldNormal;
}

/**
 * Compute automatic scale factor so the core building zone's horizontal width is ~60-100 units
 * when a map's bounding box is too large (>= 500, e.g. Unreal cm scale) or too small (< 10).
 */
export function computeAutoMapScale(params: {
  fullSize: { x: number; y: number; z: number };
  coreHorizontalSpan: number;
}): number {
  const fullMaxHoriz = Math.max(params.fullSize.x, params.fullSize.z);
  const coreSpan =
    params.coreHorizontalSpan > 0.001 ? params.coreHorizontalSpan : fullMaxHoriz;

  if (coreSpan <= 0.001) return 1.0;

  if ((fullMaxHoriz >= 500 && coreSpan > 130) || coreSpan >= 500 || coreSpan < 10) {
    return 80 / coreSpan;
  }
  if (coreSpan > 130) {
    return 85 / coreSpan;
  }
  if (coreSpan < 35) {
    return 75 / coreSpan;
  }
  return 1.0;
}

/**
 * Spatial 2D grid over solid meshes so per-frame raycast collision & floor height checks
 * only test meshes near (x, z) and run at 60 FPS.
 */
class MeshSpatialGrid {
  private cellSize: number;
  private buckets = new Map<string, MeshEntry[]>();
  private allSolid: MeshEntry[];

  constructor(entries: MeshEntry[], cellSize = 6.0) {
    this.cellSize = cellSize;
    this.allSolid = entries;
    for (const entry of entries) {
      const minCx = Math.floor(entry.box.min.x / cellSize);
      const maxCx = Math.floor(entry.box.max.x / cellSize);
      const minCz = Math.floor(entry.box.min.z / cellSize);
      const maxCz = Math.floor(entry.box.max.z / cellSize);
      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const key = `${cx},${cz}`;
          let list = this.buckets.get(key);
          if (!list) {
            list = [];
            this.buckets.set(key, list);
          }
          list.push(entry);
        }
      }
    }
  }

  queryNear(
    x: number,
    z: number,
    radius = 1.5,
    minY = -Infinity,
    maxY = Infinity,
    filterFn?: (entry: MeshEntry) => boolean,
  ): THREE.Mesh[] {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCz = Math.floor((z - radius) / this.cellSize);
    const maxCz = Math.floor((z + radius) / this.cellSize);
    const seen = new Set<THREE.Mesh>();
    const out: THREE.Mesh[] = [];

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const list = this.buckets.get(`${cx},${cz}`);
        if (!list) continue;
        for (const e of list) {
          if (seen.has(e.mesh)) continue;
          if (filterFn && !filterFn(e)) continue;
          if (e.box.max.y < minY || e.box.min.y > maxY) continue;
          if (
            e.box.max.x < x - radius ||
            e.box.min.x > x + radius ||
            e.box.max.z < z - radius ||
            e.box.min.z > z + radius
          ) {
            continue;
          }
          seen.add(e.mesh);
          out.push(e.mesh);
        }
      }
    }
    return out;
  }

  getAllSolidMeshes(): THREE.Mesh[] {
    return this.allSolid.map((e) => e.mesh);
  }
}

/**
 * Drop the triangles of a .glb mesh that lie entirely inside a box given in (r, u, f) units.
 * Used to open the 2F front window's closed shutter without touching the frame around it.
 */
function removeTrianglesWithin(
  mesh: THREE.Mesh,
  toLocalCoords: (worldPt: THREE.Vector3) => { r: number; u: number; f: number },
  box: { r: [number, number]; u: [number, number]; f: [number, number] },
): number {
  const geom = mesh.geometry;
  const posAttr = geom?.attributes?.position;
  if (!posAttr) return 0;
  const indexAttr = geom.index;
  const count = indexAttr ? indexAttr.count : posAttr.count;
  const v = new THREE.Vector3();
  const inside = (i: number) => {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    const l = toLocalCoords(v);
    return (
      l.r >= box.r[0] && l.r <= box.r[1] &&
      l.u >= box.u[0] && l.u <= box.u[1] &&
      l.f >= box.f[0] && l.f <= box.f[1]
    );
  };
  const kept: number[] = [];
  let removed = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = indexAttr ? indexAttr.getX(i) : i;
    const b = indexAttr ? indexAttr.getX(i + 1) : i + 1;
    const c = indexAttr ? indexAttr.getX(i + 2) : i + 2;
    if (inside(a) && inside(b) && inside(c)) removed++;
    else kept.push(a, b, c);
  }
  if (removed > 0) {
    const cloned = geom.clone();
    cloned.setIndex(kept);
    cloned.computeBoundingBox();
    cloned.computeBoundingSphere();
    mesh.geometry = cloned;
  }
  return removed;
}

/**
 * Cut a box (given in r/u/f units) out of a .glb mesh's flat wall triangles. Triangles that lie inside the
 * wall slab `box.f` are clipped in the (r, u) plane and only the parts outside `box.r` x `box.u` are kept,
 * so large wall triangles are trimmed exactly instead of leaving a bigger hole. Returns the triangles touched.
 */
export function clipBoxOutOfMesh(
  mesh: THREE.Mesh,
  toLocalCoords: (worldPt: THREE.Vector3) => { r: number; u: number; f: number },
  box: { r: [number, number]; u: [number, number]; f: [number, number] },
): number {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geom?.attributes?.position;
  if (!posAttr) return 0;
  const indexAttr = geom.index;
  const triCount = Math.floor((indexAttr ? indexAttr.count : posAttr.count) / 3);
  const attrNames = Object.keys(geom.attributes);
  const attrs = attrNames.map((n) => geom.attributes[n] as THREE.BufferAttribute);
  const stride = attrs.reduce((sum, a) => sum + a.itemSize, 0);

  // r/u/f of every vertex
  const vCount = posAttr.count;
  const ruf = new Float32Array(vCount * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < vCount; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    const l = toLocalCoords(v);
    ruf[i * 3] = l.r;
    ruf[i * 3 + 1] = l.u;
    ruf[i * 3 + 2] = l.f;
  }

  type PV = { r: number; u: number; data: Float32Array };
  const readVertex = (i: number): PV => {
    const data = new Float32Array(stride);
    let o = 0;
    for (const a of attrs) {
      for (let k = 0; k < a.itemSize; k++) data[o++] = a.getComponent(i, k);
    }
    return { r: ruf[i * 3], u: ruf[i * 3 + 1], data };
  };
  const lerp = (a: PV, b: PV, t: number): PV => {
    const data = new Float32Array(stride);
    for (let k = 0; k < stride; k++) data[k] = a.data[k] + (b.data[k] - a.data[k]) * t;
    return { r: a.r + (b.r - a.r) * t, u: a.u + (b.u - a.u) * t, data };
  };
  // Split a convex polygon by the line value(p) = 0 into [value < 0 part, value >= 0 part]
  const split = (poly: PV[], value: (p: PV) => number): [PV[], PV[]] => {
    const neg: PV[] = [];
    const pos: PV[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const va = value(a);
      const vb = value(b);
      if (va < 0) neg.push(a);
      else pos.push(a);
      if ((va < 0 && vb >= 0) || (va >= 0 && vb < 0)) {
        const x = lerp(a, b, va / (va - vb));
        neg.push(x);
        pos.push(x);
      }
    }
    return [neg, pos];
  };

  const out: number[] = [];
  const pushVertex = (p: PV) => {
    for (let k = 0; k < stride; k++) out.push(p.data[k]);
  };
  const pushPolygon = (poly: PV[]) => {
    for (let k = 1; k + 1 < poly.length; k++) {
      const a = poly[0];
      const b = poly[k];
      const c = poly[k + 1];
      const area2 = Math.abs((b.r - a.r) * (c.u - a.u) - (c.r - a.r) * (b.u - a.u));
      const span = Math.max(Math.abs(b.r - a.r), Math.abs(c.r - a.r), Math.abs(b.u - a.u), Math.abs(c.u - a.u));
      // keep faces seen edge-on in (r, u) (e.g. side faces), drop only slivers made by the cut itself
      if (area2 < 1e-7 && span < 1e-4) continue;
      pushVertex(a);
      pushVertex(b);
      pushVertex(c);
    }
  };

  const groups = geom.groups.length
    ? geom.groups.map((g) => ({ start: Math.floor(g.start / 3), end: Math.floor((g.start + g.count) / 3), materialIndex: g.materialIndex ?? 0 }))
    : [{ start: 0, end: triCount, materialIndex: 0 }];
  const newGroups: { start: number; count: number; materialIndex: number }[] = [];
  let touched = 0;
  for (const g of groups) {
    const before = out.length / stride;
    for (let t = g.start; t < Math.min(g.end, triCount); t++) {
      const ia = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const ib = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const ic = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
      const tri = [ia, ib, ic];
      const inSlab = tri.every((i) => ruf[i * 3 + 2] >= box.f[0] && ruf[i * 3 + 2] <= box.f[1]);
      const rs = tri.map((i) => ruf[i * 3]);
      const us = tri.map((i) => ruf[i * 3 + 1]);
      const overlaps =
        Math.max(...rs) > box.r[0] && Math.min(...rs) < box.r[1] && Math.max(...us) > box.u[0] && Math.min(...us) < box.u[1];
      const poly = tri.map(readVertex);
      if (!inSlab || !overlaps) {
        poly.forEach(pushVertex);
        continue;
      }
      touched++;
      const [left, rest1] = split(poly, (p) => p.r - box.r[0]);
      if (left.length >= 3) pushPolygon(left);
      if (rest1.length < 3) continue;
      const [rest2, right] = split(rest1, (p) => p.r - box.r[1]);
      if (right.length >= 3) pushPolygon(right);
      if (rest2.length < 3) continue;
      const [below, rest3] = split(rest2, (p) => p.u - box.u[0]);
      if (below.length >= 3) pushPolygon(below);
      if (rest3.length < 3) continue;
      const [, above] = split(rest3, (p) => p.u - box.u[1]);
      if (above.length >= 3) pushPolygon(above);
    }
    newGroups.push({ start: before, count: out.length / stride - before, materialIndex: g.materialIndex });
  }
  if (!touched) return 0;

  const vertsOut = out.length / stride;
  const rebuilt = new THREE.BufferGeometry();
  let o = 0;
  attrs.forEach((a, n) => {
    const arr = new Float32Array(vertsOut * a.itemSize);
    for (let i = 0; i < vertsOut; i++) {
      for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = out[i * stride + o + k];
    }
    rebuilt.setAttribute(attrNames[n], new THREE.BufferAttribute(arr, a.itemSize));
    o += a.itemSize;
  });
  if (geom.groups.length) {
    for (const g of newGroups) rebuilt.addGroup(g.start, g.count, g.materialIndex);
  }
  rebuilt.computeBoundingBox();
  rebuilt.computeBoundingSphere();
  mesh.geometry = rebuilt;
  return touched;
}

/**
 * Sutherland-Hodgman XZ triangle clipper for oversized ground/cliff meshes that extend far outside
 * `clipBox`. Preserves all vertex attributes (position, normal, uv, etc.) and multi-material groups,
 * keeping exact clipped geometry inside `clipBox` and dropping everything outside.
 */
export function clipMeshToKeepBoxXZ(
  mesh: THREE.Mesh,
  clipBox: THREE.Box3,
): { keptTriangles: number; modified: boolean } {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geom?.attributes?.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return { keptTriangles: 0, modified: false };

  const indexAttr = geom.index;
  const triCount = Math.floor((indexAttr ? indexAttr.count : posAttr.count) / 3);
  if (triCount === 0) return { keptTriangles: 0, modified: false };

  const attrNames = Object.keys(geom.attributes);
  const attrs = attrNames.map((n) => geom.attributes[n] as THREE.BufferAttribute);
  const stride = attrs.reduce((sum, a) => sum + a.itemSize, 0);

  const vCount = posAttr.count;
  const wx = new Float32Array(vCount);
  const wz = new Float32Array(vCount);
  const tmpV = new THREE.Vector3();
  for (let i = 0; i < vCount; i++) {
    tmpV.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.matrixWorld);
    wx[i] = tmpV.x;
    wz[i] = tmpV.z;
  }

  const minX = clipBox.min.x;
  const maxX = clipBox.max.x;
  const minZ = clipBox.min.z;
  const maxZ = clipBox.max.z;

  type ClipV = { x: number; z: number; data: Float32Array };
  const readV = (i: number): ClipV => {
    const data = new Float32Array(stride);
    let o = 0;
    for (const a of attrs) {
      for (let k = 0; k < a.itemSize; k++) data[o++] = a.getComponent(i, k);
    }
    return { x: wx[i], z: wz[i], data };
  };
  const lerpV = (a: ClipV, b: ClipV, t: number): ClipV => {
    const data = new Float32Array(stride);
    for (let k = 0; k < stride; k++) data[k] = a.data[k] + (b.data[k] - a.data[k]) * t;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, data };
  };
  const clipPlane = (poly: ClipV[], signedDist: (v: ClipV) => number): ClipV[] => {
    if (poly.length < 3) return [];
    const res: ClipV[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = signedDist(a);
      const db = signedDist(b);
      const aIn = da >= 0;
      const bIn = db >= 0;
      if (aIn) res.push(a);
      if (aIn !== bIn) {
        const denom = da - db;
        const t = Math.abs(denom) > 1e-9 ? da / denom : 0.5;
        res.push(lerpV(a, b, Math.max(0, Math.min(1, t))));
      }
    }
    return res;
  };

  const out: number[] = [];
  const pushV = (p: ClipV) => {
    for (let k = 0; k < stride; k++) out.push(p.data[k]);
  };

  const groups = geom.groups.length
    ? geom.groups.map((g) => ({
        start: Math.floor(g.start / 3),
        end: Math.floor((g.start + g.count) / 3),
        materialIndex: g.materialIndex ?? 0,
      }))
    : [{ start: 0, end: triCount, materialIndex: 0 }];
  const newGroups: { start: number; count: number; materialIndex: number }[] = [];

  let keptTriangles = 0;
  let modified = false;

  for (const g of groups) {
    const startVert = out.length / stride;
    for (let t = g.start; t < Math.min(g.end, triCount); t++) {
      const ia = indexAttr ? indexAttr.getX(t * 3) : t * 3;
      const ib = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
      const ic = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

      const ax = wx[ia], bx = wx[ib], cx = wx[ic];
      const az = wz[ia], bz = wz[ib], cz = wz[ic];

      const triMinX = Math.min(ax, bx, cx);
      const triMaxX = Math.max(ax, bx, cx);
      const triMinZ = Math.min(az, bz, cz);
      const triMaxZ = Math.max(az, bz, cz);

      // Completely outside clipBox -> drop triangle
      if (triMaxX < minX || triMinX > maxX || triMaxZ < minZ || triMinZ > maxZ) {
        modified = true;
        continue;
      }

      // Completely inside clipBox -> fast-path copy
      if (triMinX >= minX && triMaxX <= maxX && triMinZ >= minZ && triMaxZ <= maxZ) {
        pushV(readV(ia));
        pushV(readV(ib));
        pushV(readV(ic));
        keptTriangles++;
        continue;
      }

      // Straddling boundary -> exact Sutherland-Hodgman clip against 4 XZ planes
      modified = true;
      let poly: ClipV[] = [readV(ia), readV(ib), readV(ic)];
      poly = clipPlane(poly, (v) => v.x - minX);
      poly = clipPlane(poly, (v) => maxX - v.x);
      poly = clipPlane(poly, (v) => v.z - minZ);
      poly = clipPlane(poly, (v) => maxZ - v.z);

      for (let k = 1; k + 1 < poly.length; k++) {
        pushV(poly[0]);
        pushV(poly[k]);
        pushV(poly[k + 1]);
        keptTriangles++;
      }
    }
    const vertCount = out.length / stride - startVert;
    if (vertCount > 0) {
      newGroups.push({ start: startVert, count: vertCount, materialIndex: g.materialIndex });
    }
  }

  if (!modified) return { keptTriangles, modified: false };
  if (keptTriangles === 0) return { keptTriangles: 0, modified: true };

  const vertsOut = out.length / stride;
  const rebuilt = new THREE.BufferGeometry();
  let o = 0;
  attrs.forEach((a, idx) => {
    const arr = new Float32Array(vertsOut * a.itemSize);
    for (let i = 0; i < vertsOut; i++) {
      for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = out[i * stride + o + k];
    }
    rebuilt.setAttribute(attrNames[idx], new THREE.BufferAttribute(arr, a.itemSize));
    o += a.itemSize;
  });
  if (geom.groups.length) {
    for (const ng of newGroups) rebuilt.addGroup(ng.start, ng.count, ng.materialIndex);
  }
  rebuilt.computeBoundingBox();
  rebuilt.computeBoundingSphere();
  mesh.geometry = rebuilt;
  geom.dispose();
  return { keptTriangles, modified: true };
}

const MATERIAL_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'lightMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'envMap',
] as const;

function collectMaterialTextures(mat: THREE.Material, target: Set<THREE.Texture>) {
  const rec = mat as unknown as Record<string, unknown>;
  for (const slot of MATERIAL_TEXTURE_SLOTS) {
    const val = rec[slot];
    if (val && (val as THREE.Texture).isTexture) {
      target.add(val as THREE.Texture);
    }
  }
}

/**
 * Safely dispose geometries, materials, and textures from pruned meshes without touching
 * any shared resource still referenced by surviving meshes in `survivingRoot`.
 */
function disposeUnusedMapResources(
  removedMeshes: THREE.Mesh[],
  survivingRoot: THREE.Object3D,
): { disposedGeometries: number; disposedMaterials: number; disposedTextures: number } {
  const usedGeometries = new Set<THREE.BufferGeometry>();
  const usedMaterials = new Set<THREE.Material>();
  const usedTextures = new Set<THREE.Texture>();

  survivingRoot.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    if (m.geometry) usedGeometries.add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      usedMaterials.add(mat);
      collectMaterialTextures(mat, usedTextures);
    }
  });

  const deadGeometries = new Set<THREE.BufferGeometry>();
  const deadMaterials = new Set<THREE.Material>();
  const deadTextures = new Set<THREE.Texture>();

  for (const mesh of removedMeshes) {
    if (mesh.geometry && !usedGeometries.has(mesh.geometry)) {
      deadGeometries.add(mesh.geometry);
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (!usedMaterials.has(mat)) {
        deadMaterials.add(mat);
      }
      const matTextures = new Set<THREE.Texture>();
      collectMaterialTextures(mat, matTextures);
      matTextures.forEach((tex) => {
        if (!usedTextures.has(tex)) deadTextures.add(tex);
      });
    }
  }

  deadGeometries.forEach((g) => g.dispose());
  deadTextures.forEach((t) => t.dispose());
  deadMaterials.forEach((m) => m.dispose());

  return {
    disposedGeometries: deadGeometries.size,
    disposedMaterials: deadMaterials.size,
    disposedTextures: deadTextures.size,
  };
}

/** A .glb material reused on hand-built boxes, with the world size of one UV unit so textures tile at map scale. */
interface BorrowedLook {
  material: THREE.Material;
  metersPerUv: number;
}

/** Materials used to finish the enlarged 2F window opening (frame wood, outer/inner wall). */
export interface ATowerWindowLook {
  wood?: BorrowedLook;
  wallOuter?: BorrowedLook;
  wallInner?: BorrowedLook;
}

/** Average world meters covered by 1.0 UV on a mesh (texture scale), or null if it can't be measured. */
function estimateMetersPerUv(mesh: THREE.Mesh): number | null {
  const geo = mesh.geometry;
  const uv = geo?.attributes?.uv;
  const posAttr = geo?.attributes?.position;
  if (!uv || !posAttr) return null;
  const idx = geo.index;
  const count = idx ? idx.count : posAttr.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 1 < Math.min(count, 900); i += 3) {
    const ia = idx ? idx.getX(i) : i;
    const ib = idx ? idx.getX(i + 1) : i + 1;
    a.fromBufferAttribute(posAttr, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(posAttr, ib).applyMatrix4(mesh.matrixWorld);
    const du = Math.hypot(uv.getX(ia) - uv.getX(ib), uv.getY(ia) - uv.getY(ib));
    const dw = a.distanceTo(b);
    if (du > 1e-4 && dw > 0.05) {
      sum += dw / du;
      n++;
    }
  }
  if (!n) return null;
  const mpu = sum / n;
  return mpu > 0.2 && mpu < 8 ? mpu : null;
}

/** Copy a mesh's textured material for reuse on hand-built boxes (no AO/light map: those need the 2nd UV set). */
function borrowLook(mesh: THREE.Mesh | undefined): BorrowedLook | undefined {
  if (!mesh) return undefined;
  const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  if (!src || !src.map) return undefined;
  const copy = src.clone();
  copy.aoMap = null;
  copy.lightMap = null;
  copy.vertexColors = false;
  copy.side = THREE.FrontSide;
  return { material: copy, metersPerUv: estimateMetersPerUv(mesh) ?? 1 };
}

/**
 * Give a BoxGeometry real-world-scale, tiling UVs (like the .glb's own walls) instead of one stretched
 * 0..1 texture per face. `metersPerUv` is per face (+x, -x, +y, -y, +z, -z); grain follows the long side.
 */
function applyWorldScaleBoxUv(
  geo: THREE.BufferGeometry,
  w: number,
  h: number,
  d: number,
  metersPerUv: number[],
  offset: THREE.Vector3,
): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv || uv.count < 24) return;
  // [u-size, v-size, u-offset, v-offset] per face
  const faces: Array<[number, number, number, number]> = [
    [d, h, offset.z, offset.y],
    [d, h, offset.z, offset.y],
    [w, d, offset.x, offset.z],
    [w, d, offset.x, offset.z],
    [w, h, offset.x, offset.y],
    [w, h, offset.x, offset.y],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv, ou, ov] = faces[f];
    const mpu = metersPerUv[f] || 1;
    const swap = sv > su * 1.5;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = (uv.getX(i) * su + ou) / mpu;
      const vv = (uv.getY(i) * sv + ov) / mpu;
      if (swap) uv.setXY(i, vv, u);
      else uv.setXY(i, u, vv);
    }
  }
  uv.needsUpdate = true;
}

/** Where the A Tower 2F front window is, in unscaled (r, u, f) units relative to the 1F entrance origin O. */
export interface ATowerWindowSpec {
  /** Top of the 2F floor the player stands on. */
  floorU: number;
  /** How much larger the map is shown than its first tuning (ATOWER_MAP_SCALE_BOOST, or 1). */
  geomScale: number;
  /** Clear opening of the window frame. */
  rMin: number;
  rMax: number;
  /** Outer face of the facade (front of the frame) and the inner face of the interior frames. */
  fOuter: number;
  fInner: number;
}

/** Height (above the 2F floor) of the window sill. Taller than the 0.65 step-over ray so walking is blocked. */
export const WINDOW_SILL_HEIGHT = 0.9;
/**
 * Clear height of the 2F front window opening above the 2F floor. A jumping player's eye reaches
 * PLAYER_EYE_HEIGHT (1.7) + the highest jump (~1.29), so the wall above the old 1.9 m opening is cut
 * away up to here and the camera never passes through it on the way out.
 */
export const WINDOW_OPENING_HEIGHT = 3.15;
/** Top of the .glb's own window frame above the 2F floor; the opening is cut taller from here. */
const WINDOW_OLD_FRAME_TOP = 1.84;
/** Feet height above the 2F floor at which a jumping player is treated as clearing the sill. */
export const WINDOW_VAULT_CLEAR_HEIGHT = 0.33;

/**
 * A Tower 2F front window: an invisible sill + side jambs. Walking into the window is blocked, but a jump
 * carries the player over the sill, out through the opening and down to the 1F plaza.
 */
function buildATowerWindowVault(params: {
  pos: (r: number, u: number, f: number) => THREE.Vector3;
  s: number;
  win: ATowerWindowSpec;
  look?: ATowerWindowLook;
}): {
  group: THREE.Group;
  colliderMeshes: THREE.Mesh[];
  colliderShapes: ColliderShape[];
  finishMeshes: THREE.Mesh[];
} {
  const { pos, s, win } = params;
  const look = params.look ?? {};
  const group = new THREE.Group();
  group.name = 'aTowerWindowVaultGroup';
  const colliderMeshes: THREE.Mesh[] = [];
  const colliderShapes: ColliderShape[] = [];
  const invisibleColliderMat = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    visible: false,
    side: THREE.DoubleSide,
  });

  const addCollider = (
    name: string,
    rMin: number,
    rMax: number,
    uMin: number,
    uMax: number,
    fMin: number,
    fMax: number,
    userData: Record<string, unknown>,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(0.02, (rMax - rMin) * s),
        Math.max(0.02, (uMax - uMin) * s),
        Math.max(0.02, (fMax - fMin) * s),
      ),
      invisibleColliderMat,
    );
    mesh.name = name;
    mesh.position.copy(pos((rMin + rMax) * 0.5, (uMin + uMax) * 0.5, (fMin + fMax) * 0.5));
    mesh.userData.isCustomCollider = true;
    Object.assign(mesh.userData, userData);
    group.add(mesh);
    colliderMeshes.push(mesh);
    const pMin = pos(rMin, uMin, fMin);
    const pMax = pos(rMax, uMax, fMax);
    colliderShapes.push({
      id: `atower-window-${name}`,
      kind: 'aabb',
      minX: Math.min(pMin.x, pMax.x),
      maxX: Math.max(pMin.x, pMax.x),
      minY: Math.min(pMin.y, pMax.y),
      maxY: Math.max(pMin.y, pMax.y),
      minZ: Math.min(pMin.z, pMax.z),
      maxZ: Math.max(pMin.z, pMax.z),
    });
  };

  // Sill across the whole opening, from the 2F floor up to WINDOW_SILL_HEIGHT
  addCollider(
    'ATowerWindow_Sill_Collider',
    win.rMin,
    win.rMax,
    win.floorU - 0.05,
    win.floorU + WINDOW_SILL_HEIGHT,
    win.fOuter - 0.1,
    win.fInner + 0.08,
    { isWindowSill: true },
  );
  // Side jambs keep a vaulting player inside the opening (the facade itself is ignored mid-vault)
  for (const [side, r0, r1] of [
    ['L', win.rMin - 0.35, win.rMin],
    ['R', win.rMax, win.rMax + 0.35],
  ] as const) {
    addCollider(
      `ATowerWindow_Jamb_${side}_Collider`,
      r0,
      r1,
      win.floorU - 0.05,
      win.floorU + WINDOW_OPENING_HEIGHT,
      win.fOuter - 0.6,
      win.fInner + 0.3,
      { isWindowJamb: true },
    );
  }

  // Visible finish of the enlarged opening: raised sill, side reveals + facade trim, lintel.
  // Decoration only (not part of collision); the colliders above do the blocking.
  const finishMeshes: THREE.Mesh[] = [];
  const fallbackWood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9, metalness: 0 });
  const wood = look.wood ?? { material: fallbackWood, metersPerUv: 1 };
  const wallOuter = look.wallOuter ?? wood;
  const wallInner = look.wallInner ?? wood;
  const fwd = pos(0, 0, 1).sub(pos(0, 0, 0));
  const outerIsPlusZ = fwd.z < 0;
  const addFinish = (
    name: string,
    rMin: number,
    rMax: number,
    uMin: number,
    uMax: number,
    fMin: number,
    fMax: number,
    faces?: { outer: BorrowedLook; inner: BorrowedLook },
  ) => {
    const w = Math.max(0.01, (rMax - rMin) * s);
    const h = Math.max(0.01, (uMax - uMin) * s);
    const d = Math.max(0.01, (fMax - fMin) * s);
    const geo = new THREE.BoxGeometry(w, h, d);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const perFace: BorrowedLook[] = [wood, wood, wood, wood, wood, wood];
    if (faces) {
      perFace[outerIsPlusZ ? 4 : 5] = faces.outer;
      perFace[outerIsPlusZ ? 5 : 4] = faces.inner;
    }
    const lo = pos(rMin, uMin, fMin);
    const hi = pos(rMax, uMax, fMax);
    const offset = new THREE.Vector3(Math.min(lo.x, hi.x), Math.min(lo.y, hi.y), Math.min(lo.z, hi.z));
    applyWorldScaleBoxUv(geo, w, h, d, perFace.map((l) => l.metersPerUv), offset);
    const mats = perFace.map((l) => l.material);
    const mesh = new THREE.Mesh(geo, faces ? mats : wood.material);
    mesh.name = name;
    mesh.position.copy(pos((rMin + rMax) * 0.5, (uMin + uMax) * 0.5, (fMin + fMax) * 0.5));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.excludeFromCollision = true;
    mesh.userData.isWindowFinish = true;
    group.add(mesh);
    finishMeshes.push(mesh);
  };

  const sillU = win.floorU + WINDOW_SILL_HEIGHT;
  const frameTopU = win.floorU + WINDOW_OLD_FRAME_TOP * (win.geomScale || 1);
  const topU = win.floorU + WINDOW_OPENING_HEIGHT;
  // Raised sill: wall infill under the opening (outer/inner wall faces) with a wooden cap
  const g = win.geomScale || 1;
  addFinish('ATowerWindow_SillInfill', win.rMin - 0.01, win.rMax + 0.01, win.floorU + 0.28 * g, sillU - 0.06,
    win.fOuter + 0.01, win.fInner + 0.02, { outer: wallOuter, inner: wallInner });
  addFinish('ATowerWindow_SillCap', win.rMin - 0.07, win.rMax + 0.07, sillU - 0.06, sillU,
    win.fOuter - 0.07, win.fInner + 0.08);
  // Side reveals cover the cut wall edges; facade trim continues the old frame posts upward
  addFinish('ATowerWindow_Reveal_L', win.rMin - 0.11, win.rMin + 0.01, frameTopU - 0.03, topU, win.fOuter - 0.02, win.fInner + 0.1);
  addFinish('ATowerWindow_Reveal_R', win.rMax - 0.01, win.rMax + 0.11, frameTopU - 0.03, topU, win.fOuter - 0.02, win.fInner + 0.1);
  addFinish('ATowerWindow_Trim_L', win.rMin - 0.25 * g, win.rMin - 0.1, frameTopU - 0.03, topU, win.fOuter - 0.02, win.fOuter + 0.03);
  addFinish('ATowerWindow_Trim_R', win.rMax + 0.1, win.rMax + 0.25 * g, frameTopU - 0.03, topU, win.fOuter - 0.02, win.fOuter + 0.03);
  addFinish('ATowerWindow_Lintel', win.rMin - 0.25 * g, win.rMax + 0.25 * g, topU - 0.01, topU + 0.13, win.fOuter - 0.02, win.fInner + 0.1);

  return { group, colliderMeshes, colliderShapes, finishMeshes };
}

const FLOATING_ROOF_NAME_RE = /Roof|Eave|Awning|Canopy|Pagoda|MonkeyEndCap|DragonA|DragonB|RoofSupport/i;

/**
 * Enclose the 4 outer edges of `keepBox` with solid perimeter walls styled identically to the map's
 * existing monastery architecture (dark charcoal base dado, cream stucco upper wall, dark wood belt & coping)
 * using borrowed `.glb` textures and world-scale tiling UVs, plus an under-floor skirt to hide any sky void.
 */
function buildKeepBoxPerimeterWalls(params: {
  keepBox: THREE.Box3;
  s: number;
  look: ATowerWindowLook;
  lowQuality: boolean;
}): {
  group: THREE.Group;
  solidMeshes: THREE.Mesh[];
  colliderShapes: ColliderShape[];
} {
  const { keepBox, s, look, lowQuality } = params;
  const group = new THREE.Group();
  group.name = 'keepBoxPerimeterWallsGroup';
  const solidMeshes: THREE.Mesh[] = [];
  const colliderShapes: ColliderShape[] = [];

  const wallSrc = look.wallOuter ?? look.wallInner;
  const plasterMat = wallSrc
    ? (wallSrc.material.clone() as THREE.MeshStandardMaterial)
    : new THREE.MeshStandardMaterial({ color: 0xd4d0c7, roughness: 0.9, metalness: 0 });
  plasterMat.side = THREE.DoubleSide;
  const plasterMpu = wallSrc?.metersPerUv ?? 2.4;

  // Lower dark dado band reuses the exact same plaster texture map tinted dark charcoal like existing walls
  const dadoMat = plasterMat.clone();
  dadoMat.color = new THREE.Color('#2d3138');
  dadoMat.roughness = 0.92;
  dadoMat.metalness = 0.04;
  dadoMat.side = THREE.DoubleSide;

  const woodSrc = look.wood;
  const trimMat = woodSrc
    ? (woodSrc.material.clone() as THREE.MeshStandardMaterial)
    : new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 0.88, metalness: 0.04 });
  trimMat.side = THREE.DoubleSide;
  const trimMpu = woodSrc?.metersPerUv ?? 1.8;

  const floorSkirtMat = dadoMat.clone();
  floorSkirtMat.color = new THREE.Color('#3a3630');
  floorSkirtMat.roughness = 0.95;

  const minX = keepBox.min.x;
  const maxX = keepBox.max.x;
  const minZ = keepBox.min.z;
  const maxZ = keepBox.max.z;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const wallT = 0.9 * s;
  const yFloor = -3.8 * s;
  const yDadoTop = 2.2 * s;
  const yWallTop = 8.8 * s;
  const beltH = 0.24 * s;
  const capH = 0.42 * s;

  const addBox = (
    name: string,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    mpu: number,
    isSolid: boolean,
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    applyWorldScaleBoxUv(
      geo,
      w,
      h,
      d,
      [mpu, mpu, mpu, mpu, mpu, mpu],
      new THREE.Vector3(cx - w * 0.5, cy - h * 0.5, cz - d * 0.5),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = !lowQuality && isSolid;
    mesh.receiveShadow = true;
    mesh.userData.isPerimeterWall = true;
    group.add(mesh);
    if (isSolid) {
      solidMeshes.push(mesh);
      colliderShapes.push({
        id: `perimeter-${name}`,
        kind: 'aabb',
        minX: cx - w * 0.5,
        maxX: cx + w * 0.5,
        minY: cy - h * 0.5,
        maxY: cy + h * 0.5,
        minZ: cz - d * 0.5,
        maxZ: cz + d * 0.5,
      });
    }
  };

  const wallDefs: Array<{ id: string; cx: number; cz: number; w: number; d: number }> = [
    { id: 'West', cx: minX - wallT * 0.35, cz: (minZ + maxZ) * 0.5, w: wallT, d: spanZ + wallT * 2 },
    { id: 'East', cx: maxX + wallT * 0.35, cz: (minZ + maxZ) * 0.5, w: wallT, d: spanZ + wallT * 2 },
    { id: 'North', cx: (minX + maxX) * 0.5, cz: minZ - wallT * 0.35, w: spanX + wallT * 2, d: wallT },
    { id: 'South', cx: (minX + maxX) * 0.5, cz: maxZ + wallT * 0.35, w: spanX + wallT * 2, d: wallT },
  ];

  const dadoH = yDadoTop - yFloor;
  const upperH = yWallTop - yDadoTop;

  for (const wd of wallDefs) {
    // Solid lower charcoal dado band
    addBox(
      `PerimeterWall_${wd.id}_Dado`,
      wd.cx,
      yFloor + dadoH * 0.5,
      wd.cz,
      wd.w,
      dadoH,
      wd.d,
      dadoMat,
      plasterMpu,
      true,
    );
    // Solid upper warm-white stucco wall matching existing buildings
    addBox(
      `PerimeterWall_${wd.id}_Upper`,
      wd.cx,
      yDadoTop + upperH * 0.5,
      wd.cz,
      wd.w,
      upperH,
      wd.d,
      plasterMat,
      plasterMpu,
      true,
    );
    // Mid horizontal timber belt (visual trim)
    addBox(
      `PerimeterWall_${wd.id}_Belt`,
      wd.cx,
      yDadoTop,
      wd.cz,
      wd.w + 0.14 * s,
      beltH,
      wd.d + 0.14 * s,
      trimMat,
      trimMpu,
      false,
    );
    // Top roof/wall timber coping cap (visual trim)
    addBox(
      `PerimeterWall_${wd.id}_Cap`,
      wd.cx,
      yWallTop + capH * 0.4,
      wd.cz,
      wd.w + 0.28 * s,
      capH,
      wd.d + 0.28 * s,
      trimMat,
      trimMpu,
      false,
    );
  }

  // Deep under-floor ground skirt sealing any gaps along the clipped outer floor edges (non-colliding visual seal)
  addBox(
    'PerimeterUnderFloorSkirt',
    (minX + maxX) * 0.5,
    yFloor + 0.25 * s,
    (minZ + maxZ) * 0.5,
    spanX + wallT * 2,
    0.5 * s,
    spanZ + wallT * 2,
    floorSkirtMat,
    plasterMpu * 1.5,
    false,
  );

  return { group, solidMeshes, colliderShapes };
}

/**
 * Process a loaded GLTF scene:
 * 1. Scale by s = playerHeight / 1.7 (with auto-scale alignment so 1F-to-2F height matches u = 3.6*s).
 * 2. Locate reference origin `O` at the center of the 1F front entrance floor of the 2F A Tower building,
 *    verifying the 1F front entrance boundary and floor1Y via Raycast from the initial plaza direction.
 * 3. Define basis vectors F (forward into 1F entrance), R (right = F x Up), U (0, 1, 0),
 *    and coordinate helper `pos(r, u, f) = O + R*(r*s) + U*(u*s) + F*(f*s)`.
 * 4. Fix player start & respawn position to `pos(-1.2, 0, -8.5)` looking in `+F` (`yaw = 0`).
 * 5. Keep the A Tower exactly as the .glb builds it: players go around the left side and climb the
 *    building's own stairs to 2F. The 2F front window gets an invisible sill (blocks walking) that a jump
 *    clears, so players can drop from the window down to the 1F plaza.
 */
export function processLoadedGlbScene(
  gltfScene: THREE.Object3D,
  lowQuality = false,
  playerHeight = PLAYER_EYE_HEIGHT,
): LoadedGlbMapRuntime {
  const s = playerHeight / 1.7;
  const mapRoot = new THREE.Group();
  mapRoot.name = 'project-c-glb-map';
  mapRoot.add(gltfScene);
  mapRoot.updateMatrixWorld(true);

  const rawMeshes: THREE.Mesh[] = [];
  let rawATowerDoorMesh = null as THREE.Mesh | null;
  let rawATowerWindowMesh = null as THREE.Mesh | null;
  let rawATowerLowerIntMesh = null as THREE.Mesh | null;
  let rawATower2FFloorMesh = null as THREE.Mesh | null;
  let rawABombsiteFloorMesh = null as THREE.Mesh | null;

  gltfScene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.attributes.normal) {
      mesh.geometry.computeVertexNormals();
    }
    if (mesh.geometry.attributes.color) {
      mesh.geometry.deleteAttribute('color');
    }
    if (mesh.geometry.attributes.color_1) {
      mesh.geometry.deleteAttribute('color_1');
    }
    mesh.geometry.computeBoundingBox();

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matNames = mats.map((m) => m?.name || '').join(' ');
    let ancestorNames = '';
    let curParent: THREE.Object3D | null = mesh.parent;
    while (curParent && curParent !== mapRoot) {
      if (curParent.name) ancestorNames += ` ${curParent.name}`;
      curParent = curParent.parent;
    }
    const fullLabel = `${mesh.name || ''} ${ancestorNames} ${matNames}`;

    const meshWorldBox = new THREE.Box3().setFromObject(mesh);
    const meshSize = new THREE.Vector3();
    meshWorldBox.getSize(meshSize);

    let hasAnyTextureMap = false;
    let isUntexturedNearWhite = false;

    for (const m of mats) {
      if (!m) continue;
      const stdMat = m as THREE.MeshStandardMaterial;
      stdMat.vertexColors = false;
      stdMat.side = THREE.DoubleSide;
      stdMat.shadowSide = THREE.DoubleSide;

      const hasMap = Boolean(stdMat.map);
      if (hasMap && stdMat.map) {
        hasAnyTextureMap = true;
        if (stdMat.map.colorSpace !== THREE.SRGBColorSpace) {
          stdMat.map.colorSpace = THREE.SRGBColorSpace;
          stdMat.map.needsUpdate = true;
        }
      }

      const col = stdMat.color;
      const nearWhite =
        !col || (col.r >= 0.72 && col.g >= 0.72 && col.b >= 0.72);

      if (!hasMap && nearWhite) {
        isUntexturedNearWhite = true;
      }

      if (stdMat.emissive) {
        stdMat.emissive.setHex(0x000000);
      }
      if ('emissiveIntensity' in stdMat) {
        stdMat.emissiveIntensity = 0;
      }
      if ('emissiveMap' in stdMat) {
        stdMat.emissiveMap = null;
      }

      if (nearWhite && stdMat.color) {
        stdMat.color.set('#d4d0c7');
      }

      if ('roughness' in stdMat) {
        stdMat.roughness = !hasMap && nearWhite ? 0.9 : Math.max(0.85, stdMat.roughness ?? 0.88);
      }
      if ('metalness' in stdMat) {
        stdMat.metalness =
          !hasMap && nearWhite
            ? 0
            : Math.min(0.2, Math.max(0, typeof stdMat.metalness === 'number' ? stdMat.metalness : 0));
      }
      if ('metalnessMap' in stdMat) {
        stdMat.metalnessMap = null;
      }
      if ('envMapIntensity' in stdMat) {
        stdMat.envMapIntensity = 0.35;
      }

      if (ALPHA_CUTOUT_NAME_RE.test(fullLabel)) {
        stdMat.alphaTest = 0.45;
        stdMat.transparent = false;
        stdMat.depthWrite = true;
      } else {
        stdMat.transparent = false;
        stdMat.depthWrite = true;
        stdMat.opacity = 1.0;
      }
      stdMat.needsUpdate = true;
    }

    const isThinFlatPlane =
      mesh.geometry.type === 'PlaneGeometry' ||
      (meshSize.y <= 0.14 && Math.max(meshSize.x, meshSize.z) >= 0.35);
    const shouldHideMesh =
      HIDDEN_HELPER_NAME_RE.test(fullLabel) ||
      (!hasAnyTextureMap &&
        isUntexturedNearWhite &&
        isThinFlatPlane &&
        !FLOOR_NAME_RE.test(mesh.name || ''));

    if (shouldHideMesh) {
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return;
    }

    const nameAndParent = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    if (/Doorway_0_ATowerFancyFrame/i.test(nameAndParent)) {
      rawATowerDoorMesh = mesh;
    } else if (/Window_0_ATowerFrame_0/i.test(nameAndParent)) {
      rawATowerWindowMesh = mesh;
    } else if (/Shell_0_ATowerLowerInterior_0/i.test(nameAndParent)) {
      rawATowerLowerIntMesh = mesh;
    } else if (/Shell_0_ATowerIntFloor_0/i.test(nameAndParent)) {
      rawATower2FFloorMesh = mesh;
    } else if (/Floor_0_ABombsite_0/i.test(nameAndParent)) {
      rawABombsiteFloorMesh = mesh;
    }

    mesh.castShadow = !lowQuality;
    mesh.receiveShadow = true;
    rawMeshes.push(mesh);
  });

  // 1. Inspect raw Box3 & determine autoScale
  const rawFullBox = new THREE.Box3();
  const rawCentersX: number[] = [];
  const rawCentersZ: number[] = [];
  const rawCoreBox = new THREE.Box3();

  for (const mesh of rawMeshes) {
    const b = new THREE.Box3().setFromObject(mesh);
    if (b.isEmpty()) continue;
    rawFullBox.union(b);
    const c = new THREE.Vector3();
    const sz = new THREE.Vector3();
    b.getCenter(c);
    b.getSize(sz);
    const name = mesh.name || mesh.parent?.name || '';
    const isVista = VISTA_BACKDROP_RE.test(name) || Math.max(sz.x, sz.z) > 220;
    if (!isVista) {
      rawCoreBox.union(b);
      rawCentersX.push(c.x);
      rawCentersZ.push(c.z);
    }
  }

  const rawFullSize = new THREE.Vector3();
  rawFullBox.getSize(rawFullSize);

  rawCentersX.sort((a, b) => a - b);
  rawCentersZ.sort((a, b) => a - b);
  const q = (arr: number[], p: number) =>
    arr.length > 0 ? arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))] : 0;

  const spanX96 = q(rawCentersX, 0.98) - q(rawCentersX, 0.02);
  const spanZ96 = q(rawCentersZ, 0.98) - q(rawCentersZ, 0.02);
  const coreHorizontalSpan = Math.max(spanX96, spanZ96);

  // If the 2-story A Tower building is present in the .glb, align scale so 1F->2F floor height equals 3.6*s
  let autoScale =
    computeAutoMapScale({
      fullSize: rawFullSize,
      coreHorizontalSpan,
    }) * s;

  // Offsets below that were measured on the map at its first tuning scale grow with it
  let mapBoost = 1;
  if (rawATower2FFloorMesh && (rawABombsiteFloorMesh || rawATowerDoorMesh)) {
    const floor1Box = new THREE.Box3().setFromObject(
      (rawABombsiteFloorMesh ?? rawATowerDoorMesh) as THREE.Object3D,
    );
    const floor2Box = new THREE.Box3().setFromObject(rawATower2FFloorMesh);
    const raw1FY = rawABombsiteFloorMesh ? floor1Box.max.y : floor1Box.min.y;
    const raw2FY = floor2Box.min.y;
    const rawFloorDelta = raw2FY - raw1FY;
    if (rawFloorDelta > 1.0) {
      autoScale = (ATOWER_BASE_FLOOR_HEIGHT * ATOWER_MAP_SCALE_BOOST * s) / rawFloorDelta;
      mapBoost = ATOWER_MAP_SCALE_BOOST;
    }
  }

  mapRoot.scale.setScalar(autoScale);
  mapRoot.updateMatrixWorld(true);

  // Compute Dense Center (for reference / synthetic fallback)
  const scaledCenterSum = new THREE.Vector3();
  let validMeshCount = 0;
  for (const mesh of rawMeshes) {
    const b = new THREE.Box3().setFromObject(mesh);
    if (b.isEmpty()) continue;
    const c = new THREE.Vector3();
    b.getCenter(c);
    scaledCenterSum.add(c);
    validMeshCount++;
  }
  const denseCenter =
    validMeshCount > 0
      ? scaledCenterSum.divideScalar(validMeshCount)
      : new THREE.Vector3(0, 0, 0);

  // 2. Measure Reference Origin `O` (1F front entrance floor center of the 2F building) via Raycast
  const raycaster = new THREE.Raycaster();
  const downDir = new THREE.Vector3(0, -1, 0);
  const basisF = new THREE.Vector3(0, 0, -1); // Forward into 1F entrance
  const basisU = new THREE.Vector3(0, 1, 0); // Up
  const basisR = new THREE.Vector3().crossVectors(basisF, basisU).normalize(); // Right = F x Up = (1, 0, 0)

  let approxOX = denseCenter.x;
  let approxOY = denseCenter.y;
  let approxOZ = denseCenter.z;

  if (rawATowerDoorMesh || rawATowerWindowMesh || rawATowerLowerIntMesh) {
    const doorBox = rawATowerDoorMesh
      ? new THREE.Box3().setFromObject(rawATowerDoorMesh)
      : null;
    const winBox = rawATowerWindowMesh
      ? new THREE.Box3().setFromObject(rawATowerWindowMesh)
      : null;
    const intBox = rawATowerLowerIntMesh
      ? new THREE.Box3().setFromObject(rawATowerLowerIntMesh)
      : null;
    const siteFloorBox = rawABombsiteFloorMesh
      ? new THREE.Box3().setFromObject(rawABombsiteFloorMesh)
      : null;

    if (winBox) {
      approxOX = (winBox.min.x + winBox.max.x) * 0.5;
    } else if (intBox) {
      approxOX = (intBox.min.x + intBox.max.x) * 0.5;
    } else if (doorBox) {
      approxOX = (doorBox.min.x + doorBox.max.x) * 0.5;
    }

    if (doorBox) {
      approxOZ = (doorBox.min.z + doorBox.max.z) * 0.5;
      approxOY = doorBox.min.y;
    } else if (winBox) {
      approxOZ = (winBox.min.z + winBox.max.z) * 0.5;
    } else if (intBox) {
      approxOZ = intBox.max.z;
      approxOY = intBox.min.y;
    }

    if (siteFloorBox) {
      approxOY = siteFloorBox.max.y;
    }

    // Cast forward ray from initial camera direction in plaza toward +F to verify 1F front boundary
    const frontTargets: THREE.Object3D[] = [];
    if (rawATowerDoorMesh) frontTargets.push(rawATowerDoorMesh);
    if (rawATowerWindowMesh) frontTargets.push(rawATowerWindowMesh);
    if (frontTargets.length > 0) {
      const probeEye = new THREE.Vector3(approxOX, approxOY + 4.8 * s * mapBoost, approxOZ + 10.0 * s * mapBoost);
      raycaster.set(probeEye, basisF);
      raycaster.far = 20.0 * s * mapBoost;
      const frontHits = raycaster.intersectObjects(frontTargets, false);
      if (frontHits.length > 0) {
        approxOZ = frontHits[0].point.z;
      }
    }

    // Cast downward ray at 1F front entrance (approxOX, approxOZ) to accurately measure floor1Y
    const floorTargets: THREE.Object3D[] = [];
    if (rawABombsiteFloorMesh) floorTargets.push(rawABombsiteFloorMesh);
    if (rawATowerLowerIntMesh) floorTargets.push(rawATowerLowerIntMesh);
    const downTargets = floorTargets.length > 0 ? floorTargets : rawMeshes;
    raycaster.set(new THREE.Vector3(approxOX, approxOY + 3.0 * s * mapBoost, approxOZ + 0.4 * s * mapBoost), downDir);
    raycaster.far = 10.0 * s * mapBoost;
    const floorHits = raycaster.intersectObjects(downTargets, false);
    if (floorHits.length > 0) {
      approxOY = floorHits[0].point.y;
    }
  } else {
    // Fallback for generic synthetic test scenes without A Tower meshes: measure floor1Y at denseCenter
    raycaster.set(new THREE.Vector3(approxOX, approxOY + 25 * s, approxOZ), downDir);
    raycaster.far = 60 * s;
    const floorHits = raycaster.intersectObjects(rawMeshes, false);
    if (floorHits.length > 0) {
      approxOY = floorHits[0].point.y;
    }
  }

  // Translate mapRoot so the measured reference origin `O` sits cleanly at world (0, 0, 0) (floor1Y = 0)
  const measuredOriginWorld = new THREE.Vector3(approxOX, approxOY, approxOZ);
  mapRoot.position.sub(measuredOriginWorld);
  mapRoot.updateMatrixWorld(true);

  const anchorOrigin = new THREE.Vector3(0, 0, 0);

  // Coordinate formula: pos(r, u, f) = O + R*(r*s) + U*(u*s) + F*(f*s)
  const pos = (r: number, u: number, f: number): THREE.Vector3 => {
    return anchorOrigin
      .clone()
      .addScaledVector(basisR, r * s)
      .addScaledVector(basisU, u * s)
      .addScaledVector(basisF, f * s);
  };

  // Helper to convert any world point (x, y, z) into relative (r, u, f) coordinates (in unscaled units)
  const toLocalRuf = (worldPt: THREE.Vector3): { r: number; u: number; f: number } => {
    const rel = worldPt.clone().sub(anchorOrigin);
    return {
      r: rel.dot(basisR) / s,
      u: rel.dot(basisU) / s,
      f: rel.dot(basisF) / s,
    };
  };

  // Measure the 2F floor and the front window frame so the window vault lines up with the real geometry
  const k = mapBoost;
  const windowSpec: ATowerWindowSpec = {
    floorU: 3.82 * k,
    geomScale: k,
    rMin: -1.6 * k,
    rMax: 1.6 * k,
    fOuter: -0.05 * k,
    fInner: 0.34 * k,
  };
  if (rawATower2FFloorMesh) {
    const fb = new THREE.Box3().setFromObject(rawATower2FFloorMesh);
    windowSpec.floorU = toLocalRuf(new THREE.Vector3(0, fb.max.y, 0)).u;
  }
  if (rawATowerWindowMesh) {
    const wb = new THREE.Box3().setFromObject(rawATowerWindowMesh);
    const a1 = toLocalRuf(wb.min);
    const a2 = toLocalRuf(wb.max);
    const rLo = Math.min(a1.r, a2.r);
    const rHi = Math.max(a1.r, a2.r);
    if (rHi - rLo > 1.2 * k) {
      windowSpec.rMin = rLo + 0.3 * k;
      windowSpec.rMax = rHi - 0.3 * k;
      windowSpec.fOuter = Math.min(a1.f, a2.f);
    }
  }
  // inner face of the window's interior frame (the sill's back edge)
  const interiorFrameMesh = rawMeshes.find((m) =>
    /Window_0_ATowerFrameInteriorA/i.test(`${m.name || ''} ${m.parent?.name || ''}`),
  );
  if (interiorFrameMesh) {
    const ib = new THREE.Box3().setFromObject(interiorFrameMesh);
    const fA = toLocalRuf(ib.min).f;
    const fB = toLocalRuf(ib.max).f;
    const fIn = Math.max(fA, fB);
    if (fIn > windowSpec.fOuter + 0.1 * k && fIn < windowSpec.fOuter + 1.0 * k) windowSpec.fInner = fIn;
  }

  // The A Tower stays as the .glb builds it (front 1F room closed on the right, stairs on the left).
  // Open the 2F front window's closed left shutter and its centre mullion so the whole opening
  // can be jumped through; the frame around the opening stays.
  for (const mesh of rawMeshes) {
    const label = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    if (/Window_0_ATowerFrameInteriorB/i.test(label)) {
      mesh.visible = false;
    } else if (/Window_0_ATowerFrame_0|Window_0_ATowerFrameInteriorA/i.test(label)) {
      removeTrianglesWithin(mesh, toLocalRuf, {
        r: [windowSpec.rMin - 0.02 * k, -0.3 * k],
        u: [windowSpec.floorU + 0.25 * k, windowSpec.floorU + 1.98 * k],
        f: [windowSpec.fOuter - 0.05 * k, windowSpec.fInner - 0.03 * k],
      });
    }
  }

  // Cut the wall above the window up to WINDOW_OPENING_HEIGHT so a jumping player's camera fits through,
  // and take down the small decorations hanging in that space (awning, AC unit, dish, wall panels, decals).
  const openingTopU = windowSpec.floorU + WINDOW_OPENING_HEIGHT;
  const frameTopU = windowSpec.floorU + WINDOW_OLD_FRAME_TOP * k;
  const wallSlab: [number, number] = [windowSpec.fOuter - 0.15, windowSpec.fInner + 0.15];
  const corridor = {
    r: [windowSpec.rMin + 0.03, windowSpec.rMax - 0.03],
    u: [frameTopU + 0.06, openingTopU],
    f: [windowSpec.fOuter - 1.5, windowSpec.fInner + 0.6],
  };
  const rufBox = (mesh: THREE.Mesh) => {
    const b = new THREE.Box3().setFromObject(mesh);
    const lo = { r: Infinity, u: Infinity, f: Infinity };
    const hi = { r: -Infinity, u: -Infinity, f: -Infinity };
    for (let i = 0; i < 8; i++) {
      const l = toLocalRuf(
        new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z),
      );
      lo.r = Math.min(lo.r, l.r); lo.u = Math.min(lo.u, l.u); lo.f = Math.min(lo.f, l.f);
      hi.r = Math.max(hi.r, l.r); hi.u = Math.max(hi.u, l.u); hi.f = Math.max(hi.f, l.f);
    }
    return { lo, hi };
  };
  for (const mesh of rawMeshes) {
    if (!mesh.visible) continue;
    const label = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    const { lo, hi } = rufBox(mesh);
    const meetsCorridor =
      hi.r > corridor.r[0] && lo.r < corridor.r[1] &&
      hi.u > corridor.u[0] && lo.u < corridor.u[1] &&
      hi.f > corridor.f[0] && lo.f < corridor.f[1];
    // things sticking out of the facade right above the opening sat on the awning that goes away
    const onAwning =
      hi.r > corridor.r[0] && lo.r < corridor.r[1] &&
      hi.u > openingTopU && lo.u < openingTopU + 1.8 * k &&
      lo.f < windowSpec.fOuter - 0.15 * k && hi.f > corridor.f[0];
    if (!meetsCorridor && !onAwning) continue;
    if (/Shell_0_ATower|Window_0_ATowerFrame/i.test(label)) {
      if (meetsCorridor) {
        clipBoxOutOfMesh(mesh, toLocalRuf, {
          r: [windowSpec.rMin, windowSpec.rMax],
          u: [frameTopU - 0.02, openingTopU],
          f: wallSlab,
        });
      }
    } else if (Math.max(hi.r - lo.r, hi.u - lo.u, hi.f - lo.f) < 4.5 * k) {
      mesh.visible = false;
      mesh.castShadow = false;
    }
  }
  const findRaw = (re: RegExp) => rawMeshes.find((m) => re.test(`${m.name || ''} ${m.parent?.name || ''}`));
  const windowLook: ATowerWindowLook = {
    wood: borrowLook(rawATowerWindowMesh ?? undefined),
    wallOuter: borrowLook(findRaw(/^Shell_0_ATowerBaseWindow_1\b/)),
    wallInner: borrowLook(findRaw(/^Shell_0_ATowerInteriorWallJ_1\b/)),
  };

  // 3. Window vault colliders (sill + jambs) and the visible finish of the enlarged 2F front window
  const customBuilt = buildATowerWindowVault({ pos, s, win: windowSpec, look: windowLook });
  const aTowerRouteGroup = customBuilt.group;
  mapRoot.attach(aTowerRouteGroup);
  mapRoot.updateMatrixWorld(true);

  // 3.5. Keep-box optimization: prune all GLB meshes outside the red minimap border, clip oversized
  // ground/terrain meshes cleanly to keepBox, and immediately free unused GPU geometries/materials/textures.
  const fixedSpawnPos = pos(-1.2 * mapBoost, 0, -8.5 * mapBoost);
  const keepBox = new THREE.Box3(
    new THREE.Vector3(
      MAP_KEEP_BOX_BOUNDS.minX * s,
      MAP_KEEP_BOX_BOUNDS.minY * s,
      MAP_KEEP_BOX_BOUNDS.minZ * s,
    ),
    new THREE.Vector3(
      MAP_KEEP_BOX_BOUNDS.maxX * s,
      MAP_KEEP_BOX_BOUNDS.maxY * s,
      MAP_KEEP_BOX_BOUNDS.maxZ * s,
    ),
  );
  // Guarantee player spawn area and custom A Tower stairs/heaven group are strictly inside keepBox
  keepBox.expandByPoint(fixedSpawnPos);
  const customGroupBounds = new THREE.Box3().setFromObject(aTowerRouteGroup);
  if (!customGroupBounds.isEmpty()) {
    keepBox.union(customGroupBounds);
  }

  const protectedSet = new Set<THREE.Object3D>();
  aTowerRouteGroup.traverse((o) => protectedSet.add(o));

  const isProtectedCustomNode = (obj: THREE.Object3D): boolean => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (protectedSet.has(cur)) return true;
      if (/customStairAndHeavenGroup|aTowerWindowVaultGroup/i.test(cur.name || '')) return true;
      cur = cur.parent;
    }
    return false;
  };

  // Traverse all GLB meshes before pruning (including hidden helpers so they get cleaned up too)
  const allGlbMeshes: THREE.Mesh[] = [];
  gltfScene.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (isProtectedCustomNode(m)) return;
    allGlbMeshes.push(m);
  });

  const beforeMeshCount = allGlbMeshes.length;
  const removedMeshes: THREE.Mesh[] = [];
  const keptMeshes: THREE.Mesh[] = [];
  const terrainClipMargin = 2.5 * s;
  const terrainClipBox = new THREE.Box3(
    new THREE.Vector3(
      keepBox.min.x - terrainClipMargin,
      keepBox.min.y,
      keepBox.min.z - terrainClipMargin,
    ),
    new THREE.Vector3(
      keepBox.max.x + terrainClipMargin,
      keepBox.max.y,
      keepBox.max.z + terrainClipMargin,
    ),
  );

  let clippedMeshCount = 0;
  let removedFloatingRoofCount = 0;
  const tmpSize = new THREE.Vector3();
  const tmpCenter = new THREE.Vector3();

  for (const mesh of allGlbMeshes) {
    if (!mesh.visible) {
      // Keep invisible helper meshes' flags intact for tests, but remove them from scene graph & free GPU memory
      mesh.parent?.remove(mesh);
      removedMeshes.push(mesh);
      continue;
    }
    const meshBox = new THREE.Box3().setFromObject(mesh);
    if (meshBox.isEmpty() || !keepBox.intersectsBox(meshBox)) {
      mesh.parent?.remove(mesh);
      removedMeshes.push(mesh);
      continue;
    }

    // Remove floating overhang roofs / eaves / rafters / upper props whose supporting walls were outside keepBox
    // (e.g. Roof_18_TallA_1, Roof_17_ArcheryA.001, Roof_3_Garden_0, and rafters/foliage perched on them)
    const meshLabel = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
    meshBox.getCenter(tmpCenter);
    const centerOutsideXZ =
      tmpCenter.x < keepBox.min.x ||
      tmpCenter.x > keepBox.max.x ||
      tmpCenter.z < keepBox.min.z ||
      tmpCenter.z > keepBox.max.z;
    const isFloatingOverhang =
      centerOutsideXZ &&
      ((FLOATING_ROOF_NAME_RE.test(meshLabel) && meshBox.min.y > 2.5 * s) ||
        (meshBox.min.y > 5.5 * s && !/Tree_|Canopy/i.test(meshLabel)));
    if (isFloatingOverhang) {
      mesh.parent?.remove(mesh);
      removedMeshes.push(mesh);
      removedFloatingRoofCount++;
      continue;
    }

    // Clip oversized ground / terrain / cliff meshes that spill far outside keepBox
    meshBox.getSize(tmpSize);
    const protrudesOutside =
      meshBox.min.x < terrainClipBox.min.x - 1.5 * s ||
      meshBox.max.x > terrainClipBox.max.x + 1.5 * s ||
      meshBox.min.z < terrainClipBox.min.z - 1.5 * s ||
      meshBox.max.z > terrainClipBox.max.z + 1.5 * s;
    const isOversizedTerrain = Math.max(tmpSize.x, tmpSize.z) > 24 * s;

    if (isOversizedTerrain && protrudesOutside) {
      const { keptTriangles, modified } = clipMeshToKeepBoxXZ(mesh, terrainClipBox);
      if (keptTriangles === 0) {
        mesh.parent?.remove(mesh);
        removedMeshes.push(mesh);
        continue;
      }
      if (modified) {
        clippedMeshCount++;
      }
    }

    keptMeshes.push(mesh);
  }

  // Enclose the 4 outer edges of keepBox with textured perimeter walls matching existing map walls
  const perimeterBuilt = buildKeepBoxPerimeterWalls({
    keepBox,
    s,
    look: windowLook,
    lowQuality,
  });
  mapRoot.attach(perimeterBuilt.group);

  // Free GPU geometries, materials, and textures no longer referenced by any surviving mesh
  const disposedStats = disposeUnusedMapResources(removedMeshes, mapRoot);
  mapRoot.updateMatrixWorld(true);

  const afterMeshCount = keptMeshes.length;
  const optimizationStats: MapOptimizationStats = {
    beforeMeshCount,
    afterMeshCount,
    removedMeshCount: removedMeshes.length,
    clippedMeshCount,
    ...disposedStats,
  };
  console.log(
    `[MapOptimize] 삭제 전 메쉬 수: ${beforeMeshCount} → 삭제 후 남은 메쉬 수: ${afterMeshCount} ` +
      `(제거: ${removedMeshes.length}, 공중 지붕 제거: ${removedFloatingRoofCount}, 대형 지형 클리핑: ${clippedMeshCount}, ` +
      `외곽 벽 추가: ${perimeterBuilt.solidMeshes.length}, ` +
      `해제된 리소스: geo ${disposedStats.disposedGeometries} / mat ${disposedStats.disposedMaterials} / tex ${disposedStats.disposedTextures})`,
  );

  // Replace rawMeshes with ONLY surviving kept meshes so all colliders, raycasts & radar boxes rebuild cleanly
  rawMeshes.length = 0;
  rawMeshes.push(...keptMeshes);

  // Collect post-alignment mesh entries (excluding visual 9-step stone stair meshes from collision,
  // and including the invisible custom ramp/floor/wall/sill collider meshes)
  const buildEntries = (): {
    entries: MeshEntry[];
    solidEntries: MeshEntry[];
    bounds: THREE.Box3;
  } => {
    const entries: MeshEntry[] = [];
    const solidEntries: MeshEntry[] = [];
    const bounds = new THREE.Box3();

    for (const mesh of rawMeshes) {
      if (!mesh.visible) continue;
      if (mesh.userData?.excludeFromCollision) continue;
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) continue;
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      const label = `${mesh.name || ''} ${mesh.parent?.name || ''}`;
      const isVistaBackdrop = VISTA_BACKDROP_RE.test(label) || Math.max(size.x, size.z) > 220;
      const isNonSolidDecor =
        isVistaBackdrop ||
        NON_SOLID_NAME_RE.test(label) ||
        (size.y < 0.16 && Math.max(size.x, size.z) < 4.5 && !FLOOR_NAME_RE.test(label));
      const isWalkableFloorNamed = FLOOR_NAME_RE.test(label);

      if (!isVistaBackdrop) {
        bounds.union(box);
      }
      const entry: MeshEntry = {
        mesh,
        box,
        center,
        size,
        isNonSolidDecor,
        isVistaBackdrop,
        isWalkableFloorNamed,
        isCustomCollider: false,
      };
      entries.push(entry);
      if (!isNonSolidDecor) {
        solidEntries.push(entry);
      }
    }

    // Add invisible custom ramp/floor/wall/sill colliders AND keepBox perimeter enclosure walls to solidEntries
    for (const colMesh of [...customBuilt.colliderMeshes, ...perimeterBuilt.solidMeshes]) {
      const box = new THREE.Box3().setFromObject(colMesh);
      if (box.isEmpty()) continue;
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      bounds.union(box);
      const isPerimeter = Boolean(colMesh.userData?.isPerimeterWall);
      const entry: MeshEntry = {
        mesh: colMesh,
        box,
        center,
        size,
        isNonSolidDecor: false,
        isVistaBackdrop: false,
        isWalkableFloorNamed: !isPerimeter,
        isCustomCollider: true,
      };
      entries.push(entry);
      solidEntries.push(entry);
    }

    if (bounds.isEmpty()) {
      bounds.setFromObject(mapRoot);
    }
    return { entries, solidEntries, bounds };
  };

  const { solidEntries, bounds: alignedBounds } = buildEntries();
  const spatialGrid = new MeshSpatialGrid(solidEntries, 6.0);

  // 4. Fixed Player Start & Respawn Position: pos(-1.2, 0, -8.5), looking in +F (yaw = 0)
  const spawnFloorY = Number(fixedSpawnPos.y.toFixed(3));
  const spawnEyeY = Number((spawnFloorY + 1.7 * s).toFixed(3));
  const spawnX = Number(fixedSpawnPos.x.toFixed(2));
  const spawnZ = Number(fixedSpawnPos.z.toFixed(2));
  const spawnYaw = 0; // +F direction (-Z), looking straight at O and the 2F window above O

  // 5. Build AABB ColliderShapes for minimap & obstacle-avoidance compatibility
  const colliders: ColliderShape[] = [...customBuilt.colliderShapes, ...perimeterBuilt.colliderShapes];
  let colIdx = 0;
  for (const e of solidEntries) {
    if (e.isCustomCollider) continue;
    if (e.size.y < 0.55) continue;
    if (e.box.max.y < spawnFloorY + 0.45 || e.box.min.y > spawnFloorY + 3.2) continue;
    if (e.size.x > 32 && e.size.z > 32) continue;
    if (FLOOR_NAME_RE.test(e.mesh.name || '') && e.size.y < 1.2) continue;
    colliders.push({
      id: `glb-col-${colIdx++}`,
      kind: 'aabb',
      minX: e.box.min.x,
      maxX: e.box.max.x,
      minZ: e.box.min.z,
      maxZ: e.box.max.z,
      minY: e.box.min.y,
      maxY: e.box.max.y,
    });
  }

  // 6. Generate open-sightline Target Spawn Anchors around the fixed plaza spawn position
  const anchors: SpawnAnchor[] = [];
  const eyeOrigin = new THREE.Vector3(spawnX, spawnEyeY, spawnZ);
  const allSolidMeshes = spatialGrid.getAllSolidMeshes();
  let anchorCounter = 1;

  const candidateSpecs: Array<{
    angleDeg: number;
    sector: SpawnDirectionSector;
    dists: number[];
    heights: number[];
  }> = [
    // FRONT (-Z within ±38°)
    { angleDeg: 0, sector: 'FRONT', dists: [6.5, 9.5, 13.0], heights: [1.5, 2.5, 4.8] },
    { angleDeg: -16, sector: 'FRONT', dists: [6.5, 10.0, 13.5], heights: [1.5, 2.6, 4.6] },
    { angleDeg: 16, sector: 'FRONT', dists: [6.5, 10.0, 13.5], heights: [1.5, 2.6, 4.6] },
    { angleDeg: -30, sector: 'FRONT', dists: [6.5, 9.5, 12.5], heights: [1.6, 2.7, 3.8] },
    { angleDeg: 30, sector: 'FRONT', dists: [6.5, 9.5, 12.5], heights: [1.6, 2.7, 3.8] },
    // LEFT (-X)
    { angleDeg: -65, sector: 'LEFT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: -90, sector: 'LEFT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: -115, sector: 'LEFT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    // RIGHT (+X)
    { angleDeg: 65, sector: 'RIGHT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: 90, sector: 'RIGHT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: 115, sector: 'RIGHT', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    // REAR (+Z)
    { angleDeg: 150, sector: 'REAR', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: 180, sector: 'REAR', dists: [6.5, 10.0], heights: [1.6, 2.8] },
    { angleDeg: -150, sector: 'REAR', dists: [6.5, 10.0], heights: [1.6, 2.8] },
  ];

  const demoAnchorIds = [
    'near-pedestal-0',
    'near-pedestal-1',
    'balcony-L-1',
    'air-anchor-0',
    'center-float-platform',
    'far-stand-1',
    'far-stand-2',
    'far-stand-3',
    'far-stand-4',
    'far-stand-5',
  ];
  let frontDemoIdx = 0;

  for (const spec of candidateSpecs) {
    const rad = THREE.MathUtils.degToRad(spec.angleDeg);
    const dirX = Math.sin(rad);
    const dirZ = -Math.cos(rad);
    for (const dist of spec.dists) {
      for (const h of spec.heights) {
        const tx = spawnX + dirX * dist;
        const ty = spawnFloorY + h;
        const tz = spawnZ + dirZ * dist;
        const targetPt = new THREE.Vector3(tx, ty, tz);
        const toTarget = targetPt.clone().sub(eyeOrigin);
        const rayLen = toTarget.length();
        raycaster.set(eyeOrigin, toTarget.normalize());
        raycaster.far = rayLen + 0.6;
        const hits = raycaster.intersectObjects(allSolidMeshes, false);
        if (hits.length === 0 || hits[0].distance >= rayLen - 0.35) {
          const anchorId =
            spec.sector === 'FRONT' && frontDemoIdx < demoAnchorIds.length
              ? demoAnchorIds[frontDemoIdx++]
              : `glb-anchor-${anchorCounter++}`;
          const kind: SpawnAnchor['kind'] =
            spec.sector === 'REAR'
              ? 'rear'
              : dist <= 8.0
                ? 'near'
                : h >= 3.2
                  ? 'air'
                  : 'stand';
          anchors.push({
            id: anchorId,
            kind,
            x: Number(tx.toFixed(2)),
            y: Number(ty.toFixed(2)),
            z: Number(tz.toFixed(2)),
            sector: spec.sector,
            hasPedestal: false,
          });
        }
      }
    }
  }

  while (anchors.length < 16) {
    const idx = anchors.length;
    const angle = ((idx % 8) - 3.5) * 0.22;
    const dist = 5.5 + (idx % 3) * 2.0;
    const h = 1.8 + (idx % 3) * 0.9;
    const anchorId =
      frontDemoIdx < demoAnchorIds.length
        ? demoAnchorIds[frontDemoIdx++]
        : `glb-anchor-${anchorCounter++}`;
    anchors.push({
      id: anchorId,
      kind: 'near',
      x: Number((spawnX + Math.sin(angle) * dist).toFixed(2)),
      y: Number((spawnFloorY + h).toFixed(2)),
      z: Number((spawnZ - Math.cos(angle) * dist).toFixed(2)),
      sector: 'FRONT',
      hasPedestal: false,
    });
  }

  const mapMinY = alignedBounds.min.y;
  const tmpNormMat = new THREE.Matrix3();
  const horizDirs = [
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-0.707, 0, -0.707),
    new THREE.Vector3(0.707, 0, -0.707),
    new THREE.Vector3(-0.707, 0, 0.707),
    new THREE.Vector3(0.707, 0, 0.707),
  ];

  // Inside the 2F window opening (with a little room on both sides) while high enough to clear the sill
  const isVaultingWindow = (r: number, u: number, f: number): boolean =>
    r >= windowSpec.rMin - 0.05 &&
    r <= windowSpec.rMax + 0.05 &&
    f >= windowSpec.fOuter - 1.0 &&
    f <= windowSpec.fInner + 0.95 &&
    u >= windowSpec.floorU + WINDOW_VAULT_CLEAR_HEIGHT &&
    u <= windowSpec.floorU + 2.6;

  // 7. Real-time Floor Raycast (with >= 45° slope allowance: normal.y >= 0.5) & Horizontal Wall Collision
  const getFloorSupportY = (x: number, z: number, currentFeetY: number): number => {
    const nearby = spatialGrid.queryNear(
      x,
      z,
      0.85,
      mapMinY - 5,
      currentFeetY + 2.2,
      // The invisible window sill only blocks walking; it is never stood on
      (e) => !e.mesh.userData?.isWindowSill && !e.mesh.userData?.isWindowJamb,
    );

    let bestY = -Infinity;
    if (nearby.length > 0) {
      const rayTop = currentFeetY + 1.35 * s;
      raycaster.set(new THREE.Vector3(x, rayTop, z), downDir);
      raycaster.far = Math.max(10, rayTop - mapMinY + 20);
      const hits = raycaster.intersectObjects(nearby, false);
      for (const h of hits) {
        if (h.point.y > currentFeetY + 0.85 * s) continue;
        const n = computeWorldFaceNormal(h, downDir, tmpNormMat);
        // Allow slopes of 45 degrees or more (normal.y >= 0.5)
        if (n.y >= 0.5) {
          if (h.point.y > bestY) {
            bestY = h.point.y;
          }
        }
      }
    }

    return bestY > -Infinity ? bestY : spawnFloorY;
  };

  const resolveHorizontalMove = (
    curX: number,
    curZ: number,
    dx: number,
    dz: number,
    feetY: number,
    radius = 0.42,
  ): { x: number; z: number; hitEnv: boolean } => {
    let nextX = curX + dx;
    let nextZ = curZ + dz;
    let hitEnv = false;

    const curLoc = toLocalRuf(new THREE.Vector3(curX, feetY, curZ));
    const nextLoc = toLocalRuf(new THREE.Vector3(nextX, feetY, nextZ));
    // Mid-jump through the 2F front window: only the window's own jambs block, so the facade
    // around the opening can't snag the player on the way out
    const vaulting =
      isVaultingWindow(curLoc.r, curLoc.u, curLoc.f) || isVaultingWindow(nextLoc.r, nextLoc.u, nextLoc.f);

    // Query nearby solid meshes (ignoring walkable ramps as horizontal walls)
    const nearby = spatialGrid.queryNear(
      nextX,
      nextZ,
      radius + 1.5,
      feetY + 0.55 * s,
      feetY + 1.7 * s,
      (entry) => {
        if (entry.mesh.userData?.isWalkableRamp) return false;
        if (vaulting) return Boolean(entry.mesh.userData?.isWindowJamb);
        return true;
      },
    );

    if (nearby.length === 0) {
      return { x: nextX, z: nextZ, hitEnv };
    }

    const effDx = nextX - curX;
    const effDz = nextZ - curZ;
    const moveDist = Math.hypot(effDx, effDz);
    if (moveDist > 0.001) {
      const moveDir = new THREE.Vector3(effDx / moveDist, 0, effDz / moveDist);
      for (const hOffset of [0.65 * s, 1.3 * s]) {
        raycaster.set(new THREE.Vector3(curX, feetY + hOffset, curZ), moveDir);
        raycaster.far = moveDist + radius;
        const sweepHits = raycaster.intersectObjects(nearby, false);
        for (const sh of sweepHits) {
          const n = computeWorldFaceNormal(sh, moveDir, tmpNormMat);
          // Treat surfaces with normal.y >= 0.5 (>= 45 deg climbable ramp) as walkable, not blocking walls
          if (n.y < 0.5 && Math.abs(n.y) < 0.55 && sh.distance < moveDist + radius) {
            const push = moveDist + radius - sh.distance + 0.005;
            nextX += n.x * push;
            nextZ += n.z * push;
            hitEnv = true;
            break;
          }
        }
      }
    }

    for (const hOffset of [0.65 * s, 1.3 * s]) {
      for (const dir of horizDirs) {
        raycaster.set(new THREE.Vector3(nextX, feetY + hOffset, nextZ), dir);
        raycaster.far = radius;
        const rHits = raycaster.intersectObjects(nearby, false);
        for (const rh of rHits) {
          const n = computeWorldFaceNormal(rh, dir, tmpNormMat);
          if (n.y < 0.5 && Math.abs(n.y) < 0.55 && rh.distance < radius) {
            const push = radius - rh.distance + 0.004;
            nextX += n.x * push;
            nextZ += n.z * push;
            hitEnv = true;
            break;
          }
        }
      }
    }

    return { x: nextX, z: nextZ, hitEnv };
  };

  const isBelowVoidThreshold = (feetY: number): boolean => {
    return feetY < mapMinY - 10;
  };

  return {
    mapRoot,
    aTowerRouteGroup,
    keepBox,
    optimizationStats,
    aTowerWindow: windowSpec,
    anchorOrigin,
    basisF,
    basisR,
    basisU,
    unitScale: s,
    pos,
    allMeshes: rawMeshes,
    solidMeshes: spatialGrid.getAllSolidMeshes(),
    colliders,
    anchors,
    autoScale,
    denseCenterRaw: denseCenter,
    spawnPoint: {
      x: spawnX,
      floorY: spawnFloorY,
      eyeY: spawnEyeY,
      z: spawnZ,
      yaw: spawnYaw,
    },
    mapBounds: alignedBounds,
    mapMinY,
    getFloorSupportY,
    resolveHorizontalMove,
    isBelowVoidThreshold,
  };
}

/**
 * Load project C123.glb from GitHub Raw URL using GLTFLoader + DRACOLoader (CDN 1.5.6),
 * reporting progress percentage (0..100%) and returning the processed map runtime.
 */
export function loadProjectCGlbMap(params: {
  lowQuality?: boolean;
  onProgress?: (percent: number, statusText: string) => void;
}): Promise<LoadedGlbMapRuntime> {
  const { lowQuality = false, onProgress } = params;

  return new Promise((resolve, reject) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_CDN_URL);
    dracoLoader.preload();

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    let estimatedTotal = PROJECT_C_GLB_COMPRESSED_BYTES;
    const handleProgress = (xhr: ProgressEvent<EventTarget>) => {
      if (xhr.lengthComputable && xhr.total > 0) {
        const pct = Math.min(99, Math.max(1, Math.round((xhr.loaded / xhr.total) * 100)));
        onProgress?.(pct, `맵 데이터 다운로드 중... (${pct}%)`);
      } else if (xhr.loaded > 0) {
        const pct = Math.min(99, Math.max(1, Math.round((xhr.loaded / estimatedTotal) * 100)));
        onProgress?.(pct, `맵 데이터 다운로드 중... (${pct}%)`);
      }
    };

    const handleLoaded = (gltf: { scene: THREE.Group }) => {
      try {
        onProgress?.(100, '기준 원점(O) · 돌계단 및 2층 창문 방 생성 중... (100%)');
        const runtime = processLoadedGlbScene(gltf.scene, lowQuality);
        dracoLoader.dispose();
        resolve(runtime);
      } catch (err) {
        dracoLoader.dispose();
        reject(err);
      }
    };

    onProgress?.(0, 'Draco 디코더 및 맵 로딩 준비 중... (0%)');

    THREE.Cache.clear();
    const cacheBust = `cb=${Date.now()}`;
    // The compressed file has its own name, so it can use the browser cache (revalidated by ETag) and a
    // second visit doesn't download it again; the original files keep the old always-fresh behaviour.
    const urls = [
      `${PROJECT_C_GLB_COMPRESSED_URL}?v=1`,
      `${PROJECT_C_GLB_PRIMARY_URL}?${cacheBust}`,
      `${PROJECT_C_GLB_FALLBACK_URL}?${cacheBust}`,
    ];
    const tryLoad = (i: number) => {
      estimatedTotal = i === 0 ? PROJECT_C_GLB_COMPRESSED_BYTES : PROJECT_C_GLB_ORIGINAL_BYTES;
      gltfLoader.load(urls[i], handleLoaded, handleProgress, (err) => {
        if (i + 1 < urls.length) {
          tryLoad(i + 1);
        } else {
          dracoLoader.dispose();
          reject(err);
        }
      });
    };
    tryLoad(0);
  });
}
