// ─────────────────────────────────────────────────────────────────────────────
// Scene configuration: the things you are most likely to want to change.
//   • COLORS        – background gradients (top → bottom) for every `data-bg` key the DOM can use.
//   • TITLES        – the two 3D hero titles on the home page (copy + colour per line).
//   • PAGE_HERO     – which orb formation each inner page's hero shows.
//   • QUALITY       – render presets (desktop / mobile / low-end fallback).
// Scroll timings live in choreography.js (one place for every scroll range); formation shapes in formations.js.
// ─────────────────────────────────────────────────────────────────────────────

// Background gradients (sRGB hex) per `data-bg` key. Keep in sync with the CSS custom properties in css/site.css.
export const COLORS = {
  blue: { top: '#0A7FCF', bottom: '#0064A8' },
  indigo: { top: '#34379E', bottom: '#23266F' },
  white: { top: '#FFFFFF', bottom: '#ECEEF5' },
  sky: { top: '#7FC1F3', bottom: '#4FA2E4' },
  navy: { top: '#14163A', bottom: '#0A0B24' },
  black: { top: '#0D0E1A', bottom: '#020206' },
};

// Accent used for the rim of the black "portal" circle in the home dashboard (vr) section.
export const PORTAL_RIM = '#3FA2F0';

export const TITLE_COLORS = { white: '#FFFFFF', navy: '#14163A', blue: '#0072BC' };

// The two hero titles rendered inside the WebGL scene on the home page (so the glass orbs lens them).
// Title 1 sits on blue, title 2 on white.
export const TITLES = [
  [
    { text: 'PAID ADS THAT', color: TITLE_COLORS.white },
    { text: 'DRIVE REAL', color: TITLE_COLORS.white },
    { text: 'SALES & LEADS', color: TITLE_COLORS.navy },
  ],
  [
    { text: 'NOT JUST', color: TITLE_COLORS.navy },
    { text: 'CLICKS AND', color: TITLE_COLORS.navy },
    { text: 'IMPRESSIONS', color: TITLE_COLORS.blue },
  ],
];

// Orb formation shown by each inner page's `page-hero` section (see formations.js).
export const PAGE_HERO = {
  results: 'bars', // a bar chart of stacked orbs
  approach: 'constellation', // orbs joined by fine lines
  services: 'orbits', // three channels orbiting one centre
  about: 'ring', // the logo's dot ring, turning in 3D
  contact: 'scatter', // a few orbs kept to the edges, the form stays clear
};

// Font used to draw the 3D titles: FK Screamer, the site's display face (loaded by scene.js under its own family
// name, so it works whatever the CSS does). Commercial font: a web licence is needed before going live.
// "/" locally, "/thinxdigital/" on GitHub Pages (tools/publish.py sets <html data-base>; it also swaps the title font file there)
const BASE = (document.documentElement.dataset.base || '/').replace(/\/?$/, '/');
export const TITLE_FONT_URL = BASE + (document.documentElement.dataset.titleFont || 'assets/fonts/FKScreamer-Upright.woff2');

export const ASSETS = {
  hdr: BASE + 'assets/hdr/studio_small_08_1k.hdr',
  atlas: BASE + 'assets/img/ads-atlas.webp',
  atlasJson: BASE + 'assets/img/ads-atlas.json',
};

// Camera + world scale (arbitrary units; the neutral camera sits at the origin looking down -Z).
export const WORLD = {
  fov: 40, // vertical field of view in degrees
  orbCount: 24,
  titleDistance: 60, // home hero titles float this far in front of the camera
};

// Render presets. The scene picks one at boot and may step down if the frame rate stays poor.
export const QUALITY = {
  high: { dprMax: 2, post: true, msaa: 4, transmissionScale: 0.75, transmission: true, segments: 48 },
  mobile: { dprMax: 1.5, post: false, msaa: 0, transmissionScale: 0.5, transmission: true, segments: 32 },
  low: { dprMax: 1, post: false, msaa: 0, transmissionScale: 0.4, transmission: false, segments: 24 },
};
