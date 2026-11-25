/* ==========================================================================
   loader.js — direct loads only. The logo's ring of dots lights up around the
   bulb while the WebGL scene loads (`scene:ready`, 7 s timeout) and fonts settle;
   then the dots scatter and the blue panel opens with a circular reveal from the
   centre, and `app:intro` is dispatched.
   ========================================================================== */
import { gsap, html, RM, qs, qsa, lockScroll, unlockScroll } from './core.js';

const SCENE_TIMEOUT = 7000;
const MIN_SHOW = 900;

/** Resolves when the scene says it is ready (or WebGL is unavailable), or after the timeout. */
export function whenSceneReady() {
  return new Promise((resolve) => {
    if (window.__sceneReady || html.classList.contains('no-webgl')) return resolve('ready');
    window.addEventListener('scene:ready', () => resolve('ready'), { once: true });
    setTimeout(() => resolve('timeout'), SCENE_TIMEOUT);
  });
}

/** Scene-driven backgrounds replace the DOM fallbacks once WebGL is running. */
export function syncSceneClass() {
  const live = window.__sceneReady && !html.classList.contains('no-webgl');
  html.classList.toggle('no-scene', !live);
}

export function runLoader({ beforeExit, onIntro } = {}) {
  const loader = qs('.loader');
  const panel = qs('.loader__panel');
  const mark = qs('.loader__mark');
  const dots = qsa('.loader__dots circle');
  const t0 = performance.now();

  lockScroll('loader');
  window.addEventListener('scene:ready', syncSceneClass);   // a late scene still takes over

  const minDelay = new Promise((r) => setTimeout(r, Math.max(0, MIN_SHOW - (performance.now() - t0))));
  const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();

  return Promise.all([whenSceneReady(), fonts, minDelay]).then(([why]) => {
    syncSceneClass();
    beforeExit?.(why);

    const intro = () => {
      if (window.__appIntro) return;
      window.__appIntro = true;
      unlockScroll('loader');
      window.dispatchEvent(new CustomEvent('app:intro'));
      onIntro?.();
    };

    if (RM) {
      gsap.to(loader, { autoAlpha: 0, duration: 0.4, onComplete: () => { loader.remove(); intro(); } });
      return;
    }

    // circular opening: a transparent hole grows from the centre of the panel
    const W = innerWidth;
    const H = innerHeight;
    const R = Math.hypot(W, H) / 2 + 40;
    const hole = { r: 0 };
    const setHole = () => {
      const m = `radial-gradient(circle at 50% 50%, transparent ${hole.r}px, #000 ${hole.r + 1.5}px)`;
      panel.style.webkitMaskImage = m;
      panel.style.maskImage = m;
    };
    loader.classList.add('is-leaving');
    gsap.timeline({ onComplete: () => loader.remove() })
      // the dots burst outward from the bulb, the bulb shrinks into a dot
      .to(dots, {
        attr: { r: (i, el) => +el.getAttribute('r') * 1.6 },
        x: (i, el) => (+el.getAttribute('cx') - 50) * 0.9,
        y: (i, el) => (+el.getAttribute('cy') - 49) * 0.9,
        opacity: 0,
        duration: 0.9,
        ease: 'power3.in',
        stagger: { each: 0.012, from: 'center' },
      }, 0)
      .to(mark, { scale: 0.2, autoAlpha: 0, duration: 0.7, ease: 'power3.in', transformOrigin: '50% 50%' }, 0.2)
      .to(hole, { r: R, duration: 1.25, ease: 'power3.inOut', onUpdate: setHole }, 0.55)
      // the scene intro starts while the panel is opening
      .add(intro, 0.95);
  });
}
