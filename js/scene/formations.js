// Orb formations: where each of the 24 glass orbs sits (position + radius) for every shape the site uses.
//
// The orbs echo the logo, a lightbulb inside a ring of dots of varied sizes:
//   ring0         the logo's dot ring, small, in the middle of the screen (intro start, matches the loader)
//   cloud         home hero: orbs at every depth that the camera flies through (they lens the 3D titles)
//   halo          home hero: the logo ring, opened at the bottom, around the hero paragraph
//   curve         home statement: data points popping up along a rising growth line (+ a dotted axis)
//   bars          results hero: a bar chart of stacked orbs
//   constellation approach hero: orbs at several depths joined by fine lines
//   orbits        services hero: three channels orbiting one centre
//   ring          about hero: the dot ring turning in 3D
//   scatter       contact hero: a few orbs at the edges, the form stays clear
//   principles    approach ★: target → clear grid → direct line (3 arrangements, `arr` 0…2)
//   credentials   about ★: a tilted orbit ring around the badge cards (`spin`)
//   footer        a loose cloud behind the footer CTA
//   gather        a tight cluster at a screen point (route transitions)
//   hidden        radius 0 where the orb last was
//
// Layouts are rebuilt on resize from the visible area at a given depth, so they adapt to any aspect ratio (portrait
// screens get their own variants). Coordinates: the neutral camera sits at the origin looking down -Z; the home hero
// camera starts at z = HERO_START_Z and travels forward to the origin. `ring0` and `gather` are in CAMERA space.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { clamp, lerp, rng, easeOutBack, smooth } from './util.js';

export const HERO_START_Z = 52;
export const N = WORLD.orbCount;
const TAN = Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2));
const DEG = Math.PI / 180;

export class Pose {
  constructor() {
    this.p = new THREE.Vector3();
    this.s = 0; // radius
  }
  set(x, y, z, s) {
    this.p.set(x, y, z);
    this.s = s;
    return this;
  }
  copy(b) {
    this.p.copy(b.p);
    this.s = b.s;
    return this;
  }
}
export const poses = (n = N) => Array.from({ length: n }, () => new Pose());

/**
 * The logo's dot ring: an inner ring of 10 larger dots and an outer ring of 14 small ones, open at the bottom like
 * the bulb's base (set `open` to 0 for a full ring). Returns 24 [x, y, radius] in the ring's plane.
 */
export function logoRing(rx, ry, big, small, open = 1) {
  const out = [];
  const inner = [1, 0.86, 1.1, 0.92, 1.16, 1.16, 0.92, 1.1, 0.86, 1];
  const a0 = lerp(-90, -40, open) * DEG;
  const a1 = lerp(270, 220, open) * DEG;
  for (let k = 0; k < 10; k++) {
    const a = lerp(a0, a1, open ? k / 9 : k / 10);
    out.push([Math.cos(a) * rx, Math.sin(a) * ry, big * inner[k]]);
  }
  const b0 = lerp(-90, -55, open) * DEG;
  const b1 = lerp(270, 235, open) * DEG;
  for (let k = 0; k < 14; k++) {
    const a = lerp(b0, b1, open ? k / 13 : (k + 0.5) / 14);
    out.push([Math.cos(a) * rx * 1.3, Math.sin(a) * ry * 1.3, small * (0.8 + 0.4 * ((k * 7) % 5) / 4)]);
  }
  return out;
}

// ── authored data ───────────────────────────────────────────────────────────

