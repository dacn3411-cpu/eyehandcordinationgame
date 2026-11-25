/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Valorant-style asset kit: bevelled hard-surface props, hands, obstacles and foliage built in code.
 * The first-person blaster follows the layout modelled in Blender (barrel along local -Z, muzzle at z = -0.392).
 * Blender (x right, y forward, z up) -> Three.js (x, z, -y).
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V3 = [number, number, number];

/** Blender-space point -> Three.js-space point. */
const b2t = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[2], -p[1]);

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function kitMat(
  color: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveIntensity?: number;
    env?: number;
  } = {},
): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, opts]);
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.55,
    metalness: opts.metal ?? 0.05,
    emissive: opts.emissive ?? '#000000',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    envMapIntensity: opts.env ?? 0.55,
  });
  matCache.set(key, m);
  return m;
}

/** Bevelled box (RoundedBoxGeometry) so edges catch highlights instead of reading as hard voxel corners. */
export function bevelBox(w: number, h: number, d: number, r = 0.01, seg = 3): THREE.BufferGeometry {
  const rr = Math.max(0.0005, Math.min(r, w * 0.49, h * 0.49, d * 0.49));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/** Tapered capsule between two points (used for fingers, forearms, drone arms). */
export function limbGeo(p0: THREE.Vector3, p1: THREE.Vector3, r0: number, r1: number, seg = 12, caps = true): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(p1, p0);
  const len = Math.max(0.0001, dir.length());
  const parts: THREE.BufferGeometry[] = [];
  const cyl = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !caps ? false : true);
  parts.push(cyl);
  if (caps) {
    const s0 = new THREE.SphereGeometry(r0, seg, Math.max(5, seg >> 1));
    s0.translate(0, -len / 2, 0);
    const s1 = new THREE.SphereGeometry(r1, seg, Math.max(5, seg >> 1));
    s1.translate(0, len / 2, 0);
    parts.push(s0, s1);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  merged.applyMatrix4(m);
  return merged;
}

function chainGeo(pts: V3[], radii: number[], seg = 12): THREE.BufferGeometry {
  const segs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    segs.push(limbGeo(b2t(pts[i]), b2t(pts[i + 1]), radii[i], radii[i + 1], seg));
  }
  const merged = BufferGeometryUtils.mergeGeometries(segs, false)!;
  for (const s of segs) s.dispose();
  return merged;
}

/** Thin dark rim around a mesh (inverted hull) – gives the "ink line" read of Valorant hero props. */
export function addInkOutline(mesh: THREE.Mesh, thickness = 1.04, color = '#0F1923', opacity = 0.55): void {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: opacity < 1, opacity });
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.scale.setScalar(thickness);
  o.name = 'ink';
  mesh.add(o);
}

// ---------------------------------------------------------------------------------------------
// First-person blaster + hands
// ---------------------------------------------------------------------------------------------

