// type.js: lyric tokens with sung timing + the three lyric layouts (BIG / MID / SUB).
import { W, H, SONG, clamp, ease, inv, lerp, rng } from "./core.js";
import { INK } from "./riso.js";

export const FONTS = {
  display: "Anton",
  wide: "Archivo Black",
  mono: "JetBrains Mono",
  serif: "Noto Serif Display",
  hand: "Caveat",
};

export async function loadFonts(base) {
  const specs = [
    ["Anton", "Anton-Regular.ttf", {}],
    ["Archivo Black", "ArchivoBlack-Regular.ttf", {}],
    ["JetBrains Mono", "JetBrainsMono[wght].ttf", { weight: "100 800" }],
    ["Noto Serif Display", "NotoSerifDisplay[wdth,wght].ttf", { weight: "100 900", stretch: "62.5% 100%" }],
    ["Caveat", "Caveat[wght].ttf", { weight: "400 700" }],
  ];
  for (const [fam, file, desc] of specs) {
    const f = new FontFace(fam, `url(${base}/${encodeURIComponent(file)})`, desc);
    await f.load();
    document.fonts.add(f);
  }
}

// ---- tokens --------------------------------------------------------------------
const norm = (s) => s.replace(/-/g, " ").toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter((w) => w.replace(/'/g, ""));

// display overrides (same token count as the sung line). "+x" glues to the previous token.
const DISPLAY = {
  4: ["TRIPO-SR,", "PLEASE", "DON'T", "EAT", "ME", "ALIVE"],
  5: ["I'M", "UPPING", "MY", "POLY(DOOM)"],
  16: ["I'M", "UPPING", "MY", "POLY(DOOM)"],
  27: ["I'M", "UPPING", "MY", "POLY(DOOM)"],
  39: ["I'M", "UPPING", "MY", "POLY(DOOM)"],
  19: ["GTA", "VI", "IS", "COMING", "SOON"],
  20: ["1", "+E", "+30", "QUADS", "A", "SECOND"],
  21: ["SHOULD'VE", "HIT", "CTRL+S,", "WE", "RECKONED"],
  29: ["RETOPO", "GUYS", "ON", "PTO"],
};

let TOKENS = null;
export function lineTokens(line) {
  if (!TOKENS) buildTokens();
  return TOKENS[line.i];
}
function buildTokens() {
  TOKENS = {};
  for (const line of SONG.lines) {
    const words = SONG.words.filter((w) => w.line === line.i);
    const orig = line.text.split(/\s+/);
    const toks = [];
    let wi = 0;
    for (const o of orig) {
      const k = norm(o).length;
      const ws = words.slice(wi, wi + Math.max(1, k));
      wi += k;
      if (!ws.length) continue;
      toks.push({ text: o.toUpperCase(), s: ws[0].s, e: ws[ws.length - 1].e });
    }
    const ov = DISPLAY[line.i];
    if (ov && ov.length === toks.length) ov.forEach((d, j) => { toks[j].text = d.replace(/^\+/, ""); toks[j].glue = d.startsWith("+"); });
    // merge glued tokens
    const merged = [];
    for (const tk of toks) { if (tk.glue && merged.length) { const p = merged[merged.length - 1]; p.text += tk.text; p.e = tk.e; } else merged.push({ ...tk }); }
    // make sure tokens never start before the line and hold at least 60 ms
    for (let j = 0; j < merged.length; j++) { merged[j].s = Math.max(merged[j].s, line.s - 0.02); if (merged[j].e < merged[j].s + 0.06) merged[j].e = merged[j].s + 0.06; }
    TOKENS[line.i] = merged;
  }
}

export const KEYWORDS = new Set(["POLY(DOOM)", "FOOM", "QUADS", "QUADS?", "TRIPO", "TRIPO-SR,", "DONUT", "DONUT'S", "SINGULARITY'S", "BOOM", "1E30", "CTRL+S,", "PROMPT", "PROMPT?", "BLOOM", "N-GONS'", "SUBDIVISION", "CORNELL", "UTAH", "GTA", "VI"]);

// ---- drawing helpers --------------------------------------------------------------
export function fitFont(g, text, family, maxW, maxH, weight = "") {
  let size = maxH;
  g.font = `${weight} ${size}px "${family}"`.trim();
  const w = g.measureText(text).width;
  if (w > maxW) size = size * maxW / w;
  return size;
}

// ink text: prints text via riso.ink so it gets grain + multiply
export function inkText(ctx, riso, text, x, y, size, family, hex, opts = {}) {
  const { stretch = "normal", spacing = 0, align = "left", baseline = "alphabetic", offset = [0, 0], sx = 1, sy = 1, rot = 0, weight = "", stroke = 0, density = 1, angle = 45, grain = 0.35, blend = riso.defaultBlend || "multiply", alpha = 1 } = opts;
  riso.ink(ctx, hex, (g) => {
    g.save();
    g.translate(x, y); g.rotate(rot); g.scale(sx, sy);
    g.font = `${weight} ${size}px "${family}"`.trim();
    g.fontStretch = stretch;
    g.letterSpacing = spacing + "px";
    g.textAlign = align; g.textBaseline = baseline;
    if (stroke) { g.lineWidth = stroke; g.lineJoin = "round"; g.strokeText(text, 0, 0); }
    else g.fillText(text, 0, 0);
    g.fontStretch = "normal";
    g.letterSpacing = "0px";
    g.restore();
  }, { offset, density, angle, grain, blend, alpha });
}

// ---- lyric layouts -------------------------------------------------------------------
// STACK: words of the current line stacked one per row inside box {x,y,w,h}; each word
// slams in at its sung time. Used for BIG (full frame) and MID (one side).
export function drawStack(ctx, riso, t, line, box, opts = {}) {
  const toks = lineTokens(line);
  if (!toks || !toks.length) return;
  const { ink = INK.black, accent = INK.yellow, shadow = INK.pink, align = "left", out = line.e + 0.35, fadeOut = 0.12, lead = 0.04, maxRows = 7 } = opts;
  if (t < toks[0].s - lead || t > out + fadeOut) return;
  // rows: greedy pack short words together so rows read as phrases
  const rows = [];
  let cur = [];
  for (const tk of toks) {
    cur.push(tk);
    const len = cur.reduce((a, b) => a + b.text.length, 0) + cur.length - 1;
    if (len >= 5 || rows.length + 1 >= maxRows) { rows.push(cur); cur = []; }
  }
  if (cur.length) { if (rows.length && cur.reduce((a, b) => a + b.text.length, 0) <= 3) rows[rows.length - 1].push(...cur); else rows.push(cur); }
  if (opts.rows) { // fixed row count: split by character midpoints so rows balance
    const total = toks.reduce((a, b) => a + b.text.length + 1, 0);
    rows.length = 0; for (let r = 0; r < opts.rows; r++) rows.push([]);
    let pos = 0;
    for (const tk of toks) { const mid = pos + tk.text.length / 2; rows[Math.min(opts.rows - 1, Math.floor(mid / (total / opts.rows)))].push(tk); pos += tk.text.length + 1; }
    for (let r = rows.length - 1; r >= 0; r--) if (!rows[r].length) rows.splice(r, 1);
  }
  const n = rows.length;
  const g = riso.lg;
  const rowH = box.h / n;
  const fade = t > out ? 1 - (t - out) / fadeOut : 1;
  rows.forEach((row, ri) => {
    const text = row.map((r) => r.text).join(" ");
    const size = fitFont(g, text, FONTS.display, box.w, rowH * 1.12);
    const y = box.y + rowH * (ri + 1) - rowH * 0.06;
    // measure word x positions
    g.font = `${size}px "${FONTS.display}"`;
    const full = g.measureText(text).width;
    let x = align === "left" ? box.x : align === "right" ? box.x + box.w - full : box.x + (box.w - full) / 2;
    for (const tk of row) {
      const wW = g.measureText(tk.text + " ").width;
      const age = t - (tk.s - lead);
      if (age >= 0) {
        const k = clamp(age / 0.14);
        const sc = lerp(1.35, 1, ease.outBack(k));
        const kw = KEYWORDS.has(tk.text);
        const cx = x + g.measureText(tk.text).width / 2, cy = y - size * 0.36;
        const rot = (rng(Math.floor(tk.s * 100))() - 0.5) * 0.04;
        const draw = (hex, off, dens = 1) => inkText(ctx, riso, tk.text, cx, cy + size * 0.36, size, FONTS.display, hex, {
          align: "center", sx: sc, sy: sc, rot, offset: off, density: dens, alpha: fade });
        if (kw) {
          // highlighter bar behind keywords
          riso.ink(ctx, accent, (gg) => { gg.save(); gg.translate(cx, cy); gg.rotate(rot); gg.fillRect(-g.measureText(tk.text).width / 2 * sc - size * 0.06, -size * 0.30 * sc, g.measureText(tk.text).width * sc + size * 0.12, size * 0.66 * sc); gg.restore(); }, { alpha: fade, blend: "source-over" });
        }
        draw(shadow, [size * 0.035, size * 0.035], 0.55);
        draw(ink, [0, 0]);
      }
      x += wW;
    }
  });
}

// SUB: mono subtitles on a paper tab, karaoke fill. Sized for phones (a 16:9 video is ~390 pt
// wide in the X timeline); long lines wrap to two balanced rows.
export function drawSub(ctx, riso, t, line, opts = {}) {
  const toks = lineTokens(line);
  if (!toks || t < line.s - 0.3 || t > line.e + 0.5) return;
  const { y = H - 74, size = 58, ink = INK.black, tab = INK.paper, x = W / 2, maxW = W - 280 } = opts;
  const g = riso.lg;
  g.font = `700 ${size}px "${FONTS.mono}"`;
  const width = (arr) => g.measureText(arr.map((k) => k.text).join(" ")).width;
  let rows = [toks];
  if (width(toks) > maxW) {
    let best = null;
    for (let k = 1; k < toks.length; k++) {
      const a = toks.slice(0, k), b = toks.slice(k), m = Math.max(width(a), width(b));
      if (!best || m < best[0]) best = [m, [a, b]];
    }
    rows = best[1];
  }
  const lh = size * 1.22, pad = 26;
  const wMax = Math.max(...rows.map(width));
  const top = y - size * 0.95 - lh * (rows.length - 1);
  const a = clamp(inv(line.s - 0.3, line.s - 0.1, t)) * (1 - clamp(inv(line.e + 0.3, line.e + 0.5, t)));
  const bx = x - wMax / 2 - pad, bw = wMax + pad * 2, bh = size * 1.45 + lh * (rows.length - 1);
  // tab: paper-colored card with a black outline, printed (source-over so it covers)
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = tab; ctx.fillRect(bx, top, bw, bh); ctx.restore();
  riso.ink(ctx, ink, (gg) => { gg.lineWidth = 4; gg.strokeRect(bx, top, bw, bh); }, { alpha: a, grain: 0.3 });
  rows.forEach((row, ri) => {
    let xx = x - width(row) / 2;
    const yy = y - lh * (rows.length - 1 - ri);
    for (const tk of row) {
      const tw = g.measureText(tk.text + " ").width;
      const sung = t >= tk.s;
      inkText(ctx, riso, tk.text, xx, yy, size, FONTS.mono, INK.black, { weight: "700", density: sung ? 1 : 0.3, alpha: a });
      xx += tw;
    }
  });
}
