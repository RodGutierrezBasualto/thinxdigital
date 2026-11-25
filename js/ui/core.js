/* ==========================================================================
   core.js — shared setup: GSAP plugins + eases, Lenis smooth scroll (exposed as
   window.lenis), ScrollTrigger ↔ Lenis sync, anchor scrolling and small helpers.
   ========================================================================== */

const { gsap, ScrollTrigger, SplitText, CustomEase, Observer, Lenis } = window;

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, Observer);

/* ---------- Environment flags ---------- */
export const html = document.documentElement;
export const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isTouch = matchMedia('(hover: none)').matches;
export const mqMobile = matchMedia('(max-width: 767.9px)');
export const isMobile = () => mqMobile.matches;

/* ---------- Eases (own curves: long, soft tails) ---------- */
CustomEase.create('thx.out', 'M0,0 C0.08,0.62 0.1,0.88 0.19,0.95 0.29,1.01 0.38,1 1,1');
CustomEase.create('thx.inOut', 'M0,0 C0.5,0 0.12,1 1,1');
CustomEase.create('thx.back', 'M0,0 C0.09,0.68 0.11,1.06 0.21,1.1 0.34,1.07 0.48,1 1,1');

/* ---------- Brand colours used by JS tweens ---------- */
export const C = {
  navy: '#14163A',
  blue: '#0072BC',
  indigo: '#2E3192',
  sky: '#6DB5EE',
  ice: '#D6DCF5',
  grey: '#8A8FA8',
  white: '#FFFFFF',
};

/* ---------- Helpers ---------- */
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const qs = (s, r = document) => r.querySelector(s);
export const qsa = (s, r = document) => [...r.querySelectorAll(s)];
/** distance helper: no movement when the visitor prefers reduced motion */
export const M = (v) => (RM ? 0 : v);
export const main = () => document.getElementById('main');
export const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

/* ---------- Lenis ---------- */
export const lenis = new Lenis({
  lerp: 0.1,
  smoothWheel: !RM,
  syncTouch: false,          // touch scrolling stays native on phones
  gestureOrientation: 'vertical',
  autoRaf: false,
  anchors: false,
});
window.lenis = lenis;

lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
ScrollTrigger.config({ ignoreMobileResize: true });

/* Lenis can be stopped by several owners at once (loader, menu, router). */
const locks = new Set();
export function lockScroll(owner) {
  locks.add(owner);
  lenis.stop();
}
export function unlockScroll(owner) {
  locks.delete(owner);
  if (!locks.size) lenis.start();
}

/* ---------- Anchor scrolling ---------- */
const easeScroll = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Where an in-page anchor should land. Targets can fine-tune it:
 *   data-scroll-p="0.1"     → that far into a sticky section's pinned range
 *   data-scroll-to=".sel"   → an inner element, just below the header
 * Anything else lands just below the header.
 */
export function targetY(hash) {
  if (!hash || hash === '#' || hash === '#top') return 0;
  let el = null;
  try { el = document.querySelector(hash); } catch { return null; }
  if (!el) return null;
  const hdr = qs('.hdr__bar')?.offsetHeight || 0;
  let y = el.getBoundingClientRect().top + window.scrollY;
  if (el.dataset.scrollP) {
    y += parseFloat(el.dataset.scrollP) * Math.max(0, el.offsetHeight - window.innerHeight);
  } else if (el.dataset.scrollTo) {
    const inner = el.querySelector(el.dataset.scrollTo);
    if (inner) y = inner.getBoundingClientRect().top + window.scrollY - hdr - 16;
  } else if (!el.matches('[data-scene]')) {
    y -= hdr + 8;
  }
  return Math.max(0, y);
}

export function scrollToHash(hash, { immediate = false } = {}) {
  const y = targetY(hash);
  if (y == null) return false;
  const dist = Math.abs(y - window.scrollY);
  lenis.scrollTo(y, {
    immediate: immediate || RM,
    duration: clamp(dist / 5000, 1.1, 2.4),
    easing: easeScroll,
    force: true,
  });
  return true;
}

/* ---------- Text helpers ---------- */

/** Wrap each explicit title line (.ln) in an inner span so it can slide inside its mask. */
export function prepareLines(root = document) {
  qsa('.ln', root).forEach((ln) => {
    if (ln.querySelector(':scope > .ln__i')) return;
    const inner = document.createElement('span');
    inner.className = 'ln__i';
    while (ln.firstChild) inner.appendChild(ln.firstChild);
    ln.appendChild(inner);
    ln.classList.add('is-mask');
  });
}

export function sectionGeom(el) {
  const r = el.getBoundingClientRect();
  return { top: r.top + window.scrollY, height: r.height };
}

export { gsap, ScrollTrigger, SplitText };
