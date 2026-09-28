// studio.js: TRI · Print Studio. The Tripo H3.1 model of TRI printed live in the browser: a traced turntable
// (texture), the native quad wire and the Tripo auto-rig skinned with three.js, and a 40-beat routine cut from four
// Tripo dance presets on the final chorus.
// Reuses the MV engine (engine/js): riso inks, roto drawings, the shared cameras in tri_cam.js and tri3d.js.
import { W, H, STYLE, clamp, lerp, ease, rng } from "../engine/js/core.js";
import { Riso, INK, LOOK } from "../engine/js/riso.js";
import { Roto } from "../engine/js/roto.js";
import { loadFonts, FONTS, inkText } from "../engine/js/type.js";
import { camTf, tag } from "../engine/js/fx.js";
import { TRI_JOBS, DEMO, BEAT, CHOREO, choreoAt } from "../engine/js/tri_cam.js";
import { TRI, TRI_INKMAP, loadTri, loadChoreo, triPose, triPoseChoreo, printSkeleton, floorGrid, fmt } from "../engine/js/tri3d.js";
import { TriGL } from "../engine/js/triGL.js";

const CAM = TRI_JOBS.TRI_TURN.cam, TURN = TRI_JOBS.TRI_TURN;
const LOOP = CHOREO.beats * BEAT;           // the 40-beat routine (tri_cam.js CHOREO), 225 drawings at 12 fps
const DOWNBEAT = 0;                        // the music clip starts on a downbeat (song 151.993, the bar before the final chorus)
const YAWS = DEMO.yaws, TAU = Math.PI * 2;
const canvas = document.getElementById("c"), g = canvas.getContext("2d");
const riso = new Riso();
const music = new Audio("../song/demo_chorus_152_172.m4a");
music.preload = "auto";

const turn = new Roto("../build/roto_hq/H31_TURN");
const dance = Array.from({ length: YAWS }, (_, k) => new Roto(`../build/roto_hq/DEMO_Y${k}`));
turn.maxCache = 200; dance.forEach((d) => { d.maxCache = 100; });

// ---- state ------------------------------------------------------------------------------
const hash = new URLSearchParams(location.hash.slice(1));
const S = {
  yaw: +(hash.get("yaw") || 0.35), vyaw: 0, auto: !hash.get("yaw"), zoom: 1, layer: hash.get("layer") || "tex",
  prev: null, switchAt: 0, dancing: false, drag: null, lastInteract: 0, ready: false, printing: false,
};
const LAYERS = ["tex", "quads", "rig"];
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const turnIndex = (yaw) => ((Math.round(52.44 + (wrap(yaw - 0.35 + Math.PI) - Math.PI) * 96 / TAU) % 96) + 96) % 96;
const danceYaw = (yaw) => ((Math.round(wrap(yaw) / (TAU / YAWS)) % YAWS) + YAWS) % YAWS;

function danceState() {
  if (!S.dancing) return { on: false, pulse: 0 };
  const at = music.currentTime - DOWNBEAT;
  if (at < 0) return { on: false, pulse: 0 };
  const tau = at % LOOP, j = Math.min(DEMO.frames - 1, Math.floor(tau * 12 + 1e-6));
  return { on: true, j, beat: j / 12 / BEAT, pulse: Math.exp(-(at % BEAT) / 0.12) };
}