// Home hero cloud. The camera travels from z = HERO_START_Z to 0 while the titles hang 60 units in front of it.
//   ['near', z, x, y, r]  between the two camera stops: in front of the titles (two overlap title 1 so the glass
//                         lenses its letters), flown past as the camera moves forward.
//   ['far',  u, v, D, r]  screen position (−1…1 of the half-view) at distance D from the END camera: always behind
//                         the titles, small at first and growing as the camera approaches.
//   ['band', u, v, D, r]  same, but in the depth band the titles sweep through: kept clear of the title block.
const CLOUD = [
  ['near', 18, -17, 9, 2.6], ['near', 16, 16, -9.5, 2.2], ['near', 10, 14, 10, 1.8], ['near', 8, -17, -8, 2.4],
  ['near', 4, 11, 6.5, 1.6], ['near', 0, -12.5, -6.5, 1.4], ['near', 24, 20, 1, 2.8],
  ['far', -0.55, 0.45, 70, 2.4], ['far', 0.62, 0.52, 80, 2.8], ['far', 0.15, -0.6, 75, 1.8], ['far', -0.8, -0.3, 95, 3.2],
  ['far', 0.85, -0.2, 100, 2.2], ['far', -0.25, 0.75, 110, 2.6], ['far', 0.35, 0.15, 125, 3.4], ['far', -0.45, -0.7, 130, 2.4],
  ['far', 0.7, -0.75, 140, 3], ['far', -0.05, 0.4, 150, 2.6],
  ['band', -0.85, 0.8, 30, 1.6], ['band', 0.8, -0.85, 36, 1.4], ['band', 0.95, 0.6, 48, 2], ['band', -0.9, -0.75, 55, 1.8],
  ['band', 0.1, 0.92, 42, 1.2], ['band', -0.05, -0.95, 58, 1.6], ['band', -0.95, 0.15, 64, 2.2],
];

// Loose cloud behind the footer CTA: [u, v, d, r] relative to the neutral camera.
const FOOTER = [
  [-0.85, 0.55, 46, 2.4], [0.88, 0.62, 52, 2], [-0.55, -0.6, 58, 1.6], [0.62, -0.5, 50, 2.6], [-0.15, 0.85, 70, 1.4],
  [0.3, -0.85, 64, 2], [-0.95, -0.1, 80, 3], [0.98, 0.05, 76, 2.2], [0.45, 0.4, 95, 2.8], [-0.4, 0.3, 105, 2],
  [0.1, -0.3, 120, 3.2], [-0.7, -0.85, 90, 2.2], [0.75, 0.9, 110, 2.6], [-0.25, -0.1, 140, 3], [0.6, -0.1, 130, 2.4],
  [-0.8, 0.8, 125, 2.8], [0.2, 0.6, 150, 3.4], [-0.5, -0.4, 160, 3], [0.9, -0.9, 100, 2.4], [-0.05, 0.25, 175, 3.6],
  [0.4, -0.65, 170, 3.2], [-0.95, 0.4, 155, 3], [0.55, 0.75, 60, 1.2], [-0.35, -0.9, 48, 1.4],
];

// Contact hero: a handful of orbs kept to the screen edges (the form stays clear). [u, v, d, r]
const SCATTER = [
  [-0.92, 0.7, 50, 1.8], [-0.82, -0.62, 62, 2.4], [0.9, 0.78, 58, 1.4], [0.86, -0.72, 48, 2],
  [-0.96, 0.05, 80, 2.8], [0.97, 0.1, 85, 2.6], [-0.6, 0.95, 90, 1.6], [0.55, -0.95, 75, 1.8],
];

