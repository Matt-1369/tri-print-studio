// roto.js: redraws a prepped Seedance clip (vector ink layers from tools/roto_prep.py)
// as riso ink passes, with line boil between drawings.
//   drawing = { t, fg: {inks, lines}, bg: {inks, lines}, sil: [polys] }
import { noise2, W, H, STYLE } from "./core.js";
import { INK, LOOK, mixPaper } from "./riso.js";

// how each classified region prints. [ink hex, density, screen angle]
const RISO_MAP = {
  skin: [INK.pink, 0.2, 75],
  skinshade: [INK.pink, 0.2, 75],
  light: [null],
  glow: [INK.blue, 0.3, 30],
  grey: [INK.black, 0.16, 45],
  dark: [INK.black, 0.55, 45],
  black: [INK.black, 1, 0],
  yellow: [INK.yellow, 1, 0],
  pink: [INK.pink, 1, 0],
  blue: [INK.blue, 1, 0],
  red: [INK.red, 1, 0],
  green: [INK.green, 1, 0],
  lines: [INK.black, 1, 0],
};
// A: precise print. flat pale skin, fine dots only in shadows
const FINE_MAP = { ...RISO_MAP, skin: ["#FBD9E2", 1, 0], skinshade: [INK.pink, 0.3, 75], light: [null], grey: [INK.black, 0.13, 45], dark: [INK.black, 0.5, 45] };
// B: clean cel. every region a flat solid colour, crisp black lines
const CEL_MAP = { ...RISO_MAP, skin: ["#FCE3DA", 1, 0], skinshade: ["#F2B7B0", 1, 0], light: ["#ECE8E1", 1, 0], grey: ["#C9C4BD", 1, 0], dark: ["#66636B", 1, 0] };
export const DEFAULT_INKMAP = STYLE === "fine" ? FINE_MAP : STYLE === "cel" ? CEL_MAP : RISO_MAP;
export const BG_INKMAP = { ...DEFAULT_INKMAP, grey: [null], dark: [null], skin: [null], skinshade: [null], light: [null] };
const ORDER = ["light", "skin", "skinshade", "grey", "red", "green", "yellow", "pink", "blue", "glow", "dark", "black", "lines"];
// bright blue light (the wireframe twin) always prints as a quad grid
const GLOW_GRID = { glow: { ink: INK.blue, cell: 16, width: 1.5, angle: 0.1 } };


