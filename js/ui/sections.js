/* ==========================================================================
   sections.js — scroll-driven DOM animations, built per page.

   buildPage(main) scans `[data-scene]` inside the current <main> and runs the
   builder for each key, all inside one gsap.context so the router can tear the
   whole page down (destroyPage) before the next one is swapped in.
   Sticky sections use a scrubbed timeline of length exactly 1, so tween
   positions ARE the contract's `p` (start "top top", end "bottom bottom").
   Width changes rebuild the current page (line splits depend on width).
   ========================================================================== */
import {
  gsap, ScrollTrigger, SplitText, qs, qsa, clamp, lerp, M, RM, C, isMobile, html,
} from './core.js';

/* ---------- helpers ---------- */

/** Scrubbed timeline over a sticky section's pinned range (duration 1 = p). */
function pinTL(section) {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: true },
  });
  tl.set({}, {}, 1);
  return tl;
}

/** Masked line reveal for display titles: lines rise out of their masks while scrolling. */
function titleReveal(title, { trigger = title, start = 'top 90%', end = 'top 50%', stagger = 0.14 } = {}) {
  if (!title) return;
  const inner = qsa('.ln__i', title);
  if (!inner.length) return;
  gsap.fromTo(inner,
    RM ? { autoAlpha: 0 } : { yPercent: 115, rotate: 2, transformOrigin: '0% 100%' },
    { ...(RM ? { autoAlpha: 1 } : { yPercent: 0, rotate: 0 }), ease: 'power2.out', stagger, scrollTrigger: { trigger, start, end, scrub: true } });
}

/** Elements rise in once they enter (replays when scrolling back down past them). */
function riseIn(targets, { trigger, start = 'top 88%', stagger = 0.1, y = 50 } = {}) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return;
  gsap.fromTo(els, { autoAlpha: 0, y: M(y) }, {
    autoAlpha: 1, y: 0, duration: 1.3, stagger, ease: 'thx.out',
    scrollTrigger: { trigger: trigger || els[0], start, toggleActions: 'play none none reverse' },
  });
}

/** Lines of a paragraph turn from pale to full colour as it scrolls through. */
function linesInk(el, { from = C.grey, to = C.navy, start = 'top 85%', end = 'bottom 55%', x = -20 } = {}) {
  if (!el) return;
  const lines = SplitText.create(el, { type: 'lines' }).lines;
  gsap.fromTo(lines, { x: M(x), color: from, opacity: 0.3 }, {
    x: 0, color: to, opacity: 1, ease: 'none', stagger: 0.3,
    scrollTrigger: { trigger: el, start, end, scrub: true },
  });
}

/** Soft top-to-bottom mask reveal (a blurred edge travels down the block). */
function softReveal(el, { start = 'top 90%', end = 'bottom 65%' } = {}) {
  if (!el || RM) return;
  el.classList.add('soft-reveal');
  const set = (st) => el.style.setProperty('--rv', st.progress.toFixed(4));
  ScrollTrigger.create({ trigger: el, start, end, onUpdate: set, onRefresh: set });
}

/**
 * Cards that rise as a stack, fan out like a hand, then turn on a 3D ring as the (sticky) section scrolls.
 * Used by the home statement (ad types) and /about credentials. Ranges are [start, length] in section progress.
 */
