// ─────────────────────────────────────────────────────────────────────────────
// ThinxDigital — WebGL scene (fixed full-screen canvas behind the DOM, persists across page navigations).
//
// Architecture
//   scene.js                 boot, asset loading, quality tier, resize, router events, the per-frame loop
//   scene/config.js          colours, 3D title copy, page-hero formations, quality presets  ← change colours / copy here
//   scene/choreography.js    every scroll range: scroll → state object  ← change timings here
//   scene/formations.js      every orb formation (cloud, halo, growth curve, bar chart, …)  ← change shapes here
//   scene/sections.js        cached geometry + data-bg of the [data-scene] sections, page key (progress helpers)
//   scene/background.js      full-screen gradient shader: satin waves, grain, vignette, circular reveals / portal
//   scene/orbs.js            24 glass orbs + seed orbs + growth arrow + constellation lines; blending and overlays
//   scene/titles.js          the two 3D home hero titles (FK Screamer drawn to canvas, masked line reveals)
//   scene/sphere.js          home dashboard: instanced sphere of ad tiles + white veil
//   scene/post.js            EffectComposer: RGB shift + output (desktop only)
//
// Every frame: read window.scrollY → choreography.compute() → each module applies its part → render.
//
// Contract with the DOM layer (js/app.js and its router):
//   • dispatches `scene:ready` (and sets window.__sceneReady) once the HDR, the ads atlas and the font are loaded and
//     the first frame is on screen; if WebGL is unavailable it adds `html.no-webgl` and dispatches immediately;
//   • direct loads: the orbs wait in the logo's dot ring and play the intro on `app:intro`;
//   • `route:leave` {from, to, x, y}: the orbs rush to the click point while the DOM curtain covers the screen;
//   • `route:enter` {page}: rescan the sections inside the new <main>, paint that page's colours, settle intro;
//   • never touches scrolling: it only reads window.scrollY (Lenis drives the native scroll position).
// Debug: ?quality=high|mobile|low forces a render preset, ?intro=<seconds> freezes the intro at that time;
// window.__scene exposes the live state.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { ASSETS, QUALITY, TITLE_FONT_URL, WORLD } from './scene/config.js';
import { Sections } from './scene/sections.js';
import { createBackground } from './scene/background.js';
import { createOrbs } from './scene/orbs.js';
import { createTitles } from './scene/titles.js';
import { createSphere } from './scene/sphere.js';
import { createPost, RGB_BASE } from './scene/post.js';
import { createChoreography, INTRO } from './scene/choreography.js';

const html = document.documentElement;
const canvas = document.getElementById('scene');
const params = new URLSearchParams(location.search);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = matchMedia('(pointer: coarse)').matches;
const introFreeze = params.has('intro') ? parseFloat(params.get('intro')) : null; // debug: ?intro=1.2 freezes the intro

// Events may arrive before we are ready (e.g. the loader timed out): remember them.
// `intro` is the settle animation: from the logo ring on a direct load, from the gather point after a route change.
const intro = { requested: false, started: false, done: false, time: 0, t0: 0, kind: 'ring0', duration: INTRO.orbs };
const leave = { active: false, t0: 0, x: 0, y: 0 };
let onLeave = null;
let onEnter = null;
window.addEventListener('app:intro', () => (intro.requested = true));
window.addEventListener('route:leave', (e) => onLeave?.(e.detail || {}));
window.addEventListener('route:enter', (e) => onEnter?.(e.detail || {}));

function signalReady() {
  if (window.__sceneReady) return;
  window.__sceneReady = true;
  window.dispatchEvent(new Event('scene:ready'));
}

function fail(reason) {
  if (reason) console.warn('[scene] WebGL layer disabled:', reason);
  html.classList.add('no-webgl');
  signalReady();
}

function pickTier() {
  const forced = params.get('quality');
  if (forced && QUALITY[forced]) return { name: forced, adaptive: false };
  const weak = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return { name: weak ? 'low' : coarsePointer || small ? 'mobile' : 'high', adaptive: true };
}

boot().catch((err) => {
  console.error('[scene]', err);
  fail('boot error');
});

