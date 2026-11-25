// Small math + easing helpers shared by the scene modules (no three.js dependency).

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? (v >= b ? 1 : 0) : (v - a) / (b - a));
/** 0→1 ramp of `v` between `a` and `b` (clamped). */
export const ramp = (v, a, b) => clamp(invLerp(a, b, v));
export const smooth = (t) => t * t * (3 - 2 * t);

export const easeInQuad = (t) => t * t;
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInCubic = (t) => t * t * t;
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuart = (t) => 1 - (1 - t) ** 4;
/** Ease out with a small overshoot (a "pop"). */
export const easeOutBack = (t, k = 1.9) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2);

/**
 * "Snap out": a very steep start that then creeps into place (a cubic bezier whose x(s) = s³, so it has a closed form).
 * Used for the intro title lines and the orbs settling out of the intro ring.
 */
export function easeSnapOut(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const s = Math.cbrt(x);
  const m = 1 - s;
  return 3 * m * m * s + 2.7 * m * s * s + s * s * s;
}

/** Deterministic PRNG so formations look the same on every load. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Staggered local progress: item `i` of `n` starts after a delay proportional to its rank and all items finish at t = 1.
 * `spread` is the fraction of the range used for staggering.
 */
export function stagger(t, i, n, spread = 0.35) {
  const d = n > 1 ? (i / (n - 1)) * spread : 0;
  return clamp((t - d) / (1 - spread));
}
