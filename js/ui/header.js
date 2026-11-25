/* ==========================================================================
   header.js — keeps the header readable over whatever the scene paints under it,
   and marks the current page.

   Theme = "light" (white text) over blue / indigo / navy / black, "dark" (navy
   text) over white / sky. It follows the `data-bg` of the section whose colour
   is on screen (see sectionTheme); the two sections whose colour changes
   *inside* them use their progress:
     hero  — blue until the white reveal (p .05 → .35) has covered the header row
     vr    — black between the portal filling the screen and the white veil
   Each header item is themed on its own, so it also turns light over dark photos.
   ========================================================================== */
import { gsap, ScrollTrigger, qs, qsa, clamp, main } from './core.js';

const DARK_BGS = new Set(['blue', 'indigo', 'navy', 'black']);

export function initHeader() {
  const hdr = qs('.hdr');
  const parts = qsa('.hdr__logo, .hdr__nav, .hdr__cta, .hdr__menu', hdr);
  let sections = [];
  let blocks = [];

  /** Re-read the current page (call after every route change). */
  function scan() {
    const m = main();
    sections = m ? qsa('[data-scene]', m) : [];
    blocks = m ? qsa('.stat__media, .case__media, .channel__media, .dcard__tilt, .pcard--cta', m) : [];
    update();
  }

  /* The scene brings each section's colour in as a circle that has filled the screen
     by the time the section's top edge is ~25% down the viewport (enter .75), so the
     colour on screen is that of the last section whose top has passed that line. */
  function sectionTheme() {
    const V = innerHeight;
    let active = sections[0];
    let rect = active?.getBoundingClientRect();
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      if (r.top <= V * 0.27) { active = s; rect = r; } else break;
    }
    if (!active) return 'dark';
    const p = clamp(-rect.top / Math.max(1, rect.height - V));
    if (active.dataset.scene === 'hero') return p < 0.31 ? 'light' : 'dark';
    if (active.dataset.scene === 'vr') return p > 0.12 && p < 0.84 ? 'light' : 'dark';
    return DARK_BGS.has(active.dataset.bg) ? 'light' : 'dark';
  }

  function update() {
    if (hdr.classList.contains('is-menu')) return;
    const bar = qs('.hdr__bar', hdr);
    const line = bar.offsetHeight / 2;
    const base = sectionTheme();
    if (hdr.dataset.theme !== base) hdr.dataset.theme = base;
    // a dark photo passing under an item flips that item to light
    let rects = null;
    for (const part of parts) {
      let theme = base;
      if (base === 'dark' && blocks.length) {
        rects ||= blocks.map((b) => b.getBoundingClientRect()).filter((r) => r.top < line + 30 && r.bottom > 0);
        if (rects.length) {
          const r = part.getBoundingClientRect();
          if (r.width) {
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            if (rects.some((b) => cx > b.left && cx < b.right && cy > b.top && cy < b.bottom)) theme = 'light';
          }
        }
      }
      if (part.dataset.theme !== theme) part.dataset.theme = theme;
    }
  }

  /** Move aria-current to the links of the page now shown. */
  function setActive(page) {
    qsa('[data-nav]').forEach((a) => {
      if (a.dataset.nav === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  ScrollTrigger.addEventListener('refresh', update);
  window.lenis.on('scroll', update);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  scan();

  return { scan, update, setActive };
}

/** Header fades in when the intro starts (direct loads). */
export function introHeader() {
  gsap.fromTo('.hdr__bar', { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 1.6, delay: 0.2, ease: 'thx.out' });
}
