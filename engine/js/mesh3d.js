// mesh3d.js: tiny quad-first 3D for line-art props (donut, Utah-style teapot, cubes, quad
// spheres, bunny). Projection + painter's sort, printed through riso inks.
import { W, H, STYLE } from "./core.js";
import { halftonePattern, mixPaper, LOOK } from "./riso.js";

export class Mesh {
  constructor(v, f, tag = {}) { this.v = v; this.f = f; Object.assign(this, tag); } // v: [[x,y,z]], f: [[i,j,k,(l)]]
}
export function merge(...ms) {
  const v = [], f = [], fm = [];
  ms.forEach((m, mi) => { const o = v.length; v.push(...m.v); m.f.forEach((q) => { f.push(q.map((i) => i + o)); fm.push(m.mat ?? mi); }); });
  const r = new Mesh(v, f); r.fmat = fm; return r;
}
export function torus(R = 1, r = 0.4, nu = 32, nv = 16, v0 = 0, v1 = 1) {
  const v = [], f = [];
  const nvv = v1 < 1 ? nv + 1 : nv;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nvv; j++) {
    const u = i / nu * Math.PI * 2, a = (v0 + (v1 - v0) * j / nv) * Math.PI * 2;
    v.push([(R + r * Math.cos(a)) * Math.cos(u), r * Math.sin(a), (R + r * Math.cos(a)) * Math.sin(u)]);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const i2 = (i + 1) % nu, j2 = v1 < 1 ? j + 1 : (j + 1) % nv;
    f.push([i * nvv + j, i * nvv + j2, i2 * nvv + j2, i2 * nvv + j]);
  }
  return new Mesh(v, f);
}
// surface of revolution around Y from a profile [[radius, y], ...]
export function lathe(profile, n = 24) {
  const v = [], f = [], m = profile.length;
  for (let i = 0; i < n; i++) for (const [r, y] of profile) { const a = i / n * Math.PI * 2; v.push([r * Math.cos(a), y, r * Math.sin(a)]); }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const i2 = (i + 1) % n; f.push([i * m + j, i * m + j + 1, i2 * m + j + 1, i2 * m + j]); }
  return new Mesh(v, f);
}
// tube along a curve p(s) s in [0,1] with radius rad(s)
export function tube(p, rad, ns = 16, nr = 8) {
  const v = [], f = [];
  for (let i = 0; i <= ns; i++) {
    const s = i / ns, c = p(s), d = sub(p(Math.min(1, s + 0.01)), p(Math.max(0, s - 0.01)));
    const T = norm(d), up = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const N = norm(cross(T, up)), B = cross(T, N), r = rad(s);
    for (let j = 0; j < nr; j++) { const a = j / nr * Math.PI * 2; v.push(add(c, add(scale(N, Math.cos(a) * r), scale(B, Math.sin(a) * r)))); }
  }
  for (let i = 0; i < ns; i++) for (let j = 0; j < nr; j++) { const j2 = (j + 1) % nr; f.push([i * nr + j, i * nr + j2, (i + 1) * nr + j2, (i + 1) * nr + j]); }
  return new Mesh(v, f);
}
export function box(sx = 1, sy = 1, sz = 1, n = 1) {
  // subdivided cube, n x n quads per side
  const v = [], f = [];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  for (const [a, b, c, s] of faces) {
    const o = v.length;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const p = [0, 0, 0]; p[a] = (i / n - 0.5) * 2; p[b] = (j / n - 0.5) * 2; p[c] = s;
      v.push([p[0] * sx, p[1] * sy, p[2] * sz]);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = [o + i * (n + 1) + j, o + (i + 1) * (n + 1) + j, o + (i + 1) * (n + 1) + j + 1, o + i * (n + 1) + j + 1];
      f.push(s > 0 ? q : q.reverse());
    }
  }
  return new Mesh(v, f);
}
export function quadSphere(n = 6, r = 1) {
  const m = box(1, 1, 1, n);
  m.v = m.v.map((p) => scale(norm(p), r));
  return m;
}
// Utah-style teapot from lathe + tubes (all quads)
export function teapot() {
  const body = lathe([[0.0, 0], [0.9, 0.02], [1.25, 0.25], [1.42, 0.6], [1.4, 0.95], [1.2, 1.25], [0.95, 1.4], [0.88, 1.42]], 28);
  const lid = lathe([[0.88, 1.42], [0.8, 1.52], [0.5, 1.6], [0.14, 1.66], [0.1, 1.78], [0.22, 1.86], [0.12, 1.96], [0, 1.98]], 28);
  const spout = tube((s) => [1.25 + s * 1.05, 0.55 + s * s * 0.95, 0], (s) => 0.32 - s * 0.16, 12, 10);
  const handle = tube((s) => { const a = -Math.PI * 0.45 + s * Math.PI * 0.95; return [-1.35 - Math.cos(a) * 0.55, 0.95 + Math.sin(a) * 0.5, 0]; }, () => 0.1, 14, 8);
  body.mat = 0; lid.mat = 1; spout.mat = 0; handle.mat = 0;
  return merge(body, lid, spout, handle);
}
// Blender-tutorial donut: dough torus + icing half torus + sprinkles
export function donut(seed = 3) {
  const dough = torus(1, 0.45, 36, 18); dough.mat = 0;
  const icing = torus(1, 0.48, 36, 18, -0.08, 0.58); icing.mat = 1;
  icing.v = icing.v.map(([x, y, z]) => [x, y + 0.02, z]);
  const parts = [dough, icing];
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const u = r() * Math.PI * 2, a = (0.05 + r() * 0.4) * Math.PI;
    const c = [(1 + 0.5 * Math.cos(a)) * Math.cos(u), 0.5 * Math.sin(a) + 0.02, (1 + 0.5 * Math.cos(a)) * Math.sin(u)];
    const d = norm([r() - 0.5, (r() - 0.5) * 0.3, r() - 0.5]);
    const sp = tube((t) => add(c, scale(d, (t - 0.5) * 0.16)), () => 0.03, 1, 5); sp.mat = 2 + (i % 3);
    parts.push(sp);
  }
  return merge(...parts);
}

