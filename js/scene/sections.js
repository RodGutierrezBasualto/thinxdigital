// Section geometry cache.
// Every scroll section in the DOM carries data-scene="<key>" (and data-bg="<colour key>"); the page is identified by
// main[data-page]. We cache each section's document top (T), height (H) and background colour, in DOM order, and
// expose helpers that turn the contract's progress definitions into document scroll positions, so the choreography
// can say "white reveal from hero p .05 to .35" without any hard-coded pixel offsets.
//
//   enter = (y - (T - V)) / V          top edge travelling from viewport bottom to viewport top
//   p     = (y - T) / (H - V)          sticky range
//   leave = (y - (T + H - V)) / V      bottom edge travelling from viewport bottom to top
//
// The cache is refreshed on resize, on ScrollTrigger refresh, when the document height changes and on route:enter.

const FAR = 1e9; // a missing section behaves as if it were infinitely far down the page

export class Sections {
  constructor() {
    this.map = new Map();
    this.list = [];
    this.page = 'home';
    this.V = window.innerHeight;
    this.docH = 0;
    this.version = 0; // bumped on every refresh so dependants know to rebuild
  }

  refresh(V = this.V) {
    // Use the pinned (sticky) viewport height when there is one: it is what the DOM's section heights are built
    // from (100svh), and it doesn't change when a mobile URL bar shows or hides.
    const sticky = document.querySelector('[data-scene] > .sticky');
    this.V = (sticky && sticky.offsetHeight) || V;
    this.page = document.querySelector('main[data-page]')?.dataset.page || 'home';
    this.map.clear();
    this.list = [];
    const sy = window.scrollY;
    for (const el of document.querySelectorAll('[data-scene]')) {
      const r = el.getBoundingClientRect();
      const s = { key: el.dataset.scene, bg: el.dataset.bg || null, T: r.top + sy, H: r.height, el };
      if (!this.map.has(s.key)) this.map.set(s.key, s);
      this.list.push(s);
    }
    this.list.sort((a, b) => a.T - b.T);
    this.docH = document.documentElement.scrollHeight;
    this.version++;
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    return this.map.get(key) || { T: FAR, H: this.V * 2 };
  }

  /** Sticky progress of `key` at scroll `y` (0…1). */
  p(key, y) {
    const { T, H } = this.get(key);
    const r = (y - T) / Math.max(H - this.V, 1);
    return r < 0 ? 0 : r > 1 ? 1 : r;
  }

  /** Document scroll position at which the sticky progress of `key` equals `p`. */
  pAt(key, p) {
    const { T, H } = this.get(key);
    return T + p * Math.max(H - this.V, 1);
  }

  /** Scroll position at which the section's top edge has travelled `e` viewports up from the viewport bottom. */
  enterAt(key, e) {
    return this.get(key).T - this.V + e * this.V;
  }

  /** Scroll position at which the section's bottom edge has travelled `l` viewports up from the viewport bottom. */
  leaveAt(key, l) {
    const { T, H } = this.get(key);
    return T + H - this.V + l * this.V;
  }
}