export class Roto {
  constructor(base) { this.base = base; this.cache = new Map(); this.meta = null; this.maxCache = 24; }
  async load() {
    this.meta = await (await fetch(this.base + "/meta.json")).json();
    const mk = await fetch(this.base + "/markers.json");
    this.markers = mk.ok ? await mk.json() : null;
    return this;
  }
  // mocap marker positions for the drawing at localT, mapped to canvas
  markersAt(localT, tf) {
    if (!this.markers) return [];
    const i = this.indexAt(localT), pts = this.markers.pts[Math.min(i, this.markers.pts.length - 1)] || [];
    const [a, b, c, d, e, f] = tf;
    return pts.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  }
  get duration() { return this.meta.drawings * this.meta.every / this.meta.fps; }
  indexAt(localT) {
    const m = this.meta;
    return Math.max(0, Math.min(m.drawings - 1, Math.floor(localT * m.fps / m.every + 1e-6)));
  }
  async get(i) {
    if (!this.cache.has(i)) {
      const d = await (await fetch(`${this.base}/d_${String(i).padStart(5, "0")}.json`)).json();
      this.cache.set(i, d);
      if (this.cache.size > this.maxCache) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(i);
  }
  path(polys, tf, boilSeed, boilAmp) {
    const p = new Path2D();
    const [a, b, c, d, e, f] = tf;
    for (const poly of polys) {
      const v = poly.p;
      for (let k = 0; k < v.length; k += 2) {
        let x = v[k], y = v[k + 1];
        if (boilAmp) {
          const nx = noise2(x * 0.045, y * 0.045, boilSeed), ny = noise2(x * 0.045 + 50, y * 0.045, boilSeed + 7);
          x += nx * boilAmp; y += ny * boilAmp;
        }
        const X = a * x + c * y + e, Y = b * x + d * y + f;
        if (k === 0) p.moveTo(X, Y); else p.lineTo(X, Y);
      }
      p.closePath();
    }
    return p;
  }
  // opts: tf source->canvas affine, inkmap/bgInkmap overrides, misreg {ink:[dx,dy]}, boil,
  //       bg: false to skip background, outline width (px), outlineInk
  async draw(ctx, riso, localT, opts = {}) {
    const idx = this.indexAt(localT);
    const d = await this.get(idx);
    const tf = opts.tf || [1.5, 0, 0, 1.5, 0, 0];
    const boil = (opts.boil ?? 0.7) * (STYLE === "riso" ? 1 : 0.6);
    const seed = idx * 13;
    const passes = (part, map) => {
      const P = d[part]; if (!P) return;
      for (const name of ORDER) {
        const polys = name === "lines" ? P.lines : P.inks[name];
        if (!polys || !polys.length) continue;
        const spec = map[name]; if (!spec || !spec[0]) continue;
        const path = this.path(polys, tf, seed + name.length, boil);
        const off = (opts.misreg && opts.misreg[name]) || [0, 0];
        // cel look: halftone tints become flat colours mixed with the paper
        let hex = spec[0], dens = spec[1];
        if (STYLE === "cel" && dens < 0.97) { hex = mixPaper(hex, dens); dens = 1; }
        riso.ink(ctx, hex, (g) => g.fill(path, "evenodd"), { density: dens, angle: spec[2], offset: off, grain: name === "lines" ? 0.2 : 0.4 });
        const grids = { ...GLOW_GRID, ...(part === "fg" ? opts.gridInks : opts.bgGridInks) };
        const gi = grids[name];
        if (gi) {
          const cell = gi.cell || 22, ang = gi.angle || 0;
          riso.ink(ctx, gi.ink || spec[0], (g) => {
            g.save(); g.clip(path, "evenodd"); g.translate(W / 2, H / 2); g.rotate(ang); g.lineWidth = gi.width || 2; g.beginPath();
            for (let x = -W; x <= W; x += cell) { g.moveTo(x, -W); g.lineTo(x, W); }
            for (let y = -W; y <= W; y += cell) { g.moveTo(-W, y); g.lineTo(W, y); }
            g.stroke(); g.restore();
          }, { grain: 0.2, blend: gi.blend || "multiply" });
        }
      }
    };
    if (opts.bg !== false) passes("bg", { ...BG_INKMAP, ...(opts.bgInkmap || {}) });
    if (opts.between) await opts.between(ctx);
    if (d.sil && d.sil.length) {
      const sil = this.path(d.sil, tf, seed + 99, boil);
      if (opts.bg !== false || opts.knockout) {
        // knock the background out under the character: repaint paper inside the silhouette
        ctx.save(); ctx.clip(sil, "evenodd"); riso.drawPaper(ctx); ctx.restore();
      }
      passes("fg", { ...DEFAULT_INKMAP, ...(opts.inkmap || {}) });
      const ow = opts.outline ?? 3.2;
      if (ow > 0) {
        riso.ink(ctx, opts.outlineInk || INK.black, (g) => { g.lineWidth = STYLE === "riso" ? ow : ow * 0.8; g.lineJoin = "round"; g.stroke(sil); }, { grain: 0.25 });
      }
    } else {
      passes("fg", { ...DEFAULT_INKMAP, ...(opts.inkmap || {}) });
    }
    return d;
  }
}

// small paper holes inside black fills = mocap markers. returns canvas-space points.
export function markerPoints(d, tf, maxArea = 160) {
  const out = [];
  const polys = d && d.fg && d.fg.inks && d.fg.inks.black;
  if (!polys) return out;
  const [a, b, c, dd, e, f] = tf;
  for (const poly of polys) {
    if (!poly.h) continue;
    const v = poly.p; let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < v.length; k += 2) { const x0 = v[k], y0 = v[k + 1], x1 = v[(k + 2) % v.length], y1 = v[(k + 3) % v.length]; const cr = x0 * y1 - x1 * y0; A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr; }
    A /= 2; if (Math.abs(A) < 2 || Math.abs(A) > maxArea) continue;
    cx /= 6 * A; cy /= 6 * A;
    out.push([a * cx + c * cy + e, b * cx + dd * cy + f]);
  }
  return out;
}