export function buildBlasterViewmodel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'VM_blaster_mesh';

  const slideMat = kitMat('#2A3038', { rough: 0.34, metal: 0.62, env: 0.9 });
  const steelMat = kitMat('#8E99A6', { rough: 0.26, metal: 0.88, env: 1.0 });
  const polyMat = kitMat('#1B1F26', { rough: 0.55, metal: 0.1, env: 0.5 });
  const accentMat = kitMat('#FF8A2A', { rough: 0.4, emissive: '#FF8A2A', emissiveIntensity: 0.45 });
  const sightMat = kitMat('#FFC53D', { rough: 0.4, emissive: '#FFC53D', emissiveIntensity: 0.7 });
  const boreMat = kitMat('#0A0E14', { rough: 0.8 });
  const gloveMat = kitMat('#E9BFA6', { rough: 0.62, env: 0.35 });
  const sleeveMat = kitMat('#5E6A62', { rough: 0.74, env: 0.3 });
  const cuffMat = kitMat('#22262E', { rough: 0.45, metal: 0.2, env: 0.45 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: V3, rotX = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(b2t(p));
    // (x,y,z)->(x,z,-y) is a proper rotation, so a Blender X-rotation keeps the same angle in Three.js.
    m.rotation.x = rotX;
    g.add(m);
    return m;
  };
  const box = (sx: number, sy: number, sz: number, r: number, seg = 3) => bevelBox(sx, sz, sy, r, seg);
  const cylZ = (r1: number, r2: number, len: number, seg = 28): THREE.BufferGeometry => {
    // barrel axis along -Z (muzzle toward -Z). r1 is the rear radius, r2 the front radius.
    const c = new THREE.CylinderGeometry(r1, r2, len, seg);
    c.rotateX(-Math.PI / 2);
    return c;
  };

  // slide + details
  add(box(0.088, 0.46, 0.072, 0.011), slideMat, [0, 0.08, 0]);
  add(box(0.03, 0.4, 0.012, 0.004, 2), slideMat, [0, 0.08, 0.04]);
  for (const sx of [-1, 1]) add(box(0.003, 0.3, 0.014, 0.001, 1), accentMat, [sx * 0.0445, 0.11, 0.014]);
  add(box(0.003, 0.1, 0.03, 0.001, 1), boreMat, [0.0445, 0.015, 0.012]);
  add(box(0.012, 0.17, 0.05, 0.003, 2), steelMat, [-0.047, 0.03, -0.008]);
  for (let i = 0; i < 7; i++) add(box(0.092, 0.005, 0.05, 0.0012, 1), steelMat, [0, -0.125 + i * 0.0115, 0]);

  // barrel group
  add(cylZ(0.03, 0.03, 0.03), steelMat, [0, 0.325, 0]);
  add(cylZ(0.019, 0.019, 0.085), steelMat, [0, 0.352, 0]);
  add(cylZ(0.0235, 0.0235, 0.008), accentMat, [0, 0.385, 0]);
  add(cylZ(0.011, 0.011, 0.002, 20), boreMat, [0, 0.392, 0]);

  // sights (rear + front share the same top height so they line up with the laser axis)
  add(box(0.07, 0.05, 0.012, 0.003, 2), polyMat, [0, -0.1, 0.042]);
  for (const sx of [-1, 1]) add(box(0.012, 0.04, 0.022, 0.003, 2), slideMat, [sx * 0.026, -0.1, 0.057]);
  add(box(0.008, 0.02, 0.014, 0.002, 1), sightMat, [0, -0.108, 0.052]);
  add(box(0.014, 0.03, 0.03, 0.003, 2), slideMat, [0, 0.285, 0.05]);
  add(box(0.006, 0.006, 0.01, 0.001, 1), sightMat, [0, 0.272, 0.062]);

  // frame / guard / trigger / grip
  add(box(0.072, 0.36, 0.034, 0.008), polyMat, [0, 0.04, -0.052]);
  add(box(0.064, 0.1, 0.03, 0.006, 2), polyMat, [0, 0.235, -0.05]);
  add(box(0.012, 0.012, 0.045, 0.003, 2), polyMat, [0, 0.125, -0.095]);
  add(box(0.012, 0.13, 0.012, 0.003, 2), polyMat, [0, 0.064, -0.118]);
  add(box(0.01, 0.014, 0.04, 0.003, 2), steelMat, [0, 0.045, -0.092]);
  const gr = THREE.MathUtils.degToRad(-14);
  add(box(0.066, 0.085, 0.16, 0.01), polyMat, [0, -0.105, -0.145], gr);
  add(box(0.072, 0.07, 0.11, 0.008, 2), slideMat, [0, -0.105, -0.155], gr);
  add(box(0.074, 0.02, 0.02, 0.003, 1), accentMat, [0, -0.095, -0.115], gr);
  add(box(0.07, 0.095, 0.014, 0.004, 2), steelMat, [0, -0.138, -0.224], gr);
  add(box(0.058, 0.05, 0.03, 0.006, 2), polyMat, [0, -0.152, -0.062], THREE.MathUtils.degToRad(8));

  // hands (shooter's right palm on +X)
  const frontY = (z: number) => -0.105 + 0.0412 + 0.242 * (z + 0.145);
  const yc = (z: number) => frontY(z) + 0.0115;
  add(box(0.028, 0.085, 0.095, 0.01), gloveMat, [0.052, -0.13, -0.125], THREE.MathUtils.degToRad(-10));
  add(box(0.028, 0.075, 0.075, 0.01), gloveMat, [-0.052, -0.13, -0.195], THREE.MathUtils.degToRad(-10));
  const rad5 = [0.0125, 0.0118, 0.0112, 0.0106, 0.0098];
  for (const z of [-0.113, -0.136, -0.159]) {
    const y = yc(z);
    add(chainGeo([[0.05, y - 0.03, z], [0.041, y - 0.004, z], [0.015, y, z], [-0.018, y, z], [-0.04, y - 0.012, z]], rad5), gloveMat, [0, 0, 0]);
  }
  for (const z of [-0.186, -0.209]) {
    const y = yc(z);
    add(chainGeo([[-0.05, y - 0.03, z], [-0.041, y - 0.004, z], [-0.015, y, z], [0.018, y, z], [0.04, y - 0.012, z]], rad5), gloveMat, [0, 0, 0]);
  }
  add(chainGeo([[0.05, -0.095, -0.083], [0.048, -0.045, -0.085], [0.04, 0.005, -0.088], [0.012, 0.04, -0.094]], [0.0125, 0.0115, 0.0108, 0.0098]), gloveMat, [0, 0, 0]);
  add(chainGeo([[0.048, -0.16, -0.06], [0.015, -0.178, -0.052], [-0.03, -0.15, -0.048], [-0.05, -0.09, -0.048], [-0.052, -0.01, -0.05]], [0.0135, 0.013, 0.0125, 0.012, 0.0105]), gloveMat, [0, 0, 0]);
  add(chainGeo([[-0.05, -0.15, -0.115], [-0.056, -0.1, -0.09], [-0.052, -0.04, -0.075], [-0.05, 0.02, -0.072]], [0.0135, 0.0125, 0.0115, 0.0105]), gloveMat, [0, 0, 0]);

  // cuffs + sleeves (run off-screen at the bottom of the view)
  const sleeve = (a: V3, b: V3, c: V3, rc0: number, rc1: number, rs1: number) => {
    add(limbGeo(b2t(a), b2t(b), rc0, rc1, 22, false), cuffMat, [0, 0, 0]);
    add(limbGeo(b2t(b), b2t(c), rc1, rs1, 22, false), sleeveMat, [0, 0, 0]);
  };
  sleeve([0.056, -0.168, -0.134], [0.078, -0.24, -0.178], [0.17, -0.6, -0.4], 0.047, 0.052, 0.064);
  sleeve([-0.056, -0.168, -0.205], [-0.075, -0.235, -0.245], [-0.17, -0.6, -0.44], 0.046, 0.05, 0.066);

  return g;
}

