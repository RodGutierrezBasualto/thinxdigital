// Choreography: every scroll range of the WebGL layer, in one place.
//
// compute() turns the scroll position into a plain state object (background layers, camera pose, title reveals,
// orb plan, seed orbs, growth arrow, sphere, veil, RGB shift) that the scene modules apply. Every range is expressed
// through the section helpers (Sections.pAt / enterAt / leaveAt), i.e. relative to the live [data-scene] geometry.
//
// Backgrounds are data-driven: each section's `data-bg` colour arrives as a soft circle growing out of a small glass
// seed orb while that section's top edge travels up the screen (enter .05 → .75). Only the ★ sections add their own
// beats: the home hero turns blue → white inside the hero (white reveal p .05 → .35) and the home dashboard (vr) opens
// a black portal from the centre (p .25 → .45) and goes back to white under a veil (p .86 → .9).
//
// Orbs (see formations.js): home = cloud → halo → growth curve → drift away … footer cloud; inner pages = their
// page-hero formation (config PAGE_HERO) drifting away as the hero leaves, approach `principles` ★ and about
// `credentials` ★ fly in from below, every page ends with the footer cloud.

import * as THREE from 'three';
import { HERO_START_Z } from './formations.js';
import { SEED } from './orbs.js';
import { coverRadius } from './background.js';
import { PAGE_HERO, WORLD } from './config.js';
import {
  clamp, lerp, ramp, smooth,
  easeInQuad, easeOutQuad, easeOutCubic, easeInOutCubic, easeInCubic, easeSnapOut, easeOutBack,
} from './util.js';

const TAN = Math.tan(THREE.MathUtils.degToRad(WORLD.fov / 2));
const FEATHER = 0.045; // soft edge of the circular reveals, in screen heights
// Where the generic colour reveals start (uv, from the bottom-left), used in turn.
const ORIGINS = [[0.5, 0.15], [0.77, 0.22], [0.24, 0.19], [0.62, 0.12]];

// Home hero camera path: travels forward through the cloud between hero p 0 and .55, ending at the neutral pose.
const HERO_PATH = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, HERO_START_Z),
  new THREE.Vector3(-3, -2, 39),
  new THREE.Vector3(3.5, 2.4, 20),
  new THREE.Vector3(0, 0, 0),
]);
const HERO_TRAVEL_END = 0.55;

// Intro timings (seconds after `app:intro` / `route:enter`).
export const INTRO = { lineDelay: 0.8, lineStagger: 0.15, lineDuration: 4.0, settle: 4.2, orbs: 4.4, length: 6 };

