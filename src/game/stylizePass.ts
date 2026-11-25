/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Valorant-style screen treatment:
 *  - InkOutlinePass: thin navy contour lines from scene depth (silhouettes + large depth steps)
 *  - createGradePass: gentle S-curve, saturation lift, warm-highlight / teal-shadow split tone, soft vignette
 */

import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const OUTLINE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float strength;
uniform float thickness;
uniform vec3 inkColor;
varying vec2 vUv;

float viewZ(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
// inverse view depth is linear in screen space on planar surfaces -> second difference is ~0 on flat walls/floors
float invZ(vec2 uv) {
  return 1.0 / viewZ(texture2D(tDepth, uv).x);
}

void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  vec2 px = thickness / resolution;
  float c = invZ(vUv);
  float l = invZ(vUv + vec2(-px.x, 0.0));
  float r = invZ(vUv + vec2(px.x, 0.0));
  float u = invZ(vUv + vec2(0.0, px.y));
  float d = invZ(vUv + vec2(0.0, -px.y));
  float lap = abs(l + r - 2.0 * c) + abs(u + d - 2.0 * c);
  float rel = lap / max(c, 1e-5);
  float edge = smoothstep(0.10, 0.34, rel);
  // fade the line out with distance so far geometry does not shimmer
  float dist = 1.0 / max(c, 1e-5);
  edge *= 1.0 - smoothstep(70.0, 130.0, dist);
  col.rgb = mix(col.rgb, inkColor, edge * strength);
  gl_FragColor = col;
}`;

export class InkOutlinePass extends Pass {
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;

  constructor(camera: THREE.PerspectiveCamera, width: number, height: number) {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(width, height) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        strength: { value: 0.62 },
        thickness: { value: 1.0 },
        // linear-space navy (#0F1923)
        inkColor: { value: new THREE.Color('#0F1923') },
      },
      vertexShader: VERT,
      fragmentShader: OUTLINE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.resolution.value.set(width, height);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const depth = readBuffer.depthTexture;
    if (!depth) {
      // no depth available -> pass-through (never break rendering)
      this.material.uniforms.strength.value = 0;
    }
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tDepth.value = depth;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

/** Attach depth textures to both ping-pong targets of a composer (call before the first render). */
export function enableComposerDepth(composer: { renderTarget1: THREE.WebGLRenderTarget; renderTarget2: THREE.WebGLRenderTarget }): void {
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    const dt = new THREE.DepthTexture(rt.width, rt.height);
    dt.type = THREE.UnsignedIntType;
    rt.depthTexture = dt;
  }
}

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  // S-curve contrast
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.26);
  // saturation lift
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.08);
  // split tone: warm highlights, cool teal shadows
  c += vec3(0.016, 0.008, -0.014) * smoothstep(0.50, 1.0, l);
  c += vec3(-0.012, 0.006, 0.022) * (1.0 - smoothstep(0.0, 0.42, l));
  // soft vignette
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
  float vig = smoothstep(0.88, 0.28, length(q));
  c *= mix(1.0, vig, 0.28);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createGradePass(): ShaderPass {
  return new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: VERT,
      fragmentShader: GRADE_FRAG,
      depthTest: false,
      depthWrite: false,
    }),
  );
}