// ---------------------------------------------------------------------------------------------
// Moving obstacles (kinds 1-3 share footprints with their colliders in entities.ts)
// ---------------------------------------------------------------------------------------------

export function buildContainerObstacle(): THREE.Group {
  // Footprint 1.6 x 1.35 x 1.6 (matches the AABB collider). Ribbed cargo crate with steel frame + hazard panel.
  const g = new THREE.Group();
  const body = kitMat('#D83A48', { rough: 0.5, metal: 0.15, env: 0.6 });
  const frame = kitMat('#2B313A', { rough: 0.4, metal: 0.7, env: 0.85 });
  const hazard = kitMat('#FF8A2B', { rough: 0.5, emissive: '#FF8A2B', emissiveIntensity: 0.12 });
  const dark = kitMat('#0F1923', { rough: 0.7 });

  const core = new THREE.Mesh(bevelBox(1.5, 1.2, 1.5, 0.07, 4), body);
  core.position.y = 0.7;
  addInkOutline(core, 1.03, '#0F1923', 0.5);
  g.add(core);

  // ribs on all four sides
  for (let i = -2; i <= 2; i++) {
    const ribX = new THREE.Mesh(bevelBox(0.06, 1.0, 1.58, 0.02, 2), frame);
    ribX.position.set(i * 0.3, 0.7, 0);
    const ribZ = new THREE.Mesh(bevelBox(1.58, 1.0, 0.06, 0.02, 2), frame);
    ribZ.position.set(0, 0.7, i * 0.3);
    g.add(ribX, ribZ);
  }
  // corner posts + base/top rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(bevelBox(0.14, 1.36, 0.14, 0.04, 3), frame);
    post.position.set(sx * 0.77, 0.68, sz * 0.77);
    g.add(post);
  }
  const topRail = new THREE.Mesh(bevelBox(1.64, 0.1, 1.64, 0.03, 3), frame);
  topRail.position.y = 1.32;
  const botRail = topRail.clone();
  botRail.position.y = 0.06;
  g.add(topRail, botRail);

  // hazard stripe band + label plate
  const band = new THREE.Mesh(bevelBox(1.66, 0.3, 0.9, 0.03, 3), hazard);
  band.position.y = 0.7;
  g.add(band);
  for (let i = -3; i <= 3; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.92), dark);
    stripe.position.set(i * 0.23, 0.7, 0);
    stripe.rotation.z = 0.0;
    g.add(stripe);
  }
  return g;
}