export function createChoreography() {
  const state = {
    page: 'home',
    heroP: 0,
    bg: [],
    cam: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
    titles: [0, 1].map(() => ({ visible: false, shift: [-1, -1, -1], mask: [0, 0, 0], offset: new THREE.Vector3(), tilt: 0 })),
    orbs: {
      plan: { a: { kind: 'hidden' }, b: null, e: 0, idle: 0.5 },
      seeds: [{ s: 0, origin: [0.5, 0.5] }, { s: 0, origin: [0.5, 0.5] }],
      arrow: { draw: 0, erase: 0 },
      lines: 0,
    },
    sphere: { visible: false, position: new THREE.Vector3(), scale: 0, spin: 0, tilt: 0.3, push: 1, inside: 0 },
    veil: 0,
    rgb: 0,
  };

  // ── background schedule (rebuilt whenever the sections change) ─────────────
  let schedule = [];
  let scheduleVersion = -1;

  function buildSchedule(S) {
    const V = S.V;
    const home = S.page === 'home';
    const enterAt = (s, e) => s.T - V + e * V;
    schedule = [];
    let current = S.list[0]?.bg || (home ? 'blue' : 'white');
    if (home && S.list[0]?.key === 'hero') current = 'blue';
    schedule.push({ color: current, mode: 'fade', y0: -Infinity, y1: -Infinity });
    let n = 0;
    S.list.forEach((sec, i) => {
      // ★ home dashboard always enters on white (its own portal handles the black)
      const bg = home && sec.key === 'vr' ? 'white' : sec.bg || current;
      if (i > 0 && bg !== current) {
        schedule.push({ color: bg, mode: 'circle', y0: enterAt(sec, 0.05), y1: enterAt(sec, 0.75), origin: ORIGINS[n++ % ORIGINS.length] });
        current = bg;
      }
      if (home && sec.key === 'hero') {
        schedule.push({ color: 'white', mode: 'circle', y0: S.pAt('hero', 0.05), y1: S.pAt('hero', 0.35), origin: [0.5, 0.1] });
        current = 'white';
      }
      if (home && sec.key === 'vr') {
        schedule.push({ color: 'black', mode: 'portal', y0: S.pAt('vr', 0.25), y1: S.pAt('vr', 0.45) });
        schedule.push({ color: 'white', mode: 'fade', y0: S.pAt('vr', 0.86), y1: S.pAt('vr', 0.9) });
        current = 'white';
      }
    });
    state.bg = schedule.map((l) => ({ color: l.color, mode: l.mode, t: 0, radius: 0, feather: 0, origin: l.origin }));
  }

  /**
   * @param {import('./sections.js').Sections} S
   * @param {number} y   window.scrollY
   * @param {number} aspect
   * @param {{started:boolean, done:boolean, time:number}} intro  the current settle intro (load or route)
   * @param {number} time seconds since boot
   */
  function compute(S, y, aspect, intro, time) {
    if (S.version !== scheduleVersion) {
      buildSchedule(S);
      scheduleVersion = S.version;
    }
    const V = S.V;
    const page = S.page;
    const home = page === 'home';
    const portrait = aspect < 0.9;
    state.page = page;
    const heroP = home ? S.p('hero', y) : 0;
    state.heroP = heroP;

    // ── background ───────────────────────────────────────────────────────────
    const seeds = state.orbs.seeds;
    seeds[0].s = seeds[1].s = 0;
    let seedSlot = 0;
    schedule.forEach((l, i) => {
      const out = state.bg[i];
      if (l.y0 === -Infinity) {
        out.t = 1;
        return;
      }
      const t = ramp(y, l.y0, l.y1);
      out.t = t;
      if (l.mode === 'circle') {
        // the colour spills out of a seed orb that pops up first, then the circle grows past the corners
        const pop = easeOutBack(ramp(t, 0, 0.12));
        const grow = easeInOutCubic(ramp(t, 0.1, 1));
        out.radius = lerp(SEED.radius * 0.85 * pop, coverRadius(l.origin[0], l.origin[1], aspect) + FEATHER + 0.04, grow);
        out.feather = lerp(0.004, FEATHER, grow);
        if (t > 0 && t < 1 && seedSlot < 2) {
          seeds[seedSlot].s = pop * (1 - easeInCubic(ramp(t, 0.4, 0.8)));
          seeds[seedSlot].origin = l.origin;
          seedSlot++;
        }
      } else if (l.mode === 'portal') {
        const e = easeInOutCubic(t);
        out.t = e;
        out.radius = e * coverRadius(0.5, 0.5, aspect) * 1.02;
        out.feather = e > 0 ? 1 - e : 0; // rim glow strength
      } else {
        out.radius = t; // fade opacity
      }
    });

    // ── camera ───────────────────────────────────────────────────────────────
    if (home) {
      const travel = 1 - (1 - ramp(heroP, 0, HERO_TRAVEL_END)) ** 1.5;
      HERO_PATH.getPoint(travel, state.cam.pos);
      const sway = Math.sin(travel * Math.PI);
      state.cam.rot.set(sway * 0.035, Math.sin(travel * Math.PI * 2) * 0.05, sway * -0.03);
    } else {
      state.cam.pos.set(0, 0, 0);
      state.cam.rot.set(0, 0, 0);
    }

    // ── home hero titles ─────────────────────────────────────────────────────
    const [t1, t2] = state.titles;
    const introT = intro.done ? 1e3 : intro.started ? intro.time : -1;
    t1.visible = home && heroP < 0.225 && introT >= 0;
    for (let i = 0; i < 3; i++) {
      const rise = introT < 0 ? 0 : easeSnapOut(clamp((introT - INTRO.lineDelay - i * INTRO.lineStagger) / INTRO.lineDuration));
      t1.shift[i] = rise - 1;
      t1.mask[i] = easeInOutCubic(ramp(heroP, 0.12 + (2 - i) * 0.02, 0.18 + (2 - i) * 0.02)); // bottom line first
    }
    const settle = introT < 0 ? 1 : (1 - clamp((introT - 0.7) / INTRO.settle)) ** 4;
    t1.offset.set(0, -5 * settle, 16 * settle);
    t1.tilt = -0.85 * settle;
    t2.visible = home && heroP > 0.27 && heroP < 0.59;
    for (let i = 0; i < 3; i++) {
      t2.shift[i] = easeOutCubic(ramp(heroP, 0.28 + i * 0.02, 0.34 + i * 0.02)) - 1;
      t2.mask[i] = easeInOutCubic(ramp(heroP, 0.5 + (2 - i) * 0.015, 0.55 + (2 - i) * 0.015));
    }

    // ── orbs ─────────────────────────────────────────────────────────────────
    const o = state.orbs;
    const plan = o.plan;
    plan.b = null;
    plan.e = 0;
    o.arrow.draw = 0;
    o.arrow.erase = 0;
    o.lines = 0;
    const footerFrom = S.enterAt('footer', -0.1);
    const footer = () => {
      const rise = easeOutCubic(ramp(y, footerFrom, S.enterAt('footer', 0.9)));
      plan.a = { kind: 'footer', rise, par: Math.max(0, (y - S.enterAt('footer', 1)) / V) };
      plan.idle = 1;
    };

    if (home) {
      const statementT = S.get('statement').T;
      const statementP = S.p('statement', y);
      const resultsIn = S.enterAt('results', 0);
      if (y >= footerFrom) footer();
      else if (y < S.pAt('hero', HERO_TRAVEL_END)) {
        plan.a = { kind: 'cloud' };
        plan.idle = 1;
      } else if (y < S.pAt('hero', 0.8)) {
        plan.a = { kind: 'cloud' };
        plan.b = { kind: 'halo' };
        plan.e = ramp(y, S.pAt('hero', HERO_TRAVEL_END), S.pAt('hero', 0.8));
        plan.spread = 0.35;
        plan.arc = 8;
        plan.idle = lerp(1, 0.35, plan.e);
      } else if (y < statementT) {
        // the halo holds around the paragraph, then shrinks away while the statement's colour spills in
        const e = ramp(y, S.enterAt('statement', 0.1), statementT);
        plan.a = { kind: 'halo', scale: 1 - easeInQuad(e), drift: e * 0.35 };
        plan.idle = 0.35;
      } else if (y < resultsIn) {
        plan.a = { kind: 'curve', pop: ramp(statementP, 0.02, 0.8) };
        plan.idle = 0.12;
        o.arrow.draw = ramp(statementP, 0.2, 0.92);
      } else if (y < S.enterAt('results', 1)) {
        const e = ramp(y, resultsIn, S.enterAt('results', 0.9));
        plan.a = { kind: 'curve', pop: 1, drift: e };
        plan.idle = 0.12;
        o.arrow.draw = 1;
        o.arrow.erase = easeInOutCubic(ramp(e, 0, 0.7));
      } else {
        plan.a = { kind: 'hidden' };
      }
    } else {
      const heroKind = PAGE_HERO[page] || 'scatter';
      const special = page === 'approach' ? 'principles' : page === 'about' ? 'credentials' : null;
      const sp = special && S.has(special) ? S.get(special) : null;
      if (y >= footerFrom) footer();
      else if (sp && y >= S.enterAt(special, 0) && y < S.leaveAt(special, 0.85)) {
        const p = S.p(special, y);
        plan.a = {
          kind: special,
          rise: easeOutCubic(ramp(y, S.enterAt(special, 0.05), S.enterAt(special, 0.85))),
          drift: ramp(y, S.leaveAt(special, 0), S.leaveAt(special, 0.85)),
          arr: ramp(p, 0.28, 0.38) + ramp(p, 0.61, 0.71), // three steps (approach)
          spin: p,
        };
        plan.idle = special === 'principles' ? 0.3 : 0.1;
      } else {
        // the page-hero formation holds for the first bit of scroll, then drifts away as the hero leaves
        const d0 = Math.max(S.leaveAt('page-hero', -0.25), V * 0.12);
        const drift = S.has('page-hero') ? ramp(y, d0, Math.max(S.leaveAt('page-hero', 0.75), d0 + V * 0.6)) : 1;
        if (drift < 1) {
          plan.a = { kind: heroKind, drift, spin: ramp(y, 0, V * 2) };
          plan.idle = heroKind === 'constellation' || heroKind === 'scatter' ? 0.7 : 0.15;
          if (heroKind === 'constellation') o.lines = 1 - smooth(drift);
        } else {
          plan.a = { kind: 'hidden' };
        }
      }
    }

    // ── dashboard sphere, veil, RGB shift (home vr ★) ─────────────────────────
    const vrP = home ? S.p('vr', y) : 0;
    const sp = state.sphere;
    const R = 10;
    // distance at which the sphere fills ~80% of the screen height (landscape) or width (portrait)
    const fit = portrait ? R / (0.8 * TAN * aspect) : R / (0.8 * TAN);
    const arrive = easeOutQuad(ramp(vrP, 0.4, 0.66));
    const dive = easeInQuad(ramp(vrP, 0.5, 0.9));
    const dist = lerp(fit, 12, dive);
    sp.visible = home && S.has('vr') && vrP > 0.38 && vrP < 0.93;
    sp.scale = easeOutQuad(ramp(vrP, 0.4, 0.6));
    sp.push = 1 + 0.7 * dive;
    // on wide screens it settles a little left of centre (the DOM copy is on the right); on portrait, higher up
    const restX = portrait ? 0 : -fit * TAN * aspect * 0.2 * (1 - dive);
    const restY = portrait ? fit * TAN * 0.2 * (1 - dive) : 0;
    sp.position.set(lerp(fit * TAN * Math.max(aspect, 0.6) * 1.6, restX, arrive), lerp(-3, restY, arrive), -dist);
    sp.spin = time * 0.12 + vrP * 3.4 - Math.PI * (1 - arrive);
    sp.tilt = 0.32 - dive * 0.2;
    sp.inside = smooth(clamp((R * sp.push - dist) / 4 + 0.5));

    const v1 = ramp(vrP, 0.65, 0.82) * 0.06; // a faint haze first (keeps the white DOM copy readable)
    const v2 = easeInQuad(ramp(vrP, 0.82, 0.9));
    const v3 = ramp(vrP, 0.9, 1);
    state.veil = !sp.visible && (vrP <= 0 || vrP >= 1) ? 0 : vrP >= 0.9 ? 1 - smooth(v3) : Math.max(v1, v2);
    if (!home || vrP <= 0 || vrP >= 1) state.veil = 0;

    const bumpE = ramp(vrP, 0.25, 0.62);
    const bump = bumpE > 0 && bumpE < 1 ? Math.sin(Math.PI * (1 - (1 - bumpE) ** 1.7)) : 0;
    state.rgb = home ? bump * 0.005 + (vrP < 0.9 ? easeInQuad(ramp(vrP, 0.62, 0.9)) * 0.004 : 0) : 0;

    return state;
  }

  return { state, compute };
}
