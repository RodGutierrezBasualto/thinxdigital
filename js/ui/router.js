/* ==========================================================================
   router.js — client-side navigation between the site's real HTML pages.

   Same-origin clicks on known routes are intercepted: a blue dot grows from the
   click point until it covers the screen (route:leave), the target page is
   fetched and its <main> swapped in (title, meta, header state, history), the
   page is rebuilt at the top (route:enter) and the curtain opens from the centre.
   Back/forward and hashes (/services/#paid-social) are handled. Without JS the
   site is a plain multi-page site.

   Events on window (contract with scene.js):
     route:leave {detail:{from, to, x, y, fromPath, toPath}}  — leave animation starts
     route:enter {detail:{page, path, hash}}                   — new <main> in the DOM,
                                                                 scrolled and laid out
   ========================================================================== */
import { gsap, html, qs, RM, lenis, emit, lockScroll, unlockScroll, scrollToHash, targetY } from './core.js';

/** path → data-page */
export const ROUTES = {
  '/': 'home',
  '/results/': 'results',
  '/approach/': 'approach',
  '/services/': 'services',
  '/about/': 'about',
  '/contact/': 'contact',
};

/** Where the site lives: "/" locally, "/thinxdigital/" on GitHub Pages (set by tools/publish.py on <html data-base>). */
export const BASE = (document.documentElement.dataset.base || '/').replace(/\/?$/, '/');
const withBase = (path) => BASE + path.replace(/^\//, '');

/** "/results", "/results/index.html", "/home/" (with or without the base) → canonical route path */
export function normalise(pathname) {
  if (BASE !== '/' && pathname.startsWith(BASE)) pathname = '/' + pathname.slice(BASE.length);
  let p = pathname.replace(/\/index\.html$/, '/');
  if (!p.endsWith('/') && !p.includes('.')) p += '/';
  if (p === '/home/') p = '/';
  return p;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/* ---------- Curtain: grow a disc from the click point, open a hole from the centre ---------- */
function createCurtain() {
  const el = qs('.curtain');
  const st = { r: 0, h: 0 };

  function cover(x, y) {
    gsap.killTweensOf(st);
    el.style.webkitMaskImage = el.style.maskImage = 'none';
    el.classList.add('is-on');
    if (RM) {
      el.style.clipPath = 'none';
      return gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }).then();
    }
    gsap.set(el, { autoAlpha: 1 });
    const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 10;
    const set = () => { el.style.clipPath = `circle(${st.r.toFixed(1)}px at ${x}px ${y}px)`; };
    return gsap.fromTo(st, { r: 0 }, { r: R, duration: 0.85, ease: 'power3.inOut', onUpdate: set }).then(() => {
      el.style.clipPath = 'none';
      el.classList.add('is-waiting');   // dot ring shows if the fetch is slow
    });
  }

  function open() {
    el.classList.remove('is-waiting');
    if (RM) {
      return gsap.to(el, { autoAlpha: 0, duration: 0.3 }).then(() => el.classList.remove('is-on'));
    }
    const R = Math.hypot(innerWidth, innerHeight) / 2 + 10;
    const set = () => {
      const m = `radial-gradient(circle at 50% 50%, transparent ${st.h.toFixed(1)}px, #000 ${(st.h + 1.5).toFixed(1)}px)`;
      el.style.webkitMaskImage = m;
      el.style.maskImage = m;
    };
    return gsap.fromTo(st, { h: 0 }, { h: R, duration: 1.05, ease: 'power3.inOut', onUpdate: set }).then(() => {
      el.classList.remove('is-on');
      el.style.webkitMaskImage = el.style.maskImage = 'none';
      gsap.set(el, { autoAlpha: 0 });
    });
  }

  return { cover, open };
}