export function buildDroneObstacle(): THREE.Group {
  // Radius ~0.6 hover drone: segmented shell, glowing cyan ring, thrusters and a lens.
  const g = new THREE.Group();
  const shell = kitMat('#D8C8B8', { rough: 0.35, metal: 0.25, env: 0.8 });
  const dark = kitMat('#1B1F26', { rough: 0.45, metal: 0.4, env: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: '#00F5D4' });
  const lens = kitMat('#FF4655', { rough: 0.2, emissive: '#FF4655', emissiveIntensity: 1.1 });

  const top = new THREE.Mesh(new THREE.SphereGeometry(0.58, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  top.position.y = 0.62;
  addInkOutline(top, 1.035, '#0F1923', 0.5);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark);
  bottom.position.y = 0.62;
  g.add(top, bottom);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.055, 12, 36), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.62;
  g.add(ring);

  // lens eye at the front (-Z) + panel seams
  const eyeHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 20), dark);
  eyeHousing.rotation.x = Math.PI / 2;
  eyeHousing.position.set(0, 0.74, -0.54);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), lens);
  eye.position.set(0, 0.74, -0.6);
  g.add(eyeHousing, eye);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = new THREE.Mesh(limbGeo(new THREE.Vector3(Math.cos(a) * 0.46, 0.5, Math.sin(a) * 0.46), new THREE.Vector3(Math.cos(a) * 0.68, 0.38, Math.sin(a) * 0.68), 0.04, 0.055, 10), dark);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), glow);
    pad.position.set(Math.cos(a) * 0.68, 0.34, Math.sin(a) * 0.68);
    g.add(arm, pad);
  }
  return g;
}

export function buildBarrierObstacle(): THREE.Group {
  // 3.0 x 0.9 x 0.55 low barrier with chevron hazard stripes and steel feet.
  const g = new THREE.Group();
  const body = kitMat('#FF8A2B', { rough: 0.5, metal: 0.1, env: 0.55 });
  const dark = kitMat('#0F1923', { rough: 0.6, metal: 0.2 });
  const steel = kitMat('#6F7A86', { rough: 0.3, metal: 0.85, env: 0.9 });

  const slab = new THREE.Mesh(bevelBox(2.9, 0.7, 0.5, 0.07, 4), body);
  slab.position.y = 0.5;
  addInkOutline(slab, 1.04, '#0F1923', 0.55);
  g.add(slab);
  for (let i = -6; i <= 6; i++) {
    const chev = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.26, 0.52), dark);
    chev.position.set(i * 0.22, 0.64, 0);
    chev.rotation.z = 0.5;
    g.add(chev);
  }
  const cap = new THREE.Mesh(bevelBox(3.0, 0.08, 0.56, 0.03, 3), steel);
  cap.position.y = 0.88;
  g.add(cap);
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(bevelBox(0.24, 0.16, 0.7, 0.04, 3), steel);
    foot.position.set(sx * 1.35, 0.08, 0);
    g.add(foot);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Stylised tree (layered faceted canopy clusters with warm-top / cool-bottom tinting)
// ---------------------------------------------------------------------------------------------

