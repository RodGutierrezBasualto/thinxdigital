/* ==========================================================================
   menu.js — tablet / mobile menu. A blue disc grows out of the Menu button to
   fill the screen (the brand's dot motif), the numbered page links rise in, the
   Diego card and contact line follow. Navigation itself is the router's job.
   ========================================================================== */
import { gsap, qs, qsa, RM, lockScroll, unlockScroll } from './core.js';

export function initMenu() {
  const hdr = qs('.hdr');
  const menu = qs('#menu');
  const btn = qs('.hdr__menu');
  const panel = qs('.menu__panel', menu);
  const links = qsa('.menu__links a', menu);
  const card = qs('.menu__card', menu);
  const foot = qs('.menu__foot', menu);
  const scroller = qs('.menu__inner', menu);

  let open = false;
  let tl = null;
  let lastFocus = null;

  /** Circle centred on the menu button, big enough to cover the far corner. */
  function circle(scale) {
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 20;
    return `circle(${Math.max(0, R * scale)}px at ${x}px ${y}px)`;
  }

  function show() {
    if (open) return;
    open = true;
    lastFocus = document.activeElement;
    tl?.kill();
    menu.inert = false;
    menu.classList.add('is-open');
    hdr.classList.add('is-menu');
    hdr.dataset.theme = 'light';
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
    lockScroll('menu');
    scroller.scrollTop = 0;

    if (RM) {
      gsap.set(panel, { clipPath: 'none' });
      gsap.fromTo(menu, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 });
    } else {
      const s = { v: 0 };
      gsap.set(menu, { autoAlpha: 1 });
      tl = gsap.timeline({ defaults: { ease: 'thx.out' } })
        .fromTo(s, { v: 0 }, { v: 1, duration: 1.1, ease: 'power3.inOut', onUpdate: () => { panel.style.clipPath = circle(s.v); } }, 0)
        .fromTo(links, { yPercent: 110 }, { yPercent: 0, duration: 1.6, stagger: 0.06 }, 0.3)
        .fromTo(qsa('.menu__num', menu), { autoAlpha: 0 }, { autoAlpha: 0.55, duration: 1.2, stagger: 0.06 }, 0.5)
        .fromTo(card, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.6 }, 0.55)
        .fromTo(foot, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2 }, 0.7);
    }
    setTimeout(() => links[0]?.focus({ preventScroll: true }), RM ? 50 : 400);
  }

  /** instant: used when a page transition is about to cover the screen anyway */
  function hide({ restoreFocus = true, instant = false } = {}) {
    if (!open) return Promise.resolve();
    open = false;
    tl?.kill();
    hdr.classList.remove('is-menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    return new Promise((resolve) => {
      const done = () => {
        menu.classList.remove('is-open');
        menu.inert = true;
        gsap.set([menu, panel, links, card, foot], { clearProps: 'all' });
        unlockScroll('menu');
        if (restoreFocus) lastFocus?.focus?.({ preventScroll: true });
        window.dispatchEvent(new Event('scroll'));   // re-theme the header
        resolve();
      };
      if (instant || RM) { done(); return; }
      const s = { v: 1 };
      tl = gsap.timeline({ onComplete: done })
        .to([links, card, foot], { autoAlpha: 0, duration: 0.25, ease: 'power1.in' }, 0)
        .to(s, { v: 0, duration: 0.7, ease: 'power3.inOut', onUpdate: () => { panel.style.clipPath = circle(s.v); } }, 0.1);
    });
  }

  btn.addEventListener('click', () => (open ? hide() : show()));

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); hide(); }
    if (e.key === 'Tab') trapFocus(e, [btn, ...qsa('a, button', menu).filter((el) => el.offsetParent)]);
  });
  // a wider window (desktop shows inline links) closes the menu
  matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) hide({ instant: true, restoreFocus: false }); });

  return { show, hide, isOpen: () => open };
}

/** Keep keyboard focus inside a set of elements. */
export function trapFocus(e, items) {
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