export function initRouter({ menu, header, leavePage, enterPage, introPage }) {
  const curtain = createCurtain();
  const cache = new Map();
  let current = normalise(location.pathname);
  let busy = false;

  history.replaceState({ y: 0 }, '', location.href);

  function fetchPage(path) {
    if (!cache.has(path)) {
      const p = fetch(withBase(path), { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
        .catch((err) => { cache.delete(path); throw err; });
      cache.set(path, p);
    }
    return cache.get(path);
  }

  /** A same-origin link to one of our pages (not a new tab, not a download)? */
  function routeOf(a, e) {
    if (!a || (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))) return null;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return null;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return null;
    const path = normalise(url.pathname);
    return path in ROUTES ? { url, path } : null;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    const r = routeOf(a, e);
    if (!r) return;
    if (r.path === current && r.url.hash === '#main') return;   // skip link stays native
    e.preventDefault();
    const x = e.clientX || innerWidth / 2;
    const y = e.clientY || innerHeight / 2;

    if (r.path === current) {
      // same page: just glide (to the hash, or back to the top)
      const scroll = () => {
        if (r.url.hash) {
          if (scrollToHash(r.url.hash)) history.replaceState(history.state, '', r.url.pathname + r.url.hash);
        } else {
          lenis.scrollTo(0, { duration: 1.6, force: true });
        }
      };
      if (menu.isOpen()) menu.hide({ restoreFocus: false }).then(scroll);
      else scroll();
      return;
    }
    go(r.url, { x, y, push: true });
  });

  // warm the cache when a pointer heads for a link
  const warm = (e) => { const r = routeOf(e.target.closest?.('a[href]')); if (r && r.path !== current) fetchPage(r.path).catch(() => {}); };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('touchstart', warm, { passive: true });

  window.addEventListener('popstate', (e) => {
    const url = new URL(location.href);
    const path = normalise(url.pathname);
    if (!(path in ROUTES)) { location.reload(); return; }
    if (path === current) { if (url.hash) scrollToHash(url.hash); return; }
    go(url, { x: innerWidth / 2, y: innerHeight / 2, push: false, restoreY: e.state?.y });
  });

  async function go(url, { x, y, push, restoreY = null }) {
    if (busy) return;
    busy = true;
    const path = normalise(url.pathname);
    const from = ROUTES[current];
    const to = ROUTES[path];
    if (push) history.replaceState({ ...(history.state || {}), y: window.scrollY }, '');   // remember where we were
    lockScroll('router');
    emit('route:leave', { from, to, x, y, fromPath: current, toPath: path });

    const page = fetchPage(path);
    let text;
    try {
      [text] = await Promise.all([page, curtain.cover(x, y)]);
    } catch {
      location.href = url.href;   // network trouble: fall back to a normal page load
      return;
    }
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const nextMain = doc.getElementById('main');
    if (!nextMain) { location.href = url.href; return; }

    if (menu.isOpen()) await menu.hide({ instant: true, restoreFocus: false });

    // swap the page
    leavePage();
    const incoming = document.adoptNode(nextMain);
    document.getElementById('main').replaceWith(incoming);
    document.title = doc.title;
    syncHead(doc);
    html.dataset.page = to;
    header.setActive(to);
    if (push) history.pushState({ y: 0 }, '', url.pathname + url.search + url.hash);
    current = path;

    // fresh page at the top (or at its hash / remembered position), then build
    lenis.scrollTo(0, { immediate: true, force: true });
    window.scrollTo(0, 0);
    await nextFrame();
    enterPage(incoming);
    await nextFrame();
    if (url.hash && targetY(url.hash) != null) scrollToHash(url.hash, { immediate: true });
    else if (restoreY) lenis.scrollTo(restoreY, { immediate: true, force: true });
    header.scan();

    emit('route:enter', { page: to, path, hash: url.hash });
    unlockScroll('router');
    introPage(incoming, { delay: 0.35 });
    await curtain.open();
    incoming.focus({ preventScroll: true });
    busy = false;
    // back/forward pressed during the transition: catch up with the address bar
    const now = normalise(location.pathname);
    if (now !== current && now in ROUTES) go(new URL(location.href), { x: innerWidth / 2, y: innerHeight / 2, push: false });
  }

  return { go, current: () => current };
}

/** Copy the per-page head bits (description, canonical, og) from the fetched document. */
function syncHead(doc) {
  const pairs = [
    ['meta[name="description"]', 'content'],
    ['link[rel="canonical"]', 'href'],
    ['meta[property="og:title"]', 'content'],
    ['meta[property="og:description"]', 'content'],
  ];
  for (const [sel, attr] of pairs) {
    const src = doc.querySelector(sel);
    const dst = document.querySelector(sel);
    if (src && dst) dst.setAttribute(attr, src.getAttribute(attr));
  }
}
