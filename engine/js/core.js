// core.js: canvas size, math, seeded randomness, noise, song timing.
export const W = 1920, H = 1080, FPS = 24;
// look: "riso" (v3), "fine" (A: precise print), "cel" (B: clean flat colour)
export const STYLE = (typeof location !== "undefined" && new URLSearchParams(location.search).get("style")) || "riso";

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ease = {
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  step: (t, n) => Math.floor(t * n) / n,
};

// mulberry32
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(x, y = 0, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise1(x, s = 0) {
  const i = Math.floor(x), f = x - i, u = smooth(f);
  return lerp(hash(i, 0, s), hash(i + 1, 0, s), u) * 2 - 1;
}
export function noise2(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = smooth(fx), uy = smooth(fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

// ---- song timing -------------------------------------------------------------
export const SONG = { loaded: false };
export async function loadSong(url) {
  const j = await (await fetch(url)).json();
  Object.assign(SONG, j, { loaded: true });
  SONG.beatTimes = j.beats.map((b) => b.t);
  return SONG;
}
// index of last beat <= t (binary search)
export function beatIndex(t) {
  const b = SONG.beatTimes; let lo = 0, hi = b.length - 1;
  if (t < b[0]) return -1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; }
  return lo;
}
export function beatInfo(t) {
  const i = beatIndex(t);
  if (i < 0) return { i: -1, bar: -1, pos: 0, phase: t / (SONG.bar_sec / 4), since: t, t0: 0 };
  const bt = SONG.beatTimes, per = SONG.bar_sec / 4;
  const t0 = bt[i], t1 = bt[i + 1] ?? t0 + per;
  return { i, bar: SONG.beats[i].bar, pos: SONG.beats[i].pos, phase: (t - t0) / (t1 - t0), since: t - t0, t0 };
}
// exponential kick pulse, 1 on the beat decaying over `decay` seconds; `every` = 1 (beats) or 4 (bars)
export function pulse(t, decay = 0.18, every = 1) {
  const b = beatInfo(t);
  if (b.i < 0) return 0;
  if (every > 1 && b.pos % every !== 0) {
    // time since last qualifying beat
    let k = b.i; while (k >= 0 && SONG.beats[k].pos % every !== 0) k--;
    if (k < 0) return 0;
    return Math.exp(-(t - SONG.beatTimes[k]) / decay);
  }
  return Math.exp(-b.since / decay);
}
export const barTime = (bar) => { const k = SONG.beats.findIndex((b) => b.bar === bar && b.pos === 0); return k < 0 ? null : SONG.beatTimes[k]; };
export function lineAt(t) { return SONG.lines.find((l) => t >= l.s - 0.05 && t <= l.e + 0.05); }
export function wordsIn(line) { return SONG.words.filter((w) => w.line === line.i); }
