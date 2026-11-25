// =====================================================================
// Stylized prop kit (original designs): heavy framed wooden crates, draped
// canvas, glowing teal panels, and a "hand-painted" surface shader tweak.
// =====================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ painted look
// Adds soft, low-frequency brush-stroke variation in world space to any
// MeshStandardMaterial, so big flat surfaces read as painted rather than plastic.
// Costs a few ALU ops per pixel; no textures.
export function addPaintedLook(mat: THREE.MeshStandardMaterial, strength = 0.1) {
  if (mat.userData.painted) return;
  mat.userData.painted = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPaint = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPaintPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPaintPos;
uniform float uPaint;
float pHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pHash(i), pHash(i + vec3(1,0,0)), f.x), mix(pHash(i + vec3(0,1,0)), pHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pHash(i + vec3(0,0,1)), pHash(i + vec3(1,0,1)), f.x), mix(pHash(i + vec3(0,1,1)), pHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  // horizontal brush strokes + broad colour wash
  vec3 sp = vPaintPos * vec3(0.9, 3.2, 0.9);
  float strokes = pNoise(sp) * 0.6 + pNoise(sp * 2.3 + 7.0) * 0.4;
  float wash = pNoise(vPaintPos * 0.18 + 3.0);
  float k = 1.0 + uPaint * ((strokes - 0.5) * 0.9 + (wash - 0.5) * 1.2);
  diffuseColor.rgb *= k;
  // warm the lit tops, cool the lower parts slightly (painted gradient)
  diffuseColor.rgb *= mix(vec3(0.96, 0.97, 1.0), vec3(1.03, 1.0, 0.96), clamp(vPaintPos.y * 0.12, 0.0, 1.0));
}`,
      );
  };
  mat.needsUpdate = true;
}

// ------------------------------------------------------------------ materials (shared)
let kit: Record<string, THREE.MeshStandardMaterial> | null = null;
function mats() {
  if (kit) return kit;
  const m = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const mm = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, envMapIntensity: 0.5, ...extra });
    addPaintedLook(mm, 0.12);
    return mm;
  };
  kit = {
    panel: m('#C9B27A'), // muted ochre-olive board
    panelDark: m('#A8935E'),
    frame: m('#8C8478'), // weathered grey timber
    frameDark: m('#6F685E'),
    canvas: m('#8A7E70', { side: THREE.DoubleSide, roughness: 0.95 }),
    glow: new THREE.MeshStandardMaterial({
      color: '#59E3C2',
      emissive: '#2FD6B0',
      emissiveIntensity: 0.9,
      roughness: 0.35,
    }),
    steel: m('#5E6670', { roughness: 0.45, metalness: 0.5 }),
  };
  return kit;
}

const beam = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.22);

/**
 * Heavy crate: chunky timber frame on every edge, a mid band, and diagonal
 * braces on each side. Origin at the bottom centre.
 */
export function buildFramedCrate(w: number, h: number, d: number, opts: { glow?: boolean } = {}): THREE.Group {
  const M = mats();
  const g = new THREE.Group();
  const t = Math.min(0.16, Math.min(w, h, d) * 0.1); // frame thickness
  const body = new THREE.Mesh(new RoundedBoxGeometry(w - t, h - t, d - t, 2, 0.03), opts.glow ? M.panelDark : M.panel);
  body.position.y = h / 2;
  g.add(body);
  // 12 edge beams
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const v = new THREE.Mesh(beam(t, h, t), M.frame);
      v.position.set(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2));
      g.add(v);
    }
    for (const sy of [0, 1]) {
      const a = new THREE.Mesh(beam(t, t, d), M.frame);
      a.position.set(sx * (w / 2 - t / 2), sy ? h - t / 2 : t / 2, 0);
      g.add(a);
    }
  }
  for (const sz of [-1, 1]) {
    for (const sy of [0, 1]) {
      const a = new THREE.Mesh(beam(w, t, t), M.frame);
      a.position.set(0, sy ? h - t / 2 : t / 2, sz * (d / 2 - t / 2));
      g.add(a);
    }
  }
  // braces on the four sides (a centred "V" pair per face reads as heavy and graphic)
  const faces: Array<{ n: THREE.Vector3; span: number }> = [
    { n: new THREE.Vector3(0, 0, 1), span: w },
    { n: new THREE.Vector3(0, 0, -1), span: w },
    { n: new THREE.Vector3(1, 0, 0), span: d },
    { n: new THREE.Vector3(-1, 0, 0), span: d },
  ];
  for (const f of faces) {
    const depth = f.n.z !== 0 ? d : w;
    const faceGroup = new THREE.Group();
    faceGroup.rotation.y = Math.atan2(f.n.x, f.n.z);
    faceGroup.position.copy(f.n).multiplyScalar(depth / 2 - t * 0.35);
    const inner = f.span - t * 2;
    const ih = h - t * 2;
    const len = Math.hypot(inner / 2, ih);
    const ang = Math.atan2(inner / 2, ih);
    for (const s of [-1, 1]) {
      const br = new THREE.Mesh(beam(t * 0.85, len, t * 0.7), M.frameDark);
      br.position.set(s * inner / 4, h / 2, 0);
      br.rotation.z = s * ang;
      faceGroup.add(br);
    }
    // mid band
    const band = new THREE.Mesh(beam(f.span - t, t * 0.8, t * 0.7), M.frameDark);
    band.position.set(0, h / 2, 0);
    faceGroup.add(band);
    if (opts.glow) {
      // translucent teal panels between the braces
      for (const s of [-1, 1]) {
        const tri = new THREE.Shape();
        tri.moveTo(s * inner / 2, t);
        tri.lineTo(s * 0.05, t);
        tri.lineTo(s * inner / 2, h / 2 - t * 0.6);
        tri.lineTo(s * inner / 2, t);
        const tm = new THREE.Mesh(new THREE.ShapeGeometry(tri), M.glow);
        tm.position.z = 0.012;
        faceGroup.add(tm);
      }
    }
    g.add(faceGroup);
  }
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return g;
}

/** A canvas sheet draped over a box of size w x h x d (top at y = h). */
export function buildDrape(w: number, h: number, d: number, hang = 0.65, seed = 1): THREE.Mesh {
  const M = mats();
  const segX = 18;
  const segZ = 14;
  const ext = hang * 2;
  const geo = new THREE.PlaneGeometry(w + ext, d + ext, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ox = Math.max(0, Math.abs(x) - w / 2);
    const oz = Math.max(0, Math.abs(z) - d / 2);
    const over = Math.hypot(ox, oz);
    // fall over the edges, with soft folds
    const fold = 0.06 * Math.sin(x * 4.1 + seed) * Math.cos(z * 3.3 + seed * 2);
    let y = h + 0.03 + fold * (1 - Math.min(1, over * 2));
    let nx = x;
    let nz = z;
    if (over > 0) {
      const drop = over * 1.15 + 0.08 * Math.sin(x * 6 + z * 5 + seed);
      y = h - drop;
      nx = Math.sign(x) * Math.min(Math.abs(x), w / 2 + 0.04 + ox * 0.12);
      nz = Math.sign(z) * Math.min(Math.abs(z), d / 2 + 0.04 + oz * 0.12);
    }
    pos.setXYZ(i, nx, Math.max(0.05, y), nz);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, M.canvas);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
