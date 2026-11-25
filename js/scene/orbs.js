// Glass dots.
//
// 24 flat glass dots — thin round discs with a rounded rim, like glass coins — (MeshPhysicalMaterial transmission,
// lit only by the HDR environment) that move between the
// formations of formations.js. Each frame:
//   1. choreography.js gives a PLAN: formation `a`, optionally formation `b` and a blend `e` (staggered per orb);
//   2. time-based OVERLAYS are applied on top: the settle intro (orbs come from the intro ring or from the route
//      transition's gather point into the scroll formation) and the route-leave gather (orbs rush to the click point);
//   3. a gentle idle float is added and the meshes are updated.
// Extra glass pieces live here too: two small SEED orbs (the background's circular colour reveals grow out of them),
// the glass growth ARROW drawn through the statement's data points, and the fine LINES of the constellation.
// A pose is a position + a radius; each dot faces the camera and tilts slowly on its own so its rim catches the light.

import * as THREE from 'three';
import { N, poses, createFormations } from './formations.js';
import { WORLD } from './config.js';
import { clamp, lerp, stagger, easeInOutCubic, easeInCubic, easeSnapOut, easeOutBack } from './util.js';

const TAN = Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2));
export const SEED = { distance: 40, radius: 0.0375 }; // seed orb: depth, and radius in screen heights
const TUBE = { segments: 180, radial: 10 }; // growth arrow tube resolution

function createGlass() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.12,
    transmission: 1,
    ior: 1.7,
    thickness: 0.6, // × the mesh scale: a thin flat disc — the face stays clear, the rounded rim bends the light
    specularIntensity: 0.7,
    envMapIntensity: 0.9,
    clearcoat: 0.5,
    clearcoatRoughness: 0.08,
    // a cool blue absorption: the body of the glass reads deeper than the background, the rims stay bright
    attenuationColor: new THREE.Color(0xb4c3e6),
    attenuationDistance: 4.5,
  });
}

/**
 * A flat glass dot of radius 1: a disc HALF thick, with a fully rounded rim, facing +Z.
 * Built as a lathe profile (centre of the top face → rim arc → centre of the bottom face), so the normals are smooth.
 */
export function createDiscGeometry(segments = 48, HALF = 0.11) {
  const pts = [new THREE.Vector2(0, HALF)];
  const arc = 10;
  for (let k = 0; k <= arc; k++) {
    const a = Math.PI / 2 - (k / arc) * Math.PI; // +90° → -90° around the rim centre
    pts.push(new THREE.Vector2(1 - HALF + Math.cos(a) * HALF, Math.sin(a) * HALF));
  }
  pts.push(new THREE.Vector2(0, -HALF));
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateX(Math.PI / 2); // lathe axis Y → disc faces ±Z
  return g;
}