export function createFormations() {
  const r = rng(11);
  const traits = Array.from({ length: N }, () => ({
    phase: r() * Math.PI * 2,
    arc: new THREE.Vector3(r() - 0.5, r() - 0.5, r() * 0.5).normalize(),
    drift: new THREE.Vector3((r() - 0.5) * 2, 0.7 + r(), (r() - 0.5) * 1.2),
    hash: r(),
  }));

  const F = {
    ring0: poses(), cloud: poses(), halo: poses(), curve: poses(), bars: poses(), constellation: poses(),
    scatter: poses(), footer: poses(), gather: poses(),
    principles: [poses(), poses(), poses()],
  };
  const curveInfo = { path: null, along: new Float32Array(N), axis: new Uint8Array(N) };
  const orbitInfo = { center: new THREE.Vector3(), scale: 1 };
  const ringInfo = { center: new THREE.Vector3(), scale: 1, layout: logoRing(1, 1, 1, 0.5, 0) };
  const credInfo = { center: new THREE.Vector3(), scale: 1 };
  const pinInfo = { center: new THREE.Vector3(), axis: new THREE.Vector3(0, 0, 1) };
  let constellationPairs = [];
  let ctx = { aspect: 16 / 9, portrait: false };

  const view = (d) => ({ hh: d * TAN, hw: d * TAN * ctx.aspect });
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();

  /**
   * @param {{aspect:number, titleFootprint?:{u:number, v:number}}} o
   */
  function layout(o) {
    ctx = { ...ctx, ...o, portrait: o.aspect < 0.9 };
    const { aspect, portrait } = ctx;
    const sm = portrait ? 0.62 : 1; // orb size multiplier on narrow screens

    // ring0: the logo ring, small, 60 units in front of the camera (camera space).
    {
      const R = view(60).hh * (portrait ? 0.2 : 0.26);
      logoRing(R, R, R * 0.2, R * 0.1).forEach(([x, y, s], i) => F.ring0[i].set(x, y, -60, s));
    }

    // Home hero cloud — kept off the camera path and out of the titles' way.
    {
      const nearK = clamp(aspect / 1.6, 0.42, 1);
      const fp = o.titleFootprint || { u: 0.45, v: 0.5 };
      const titleD = WORLD.titleDistance;
      CLOUD.forEach((c, i) => {
        let x, y, z, s;
        if (c[0] === 'near') {
          [, z, x, y, s] = c;
          x *= nearK;
        } else {
          const [, u, v, D, rr] = c;
          const { hh, hw } = view(D);
          x = u * hw;
          y = v * hh;
          z = -D;
          s = rr;
        }
        s *= sm;
        if (z > -titleD - 4 && z < HERO_START_Z - titleD + 4) {
          // The titles sweep through this depth: when they reach it, the orb must sit outside the title block.
          const t = view(titleD);
          const fx = fp.u * t.hw + s * 1.4;
          const fy = fp.v * t.hh + s * 1.4;
          if (Math.abs(x) < fx && Math.abs(y) < fy) {
            if (fx - Math.abs(x) < fy - Math.abs(y) && !portrait) x = Math.sign(x || 1) * fx;
            else y = Math.sign(y || 1) * fy;
          }
        }
        if (z > -4 && z < HERO_START_Z + 2) {
          // Don't let the camera fly through an orb.
          const rr = Math.hypot(x, y);
          const minR = s + 6;
          if (rr < minR) {
            const k = minR / Math.max(rr, 0.001);
            x *= k;
            y *= k;
          }
        }
        F.cloud[i].set(x, y, z, s);
      });
    }

    // Halo: the logo ring around the hero paragraph (open at the bottom, where the small "about" link sits).
    {
      const { hh, hw } = view(60);
      // (on portrait the paragraph spans the width: the ring's sides sit on the screen edges)
      const rx = portrait ? hw * 1.02 : Math.max(hw * 0.6, hh * 0.9);
      const ry = portrait ? hh * 0.46 : hh * 0.6;
      const big = (portrait ? 1.05 : 1.65);
      logoRing(rx, ry, big, big * 0.52).forEach(([x, y, s], i) => F.halo[i].set(x, y + hh * 0.02, -60 + (traits[i].hash - 0.5) * 4, s));
    }

    // Growth curve: a rising line with a dip (like the logo's arrow) + a dotted axis underneath.
    {
      const { hh, hw } = view(60);
      const x0 = portrait ? -hw * 0.78 : -hw * 0.78;
      const x1 = portrait ? hw * 0.62 : hw * 0.74;
      const y0 = portrait ? -hh * 0.72 : -hh * 0.7;
      const y1 = portrait ? hh * 0.02 : hh * 0.22;
      const P = (u, v) => new THREE.Vector3(lerp(x0, x1, u), lerp(y0, y1, v), -60);
      const pts = [P(0, 0.02), P(0.36, 0.48), P(0.5, 0.33), P(1, 1)];
      curveInfo.path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
      curveInfo.tip = pts[3].clone();
      curveInfo.tangent = pts[3].clone().sub(pts[2]).normalize();
      const dataN = 13;
      const big = portrait ? 1.25 : 1.9;
      for (let k = 0; k < dataN; k++) {
        const u = k / (dataN - 1);
        curveInfo.path.getPointAt(u, _v);
        F.curve[k].set(_v.x, _v.y, _v.z, lerp(big * 0.4, big, u ** 1.4) * (k === dataN - 1 ? 0.0 : 1));
        curveInfo.along[k] = u;
        curveInfo.axis[k] = 0;
      }
      // the last slot carries no orb: the glass arrow head sits there
      for (let k = dataN; k < N; k++) {
        const u = (k - dataN) / (N - dataN - 1);
        F.curve[k].set(lerp(x0, x1, u), y0 - hh * 0.09, -60, big * 0.18);
        curveInfo.along[k] = u;
        curveInfo.axis[k] = 1;
      }
    }

    // Bar chart: six columns of stacked orbs, rising left to right.
    {
      const { hh, hw } = view(60);
      const counts = [2, 3, 4, 4, 5, 6];
      const rb = portrait ? 0.78 : 1.15;
      const gapY = rb * 2.25;
      const gapX = rb * 3.1;
      const cx = portrait ? 0 : hw * 0.6;
      const by = portrait ? -hh * 0.78 : -hh * 0.66;
      let i = 0;
      counts.forEach((c, col) => {
        const x = cx + (col - (counts.length - 1) / 2) * gapX;
        for (let k = 0; k < c; k++) F.bars[i++].set(x, by + k * gapY, -60 + (traits[i - 1].hash - 0.5) * 1.5, rb * (k === c - 1 ? 1.08 : 1));
      });
    }

    // Constellation: seeded points at several depths in the right part of the screen (lower part on portrait).
    {
      const cr = rng(5);
      F.constellation.forEach((pose, i) => {
        const d = lerp(45, 95, cr());
        const { hh, hw } = view(d);
        const u = portrait ? lerp(-0.85, 0.85, cr()) : lerp(-0.05, 0.92, cr());
        const v = portrait ? lerp(-0.95, -0.38, cr()) : lerp(-0.78, 0.78, cr());
        pose.set(u * hw, v * hh, -d, lerp(0.55, 1.7, cr() ** 1.5) * sm);
      });
      // join every orb to its two nearest neighbours (unique pairs)
      const seen = new Set();
      constellationPairs = [];
      F.constellation.forEach((a, i) => {
        const near = F.constellation
          .map((b, j) => ({ j, d: a.p.distanceTo(b.p) }))
          .filter((e) => e.j !== i)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2);
        for (const { j } of near) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            constellationPairs.push([i, j]);
          }
        }
      });
    }

    // Orbits, ring and credentials are animated every frame; store their centres and scale here.
    {
      const { hh, hw } = view(60);
      orbitInfo.center.set(portrait ? 0 : hw * 0.42, portrait ? -hh * 0.66 : 0, -60);
      orbitInfo.scale = portrait ? hw * 0.05 : Math.min(hh * 0.045, hw * 0.035); // world units per orbit unit
      // about: an orbit around Diego's photo card (right half on desktop, lower half on portrait, its sides on the
      // screen edges so the orbs peek out either side of the card)
      ringInfo.center.set(portrait ? 0 : hw * 0.45, portrait ? -hh * 0.32 : 0, -60);
      ringInfo.scale = portrait ? hw * 1.05 : hw * 0.4;
      credInfo.center.set(0, -hh * 0.04, -60);
      credInfo.scale = portrait ? hw * 0.95 : Math.min(hh * 1.05, hw * 0.75);
    }

    // Scatter (contact): eight orbs at the edges, the rest hidden.
    SCATTER.forEach(([u, v, d, s], i) => {
      const { hh, hw } = view(d);
      F.scatter[i].set(u * hw, v * hh, -d, s * sm);
    });
    for (let i = SCATTER.length; i < N; i++) F.scatter[i].set(0, 0, -80, 0);

    // Principles (approach ★): three arrangements on the left half (top centre on portrait).
    {
      const dist = 62;
      const { hh, hw } = view(dist);
      const sc = portrait ? clamp((hw * 2 * 0.62) / 22, 0.4, 0.9) : clamp((hh * 2 * 0.56) / 22, 0.7, 1.4);
      pinInfo.center.set(portrait ? 0 : -hw * 0.47, portrait ? hh * 0.36 : 0, -dist);
      const tilt = new THREE.Quaternion().setFromEuler(_e.set(0.25, portrait ? 0.1 : 0.38, 0));
      pinInfo.axis.set(0, 0, 1).applyQuaternion(tilt);
      const A = [];
      // A · target: one large orb, a ring of 7, a ring of 12 (focused on results)
      A.push([0, 0, 2.7]);
      for (let k = 0; k < 7; k++) A.push([Math.cos((k / 7) * Math.PI * 2) * 6, Math.sin((k / 7) * Math.PI * 2) * 6, 1.05]);
      for (let k = 0; k < 12; k++) A.push([Math.cos(((k + 0.5) / 12) * Math.PI * 2) * 10.5, Math.sin(((k + 0.5) / 12) * Math.PI * 2) * 10.5, 0.62]);
      // B · a clean 5 × 4 grid of equal orbs (clear, honest reporting)
      const B = [];
      for (let k = 0; k < 20; k++) B.push([((k % 5) - 2) * 4.2, (1.5 - Math.floor(k / 5)) * 4.2, 1.05]);
      // C · a direct line between two large orbs (you and the person running your campaigns)
      const C = [];
      C.push([-10, -7, 2.4], [10, 7, 2.4]);
      for (let k = 0; k < 18; k++) {
        const u = (k + 1) / 19;
        C.push([lerp(-10, 10, u), lerp(-7, 7, u), 0.42]);
      }
      [A, B, C].forEach((arr, ai) => {
        F.principles[ai].forEach((pose, i) => {
          const a = arr[i];
          if (!a) return pose.set(pinInfo.center.x, pinInfo.center.y, pinInfo.center.z, 0);
          _v.set(a[0] * sc, a[1] * sc, 0).applyQuaternion(tilt).add(pinInfo.center);
          pose.set(_v.x, _v.y, _v.z, a[2] * sc);
        });
      });
    }

    FOOTER.forEach(([u, v, d, s], i) => {
      const { hh, hw } = view(d);
      F.footer[i].set(u * hw, v * hh, -d, s * (portrait ? 0.7 : 0.9));
    });
  }

  /** Tight cluster around a screen point (camera space). `x`, `y` are CSS pixels, `w`, `h` the viewport size. */
  function setGather(x, y, w, h) {
    const d = 34;
    const { hh, hw } = view(d);
    const cx = ((x / w) * 2 - 1) * hw;
    const cy = (1 - (y / h) * 2) * hh;
    const golden = Math.PI * (3 - Math.sqrt(5));
    F.gather.forEach((pose, i) => {
      const yy = 1 - ((i + 0.5) / N) * 2;
      const rr = Math.sqrt(1 - yy * yy);
      const a = golden * i;
      pose.set(cx + Math.cos(a) * rr * 2.2, cy + yy * 2.2, -d + Math.sin(a) * rr * 2.2, 0.42);
    });
  }

  /**
   * Evaluate a formation spec into `out` (world space).
   * @param {object} spec  { kind, pop?, arr?, spin?, par?, drift?, rise?, grow? }
   * @param {Pose[]} out
   * @param {{time:number, cam:THREE.Matrix4, prev:Pose[]}} c
   */
  function evaluate(spec, out, c) {
    const { time } = c;
    const k = spec.kind;
    switch (k) {
      case 'ring0':
      case 'gather':
        for (let i = 0; i < N; i++) {
          out[i].copy(F[k][i]);
          out[i].p.applyMatrix4(c.cam);
        }
        break;
      case 'cloud':
      case 'halo':
      case 'bars':
      case 'constellation':
      case 'scatter':
      case 'footer':
        for (let i = 0; i < N; i++) out[i].copy(F[k][i]);
        break;
      case 'curve': {
        // data points pop up one after another (axis dots first), each with a little overshoot
        const pop = spec.pop ?? 1;
        for (let i = 0; i < N; i++) {
          out[i].copy(F.curve[i]);
          const at = curveInfo.axis[i] ? curveInfo.along[i] * 0.25 : 0.18 + curveInfo.along[i] * 0.78;
          out[i].s *= easeOutBack(clamp((pop - at) / 0.1));
        }
        break;
      }
      case 'orbits': {
        // an atom: one central orb and three tilted orbits of 7 (one per channel), each turning at its own speed
        const sc = orbitInfo.scale;
        for (let i = 0; i < N; i++) {
          if (i === 0) {
            out[i].set(orbitInfo.center.x, orbitInfo.center.y, orbitInfo.center.z, 2.6 * sc);
            continue;
          }
          if (i > 21) {
            out[i].set(orbitInfo.center.x, orbitInfo.center.y, orbitInfo.center.z, 0);
            continue;
          }
          const o = (i - 1) % 3;
          const j = Math.floor((i - 1) / 3);
          const a = (j / 7) * Math.PI * 2 + time * [0.24, -0.18, 0.14][o] + (spec.spin || 0) * (o + 1);
          _v.set(Math.cos(a) * 15 * sc, Math.sin(a) * 15 * sc, 0).applyEuler(_e.set(1.2, 0, [0, 1.05, -1.05][o], 'ZXY'));
          const s = (0.75 + 0.5 * traits[i].hash) * sc;
          out[i].set(orbitInfo.center.x + _v.x, orbitInfo.center.y + _v.y, orbitInfo.center.z + _v.z, s);
        }
        break;
      }
      case 'ring':
      case 'credentials': {
        // the logo's dot ring (closed), turning about its own axis, tilted in 3D
        const info = k === 'ring' ? ringInfo : credInfo;
        // (credentials: seen from slightly above, like a planet's ring, so it reads as an orbit around the cards)
        _q.setFromEuler(k === 'ring' ? _e.set(-1.15, 0.15, -0.12) : _e.set(-1.22, 0, 0.1));
        const turn = time * (k === 'ring' ? 0.12 : 0.05) + (spec.spin || 0) * Math.PI * 1.4;
        ringInfo.layout.forEach(([x, y, s], i) => {
          const a = Math.atan2(y, x) + turn;
          const rad = Math.hypot(x, y);
          _v.set(Math.cos(a) * rad, Math.sin(a) * rad, 0).multiplyScalar(info.scale * 0.85).applyQuaternion(_q).add(info.center);
          out[i].set(_v.x, _v.y, _v.z, s * info.scale * 0.13);
        });
        break;
      }
      case 'principles': {
        const a = clamp(spec.arr ?? 0, 0, 2);
        const ai = Math.min(Math.floor(a), 1);
        const e = smooth(smooth(clamp(a - ai)));
        const A = F.principles[ai];
        const B = F.principles[ai + 1];
        for (let i = 0; i < N; i++) {
          out[i].p.lerpVectors(A[i].p, B[i].p, a >= 2 ? 1 : e).addScaledVector(traits[i].arc, Math.sin(Math.PI * e) * 3);
          out[i].s = lerp(A[i].s, B[i].s, a >= 2 ? 1 : e);
        }
        // turn slowly with the scroll around the arrangement's own axis
        _q.setFromAxisAngle(pinInfo.axis, (spec.spin || 0) * 0.8 - 0.2);
        for (let i = 0; i < N; i++) out[i].p.sub(pinInfo.center).applyQuaternion(_q).add(pinInfo.center);
        break;
      }
      default: // hidden
        for (let i = 0; i < N; i++) out[i].set(c.prev[i].p.x, c.prev[i].p.y, c.prev[i].p.z, 0);
    }

    // modifiers
    if (spec.scale !== undefined) for (let i = 0; i < N; i++) out[i].s *= spec.scale;
    if (spec.par) for (let i = 0; i < N; i++) out[i].p.y += spec.par * (3 + traits[i].hash * 6); // footer parallax
    if (spec.drift) {
      // float up and away, shrinking
      const e = spec.drift;
      for (let i = 0; i < N; i++) {
        const t = traits[i];
        out[i].p.x += t.drift.x * 16 * e * e;
        out[i].p.y += t.drift.y * 24 * e * e;
        out[i].p.z += t.drift.z * 14 * e * e;
        out[i].s *= 1 - smooth(clamp((e - 0.15) / 0.8));
      }
    }
    if (spec.rise !== undefined && spec.rise < 1) {
      // fly in from below the screen, growing
      const e = spec.rise;
      for (let i = 0; i < N; i++) {
        const d = Math.max(-out[i].p.z, 10);
        out[i].p.y -= (1 - e) * d * TAN * (2 + traits[i].hash);
        out[i].s *= smooth(e);
      }
    }
    return out;
  }

  return {
    traits,
    layout,
    evaluate,
    setGather,
    get curve() {
      return curveInfo;
    },
    get constellationPairs() {
      return constellationPairs;
    },
  };
}