// ---- drawing ------------------------------------------------------------------------------
function misreg(seed) {
  const r = rng(seed * 7 + 3), m = () => [(r() - 0.5) * 3.2 * LOOK.misreg, (r() - 0.5) * 3.2 * LOOK.misreg];
  return { yellow: m(), pink: m(), blue: m(), red: m(), green: m(), skin: m() };
}
// what each layer shows at the current state; yaw snaps to what the printed drawings exist for
function readySide(yaw) {
  const k0 = danceYaw(yaw);
  if (danceReady.has(k0)) return k0;
  let best = null;
  for (const k of danceReady) { const dk = Math.min(Math.abs(k - k0), YAWS - Math.abs(k - k0)); if (best === null || dk < best[1]) best = [k, dk]; }
  return best && best[0];
}
function view(layer, d) {
  if (layer === "tex") {
    const k = d.on ? readySide(S.yaw) : null;
    if (k !== null) return { yaw: k * TAU / YAWS, key: `D${k}.${d.j}` };
    const i = turnIndex(S.yaw); return { yaw: TURN.rot(i), key: `T${i}` };
  }
  const y = Math.round(S.yaw * 180 / Math.PI) * Math.PI / 180;
  return { yaw: y, key: `${layer}${y.toFixed(3)}${d.on ? "." + d.j : ""}` };
}
async function drawLayer(ctx, layer, d, tf, zk) {
  const v = view(layer, d);
  floorGrid(ctx, riso, { cam: CAM, rot: v.yaw, tf, alpha: 0.45 });
  if (layer === "tex") {
    const k = d.on ? readySide(S.yaw) : null, live = k !== null;
    const clip = live ? dance[k] : turn, i = live ? d.j : turnIndex(S.yaw);
    await clip.draw(ctx, riso, i / 12 + 1e-4, { tf, inkmap: TRI_INKMAP, outline: 3.4, misreg: misreg(i) });
    return;
  }
  const pose = d.on ? triPoseChoreo(d.beat) : triPose();
  wire.print(ctx, riso, pose, { cam: CAM, rot: v.yaw, tf, width: lerp(0.9, 1.3, zk), alpha: layer === "rig" ? 0.45 : 1, bands: [0, 0.06, 0.16, 0.3] });
  if (layer === "rig") printSkeleton(ctx, riso, pose.bones, { cam: CAM, rot: v.yaw, tf, scale: lerp(1, 1.3, zk) });
}
function hud(ctx, d) {
  const s = TRI.stats, layer = S.layer;
  if (layer !== "tex") {
    const rows = [["TRI.glb · Tripo H3.1", ""], ["Vertices", fmt(s.verts)], ["Faces", fmt(s.faces)], ["Quads", fmt(s.quads), true], ["Triangles", fmt(s.tris)], ["Joints", String(s.joints)]];
    rows.forEach(([k, v, hot], i) => {
      const y = 58 + i * 32;
      inkText(ctx, riso, k, 44, y, 24, FONTS.mono, INK.black, { weight: i ? "400" : "700", grain: 0.2 });
      if (v) inkText(ctx, riso, v, 214, y, 24, FONTS.mono, hot ? INK.pink : INK.black, { weight: "700", grain: 0.2 });
    });
  }
  const cap = { tex: "TEXTURED 3D MODEL · TRIPO H3.1", quads: `${fmt(s.quads)} NATIVE QUADS · ${Math.round(s.quads / s.faces * 100)}%`, rig: `AUTO-RIG · ${s.joints} JOINTS` }[layer];
  tag(ctx, riso, cap, 70, H - 70, { bg: INK.yellow, size: 32 });
  if (d.on) {   // the preset carrying the most weight right now
    const top = choreoAt(d.beat).mix.reduce((a, b) => (b.w > a.w ? b : a));
    tag(ctx, riso, `DANCE_${top.clip.slice(1)} · RETARGETED ♪`, 1400, 90, { bg: INK.pink, ink: INK.paper, size: 32 });
  }
}
function vignette(ctx) {
  ctx.save();
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(40,30,20,0.16)");
  ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

let lastKey = "", busy = false, lastDraw = 0, wire = null;
async function render(now, force = false) {
  const d = danceState(), zk = clamp((S.zoom - 1) / 1.4);
  const sw = S.prev ? clamp((now - S.switchAt) / 550) : 1;
  const key = [view(S.layer, d).key, S.prev && sw < 1 ? view(S.prev, d).key + sw.toFixed(2) : "", S.zoom.toFixed(3), d.on ? d.pulse.toFixed(2) : "", STYLE].join("|");
  if (!force && key === lastKey) return;
  lastKey = key;
  const z = S.zoom * (1 + 0.035 * (d.pulse || 0));
  const tf = camTf(z, 640, lerp(380, 245, zk), W / 2, H / 2 + 20);
  riso.frameSeed = d.on ? d.j : 0;
  g.setTransform(1, 0, 0, 1, 0, 0);
  riso.drawPaper(g);
  if (S.prev && sw < 1) {                     // scan-line wipe from the old layer to the new one
    const scan = ease.inOut(sw) * (H + 60) - 30;
    g.save(); g.beginPath(); g.rect(0, scan, W, H); g.clip(); riso.drawPaper(g); await drawLayer(g, S.prev, d, tf, zk); g.restore();
    g.save(); g.beginPath(); g.rect(0, 0, W, Math.max(0, scan)); g.clip(); riso.drawPaper(g); await drawLayer(g, S.layer, d, tf, zk); g.restore();
    riso.ink(g, INK.blue, (q) => q.fillRect(0, scan - 5, W, 10), { grain: 0.2 });
  } else {
    S.prev = null;
    await drawLayer(g, S.layer, d, tf, zk);
  }
  hud(g, d);
  vignette(g);
}

function tick(nowMs) {
  requestAnimationFrame(tick);
  if (!S.ready) return;
  const dt = Math.min(0.1, (nowMs - (tick.last || nowMs)) / 1000); tick.last = nowMs;
  if (S.dancing && music.ended) setDancing(false);
  if (!S.drag) {
    if (S.auto && !(S.dancing && S.layer === "tex")) S.yaw += dt * (S.dancing ? 0.2 : 0.35);
    else { S.yaw += S.vyaw * dt; S.vyaw *= Math.pow(0.03, dt); }
    if (!S.auto && !S.dancing && nowMs - S.lastInteract > 7000) S.auto = true;
  }
  if (busy || S.printing || nowMs - lastDraw < 1000 / 24 - 2) return;
  busy = true; lastDraw = nowMs;
  render(nowMs).catch((e) => console.error(e)).finally(() => { busy = false; });
}

// ---- controls -----------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
function saveHash() { history.replaceState(null, "", `${location.search}#layer=${S.layer}&yaw=${wrap(S.yaw).toFixed(2)}`); }
function setLayer(layer) {
  if (layer === S.layer || !LAYERS.includes(layer)) return;
  S.prev = S.layer; S.layer = layer; S.switchAt = performance.now();
  document.querySelectorAll("[data-layer]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layer === layer)));
  saveHash();
}
function setDancing(on) {
  S.dancing = on;
  $("#dance").setAttribute("aria-pressed", String(on));
  $("#dance").textContent = on ? "■ Stop" : "▶ Dance";
  if (on) {
    S.vyaw = 0;
    prefetchDance(danceYaw(S.yaw));
    music.currentTime = 0; music.play().catch(() => setDancing(false));
  } else { music.pause(); }
}
document.querySelectorAll("[data-layer]").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer)));
document.querySelectorAll("[data-style]").forEach((b) => {
  b.setAttribute("aria-pressed", String(b.dataset.style === STYLE));
  b.addEventListener("click", () => { if (b.dataset.style !== STYLE) { saveHash(); const q = new URLSearchParams(location.search); q.set("style", b.dataset.style); location.search = q.toString(); } });
});
$("#dance").addEventListener("click", () => setDancing(!S.dancing));
$("#print").addEventListener("click", printFrame);
addEventListener("keydown", (e) => {
  if (e.target.closest("video")) return;
  if (e.key >= "1" && e.key <= "3") setLayer(LAYERS[+e.key - 1]);
  else if (e.key === " " && document.activeElement === document.body) { e.preventDefault(); setDancing(!S.dancing); }
  else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { S.auto = false; S.lastInteract = performance.now(); S.yaw += (e.key === "ArrowLeft" ? -1 : 1) * 0.2; saveHash(); }
});

