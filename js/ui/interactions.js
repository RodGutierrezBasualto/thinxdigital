/* ==========================================================================
   interactions.js — pointer-driven details, set up per page.
   initInteractions(main) returns a cleanup function the router calls on leave.
     · Diego card: 3D tilt + moving light
     · partnership row: native scroller + mouse drag with inertia + buttons
     · FAQ: accordion, "See more questions", a dot that rides the divider
     · footer card: soft light following the cursor
   ========================================================================== */
import { gsap, ScrollTrigger, qs, qsa, clamp, RM, isTouch } from './core.js';

export function initInteractions(m) {
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  qsa('.dcard', m).forEach((card) => diegoTilt(card, on));
  const row = qs('.partners__viewport', m);
  if (row) partnerRow(row, m, on);
  const faqEl = qs('.faq', m);
  if (faqEl) faq(faqEl, on);
  const fcard = qs('.fcard', m);
  if (fcard) footerGlow(fcard, on);
  return () => cleanups.forEach((fn) => fn());
}

/* ---------- Diego card: subtle 3D tilt + moving light ---------- */
function diegoTilt(card, on) {
  const tilt = qs('.dcard__tilt', card);
  if (!tilt || isTouch || RM) return;
  const st = { rx: 0, ry: 0, gx: 50, gy: 30 };
  const apply = () => {
    tilt.style.setProperty('--rx', `${st.rx.toFixed(2)}deg`);
    tilt.style.setProperty('--ry', `${st.ry.toFixed(2)}deg`);
    tilt.style.setProperty('--gx', `${st.gx.toFixed(1)}%`);
    tilt.style.setProperty('--gy', `${st.gy.toFixed(1)}%`);
  };
  on(card, 'pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    gsap.to(st, { rx: (0.5 - ny) * 8, ry: (nx - 0.5) * 10, gx: nx * 100, gy: ny * 100, duration: 0.8, ease: 'power3.out', onUpdate: apply, overwrite: true });
  });
  on(card, 'pointerleave', () => {
    gsap.to(st, { rx: 0, ry: 0, gx: 50, gy: 30, duration: 1.4, ease: 'elastic.out(1, .5)', onUpdate: apply, overwrite: true });
  });
}