async function boot() {
  if (!canvas) return fail('no #scene canvas');
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) return fail('WebGL2 not supported');

  const tierInfo = pickTier();
  let tierName = tierInfo.name;
  let tier = QUALITY[tierName];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !tier.post, // the composer has its own multisampled target
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch (e) {
    return fail(e.message);
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x0064a8, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(WORLD.fov, 1, 0.5, 700);
  scene.add(camera);

  const sections = new Sections();
  const choreo = createChoreography();
  const background = createBackground();
  const orbs = createOrbs({ segments: tier.segments });
  scene.add(background.mesh, orbs.group);
  camera.add(...orbs.seeds);

  // ── assets ─────────────────────────────────────────────────────────────────
  const fontFamily = 'SceneScreamer';
  const fontP = new FontFace(fontFamily, `url(${TITLE_FONT_URL}) format("woff2")`)
    .load()
    .then((f) => (document.fonts.add(f), fontFamily))
    .catch(() => 'FK Screamer'); // fall back to the DOM's @font-face of the same file
  const cssFontP = document.fonts.load('400 120px "FK Screamer"').catch(() => null); // the DOM's display face
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envP = new HDRLoader()
    .loadAsync(ASSETS.hdr)
    .then((hdr) => {
      const env = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();
      return env;
    })
    .catch((e) => (console.warn('[scene] HDR failed', e), null));
  const atlasP = new THREE.TextureLoader()
    .loadAsync(ASSETS.atlas)
    .then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    })
    .catch((e) => (console.warn('[scene] atlas failed', e), null));
  const infoP = fetch(ASSETS.atlasJson)
    .then((r) => r.json())
    .catch(() => ({ cols: 8, rows: 7, count: 56, tileWidth: 256, tileHeight: 320 }));

  const [family, env, atlas, info] = await Promise.all([fontP, envP, atlasP, infoP, cssFontP]);
  pmrem.dispose();
  if (env) {
    scene.environment = env;
    scene.environmentRotation.set(0.35, 0.9, 0); // puts the studio's softboxes up-left on the orbs
  }

  const titles = createTitles({
    family,
    fontPx: tierName === 'high' ? 250 : 170,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  scene.add(titles.root);

  const sphere = atlas ? createSphere(atlas, info) : null;
  if (sphere) {
    scene.add(sphere.group);
    camera.add(sphere.veil);
  }

  // ── quality / sizing ───────────────────────────────────────────────────────
  let post = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let aspect = 1;

  function applyTier() {
    tier = QUALITY[tierName];
    renderer.transmissionResolutionScale = tier.transmissionScale;
    orbs.setTransmission(tier.transmission);
    if (tier.post && !post) post = createPost(renderer, scene, camera, tier);
    if (!tier.post && post) {
      post.dispose();
      post = null;
    }
    resize(true);
  }

  function resize(force = false) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // On touch devices ignore small height-only changes (URL bar) so formations and scroll maths never jump.
    if (!force && w === width && Math.abs(h - height) < (coarsePointer ? 120 : 1)) return;
    width = w;
    height = h;
    aspect = w / h;
    dpr = Math.min(window.devicePixelRatio || 1, tier.dprMax);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    post?.setSize(w, h, dpr);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    titles.layout(aspect);
    sphere?.layout(aspect);
    orbs.layout({ aspect, titleFootprint: titleFootprint() });
    refreshSections();
  }

  /** Half-size of the hero title block as a fraction of the half-view (used to keep the cloud clear of it). */
  function titleFootprint() {
    const halfH = WORLD.titleDistance * Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2));
    const { w, h } = titles.blockSize;
    return { u: w / 2 / (halfH * aspect), v: h / 2 / halfH };
  }

  function refreshSections() {
    sections.refresh(height || window.innerHeight);
  }

  applyTier();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resize(false), 80);
  });
  window.addEventListener('load', refreshSections);
  window.ScrollTrigger?.addEventListener?.('refresh', refreshSections);
  if ('ResizeObserver' in window) {
    let lastH = 0;
    new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight;
      if (h !== lastH) {
        lastH = h;
        refreshSections();
      }
    }).observe(document.body);
  }

  // ── pointer parallax (desktop only) ────────────────────────────────────────
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!coarsePointer) {
    window.addEventListener('pointermove', (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // ── intro, route transitions ───────────────────────────────────────────────
  let clock = 0;

  function startIntro() {
    if (intro.started) return;
    intro.started = true;
    intro.t0 = clock;
    // Skip it when the visitor is already further down the page (reload mid-page) or prefers less motion.
    if (reducedMotion || window.scrollY > sections.V * 0.1) intro.done = true;
  }

  // The DOM curtain is closing: the orbs rush to the click point and wait there, gathered.
  onLeave = ({ x, y }) => {
    orbs.setGather(Number.isFinite(x) ? x : width / 2, Number.isFinite(y) ? y : height / 2, width, height);
    Object.assign(leave, { active: true, t0: clock });
  };

  // The new page is in place (scrolled to top): read its sections and let the orbs settle into its formation.
  onEnter = () => {
    refreshSections();
    const fromGather = leave.active;
    leave.active = false;
    Object.assign(intro, {
      requested: true,
      started: true,
      done: reducedMotion,
      t0: clock,
      time: 0,
      kind: fromGather ? 'gather' : 'ring0',
      duration: fromGather ? 2.6 : INTRO.orbs,
    });
  };

  // ── frame loop ─────────────────────────────────────────────────────────────
  const motion = reducedMotion ? 0 : 1;
  const basePos = new THREE.Vector3();
  const baseQuat = new THREE.Quaternion();
  const baseMatrix = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  const parallax = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const forward = new THREE.Vector3();
  let last = performance.now();
  let frame = 0;
  let paused = false;
  const perf = { acc: 0, frames: 0, bad: 0 };

  function tick() {
    if (paused || document.hidden) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;
    frame++;

    if (intro.requested && !intro.started) startIntro();
    if (intro.started && !intro.done) {
      intro.time = clock - intro.t0;
      if (intro.time > INTRO.length) intro.done = true;
    }
    if (introFreeze !== null) Object.assign(intro, { started: true, done: false, time: introFreeze });
    if (leave.active && clock - leave.t0 > 5) leave.active = false; // the new page never arrived
    if (frame % 90 === 0 && document.documentElement.scrollHeight !== sections.docH) refreshSections();

    const st = choreo.compute(sections, window.scrollY, aspect, intro, clock);

    // camera: scripted pose (+ a touch of pointer parallax). The titles hang off the scripted pose.
    basePos.copy(st.cam.pos);
    baseQuat.setFromEuler(st.cam.rot);
    baseMatrix.compose(basePos, baseQuat, one);
    titles.root.position.copy(basePos).add(forward.set(0, 0, -WORLD.titleDistance).applyQuaternion(baseQuat));
    titles.root.quaternion.copy(baseQuat);
    const k = Math.min(1, dt * 2.5);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    parallax.setFromEuler(euler.set(-mouse.y * 0.018 * motion, -mouse.x * 0.026 * motion, 0));
    camera.position.copy(basePos);
    camera.quaternion.copy(baseQuat).multiply(parallax);

    background.update(clock, st.bg, aspect, height * dpr);
    orbs.update(
      {
        plan: st.orbs.plan,
        settle: intro.done ? null : { kind: intro.kind, t: intro.started ? intro.time : 0, duration: intro.duration },
        leave: leave.active ? { t: clock - leave.t0 } : null,
        cam: baseMatrix,
        seeds: st.orbs.seeds,
        arrow: st.orbs.arrow,
        lines: st.orbs.lines * (leave.active ? 0 : 1),
      },
      clock,
      motion,
      aspect
    );
    titles.update(st.titles);
    sphere?.update(st.sphere, st.veil);

    if (post) {
      post.setAmount(RGB_BASE + st.rgb);
      post.render();
    } else {
      renderer.render(scene, camera);
    }

    watchPerformance(dt);
  }

  // Step down one quality tier if the frame rate stays poor (checked every 2 s, needs 3 bad checks in a row).
  function watchPerformance(dt) {
    if (!tierInfo.adaptive || clock < 4 || tierName === 'low') return;
    perf.acc += dt;
    perf.frames++;
    if (perf.acc < 2) return;
    const fps = perf.frames / perf.acc;
    perf.acc = 0;
    perf.frames = 0;
    perf.bad = fps < 40 ? perf.bad + 1 : 0;
    if (perf.bad >= 3) {
      perf.bad = 0;
      console.info(`[scene] low frame rate (${fps.toFixed(0)} fps), stepping quality down`);
      setQuality(tierName === 'high' ? 'mobile' : 'low');
    }
  }

  function setQuality(name) {
    if (!QUALITY[name]) return;
    tierName = name;
    applyTier();
    console.info(`[scene] quality "${tierName}"`);
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    paused = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    paused = false;
  });
  document.addEventListener('visibilitychange', () => {
    last = performance.now(); // no time jump after a hidden tab
  });

  // Compile every material up front (hidden objects included) so nothing hitches mid-scroll.
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
  });
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  } catch (e) {
    console.warn('[scene] precompile failed', e);
  }
  for (const o of hidden) o.visible = false;

  tick();
  if (window.gsap?.ticker) window.gsap.ticker.add(tick);
  else renderer.setAnimationLoop(tick);

  requestAnimationFrame(() => {
    signalReady();
    // If the DOM layer never asks for the intro, play it anyway after a while.
    setTimeout(() => (intro.requested = true), 9000);
  });

  window.__scene = {
    get state() {
      return choreo.state;
    },
    get quality() {
      return tierName;
    },
    setQuality,
    sections,
    renderer,
    scene,
  };
  console.info(`[scene] ready — quality "${tierName}", dpr ${dpr}`);
}