// drag to turn, wheel or pinch to zoom
const pts = new Map();
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
  S.drag = { x: e.clientX, t: performance.now(), v: 0 }; S.auto = false; canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2) {
    const [a, b] = [...pts.values()], [pa] = [prev];
    const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
    const d1 = Math.hypot(pa[0] - other[0], pa[1] - other[1]), d2 = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d1 > 0) S.zoom = clamp(S.zoom * d2 / d1, 0.8, 2.4);
    return;
  }
  const now = performance.now(), dx = e.clientX - S.drag.x, k = 3.2 / canvas.clientWidth * Math.PI;
  S.yaw += dx * k; S.drag.v = dx * k / Math.max(0.008, (now - S.drag.t) / 1000); S.drag.x = e.clientX; S.drag.t = now;
  S.lastInteract = now;
});
const up = (e) => {
  pts.delete(e.pointerId);
  if (pts.size) return;
  if (S.drag) S.vyaw = clamp(S.drag.v, -6, 6);
  S.drag = null; S.lastInteract = performance.now(); canvas.classList.remove("dragging"); saveHash();
};
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(-e.deltaY * 0.0012), 0.8, 2.4); S.lastInteract = performance.now(); }, { passive: false });

// print this frame: the current view with a colophon strip, as a PNG
async function printFrame() {
  S.printing = true;
  while (busy) await new Promise((r) => setTimeout(r, 16));
  await render(performance.now(), true);
  const y = H - 132;
  g.save(); g.fillStyle = "#FBF8F1"; g.fillRect(0, y, W, 132); g.restore();
  riso.ink(g, INK.black, (q) => { q.fillRect(0, y, W, 5); }, { grain: 0.2 });
  inkText(g, riso, "TRI · PRINT STUDIO", 60, y + 82, 56, FONTS.display, INK.black);
  inkText(g, riso, "the idol is a Tripo model · tripo3d.ai", 560, y + 76, 34, FONTS.mono, INK.pink, { weight: "700" });
  inkText(g, riso, new Date().toISOString().slice(0, 10), W - 60, y + 76, 30, FONTS.mono, INK.black, { align: "right" });
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tri_print_${S.layer}_${Date.now()}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  lastKey = ""; S.printing = false;
}