/* ---------- Partnerships: native horizontal scroller + mouse drag with inertia ---------- */
function partnerRow(vp, m, on) {
  const prev = qs('.partners__prev', m);
  const next = qs('.partners__next', m);
  let tween = null;

  const maxScroll = () => vp.scrollWidth - vp.clientWidth;
  const updateNav = () => {
    prev.disabled = vp.scrollLeft <= 4;
    next.disabled = vp.scrollLeft >= maxScroll() - 4;
  };
  on(vp, 'scroll', updateNav, { passive: true });
  on(window, 'resize', updateNav);
  updateNav();

  const step = () => {
    const card = qs('.pcard', vp);
    const gap = parseFloat(getComputedStyle(qs('.partners__track', vp)).columnGap) || 16;
    return card ? card.offsetWidth + gap : vp.clientWidth * 0.8;
  };
  const glide = (to) => {
    tween?.kill();
    tween = gsap.to(vp, { scrollLeft: clamp(to, 0, maxScroll()), duration: RM ? 0 : 0.9, ease: 'power3.out' });
  };
  on(next, 'click', () => glide(vp.scrollLeft + step()));
  on(prev, 'click', () => glide(vp.scrollLeft - step()));
  // horizontal trackpad swipes stay native (Lenis only handles the vertical page scroll)
  on(vp, 'wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.stopPropagation(); }, { passive: true });
  on(vp, 'keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); glide(vp.scrollLeft + step()); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); glide(vp.scrollLeft - step()); }
  });

  // mouse drag (touch keeps native scrolling + snap)
  let down = false; let moved = false; let startX = 0; let startScroll = 0; let lastX = 0; let lastT = 0; let vel = 0;
  on(vp, 'pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false;
    startX = lastX = e.clientX; startScroll = vp.scrollLeft; lastT = performance.now(); vel = 0;
    tween?.kill();
  });
  on(window, 'pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) { moved = true; vp.classList.add('is-drag'); }
    if (!moved) return;
    vp.scrollLeft = startScroll - dx;
    const now = performance.now();
    vel = 0.8 * ((e.clientX - lastX) / Math.max(1, now - lastT)) + 0.2 * vel;
    lastX = e.clientX; lastT = now;
  });
  on(window, 'pointerup', () => {
    if (!down) return;
    down = false;
    if (!moved) return;
    vp.classList.remove('is-drag');
    if (Math.abs(vel) > 0.05) glide(vp.scrollLeft - vel * 320);
  });
  // a drag must not "click" the CTA inside the last card
  on(vp, 'click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}

/* ---------- FAQ ---------- */
function faq(root, on) {
  const items = qsa('.qa', root);
  items.forEach((qa, i) => {
    const btn = qs('.qa__btn', qa);
    const panel = qs('.qa__panel', qa);
    const id = `qa-${i + 1}`;
    panel.id = id;
    btn.id = `${id}-btn`;
    btn.setAttribute('aria-controls', id);
    panel.setAttribute('aria-labelledby', btn.id);
    on(btn, 'click', () => toggle(qa));
    // the divider carries a small dot that follows the cursor along it (brand dot motif)
    if (!qa.querySelector('.qa__rail')) {
      const rail = document.createElement('span');
      rail.className = 'qa__rail';
      rail.setAttribute('aria-hidden', 'true');
      rail.innerHTML = '<i></i>';
      qa.append(rail);
    }
  });

  function toggle(qa) {
    const open = !qa.classList.contains('is-open');
    const panel = qs('.qa__panel', qa);
    qs('.qa__btn', qa).setAttribute('aria-expanded', String(open));
    gsap.killTweensOf(panel);
    if (open) {
      qa.classList.add('is-open');
      gsap.fromTo(panel, { height: panel.offsetHeight }, { height: 'auto', duration: RM ? 0 : 0.5, ease: 'power3.out', onComplete: () => ScrollTrigger.refresh() });
    } else {
      gsap.to(panel, { height: 0, duration: RM ? 0 : 0.4, ease: 'power3.inOut', onComplete: () => { qa.classList.remove('is-open'); ScrollTrigger.refresh(); } });
    }
  }

  const more = qs('.faq__more', root);
  if (more) on(more, 'click', () => {
    root.classList.add('is-all');
    const extra = qsa('.qa--more', root);
    gsap.fromTo(extra, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.08, ease: 'thx.out' });
    qs('.qa__btn', extra[0])?.focus({ preventScroll: true });
    ScrollTrigger.refresh();
  });

  if (isTouch || RM) return;
  items.forEach((qa) => {
    const dot = qs('.qa__rail i', qa);
    on(qa, 'pointermove', (e) => {
      const r = qa.getBoundingClientRect();
      gsap.to(dot, { x: clamp(e.clientX - r.left, 0, r.width), scale: 1, autoAlpha: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
    });
    on(qa, 'pointerleave', () => gsap.to(dot, { scale: 0, autoAlpha: 0, duration: 0.4, ease: 'power2.in', overwrite: true }));
  });
}

/* ---------- Footer glass card: a soft light follows the cursor ---------- */
function footerGlow(card, on) {
  if (isTouch || RM) return;
  const st = { x: 50, y: 50, i: 0 };
  const apply = () => {
    card.style.setProperty('--gx', `${st.x.toFixed(1)}%`);
    card.style.setProperty('--gy', `${st.y.toFixed(1)}%`);
    card.style.setProperty('--gi', st.i.toFixed(3));
  };
  on(card, 'pointermove', (e) => {
    const r = card.getBoundingClientRect();
    gsap.to(st, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, i: 1, duration: 0.9, ease: 'power3.out', onUpdate: apply, overwrite: true });
  });
  on(card, 'pointerleave', () => gsap.to(st, { i: 0, duration: 1.2, ease: 'power2.out', onUpdate: apply, overwrite: true }));
}
