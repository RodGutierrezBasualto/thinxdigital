/* ==========================================================================
   app.js — DOM/UI entry point (agent B).

   Direct load: loader (waits for scene:ready, 7 s timeout) → app:intro.
   Afterwards the router swaps <main> between pages; each page is built by
   enterPage() and torn down by leavePage() (scroll animations, pointer details,
   the contact form).
   ========================================================================== */
import { html, main, prepareLines, scrollToHash, targetY } from './ui/core.js';
import { runLoader, syncSceneClass } from './ui/loader.js';
import { initHeader, introHeader } from './ui/header.js';
import { initMenu } from './ui/menu.js';
import { initRouter } from './ui/router.js';
import { buildPage, destroyPage, introPage } from './ui/sections.js';
import { initInteractions } from './ui/interactions.js';
import { initForms } from './ui/forms.js';

html.classList.add('app');
const startHash = location.hash;
window.scrollTo(0, 0);
syncSceneClass();

/* ---------- page lifecycle ---------- */
let cleanups = [];

function enterPage(m) {
  prepareLines(m);
  buildPage(m);
  cleanups = [initInteractions(m), initForms(m)];
}

function leavePage() {
  cleanups.forEach((fn) => fn?.());
  cleanups = [];
  destroyPage();
}

/* ---------- boot ---------- */
prepareLines(document.querySelector('.hdr') || document);
const menu = initMenu();
let header = null;

const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
fontsReady.then(() => {
  enterPage(main());
  header = initHeader();
  initRouter({ menu, header, leavePage, enterPage, introPage });
});

runLoader({
  beforeExit: () => {
    // deep link (e.g. /services/#paid-social): land there before the curtain opens
    if (startHash) fontsReady.then(() => { if (targetY(startHash) != null) scrollToHash(startHash, { immediate: true }); });
  },
  onIntro: () => {
    introHeader();
    introPage(main());
    html.classList.add('is-ready');
  },
});
