// fx.js: reusable printed motion-graphics pieces.
import { W, H, clamp, inv, lerp, ease, rng, noise1, noise2 } from "./core.js";
import { INK } from "./riso.js";
import { FONTS, inkText } from "./type.js";

// source->canvas affine for a 1280x720 roto clip with zoom z around focus (fx,fy)
export function camTf(z = 1, fx = 640, fy = 360, cx = W / 2, cy = H / 2, rot = 0) {
  const s = 1.5 * z, c = Math.cos(rot) * s, n = Math.sin(rot) * s;
  return [c, n, -n, c, cx - (c * fx - n * fy), cy - (n * fx + c * fy)];
}

// hand-drawn wobbly line
export function wobbleLine(g, x0, y0, x1, y1, seed = 1, amp = 1.2, steps = 8) {
  g.moveTo(x0 + noise1(seed, 3) * amp, y0 + noise1(seed, 4) * amp);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    g.lineTo(lerp(x0, x1, k) + noise1(seed + k * 3, 1) * amp, lerp(y0, y1, k) + noise1(seed + k * 3, 2) * amp);
  }
}

// screen-space quad grid; reveal(x,y) -> 0..1 controls which cells are drawn
export function quadGrid(ctx, riso, { cell = 64, ink = INK.blue, width = 2, reveal = () => 1, seed = 1, offset = [0, 0], box = [0, 0, W, H], alpha = 1 } = {}) {
  const [bx, by, bw, bh] = box;
  riso.ink(ctx, ink, (g) => {
    g.lineWidth = width; g.lineCap = "round"; g.beginPath();
    for (let x = bx; x <= bx + bw + 0.1; x += cell) for (let y = by; y < by + bh; y += cell) {
      const r = reveal(x, y + cell / 2); if (r <= 0) continue;
      wobbleLine(g, x, y, x, y + cell * Math.min(1, r), seed + x * 0.1 + y * 0.013, 0.9, 3);
    }
    for (let y = by; y <= by + bh + 0.1; y += cell) for (let x = bx; x < bx + bw; x += cell) {
      const r = reveal(x + cell / 2, y); if (r <= 0) continue;
      wobbleLine(g, x, y, x + cell * Math.min(1, r), y, seed + y * 0.1 + x * 0.017, 0.9, 3);
    }
    g.stroke();
  }, { grain: 0.25, offset, alpha });
}

// comic burst polygon
export function burstPath(g, cx, cy, r0, r1, spikes = 14, rot = 0, seed = 1) {
  const R = rng(seed);
  g.moveTo(cx + Math.cos(rot) * r1, cy + Math.sin(rot) * r1);
  for (let i = 0; i < spikes * 2; i++) {
    const a = rot + (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? r1 * (0.85 + R() * 0.3) : r0 * (0.9 + R() * 0.2);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

// radiating rays behind a stage (K-pop sunburst)
export function rays(ctx, riso, cx, cy, n, rot, ink, density = 1) {
  riso.ink(ctx, ink, (g) => {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = rot + i / n * Math.PI * 2, a1 = a0 + Math.PI / n;
      g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * 3000, cy + Math.sin(a0) * 3000); g.lineTo(cx + Math.cos(a1) * 3000, cy + Math.sin(a1) * 3000); g.closePath();
    }
    g.fill();
  }, { density, angle: 30, grain: 0.35 });
}

// jagged paper tear edge (vertical, moving left->right). returns Path2D covering the revealed side
export function tearPath(x, seed = 3, amp = 26) {
  const p = new Path2D();
  p.moveTo(-10, -10); p.lineTo(x + noise1(seed, 0) * amp, -10);
  for (let y = 0; y <= H + 20; y += 18) p.lineTo(x + noise1(seed + y * 0.05, 1) * amp + (rng(seed + y)() - 0.5) * 10, y);
  p.lineTo(-10, H + 10); p.closePath();
  return p;
}

// the Tripo-style prompt box
export function promptBox(ctx, riso, { x, y, w, h, text, n = text.length, cursor = true, label = "Describe your 3D model", button = true, size = 44, alpha = 1, generating = 0 }) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#FBF8F1";
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.restore();
  riso.ink(ctx, INK.black, (g) => { g.lineWidth = 4; g.beginPath(); g.roundRect(x, y, w, h, 18); g.stroke(); }, { alpha, grain: 0.25 });
  inkText(ctx, riso, label, x + 34, y + 50, 32, FONTS.mono, INK.black, { density: 0.45, alpha });
  const shown = "> " + text.slice(0, Math.floor(n));
  const g = riso.lg; g.font = `600 ${size}px "${FONTS.mono}"`;
  const maxW = w - 68 - (button ? 300 : 0);
  const rows = [""];
  for (const wd of shown.split(" ")) { const tr = rows[rows.length - 1] ? rows[rows.length - 1] + " " + wd : wd; if (g.measureText(tr).width > maxW && rows[rows.length - 1]) rows.push(wd); else rows[rows.length - 1] = tr; }
  const lh = size * 1.2, y0 = y + h / 2 + size * 0.45 - lh * (rows.length - 1) / 2 + 12;
  rows.forEach((r, i) => inkText(ctx, riso, r, x + 34, y0 + i * lh, size, FONTS.mono, INK.black, { weight: "600", alpha }));
  if (cursor) {
    const cw = g.measureText(rows[rows.length - 1]).width, cy = y0 + (rows.length - 1) * lh;
    riso.ink(ctx, INK.blue, (gg) => gg.fillRect(x + 36 + cw, cy - size * 0.8, size * 0.5, size * 1.0), { alpha });
  }
  if (button) {
    const bw = 280, bh = 80, bx = x + w - bw - 26, by = y + h - bh - 22;
    riso.ink(ctx, INK.yellow, (gg) => { gg.beginPath(); gg.roundRect(bx, by, bw, bh, 40); gg.fill(); }, { alpha });
    riso.ink(ctx, INK.black, (gg) => { gg.lineWidth = 3; gg.beginPath(); gg.roundRect(bx, by, bw, bh, 40); gg.stroke(); }, { alpha, grain: 0.2 });
    inkText(ctx, riso, generating > 0 ? "GENERATING…" : "GENERATE ✦", bx + bw / 2, by + bh / 2 + 12, 34, FONTS.mono, INK.black, { align: "center", weight: "800", alpha });
    if (generating > 0) riso.ink(ctx, INK.blue, (gg) => gg.fillRect(bx + 8, by + bh - 12, (bw - 16) * generating, 6), { alpha });
  }
}