export function buildStylizedTree(opts: { height?: number } = {}): THREE.Group {
  const h = opts.height ?? 6.6;
  const g = new THREE.Group();
  const trunkMat = kitMat('#5A4636', { rough: 0.9, env: 0.2 });

  // tapered, slightly bent trunk made of limbs
  const trunkPts = [
    new THREE.Vector3(0, -0.6, 0),
    new THREE.Vector3(0.1, h * 0.28, 0.05),
    new THREE.Vector3(-0.05, h * 0.5, 0),
    new THREE.Vector3(0.0, h * 0.68, 0.05),
  ];
  const trunkRad = [0.34, 0.27, 0.2, 0.14];
  for (let i = 0; i < trunkPts.length - 1; i++) {
    const m = new THREE.Mesh(limbGeo(trunkPts[i], trunkPts[i + 1], trunkRad[i], trunkRad[i + 1], 10), trunkMat);
    g.add(m);
  }
  const branchDefs: Array<[number, number, number, number, number]> = [
    [0.06, h * 0.44, 0.0, 1.2, h * 0.58],
    [-0.04, h * 0.5, 0.0, -1.1, h * 0.64],
    [0.0, h * 0.58, 0.0, 0.2, h * 0.76],
  ];
  for (const [x0, y0, z0, x1, y1] of branchDefs) {
    g.add(new THREE.Mesh(limbGeo(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, 0.2), 0.09, 0.05, 8), trunkMat));
  }

  // canopy: faceted icosahedron clusters, each painted with a vertical gradient via vertex colours
  const leafBase = ['#3F6B3A', '#4F8043', '#386233', '#5E8F4D'];
  const clusters: Array<[number, number, number, number]> = [
    [0.0, h * 0.74, 0.0, 1.5],
    [-1.4, h * 0.68, 0.3, 1.2],
    [1.35, h * 0.66, -0.2, 1.15],
    [-0.5, h * 0.88, 0.2, 1.25],
    [0.85, h * 0.86, 0.1, 1.05],
    [-1.55, h * 0.84, -0.1, 0.95],
    [0.1, h * 1.0, 0.0, 1.05],
    [1.6, h * 0.52, 0.35, 0.9],
    [-1.8, h * 0.54, 0.2, 0.85],
  ];
  clusters.forEach(([cx, cy, cz, r], idx) => {
    // soft rounded clump (welded vertices -> smooth shading, no facets)
    const ico = new THREE.IcosahedronGeometry(r, 3);
    ico.deleteAttribute('normal');
    ico.deleteAttribute('uv');
    const geo = BufferGeometryUtils.mergeVertices(ico);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // gentle wobble keeps the silhouette organic
    for (let i = 0; i < pos.count; i++) {
      const wob = 1 + 0.07 * Math.sin(pos.getX(i) * 2.3 + idx) * Math.cos(pos.getZ(i) * 2.1 + idx * 1.7);
      pos.setXYZ(i, pos.getX(i) * wob * 1.12, pos.getY(i) * wob * 0.9, pos.getZ(i) * wob);
    }
    geo.computeVertexNormals();
    const base = new THREE.Color(leafBase[idx % leafBase.length]);
    const lit = base.clone().lerp(new THREE.Color('#BFE07A'), 0.38);
    const shade = base.clone().lerp(new THREE.Color('#1D3B3A'), 0.45);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) / r + 1) * 0.5, 0, 1);
      const c = shade.clone().lerp(lit, t);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.4 }),
    );
    m.position.set(cx, cy, cz);
    m.rotation.y = idx * 0.9;
    addInkOutline(m, 1.025, '#142A1E', 0.35);
    g.add(m);
  });
  return g;
}

// ---------------------------------------------------------------------------------------------
// Target dressing (visual only)
// ---------------------------------------------------------------------------------------------

let haloTex: THREE.CanvasTexture | null = null;
function getHaloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

export function addTargetDepthDressing(
  panelGroup: THREE.Group,
  frameGeo: THREE.BufferGeometry,
  diameter: number,
  color: string,
  isCircle: boolean,
  lowQuality: boolean,
): void {
  const r = diameter * 0.5;
  const metal = kitMat('#1B2430', { rough: 0.35, metal: 0.75, env: 0.9 });

  // dark backing plate in the same silhouette as the frame -> reads as a thick physical panel
  const backing = new THREE.Mesh(frameGeo, metal);
  backing.scale.setScalar(diameter * 1.07);
  // scale about the shape's own centre (some frame shapes are not centred on the origin)
  if (!frameGeo.boundingBox) frameGeo.computeBoundingBox();
  const c = frameGeo.boundingBox!.getCenter(new THREE.Vector3());
  backing.position.set(-c.x * diameter * 0.07, -c.y * diameter * 0.07, -0.15);
  panelGroup.add(backing);

  if (isCircle) {
    const housing = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.06, 10, 48), metal);
    housing.position.z = -0.11;
    panelGroup.add(housing);
  }

  // four emitter nubs on the diagonals with glowing tips
  const tipMat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const nub = new THREE.Mesh(bevelBox(r * 0.16, r * 0.16, 0.12, 0.02, 2), metal);
    nub.position.set(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, -0.1);
    nub.rotation.z = a;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(r * 0.07, r * 0.07, 0.02), tipMat);
    tip.position.z = 0.065;
    nub.add(tip);
    panelGroup.add(nub);
  }

  // soft hologram halo behind the target (skipped on low quality to save fill-rate)
  if (!lowQuality) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(diameter * 1.7, diameter * 1.7),
      new THREE.MeshBasicMaterial({
        map: getHaloTexture(),
        color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.z = -0.2;
    halo.renderOrder = -1;
    panelGroup.add(halo);
  }
}