export function createOrbs({ segments = 48 } = {}) {
  const formations = createFormations();
  const { traits } = formations;
  const material = createGlass();
  const geometry = createDiscGeometry(Math.max(32, segments));
  const knotGeometry = new THREE.SphereGeometry(1, 20, 14); // the arrow's joint stays a small bead
  const group = new THREE.Group();
  group.name = 'orbs';

  const meshes = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geometry, material);
    m.name = `orb-${i}`;
    m.renderOrder = 1;
    group.add(m);
    meshes.push(m);
  }

  // Seed orbs: children of the camera, placed at a screen point.
  const seeds = [0, 1].map(() => {
    const m = new THREE.Mesh(geometry, material);
    m.name = 'seed-orb';
    m.visible = false;
    return m;
  });

  // Growth arrow (statement): a glass tube drawn through the data points + a cone head (rebuilt on layout).
  const arrow = new THREE.Group();
  arrow.name = 'growth-arrow';
  arrow.visible = false;
  const tube = new THREE.Mesh(new THREE.BufferGeometry(), material);
  // the head is an open chevron like the logo's arrow: two short glass rods meeting at the tip
  const head = new THREE.Group();
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  const rods = [0, 1].map(() => new THREE.Mesh(rodGeo, material));
  const knot = new THREE.Mesh(knotGeometry, material);
  head.add(...rods, knot);
  arrow.add(tube, head);
  group.add(arrow);
  let headScale = 1;

  // Constellation lines.
  const lineGeo = new THREE.BufferGeometry();
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = 0;
  group.add(lines);

  const A = poses();
  const B = poses();
  const out = poses();
  const src = poses();
  const last = poses();
  for (const p of last) p.set(0, 0, -80, 0);
  const settleDelay = new Float32Array(N).map((_, i) => traits[i].hash * 0.18);

  function layout(o) {
    formations.layout(o);
    // rebuild the growth arrow along the new curve
    const c = formations.curve;
    const portrait = o.aspect < 0.9;
    const radius = portrait ? 0.2 : 0.28;
    tube.geometry.dispose();
    tube.geometry = new THREE.TubeGeometry(c.path, TUBE.segments, radius, TUBE.radial, false);
    headScale = portrait ? 0.62 : 1;
    head.position.copy(c.tip);
    const back = c.tangent.clone().negate();
    const armLength = 2.6 * headScale;
    rods.forEach((rod, k) => {
      const dir = back.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (k ? 1 : -1) * 0.7);
      rod.scale.set(radius, armLength, radius);
      rod.position.copy(dir).multiplyScalar(armLength / 2);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    });
    knot.scale.setScalar(radius);
    // lines: two vertices per pair
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(formations.constellationPairs.length * 6), 3));
  }

  const _cam = new THREE.Matrix4();
  const _camQ = new THREE.Quaternion();
  const _tilt = new THREE.Quaternion();
  const _euler = new THREE.Euler();
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  /**
   * @param {object} f
   * @param {{a:object, b?:object, e?:number, spread?:number, arc?:number, idle?:number}} f.plan
   * @param {{kind:'ring0'|'gather', t:number, duration:number}|null} f.settle
   * @param {{t:number}|null} f.leave
   * @param {THREE.Matrix4} f.cam  base camera matrix (world ← camera)
   * @param {{s:number, origin:number[]}[]} f.seeds
   * @param {{draw:number, erase:number}} f.arrow
   * @param {number} f.lines  constellation line opacity
   */
  function update(f, time, motion, aspect) {
    _cam.copy(f.cam);
    const c = { time, cam: _cam, prev: last };
    const plan = f.plan;

    // 1. scroll formation
    formations.evaluate(plan.a, A, c);
    if (plan.b && plan.e > 0) {
      formations.evaluate(plan.b, B, c);
      const spread = plan.spread ?? 0.3;
      for (let i = 0; i < N; i++) {
        const e = easeInOutCubic(stagger(plan.e, (i * 7) % N, N, spread));
        out[i].p.lerpVectors(A[i].p, B[i].p, e).addScaledVector(traits[i].arc, Math.sin(Math.PI * e) * (plan.arc ?? 6));
        out[i].s = lerp(A[i].s, B[i].s, e);
      }
    } else {
      for (let i = 0; i < N; i++) out[i].copy(A[i]);
    }

    // 2. overlays
    if (f.settle) {
      formations.evaluate({ kind: f.settle.kind }, src, c);
      for (let i = 0; i < N; i++) {
        const e = easeSnapOut(clamp((f.settle.t - settleDelay[i]) / f.settle.duration));
        if (e >= 1) continue;
        out[i].p.lerpVectors(src[i].p, out[i].p, e).addScaledVector(traits[i].arc, Math.sin(Math.PI * e) * 4);
        out[i].s = lerp(src[i].s, out[i].s, e);
      }
    }
    if (f.leave) {
      formations.evaluate({ kind: 'gather' }, src, c);
      for (let i = 0; i < N; i++) {
        const e = easeInCubic(clamp((f.leave.t - settleDelay[i] * 0.5) / 0.6));
        out[i].p.lerp(src[i].p, e);
        out[i].s = lerp(out[i].s, src[i].s, e);
      }
    }
    for (let i = 0; i < N; i++) last[i].copy(out[i]);

    // 3. apply (+ idle float); dots face the camera, each tilting on its own (never edge-on: max ~35°)
    _cam.decompose(_v1, _camQ, _v2);
    const amp = (plan.idle ?? 0.5) * motion;
    for (let i = 0; i < N; i++) {
      const m = meshes[i];
      const o = out[i];
      m.visible = o.s > 0.01;
      if (!m.visible) continue;
      const t = traits[i];
      m.position.copy(o.p);
      if (amp) {
        m.position.y += Math.sin(time * 0.6 + t.phase) * 0.45 * amp;
        m.position.x += Math.sin(time * 0.37 + t.phase * 1.7) * 0.25 * amp;
      }
      m.scale.setScalar(o.s);
      const w = 0.35 + 0.65 * motion; // keep a resting tilt even when motion is reduced
      _euler.set(
        (Math.sin(t.phase * 2.3) * 0.32 + Math.sin(time * 0.45 + t.phase) * 0.22) * w,
        (Math.cos(t.phase * 1.7) * 0.32 + Math.sin(time * 0.38 + t.phase * 1.9) * 0.22) * w,
        0
      );
      m.quaternion.copy(_camQ).multiply(_tilt.setFromEuler(_euler));
    }

    // seeds (camera space)
    f.seeds.forEach((sd, k) => {
      const m = seeds[k];
      m.visible = sd.s > 0.01;
      if (!m.visible) return;
      const hh = SEED.distance * TAN;
      m.position.set((sd.origin[0] * 2 - 1) * hh * aspect, (sd.origin[1] * 2 - 1) * hh, -SEED.distance);
      m.scale.setScalar(SEED.radius * 2 * hh * sd.s);
    });

    // growth arrow
    const ar = f.arrow;
    arrow.visible = ar.draw > 0.001 && ar.erase < 0.999;
    if (arrow.visible) {
      // TubeGeometry indexes segment by segment along the path: 6 indices per radial step of each segment
      const per = TUBE.radial * 6;
      const start = Math.floor(ar.erase * TUBE.segments) * per;
      const end = Math.floor(ar.draw * TUBE.segments) * per;
      tube.geometry.setDrawRange(start, Math.max(0, end - start));
      const hs = easeOutBack(clamp((ar.draw - 0.92) / 0.08)) * (1 - ar.erase);
      head.visible = hs > 0.01;
      head.scale.setScalar(hs);
    }

    // constellation lines follow the orbs
    lines.visible = f.lines > 0.01;
    if (lines.visible) {
      lineMat.opacity = f.lines * 0.32;
      const pos = lineGeo.attributes.position;
      formations.constellationPairs.forEach(([i, j], k) => {
        pos.setXYZ(k * 2, meshes[i].position.x, meshes[i].position.y, meshes[i].position.z);
        pos.setXYZ(k * 2 + 1, meshes[j].position.x, meshes[j].position.y, meshes[j].position.z);
      });
      pos.needsUpdate = true;
    }
  }

  function setEnvironment(env) {
    material.envMap = env;
    material.needsUpdate = true;
  }

  /** Cheaper look for weak GPUs: frosted translucent glass without the transmission pass. */
  function setTransmission(on) {
    material.transmission = on ? 1 : 0;
    material.transparent = !on;
    material.opacity = on ? 1 : 0.4;
    material.roughness = on ? 0.07 : 0.3;
    material.color.set(on ? 0xffffff : 0xe8f1ff);
    material.needsUpdate = true;
  }

  return {
    group,
    seeds,
    layout,
    update,
    setEnvironment,
    setTransmission,
    setGather: formations.setGather,
  };
}
