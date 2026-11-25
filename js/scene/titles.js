// 3D hero titles.
//
// Each title (3 lines) is drawn once with FK Screamer into a canvas; every line becomes a plane inside the scene,
// a fixed distance in front of the hero camera, so the glass orbs in front of it lens the letters.
// The planes are not `transparent`, because three.js only copies opaque objects into the render target the transmissive
// glass samples from. They still blend their anti-aliased edges: three only switches blending off for opaque materials
// that use NormalBlending, so these use an equivalent CustomBlending (clean edges, no alpha-to-coverage dithering).
//
// A line's plane is also its mask: the shader samples the text shifted by `shift` (in line-box heights; -1 = fully
// below the box, 0 = at rest), so lines slide up into view through their bottom edge, and `mask` discards everything
// below a rising edge (0 = nothing hidden, 1 = all hidden), which erases a line bottom-up.
// Copy and colours: config.js → TITLES.

import * as THREE from 'three';
import { TITLES, WORLD } from './config.js';

// FK Screamer is a tall, very condensed display face: lines are set tight (baseline to baseline ≈ 1.1 cap heights).
// Each line's box (its mask) is measured from the glyphs actually drawn, so "&" or any taller glyph never gets clipped.
const PITCH = 1.1; // line spacing in cap heights
const PAD_TOP = 0.08; // room above the tallest glyph, in cap heights
const PAD_BOTTOM = 0.12; // room under the baseline: the mask edge the lines rise through, in cap heights
const MARGIN = 0.06; // horizontal margin around each line, in cap heights

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uRect;      // this line's rectangle inside the canvas texture: u0, v0, u1, v1
uniform vec3 uColor;
uniform float uShift;    // -1 → text hidden below the box, 0 → at rest
uniform float uMask;     // 0 → fully visible, 1 → erased from the bottom up
varying vec2 vUv;

void main() {
  if (vUv.y < uMask) discard;
  float sy = vUv.y - uShift;
  if (sy < 0.0 || sy > 1.0) discard;
  float a = texture2D(uMap, vec2(mix(uRect.x, uRect.z, vUv.x), mix(uRect.y, uRect.w, sy))).a;
  // sharpen the (mip-mapped, slightly soft) texture edge to about one screen pixel, then blend it
  a = smoothstep(0.5 - fwidth(a) * 0.75, 0.5 + fwidth(a) * 0.75, a);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function drawTitle(lines, family, fontPx) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `400 ${fontPx}px "${family}"`;
  ctx.font = font;
  const cap = ctx.measureText('H').actualBoundingBoxAscent || fontPx * 0.8;
  const metrics = lines.map((l) => ctx.measureText(l.text));
  const widths = metrics.map((m) => m.width);
  // box: tallest glyph (+ pad) above the baseline, the deepest one (+ pad) below it, in cap heights
  const above = Math.max(cap, ...metrics.map((m) => m.actualBoundingBoxAscent)) / cap + PAD_TOP;
  const below = Math.max(0, ...metrics.map((m) => m.actualBoundingBoxDescent)) / cap + PAD_BOTTOM;
  const pad = Math.ceil(cap * 0.2);
  const band = Math.ceil(cap * (above + below));
  canvas.width = Math.ceil(Math.max(...widths) + pad * 2);
  canvas.height = band * lines.length;
  ctx.font = font; // resizing the canvas resets the context state
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l.text, pad, i * band + cap * above));

  const rects = lines.map((l, i) => {
    const m = cap * MARGIN;
    return {
      widthCaps: (widths[i] + 2 * m) / cap,
      rect: new THREE.Vector4(
        (pad - m) / canvas.width,
        1 - ((i + 1) * band) / canvas.height,
        (pad + widths[i] + m) / canvas.width,
        1 - (i * band) / canvas.height
      ),
    };
  });
  return { canvas, rects, maxWidthCaps: Math.max(...rects.map((r) => r.widthCaps)), above, below };
}

export function createTitles({ family, fontPx, anisotropy }) {
  const root = new THREE.Group();
  root.name = 'hero-titles';
  const geometry = new THREE.PlaneGeometry(1, 1);
  const titles = TITLES.map((lines, ti) => {
    const drawn = drawTitle(lines, family, fontPx);
    const texture = new THREE.CanvasTexture(drawn.canvas);
    texture.colorSpace = THREE.NoColorSpace; // only the alpha channel is used
    texture.anisotropy = anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const group = new THREE.Group();
    group.name = `title-${ti + 1}`;
    const meshes = lines.map((line, li) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: texture },
          uRect: { value: drawn.rects[li].rect },
          uColor: { value: new THREE.Color(line.color) }, // THREE.Color converts the sRGB hex to linear
          uShift: { value: -1 },
          uMask: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 2;
      mesh.userData.widthCaps = drawn.rects[li].widthCaps;
      group.add(mesh);
      return mesh;
    });
    root.add(group);
    return { group, meshes, maxWidthCaps: drawn.maxWidthCaps, above: drawn.above, below: drawn.below };
  });

  let capWorld = 1;

  /** Size the lines for the current viewport: ~14% of the viewport height per cap (like the original), but never
   *  wider than the screen (portrait screens are limited by the width). */
  function layout(aspect) {
    const halfH = WORLD.titleDistance * Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2));
    const halfW = halfH * aspect;
    const widest = Math.max(...titles.map((t) => t.maxWidthCaps));
    const byHeight = 2 * halfH * (aspect < 1 ? 0.13 : 0.142);
    const byWidth = (2 * halfW * (aspect < 1 ? 0.88 : 0.8)) / widest;
    capWorld = Math.min(byHeight, byWidth);
    for (const t of titles) {
      const box = t.above + t.below;
      t.meshes.forEach((m, i) => {
        m.scale.set(m.userData.widthCaps * capWorld, box * capWorld, 1);
        // Baselines are spaced by PITCH and the 3-line block (cap tops to baselines) is centred on y = 0.
        const baseline = (1 - i) * PITCH * capWorld - capWorld / 2;
        m.position.set(0, baseline + ((t.above - t.below) / 2) * capWorld, 0);
      });
    }
  }

  /**
   * @param {{visible:boolean, shift:number[], mask:number[], offset:THREE.Vector3, tilt:number}[]} states one per title
   */
  function update(states) {
    let any = false;
    titles.forEach((t, ti) => {
      const s = states[ti];
      t.group.visible = s.visible;
      if (!s.visible) return;
      any = true;
      t.group.position.copy(s.offset);
      t.group.rotation.x = s.tilt;
      t.meshes.forEach((m, li) => {
        m.material.uniforms.uShift.value = s.shift[li];
        m.material.uniforms.uMask.value = s.mask[li];
        m.visible = s.shift[li] > -0.999 && s.mask[li] < 0.999;
      });
    });
    root.visible = any;
  }

  return {
    root,
    layout,
    update,
    get capWorld() {
      return capWorld;
    },
    /** World size of the widest 3-line title block (used to keep the orb cloud clear of it). */
    get blockSize() {
      const widest = Math.max(...titles.map((t) => t.maxWidthCaps));
      return { w: widest * capWorld, h: (2 * PITCH + 1) * capWorld };
    },
  };
}