// ---- loading ------------------------------------------------------------------------------
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
// dance drawings stream in side by side: the side you are looking at first, then outward from it
const danceReady = new Set();
// all drawings of a clip: one bundle request (all.json, gzip) when the build has one, else file by file
async function loadDrawings(roto, n, onEach = () => {}) {
  const r = await fetch(roto.base + "/all.json").catch(() => null);
  if (r && r.ok) { (await r.json()).forEach((d, i) => roto.cache.set(i, d)); for (let i = 0; i < n; i++) onEach(); return; }
  await pool([...Array(n).keys()], 8, async (i) => { await roto.get(i); onEach(); });
}
let queue = [], loading = false;
function prefetchDance(k0) {
  const dist = (a) => Math.min(Math.abs(a - k0), YAWS - Math.abs(a - k0));
  queue = [...Array(YAWS).keys()].filter((k) => !danceReady.has(k)).sort((a, b) => dist(a) - dist(b));
  if (!loading) pump();
}
async function pump() {
  loading = true;
  while (queue.length) {
    const k = queue.shift();
    if (danceReady.has(k)) continue;
    try { await dance[k].load(); await loadDrawings(dance[k], DEMO.frames); danceReady.add(k); } catch (e) { console.warn("dance side", k, e); }
  }
  loading = false;
}
async function boot() {
  const bar = $("#progress"), btn = $("#enter");
  let done = 0; const total = 96 + 4, step = () => { bar.style.width = `${Math.round(++done / total * 100)}%`; };
  await Promise.all([loadFonts("../engine/fonts").then(step), loadTri(["d04"], "h31").then(() => loadChoreo("h31")).then(step), turn.load().then(step)]); step();
  await loadDrawings(turn, 96, step);
  prefetchDance(danceYaw(S.yaw));      // stream every dance side in the background from the start
  wire = new TriGL();
  // warm-up behind the loading screen: the first routine pose binds every animation track (~0.8 s) and the first
  // WebGL passes compile their shaders; doing it here keeps the first press of Dance instant
  const warm = document.createElement("canvas"); warm.width = W; warm.height = H;
  const wg = warm.getContext("2d"), wtf = camTf(1, 640, 380);
  wire.print(wg, riso, triPoseChoreo(0), { cam: CAM, rot: 0, tf: wtf });
  printSkeleton(wg, riso, triPoseChoreo(20).bones, { cam: CAM, rot: 0, tf: wtf });
  triPose();
  S.ready = true;
  if (S.layer !== "tex") document.querySelectorAll("[data-layer]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layer === S.layer)));
  btn.disabled = false; btn.textContent = "Enter the studio";
  btn.addEventListener("click", () => { $("#intro").remove(); S.lastInteract = performance.now(); prefetchDance(danceYaw(S.yaw)); }, { once: true });
  requestAnimationFrame(tick);
}
boot().catch((e) => { console.error(e); $("#enter").textContent = "Failed to load — see console"; });
window.STUDIO = { S, render, setLayer, setDancing };
