// riso.js: paper stock + riso-style ink layers (multiply overprint, misregistration,
// halftone tints, uneven ink coverage).
import { W, H, rng, noise2, STYLE } from "./core.js";
export function mixPaper(hex, k) {
  const p = [0xF3, 0xEE, 0xE3], c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return "#" + c.map((v, i) => Math.round(p[i] + (v - p[i]) * k).toString(16).padStart(2, "0")).join("");
}
export const LOOK = { riso: { grain: 1, cell: 7, misreg: 1 }, fine: { grain: 0.35, cell: 4.5, misreg: 0.5 }, cel: { grain: 0.12, cell: 4.5, misreg: 0 } }[STYLE] || { grain: 1, cell: 7, misreg: 1 };

export const INK = {
  paper: "#F3EEE3",
  black: "#1B1A1F",
  yellow: "#F8CF00",
  pink: "#FF48B0",
  blue: "#2F5BFF",
  red: "#F15060",
  green: "#00A95C",
  teal: "#00838A",
  orange: "#FF6C2F",
  purple: "#765BA7",
};

function canvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// ---- paper -------------------------------------------------------------------
export function makePaper(seed = 7, base = INK.paper) {
  const c = canvas(), g = c.getContext("2d");
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // low-frequency mottling
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = r() * H, rad = 120 + r() * 520;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    gr.addColorStop(0, dark ? "rgba(120,100,70,0.035)" : "rgba(255,255,250,0.05)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibers
  g.lineCap = "round";
  for (let i = 0; i < 4200; i++) {
    const x = r() * W, y = r() * H, len = 6 + r() * 34, a = r() * Math.PI * 2;
    g.strokeStyle = r() < 0.6 ? `rgba(110,95,70,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.08 + r() * 0.1})`;
    g.lineWidth = 0.4 + r() * 0.9;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // speckles
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(60,50,40,${0.05 + r() * 0.12})`;
    g.fillRect(r() * W, r() * H, 0.6 + r() * 1.4, 0.6 + r() * 1.4);
  }
  // fine grain
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(id, 0, 0);
  return c;
}

// speckle mask used to knock holes in ink (uneven coverage). white = remove ink.
function makeInkGrain(seed) {
  const c = canvas(), g = c.getContext("2d");
  const id = g.createImageData(W, H), d = id.data, r = rng(seed);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lf = noise2(x / 90, y / 90, seed) * 0.5 + noise2(x / 17, y / 17, seed + 1) * 0.35;
      const v = lf + (r() - 0.5) * 0.9;
      const a = v > 0.55 ? Math.min(1, (v - 0.55) * 2.2) : 0;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

const patternCache = new Map();
export function halftonePattern(ctx, hex, density, angleDeg, cell = 7) {
  const key = `${hex}|${density.toFixed(2)}|${angleDeg}|${cell}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const size = cell;
  const c = canvas(size, size), g = c.getContext("2d");
  g.fillStyle = hex;
  const rad = Math.sqrt(density / Math.PI) * size * 1.02;
  g.beginPath(); g.arc(size / 2, size / 2, Math.min(rad, size * 0.72), 0, Math.PI * 2); g.fill();
  if (rad > size * 0.5) { // corners join at high density
    for (const [cx, cy] of [[0, 0], [size, 0], [0, size], [size, size]]) {
      g.beginPath(); g.arc(cx, cy, rad - size * 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  const p = ctx.createPattern(c, "repeat");
  p.setTransform(new DOMMatrix().rotateSelf(angleDeg));
  patternCache.set(key, p);
  return p;
}

export class Riso {
  constructor() {
    this.layer = canvas(); this.lg = this.layer.getContext("2d");
    this.grains = [makeInkGrain(11), makeInkGrain(23)];
    this.paper = makePaper(7);
    this.frameSeed = 0;
  }
  // draw one ink pass. fillFn(g) must fill shapes on g (fillStyle is prepared).
  // opts: density (0..1, <0.97 = halftone), angle, cell, offset [dx,dy], grain (0..1), alpha
  ink(ctx, hex, fillFn, opts = {}) {
    const { density = 1, angle = 45, cell = LOOK.cell, offset = [0, 0], alpha = 1, blend = this.defaultBlend || "multiply" } = opts;
    const grain = (opts.grain ?? 0.5) * LOOK.grain;
    const g = this.lg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, W, H);
    // cel look: tints print as flat colour (ink mixed into paper) instead of dots
    g.fillStyle = density >= 0.97 ? hex : STYLE === "cel" ? mixPaper(hex, density) : halftonePattern(g, hex, density, angle, cell);
    g.strokeStyle = g.fillStyle;
    fillFn(g);
    if (grain > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "destination-out";
      g.globalAlpha = grain;
      const gr = this.grains[this.frameSeed % 2];
      const ox = (this.frameSeed * 131) % 400, oy = (this.frameSeed * 71) % 300;
      g.drawImage(gr, -ox, -oy); g.drawImage(gr, W - ox, -oy); g.drawImage(gr, -ox, H - oy); g.drawImage(gr, W - ox, H - oy);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = blend;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.layer, offset[0], offset[1]);
    ctx.restore();
  }
  drawPaper(ctx, flicker = 0) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.paper, 0, 0);
    if (flicker) { ctx.fillStyle = flicker > 0 ? `rgba(255,255,255,${flicker})` : `rgba(0,0,0,${-flicker})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }
}