// ---- math ----
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export function rotY(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
export function rotX(p, a) { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; }
export function rotZ(p, a) { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; }

// camera: {pos, target, fov (deg), cx, cy}
export function camBasis(cam) {
  const f = norm(sub(cam.target, cam.pos));
  const r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  return { f, r, u, k: (cam.h || H) * 0.5 / Math.tan((cam.fov || 40) * Math.PI / 360) };
}
export function projectPt(p, cam, B) {
  const d = sub(p, cam.pos); const z = dot(d, B.f);
  return [(cam.cx ?? W / 2) + dot(d, B.r) * B.k / z, (cam.cy ?? H / 2) - dot(d, B.u) * B.k / z, z];
}

// transform: xf(p) world-space mapping. Returns sorted faces with screen coords and shade.
export function prepare(mesh, xf, cam, light = norm([-0.4, 0.8, 0.5])) {
  const B = camBasis(cam);
  const wv = mesh.v.map(xf);
  const sv = wv.map((p) => projectPt(p, cam, B));
  const out = [];
  mesh.f.forEach((q, fi) => {
    const a = wv[q[0]], b = wv[q[1]], c = wv[q[2]];
    let n = norm(cross(sub(b, a), sub(c, a)));
    const ctr = q.reduce((acc, i) => add(acc, wv[i]), [0, 0, 0]).map((x) => x / q.length);
    const facing = dot(n, sub(cam.pos, ctr)) > 0;
    const z = q.reduce((acc, i) => acc + sv[i][2], 0) / q.length;
    if (q.some((i) => sv[i][2] <= 0.05)) return;
    out.push({ pts: q.map((i) => sv[i]), z, shade: Math.max(0, dot(n, light)), facing, mat: mesh.fmat ? mesh.fmat[fi] : (mesh.mat ?? 0) });
  });
  out.sort((x, y) => y.z - x.z);
  return out;
}
export function facePath(g, pts) { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }

// print a prepared mesh. mats: {matIndex: {ink, bands:[density low..high]}}; wire: {ink, width}
export function printMesh(ctx, riso, faces, { mats = {}, wire = null, cull = true, offset = [0, 0], occlude = true } = {}) {
  const vis = cull ? faces.filter((f) => f.facing) : faces;
  if (occlude) {
    // paper under the object so it reads as a solid print
    ctx.save(); ctx.fillStyle = "#F3EEE3"; ctx.globalAlpha = 1;
    ctx.beginPath(); for (const f of vis) facePath(ctx, f.pts); ctx.fill(); ctx.restore();
  }
  const groups = new Map();
  for (const f of vis) {
    const m = mats[f.mat]; if (!m) continue;
    const bands = m.bands || [1];
    const bi = Math.min(bands.length - 1, Math.floor((1 - f.shade) * bands.length));
    const key = m.ink + "|" + bands[bi];
    if (!groups.has(key)) groups.set(key, { ink: m.ink, d: bands[bi], faces: [] });
    groups.get(key).faces.push(f);
  }
  for (const gr of groups.values()) {
    if (gr.d <= 0) continue;
    riso.ink(ctx, gr.ink, (g) => { g.beginPath(); for (const f of gr.faces) facePath(g, f.pts); g.fill(); }, { density: gr.d, angle: 45, offset });
  }
  if (wire) {
    riso.ink(ctx, wire.ink, (g) => { g.lineWidth = wire.width || 1.5; g.lineJoin = "round"; g.beginPath(); for (const f of (wire.all ? faces : vis)) facePath(g, f.pts); g.stroke(); }, { grain: 0.15, offset: wire.offset || [0, 0] });
  }
}

// the real Utah teapot (Newell's Bezier patches via three.js), re-quadded
export async function utahTeapot(segments = 6) {
  const { TeapotGeometry } = await import("../vendor/TeapotGeometry.js");
  const geo = new TeapotGeometry(1, segments, true, true, true, true, true);
  const pos = geo.getAttribute("position"), idx = geo.getIndex();
  const v = [];
  for (let i = 0; i < pos.count; i++) v.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  const tris = [];
  for (let i = 0; i < idx.count; i += 3) tris.push([idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]);
  const f = [];
  for (let i = 0; i < tris.length; i++) {
    const a = tris[i], b = tris[i + 1];
    if (b) {
      const shared = a.filter((x) => b.includes(x));
      if (shared.length === 2) {
        const oa = a.find((x) => !shared.includes(x)), ob = b.find((x) => !shared.includes(x));
        // keep a's winding: oa -> s0 -> ob -> s1 where s0 follows oa in a
        const k = a.indexOf(oa), s0 = a[(k + 1) % 3], s1 = a[(k + 2) % 3];
        f.push([oa, s0, ob, s1]); i++; continue;
      }
    }
    f.push(a);
  }
  const m = new Mesh(v, f); m.mat = 0;
  return m;
}

// painter's-order print on one layer: each face gets paper, its halftone tint and its wire,
// so occluded wires stay hidden. mats: {mat: {ink, bands}}; wire: {ink, width}
export function printMeshSolid(ctx, riso, faces, { mats = {}, wire = { ink: "#2F5BFF", width: 1.4 }, cull = true, offset = [0, 0], paper = "#F3EEE3", alpha = 1 } = {}) {
  const vis = cull ? faces.filter((f) => f.facing) : faces;
  if (paper) { // knock out whatever is underneath so the object prints on clean stock
    ctx.save(); ctx.beginPath(); for (const f of vis) facePath(ctx, f.pts.map((p) => [p[0] + offset[0], p[1] + offset[1]])); ctx.clip("nonzero"); riso.drawPaper(ctx); ctx.restore();
  }
  riso.ink(ctx, "#000", (g) => {
    g.lineJoin = "round";
    for (const f of vis) {
      g.beginPath(); facePath(g, f.pts);
      if (paper) { g.fillStyle = paper; g.fill(); }
      const m = mats[f.mat];
      if (m) {
        const bands = m.bands || [1];
        const d = bands[Math.min(bands.length - 1, Math.floor((1 - f.shade) * bands.length))];
        if (d > 0) { g.fillStyle = d >= 0.97 ? m.ink : STYLE === "cel" ? mixPaper(m.ink, d) : halftonePattern(g, m.ink, d, m.angle ?? 45, m.cell ?? LOOK.cell); g.fill(); }
      }
      if (wire) { g.strokeStyle = wire.ink; g.lineWidth = wire.width; g.stroke(); }
    }
  }, { offset, grain: 0.3, alpha });
}