// hand-written annotation with an arrow
export function note(ctx, riso, text, x, y, tx, ty, { ink = INK.blue, size = 46, alpha = 1, seed = 2, blend = "multiply" } = {}) {
  size = Math.round(size * 1.3);                       // phone-legible
  const mg = riso.lg; mg.font = `700 ${size}px "${FONTS.hand}"`;
  const tw = mg.measureText(text).width;
  if (x + tw > W - 36) x = Math.max(36, W - 36 - tw);
  if (y - size * 0.8 < 36) y = 36 + size * 0.8;
  inkText(ctx, riso, text, x, y, size, FONTS.hand, ink, { weight: "700", alpha, blend });
  riso.ink(ctx, ink, (g) => {
    g.lineWidth = 4.5; g.lineCap = "round"; g.beginPath();
    const mx = (x + tx) / 2 + 40, my = (y + ty) / 2 - 30;
    g.moveTo(x - 10, y - size * 0.3); g.quadraticCurveTo(mx, my, tx, ty);
    const a = Math.atan2(ty - my, tx - mx);
    g.moveTo(tx, ty); g.lineTo(tx - Math.cos(a - 0.5) * 24, ty - Math.sin(a - 0.5) * 24);
    g.moveTo(tx, ty); g.lineTo(tx - Math.cos(a + 0.5) * 24, ty - Math.sin(a + 0.5) * 24);
    g.stroke();
  }, { alpha, grain: 0.2, blend });
}

// fill the whole frame with an ink (solid or tint)
export function flood(ctx, riso, ink, density = 1, alpha = 1) {
  riso.ink(ctx, ink, (g) => g.fillRect(0, 0, W, H), { density, alpha, grain: 0.4 });
}

// mono label box like a UI tag
export function tag(ctx, riso, text, x, y, { size = 26, ink = INK.black, bg = INK.yellow, alpha = 1, fixed = false, opaque = false } = {}) {
  if (!fixed) size = Math.max(40, Math.round(size * 1.35));   // phone-legible
  const g = riso.lg; g.font = `700 ${size}px "${FONTS.mono}"`;
  let w = g.measureText(text).width + size;
  if (w > W - 80) { size = Math.floor(size * (W - 80) / w); g.font = `700 ${size}px "${FONTS.mono}"`; w = g.measureText(text).width + size; }
  if (x + w > W - 40) x = Math.max(40, W - 40 - w);
  riso.ink(ctx, bg, (gg) => gg.fillRect(x, y - size * 0.95, w, size * 1.35), { alpha, blend: opaque ? "source-over" : undefined });
  inkText(ctx, riso, text, x + size / 2, y, size, FONTS.mono, ink, { weight: "700", alpha, blend: opaque || ink === INK.paper ? "source-over" : "multiply" });
  return w;
}
