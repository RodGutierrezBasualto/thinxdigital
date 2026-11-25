// Full-screen background shader.
//
// The page background is a stack of colour "states" (one per section `data-bg`, plus the special ones of the ★
// sections, see choreography.js). Each state is a two-tone vertical gradient. A state arrives as a soft-edged CIRCLE
// growing from a point (where a small glass "seed" orb pops up, so the colour seems to spill out of a dot), as the
// crisp black PORTAL of the home dashboard (grows from the centre, with a blue rim), or as a plain FADE. Every frame
// the JS side finds the last state that fully covers the screen, uses it as the base, and sends only the (at most 4)
// states still animating on top of it to the shader.
//
// The gradient coordinate is bent by slow sine waves and wrapped with fract(), which gives the soft satin folds; then
// grain and a vignette are added. Colours are mixed in sRGB (like a designer's gradient) and converted to linear at the
// end, because the renderer works in linear space and converts back on output.

import * as THREE from 'three';
import { COLORS, PORTAL_RIM } from './config.js';

const MAX_LAYERS = 4;
const MODE = { circle: 0, portal: 1, fade: 2 };

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0); // already in clip space: a 2×2 plane covers the screen
}`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uPx;            // one device pixel in uv.y units
uniform vec3 uBaseTop;
uniform vec3 uBaseBottom;
uniform vec3 uTop[${MAX_LAYERS}];
uniform vec3 uBottom[${MAX_LAYERS}];
uniform vec2 uOrigin[${MAX_LAYERS}];   // circle centre in uv
uniform float uRadius[${MAX_LAYERS}];  // circle radius in screen heights (fade: opacity)
uniform float uFeather[${MAX_LAYERS}]; // soft edge width in screen heights
uniform float uMode[${MAX_LAYERS}];
uniform int uCount;
uniform vec3 uRim;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  vec2 uv = vUv;
  float t = uTime;

  // Satin: two slow sine waves bend the gradient coordinate; fract() folds it into soft bands.
  float w1 = sin((uv.x + t * 0.055) * 2.2) * 0.5;
  float w2 = sin((uv.x * 1.6 - t * 0.07) * 1.4 + uv.y * 3.0) * 0.3;
  float wave = w1 + w2;
  float g = pow(fract(uv.y * 0.9 + wave + t * 0.04), 1.2);

  vec3 col = mix(uBaseBottom, uBaseTop, g);
  float rim = 0.0;
  vec2 q = uv * vec2(uAspect, 1.0); // aspect-corrected position, 1 unit = screen height

  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= uCount) break;
    vec3 layer = mix(uBottom[i], uTop[i], g);
    float m;
    if (uMode[i] < 0.5) {
      // Soft circle growing from a seed orb; the edge wobbles a touch with the satin so it feels liquid.
      float d = length(q - uOrigin[i] * vec2(uAspect, 1.0));
      float r = uRadius[i] + wave * 0.012;
      m = 1.0 - smoothstep(r - uFeather[i], r + uFeather[i], d);
    } else if (uMode[i] < 1.5) {
      // Portal: crisp circle from the centre with a glowing rim.
      float d = length(q - vec2(0.5 * uAspect, 0.5));
      float r = uRadius[i];
      m = 1.0 - smoothstep(r - uPx * 1.5, r + uPx * 1.5, d);
      rim += exp(-abs(d - r) * 28.0) * uFeather[i];
    } else {
      m = uRadius[i];
    }
    col = mix(col, layer, m);
  }
  col += uRim * rim * 0.85;

  // Grain: soft mottling plus a fine film grain (also kills banding in the gradients).
  float n = valueNoise(vec2(uv.x * 4.0 + wave * 2.0, uv.y * 4.0 + t * 0.25));
  col += (n - 0.5) * 0.07;
  col += (hash(gl_FragCoord.xy + fract(t * 7.0) * 113.0) - 0.5) * 0.022;

  // Vignette, gently modulated by the waves so the light seems to move with the satin.
  float v = smoothstep(1.1, 0.35, distance(uv, vec2(0.5)));
  col *= mix(0.86, 1.04, v + 0.12 * wave);

  gl_FragColor = vec4(srgbToLinear(clamp(col, 0.0, 1.0)), 1.0);
  #include <colorspace_fragment>
}`;

/** '#RRGGBB' → Vector3 of raw sRGB components (no colour management: we want the designer's numbers). */
function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Distance from (ox, oy) (uv) to the farthest screen corner, in screen heights. */
export function coverRadius(ox, oy, aspect) {
  const x = Math.max(ox, 1 - ox) * aspect;
  const y = Math.max(oy, 1 - oy);
  return Math.hypot(x, y);
}

export function createBackground() {
  const palette = {};
  for (const [k, v] of Object.entries(COLORS)) palette[k] = { top: hexToVec3(v.top), bottom: hexToVec3(v.bottom) };

  const uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uPx: { value: 0.001 },
    uBaseTop: { value: palette.blue.top.clone() },
    uBaseBottom: { value: palette.blue.bottom.clone() },
    uTop: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3()) },
    uBottom: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector3()) },
    uOrigin: { value: Array.from({ length: MAX_LAYERS }, () => new THREE.Vector2(0.5, 0.5)) },
    uRadius: { value: new Array(MAX_LAYERS).fill(0) },
    uFeather: { value: new Array(MAX_LAYERS).fill(0) },
    uMode: { value: new Array(MAX_LAYERS).fill(0) },
    uCount: { value: 0 },
    uRim: { value: hexToVec3(PORTAL_RIM) },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000; // drawn first, behind everything (and included in the glass transmission pass)
  mesh.name = 'background';

  /**
   * @param {number} time seconds
   * @param {{color:string, mode:'circle'|'portal'|'fade', t:number, radius:number, feather:number, origin:number[]}[]} layers
   *        in stacking order; `t` ≥ 1 means the layer covers the screen.
   */
  function update(time, layers, aspect, heightPx) {
    uniforms.uTime.value = time;
    uniforms.uAspect.value = aspect;
    uniforms.uPx.value = 1 / Math.max(heightPx, 1);

    // The last layer that fully covers the screen becomes the base; everything below it is invisible.
    let base = 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i].t >= 1) {
        base = i;
        break;
      }
    }
    const b = palette[layers[base]?.color] || palette.white;
    uniforms.uBaseTop.value.copy(b.top);
    uniforms.uBaseBottom.value.copy(b.bottom);

    let n = 0;
    for (let i = base + 1; i < layers.length && n < MAX_LAYERS; i++) {
      const l = layers[i];
      if (l.t <= 0) continue;
      const c = palette[l.color] || palette.white;
      uniforms.uTop.value[n].copy(c.top);
      uniforms.uBottom.value[n].copy(c.bottom);
      uniforms.uOrigin.value[n].set(l.origin?.[0] ?? 0.5, l.origin?.[1] ?? 0.5);
      uniforms.uRadius.value[n] = l.radius;
      uniforms.uFeather.value[n] = l.feather;
      uniforms.uMode.value[n] = MODE[l.mode] ?? 0;
      n++;
    }
    uniforms.uCount.value = n;
  }

  return { mesh, update };
}