function orbitCards(s, cards, { enter: [e0, eL], fan: [f0, fL], ring: [r0, rL] }) {
  const n = cards.length;
  if (!n) return;
  const place = (p) => {
    const W = innerWidth;
    const cw = cards[0].offsetWidth;
    const mobile = W < 768;
    const enter = clamp((p - e0) / eL);            // stack rises in
    const fan = clamp((p - f0) / fL);              // stack → fan
    const ring = clamp((p - r0) / rL);             // fan → turning ring
    const R = mobile ? W * 0.55 : Math.min(W * 0.34, cw * 1.35);
    cards.forEach((card, i) => {
      const k = i - (n - 1) / 2;                   // centred index
      // stack: slight offsets
      const sx = k * 6, sy = k * -6, sr = k * 2;
      // fan: cards spread like a hand
      const fx = k * (mobile ? cw * 0.28 : cw * 0.5);
      const fy = Math.abs(k) * (mobile ? 14 : 24);
      const fr = k * (mobile ? 7 : 9);
      // ring: positions on a circle in the XZ plane, turning with scroll
      const a = (k / n) * Math.PI * 2 + ring * Math.PI * 1.6;
      const rx = Math.sin(a) * R;
      const rz = (Math.cos(a) - 1) * R * 0.8;
      const ry = (a * 180) / Math.PI;
      const fe = gsap.parseEase('power2.inOut');
      const f = fe(fan);
      const g = fe(ring > 0 ? clamp(ring * 3) : 0);  // blend into the ring quickly once it starts
      const x = lerp(lerp(sx, fx, f), rx, g);
      const y = lerp(lerp(sy, fy, f), 0, g) + (1 - enter) * 260;
      const z = lerp(0, rz, g);
      const rot = RM ? 0 : lerp(lerp(sr, fr, f), 0, g);
      const rotY = RM ? 0 : lerp(0, ry, g);
      card.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rot.toFixed(2)}deg)`;
      const depth = lerp(1, 0.35 + 0.65 * (Math.cos(a) + 1) / 2, g);   // cards at the back recede
      card.style.opacity = (enter * depth).toFixed(3);
      card.style.zIndex = String(Math.round(1000 + z));
      card.style.visibility = enter > 0 ? 'visible' : 'hidden';
    });
  };
  ScrollTrigger.create({ trigger: s, start: 'top top', end: 'bottom bottom', onUpdate: (st) => place(st.progress), onRefresh: (st) => place(st.progress) });
}

/** Big numbers count up once when they first show. */
function countUp(els) {
  els.forEach((el) => {
    const final = (el.dataset.final ||= el.textContent.trim());
    const m = final.match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
    if (!m || RM || el.dataset.done) { el.textContent = final; return; }
    const [, sign, num, suffix] = m;
    el.textContent = `${sign}0${suffix}`;
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top bottom', once: true,
      onEnter: () => {
        el.dataset.done = '1';
        gsap.to(o, {
          v: +num, duration: 1.8, ease: 'power3.out',
          onUpdate: () => { el.textContent = `${sign}${Math.round(o.v)}${suffix}`; },
          onComplete: () => { el.textContent = final; },
        });
      },
    });
  });
}

/** Text steps that swap inside a sticky section (approach principles). */
function stepSwap(tl, steps, { start, frag }) {
  steps.forEach((st, i) => {
    const c = start + frag * i;
    const out = c + frag - 0.02;
    const lines = SplitText.create(qsa('.step__title, .step__text', st), { type: 'lines' }).lines;
    const extras = qsa('.step__idx, .step__cta', st);
    tl.set(st, { visibility: 'visible' }, c)
      .fromTo(lines, { x: M(40), autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.12, ease: 'power2.out', stagger: 0.08 / Math.max(1, lines.length - 1) }, c)
      .fromTo(extras, { autoAlpha: 0, y: M(12) }, { autoAlpha: 1, y: 0, duration: 0.12, ease: 'power2.in' }, c + 0.03);
    if (i < steps.length - 1) tl.to(st, { autoAlpha: 0, duration: 0.1, ease: 'power2.in' }, out - 0.1);
  });
}

const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/* ==========================================================================
   Builders (one per data-scene key)
   ========================================================================== */
const B = {};

/* ---------- home ---------- */

B.hero = (s) => {
  const tl = pinTL(s);
  // paragraph: lines fade in and turn grey → navy, p .6 → .85
  qsa('.hero__line', s).forEach((ln, i) => {
    const at = 0.6 + i * 0.05;
    tl.fromTo(ln, { autoAlpha: 0, y: M(28) }, { autoAlpha: 1, y: 0, duration: 0.08, ease: 'power2.out' }, at)
      .fromTo(ln, { color: C.grey }, { color: C.navy, duration: 0.14 }, at);
  });
  tl.fromTo(qs('.hero__about', s), { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.06, ease: 'back.out(2)' }, 0.8);

  // DOM fallback of the two 3D titles (only visible without the WebGL scene)
  const t1 = qsa('.hero__title--1 .ln__i', s);
  const t2 = qsa('.hero__title--2 .ln__i', s);
  tl.fromTo([...t1].reverse(), { yPercent: 0 }, { yPercent: -115, duration: 0.06, stagger: 0.02, ease: 'power2.in' }, 0.12)
    .fromTo(t2, { yPercent: 115 }, { yPercent: 0, duration: 0.07, stagger: 0.015, ease: 'power2.out' }, 0.28)
    .to([...t2].reverse(), { yPercent: -115, duration: 0.06, stagger: 0.01, ease: 'power2.in' }, 0.5);

  // scroll cue leaves almost at once
  tl.to(qs('.scroll-cue', s), { autoAlpha: 0, duration: 0.04 }, 0.01);

  // the paragraph lifts away as the hero ends
  gsap.fromTo(qs('.hero__intro', s), { autoAlpha: 1, y: 0 }, {
    autoAlpha: 0, y: M(-80), ease: 'none',
    scrollTrigger: { trigger: s, start: 'bottom bottom', end: 'bottom 45%', scrub: true },
  });

  // fallback white circle (CSS var drives .fb__reveal)
  const set = (st) => s.style.setProperty('--reveal', clamp((st.progress - 0.05) / 0.3).toFixed(4));
  ScrollTrigger.create({ trigger: s, start: 'top top', end: 'bottom bottom', onUpdate: set, onRefresh: set });
};

B.statement = (s) => {
  const tl = pinTL(s);
  const text = qs('.statement__text', s);
  const words = SplitText.create(text, { type: 'words' }).words;
  const d = 0.12;
  tl.fromTo(words, { x: M(-40), autoAlpha: 0, color: '#8F92E0' }, {
    x: 0, autoAlpha: 1, color: C.white, duration: d, ease: 'power2.out',
    stagger: (0.3 - 0.04 - d) / Math.max(1, words.length - 1),
  }, 0.04);
  // the ad types: stack rises p .2 → .32, fans out .3 → .5, then turns on a 3D ring to the end
  orbitCards(s, qsa('.pcard', s), { enter: [0.2, 0.12], fan: [0.3, 0.2], ring: [0.5, 0.5] });
};

B.results = (s) => {
  const title = qs('.results__title', s);
  titleReveal(title, { start: 'top 92%', end: 'top 50%' });
  qsa('.stats > li', s).forEach((li, i) => {
    gsap.fromTo(li, { y: M(110 + i * 50) }, {
      y: 0, ease: 'none',
      scrollTrigger: { trigger: qs('.stats', s), start: 'top bottom', end: 'top 45%', scrub: true },
    });
  });
  countUp(qsa('.stat__num', s));
  riseIn(qs('.results__cta', s), { y: 20, start: 'top 95%' });
};

B.vr = (s) => {
  const tl = pinTL(s);
  // (no title screen: the section opens straight into the black portal, p 0 → .16)
  // copy on black: block (+ scrim) from p .3, words .34 → .44, button .4 → .5, out .76 → .82
  const side = qs('.vr__side', s);
  const words = SplitText.create(qs('.vr__text', s), { type: 'words' }).words;
  tl.fromTo(side, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, 0.3)
    .fromTo(words, { autoAlpha: 0, y: M(16), color: C.grey }, {
      autoAlpha: 1, y: 0, color: C.white, duration: 0.1, ease: 'power2.out',
      stagger: 0.1 / Math.max(1, words.length - 1),
    }, 0.34)
    .fromTo(qs('.vr__cta', s), { autoAlpha: 0, y: M(20) }, { autoAlpha: 1, y: 0, duration: 0.1 }, 0.4)
    .to(side, { autoAlpha: 0, duration: 0.06 }, 0.76);
  // fallback portal
  const portal = qs('.fb__portal', s);
  tl.fromTo(portal, { scale: 0 }, { scale: 1, duration: 0.16, ease: 'power2.in' }, 0)
    .to(portal, { autoAlpha: 0, duration: 0.04 }, 0.82);
};

B.expertises = (s) => {
  const list = qs('.exp', s);
  gsap.fromTo(qsa('.exp__item', s), { y: () => M(innerHeight * 0.15) }, {
    y: 0, ease: 'none', stagger: 0.25,
    scrollTrigger: { trigger: list, start: 'top 92%', end: 'bottom 82%', scrub: 0.5, invalidateOnRefresh: true },
  });
  riseIn(qs('.eyebrow', s), { y: 12, start: 'top 90%' });
  // no hover on phones: the line crossing the middle of the screen lights up instead
  if (isMobile() || !matchMedia('(hover: hover)').matches) {
    qsa('.exp__item', s).forEach((item) => {
      ScrollTrigger.create({ trigger: item, start: 'center 56%', end: 'center 44%', toggleClass: 'is-on' });
    });
  }
};

B.spotlight = (s) => {
  titleReveal(qs('.spot__title', s));
  const text = qs('.spot__text', s);
  linesInk(text, { start: 'top 88%', end: 'bottom 62%', x: -16 });
  riseIn(qs('.spot__cta', s), { y: 20, start: 'top 95%' });
  gsap.fromTo(qs('.dcard', s), { y: M(120) }, {
    y: 0, ease: 'none', scrollTrigger: { trigger: s, start: 'top bottom', end: 'top 30%', scrub: true },
  });
  photoDrift(s);
};

function photoDrift(s) {
  gsap.fromTo(qs('.dcard__photo img', s), { yPercent: M(-10) }, {
    yPercent: 0, ease: 'none', scrollTrigger: { trigger: s, start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

B.footer = (s) => {
  const title = qs('.footer__title', s);
  titleReveal(title, { trigger: s, start: 'top 75%', end: 'top 10%', stagger: 0.18 });
  riseIn(qs('.footer__cta', s), { trigger: s, start: 'top 35%', y: 24 });
  gsap.fromTo(qs('.fcard', s), { y: M(100), autoAlpha: 0.4 }, {
    y: 0, autoAlpha: 1, ease: 'none',
    scrollTrigger: { trigger: qs('.fcard', s), start: 'top bottom', end: 'top 60%', scrub: true },
  });
};

/* ---------- inner pages ---------- */

B['page-hero'] = (s) => {
  // title drifts up and dims as the hero scrolls away (the entrance is introPage)
  const box = qs('.pagehero, .contact__copy', s);
  if (!box || s.classList.contains('s-pagehero--contact')) return;
  gsap.to(box, {
    y: M(-120), autoAlpha: 0.2, ease: 'none',
    scrollTrigger: { trigger: s, start: 'top top', end: 'bottom top', scrub: true },
  });
  const cue = qs('.scroll-cue', s);
  if (cue) gsap.to(cue, { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: s, start: 'top top', end: '+=120', scrub: true } });
};

B.cases = (s) => {
  qsa('.case', s).forEach((c) => {
    const media = qs('.case__media', c);
    // the image opens out of a circle (dot motif), then drifts
    gsap.fromTo(qs('.case__img', c), RM ? { autoAlpha: 0 } : { clipPath: 'circle(8% at 50% 50%)', scale: 1.15 }, {
      ...(RM ? { autoAlpha: 1 } : { clipPath: 'circle(75% at 50% 50%)', scale: 1 }), ease: 'none',
      scrollTrigger: { trigger: media, start: 'top 95%', end: 'top 35%', scrub: true },
    });
    const sub = qs('.case__img--sub', c);
    if (sub) gsap.fromTo(sub, { y: M(80), autoAlpha: 0 }, { y: M(-30), autoAlpha: 1, ease: 'none', scrollTrigger: { trigger: media, start: 'top 80%', end: 'bottom 30%', scrub: true } });
    titleReveal(qs('.case__name', c), { start: 'top 90%', end: 'top 60%' });
    riseIn(qsa('.case__meta, .case__stats li, .case__story', c), { trigger: qs('.case__body', c), start: 'top 80%', stagger: 0.08, y: 30 });
    countUp(qsa('.case__num', c));
  });
};

B.partners = (s) => {
  titleReveal(qs('.partners__title', s));
  riseIn(qs('.partners__nav', s), { y: 20, start: 'top 92%' });
  riseIn(qsa('.pcard', s), { trigger: qs('.partners__viewport', s), start: 'top 88%', stagger: 0.07, y: 60 });
};

B.principles = (s) => {
  const tl = pinTL(s);
  stepSwap(tl, qsa('.step', s), { start: 0.06, frag: 0.9 / 3 });
};

B.process = (s) => {
  riseIn(qs('.eyebrow', s), { y: 12 });
  titleReveal(qs('.process__title', s));
  const list = qs('.process', s);
  // the rail between the numbers fills as you scroll past
  gsap.fromTo(list, { '--fill': 0 }, { '--fill': 1, ease: 'none', scrollTrigger: { trigger: list, start: 'top 75%', end: 'bottom 55%', scrub: true } });
  riseIn(qsa('.pstep', s), { trigger: list, start: 'top 85%', stagger: 0.12, y: 50 });
};

B.ai = (s) => {
  // marquee: slow autoplay loop (two copies) + scroll drift
  const marquee = qs('.marquee', s);
  const loop = qs('.marquee__loop', s);
  if (loop.children.length < 2) loop.appendChild(loop.firstElementChild.cloneNode(true));
  if (!RM) {
    const auto = gsap.to(loop, { xPercent: -50, duration: 50, ease: 'none', repeat: -1, paused: true });
    ScrollTrigger.create({ trigger: marquee, start: 'top bottom', end: 'bottom top', onToggle: (st) => (st.isActive ? auto.play() : auto.pause()) });
    gsap.fromTo(qs('.marquee__drift', s), { x: () => innerWidth * 0.1 }, {
      x: () => -innerWidth * 0.25, ease: 'none',
      scrollTrigger: { trigger: marquee, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
  }
  riseIn(qs('.ai .eyebrow', s), { y: 12 });
  titleReveal(qs('.ai__title', s));
  linesInk(qs('.ai__lead', s), { start: 'top 88%', end: 'bottom 60%' });
  riseIn(qsa('.ai__col', s), { trigger: qs('.ai__cols', s), start: 'top 85%', stagger: 0.15, y: 60 });
  riseIn(qsa('.chip', s), { trigger: qs('.chips', s), start: 'top 90%', stagger: 0.08, y: 30 });
};

B.channels = (s) => {
  qsa('.channel', s).forEach((ch) => {
    const media = qs('.channel__media', ch);
    gsap.fromTo(media, RM ? { autoAlpha: 0 } : { clipPath: 'inset(12% 12% 12% 12% round 32px)' }, {
      ...(RM ? { autoAlpha: 1 } : { clipPath: 'inset(0% 0% 0% 0% round 32px)' }), ease: 'none',
      scrollTrigger: { trigger: ch, start: 'top 92%', end: 'top 45%', scrub: true },
    });
    const img = qs('img', media);
    if (img) gsap.fromTo(img, { yPercent: M(-8) }, { yPercent: M(8), ease: 'none', scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: true } });
    titleReveal(qs('.channel__title', ch), { start: 'top 90%', end: 'top 60%' });
    riseIn(qsa('.channel__n, .channel__text, .pills li', ch), { trigger: qs('.channel__body', ch), start: 'top 82%', stagger: 0.05, y: 24 });
  });
};

B.dashboard = (s) => {
  riseIn(qs('.eyebrow', s), { y: 12 });
  titleReveal(qs('.dash__title', s));
  riseIn(qs('.dash__text', s), { y: 24, start: 'top 88%' });
  riseIn(qsa('.dash__features li', s), { trigger: qs('.dash__features', s), start: 'top 92%', stagger: 0.1, y: 24 });
  // illustrative dashboard: panel rises, line draws, bars grow
  const ui = qs('.dui', s);
  const line = qs('.dui__line', s);
  const len = line.getTotalLength?.() || 600;
  gsap.set(line, { strokeDasharray: len });
  const tl = gsap.timeline({ scrollTrigger: { trigger: ui, start: 'top 80%', toggleActions: 'play none none reverse' } });
  tl.fromTo(ui, { y: M(60), autoAlpha: 0, rotateX: M(10) }, { y: 0, autoAlpha: 1, rotateX: 0, duration: 1.2, ease: 'thx.out' })
    .fromTo(line, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 0.3)
    .fromTo(qs('.dui__area', s), { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 0.9)
    .fromTo(qsa('.dui__bars i', s), { scaleY: 0 }, { scaleY: 1, duration: 0.9, stagger: 0.06, ease: 'thx.out' }, 0.5);
};

B.bio = (s) => {
  linesInk(qs('.bio__lead', s), { start: 'top 85%', end: 'bottom 50%' });
  riseIn(qsa('.bio__cols > p:not(.bio__lead)', s), { trigger: qs('.bio__cols', s), start: 'top 70%', stagger: 0.12, y: 30 });
  riseIn(qsa('.facts li', s), { trigger: qs('.facts', s), start: 'top 88%', stagger: 0.08, y: 40 });
  riseIn(qsa('.promises li', s), { trigger: qs('.promises', s), start: 'top 90%', stagger: 0.1, y: 30 });
};

/* Credentials: the badge cards start as a tidy stack, fan out like a hand of cards,
   then turn on a slow 3D ring as you scroll (front card readable, others recede). */
B.credentials = (s) => {
  const title = qs('.cred__title', s);
  const cards = qsa('.lcard', s);
  gsap.fromTo(qsa('.ln__i', title), RM ? { autoAlpha: 0 } : { yPercent: 115 }, {
    ...(RM ? { autoAlpha: 1 } : { yPercent: 0 }), ease: 'power2.out', stagger: 0.2,
    scrollTrigger: { trigger: s, start: 'top 60%', end: 'top top', scrub: true },
  });
  orbitCards(s, cards, { enter: [0, 0.12], fan: [0.1, 0.25], ring: [0.35, 0.6] });
};

B.faq = (s) => {
  riseIn(qs('.faq__pill', s), { y: 16 });
  titleReveal(qs('.faq__title', s));
  softReveal(qs('.faq__list', s), { start: 'top 92%', end: 'bottom 70%' });
};

/* ==========================================================================
   Page lifecycle
   ========================================================================== */
let ctx = null;
let current = null;
let lastW = innerWidth;

export function buildPage(m) {
  current = m;
  ctx = gsap.context(() => {
    qsa('[data-scene]', m).forEach((s) => B[s.dataset.scene]?.(s));
  }, m);
  ScrollTrigger.refresh();
}

export function destroyPage() {
  ctx?.revert();
  ctx = null;
  current = null;
}

let t = 0;
window.addEventListener('resize', () => {
  clearTimeout(t);
  t = setTimeout(() => {
    if (innerWidth === lastW || !current) return;   // height-only (mobile URL bar): nothing to rebuild
    lastW = innerWidth;
    const m = current;
    destroyPage();
    buildPage(m);
  }, 220);
});

/** Entrance of a page's hero (direct load intro and after each route change). */
export function introPage(m, { delay = 0 } = {}) {
  if (!m || RM) return;
  const hero = qs('[data-scene="page-hero"]', m);
  if (hero) {
    gsap.fromTo(qsa('.pagehero__title .ln__i', hero), { yPercent: 115, rotate: 3 }, { yPercent: 0, rotate: 0, duration: 1.6, stagger: 0.12, delay: delay + 0.1, ease: 'thx.out' });
    gsap.fromTo(qsa('.pagehero__eyebrow, .pagehero__intro, .pagehero__cta, .contact__details, .contact__card, .dcard', hero),
      { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 1.4, stagger: 0.1, delay: delay + 0.35, ease: 'thx.out', clearProps: 'transform' });
  }
  // home without WebGL: the DOM title 1 rises
  if (html.classList.contains('no-scene')) {
    const spans = qsa('.hero__title--1 .ln__i > span', m);
    if (spans.length) gsap.fromTo(spans, { yPercent: 115 }, { yPercent: 0, duration: 1.6, stagger: 0.1, delay: delay + 0.2, ease: 'thx.out' });
  }
}
