// tri3d.js: the real Tripo model of TRI inside the print. The native-quad mesh (Tripo P2 quad output) is
// skinned by the Tripo auto-rig and driven by its dance presets through three.js on the CPU, then
// painter-printed as paper faces + blue quad wire; the rig prints as Blender-style octahedral bones.
// Model space: height 1, feet on y=0, facing +Z (same as the offline textured renders, see tri_cam.js).
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { W, H, clamp } from "./core.js";
import { INK } from "./riso.js";
import { printMeshSolid } from "./mesh3d.js";
import { camBasis, projectSrc, rotPoint } from "./tri_cam.js";

export const FRONT = -Math.PI / 2;  // Tripo exports face +X
// ink overrides for the traced renders of the model: its magenta (laces, donut, nails) classifies as red
export const TRI_INKMAP = { red: [INK.pink, 1, 0] };
export const TRI = { stats: null, rigs: {}, ready: false };
const BASE = "../gen/tripo/";
// which Tripo generation drives the wire: "tri" = P2 (the MV ending), "h31" = H3.1 (the reveal clip; override with ?tri=)
const Q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
export const TRI_MODEL = Q.get("tri") || (Q.get("cut") === "reveal" ? "h31" : "tri");

export async function loadTri(anims = ["d04", "idle"], model = TRI_MODEL) {
  const topo = await (await fetch(BASE + `${model}_quad.json`)).json();
  TRI.faces = topo.f; TRI.map = topo.map; TRI.stats = topo.stats;
  const loader = new GLTFLoader();
  for (const k of anims) {
    const gl = await loader.loadAsync(BASE + `${model}_quad_${k}.glb`);
    let mesh = null; gl.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    const mixer = new THREE.AnimationMixer(gl.scene), clip = gl.animations[0];
    mixer.clipAction(clip).play();
    TRI.rigs[k] = { scene: gl.scene, mesh, mixer, clip, dur: clip.duration };
  }
  // normalisation from the bind pose (same recipe as r3d.js: unit height, feet on 0, centred)
  const r = TRI.rigs[anims[0]];
  r.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromBufferAttribute(r.mesh.geometry.attributes.position).applyMatrix4(r.mesh.matrixWorld);
  const s = 1 / (box.max.y - box.min.y);
  TRI.norm = { s, o: [-(box.min.x + box.max.x) / 2 * s, -box.min.y * s, -(box.min.z + box.max.z) / 2 * s] };
  const bones = r.mesh.skeleton.bones;
  TRI.joints = bones.map((b) => b.name);
  TRI.parents = bones.map((b) => bones.indexOf(b.parent));
  TRI.ready = true;
}
const toModel = (v) => { const { s, o } = TRI.norm; return rotPoint([v.x * s + o[0], v.y * s + o[1], v.z * s + o[2]], FRONT); };

// vertices + joints in model space. anim = rig key ("d04", "idle") and its clip time, or null for the bind pose
const _v = new THREE.Vector3(), cache = new Map();
export function triPose(anim = null, t = 0) {
  const k = anim ? TRI.rigs[anim] : Object.values(TRI.rigs)[0];
  const tt = anim ? ((t % k.dur) + k.dur) % k.dur : 0;
  const key = `${anim}|${tt.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);
  if (anim) k.mixer.setTime(tt); else k.mesh.skeleton.pose();
  k.scene.updateMatrixWorld(true);
  const pos = k.mesh.geometry.attributes.position, mw = k.mesh.matrixWorld;
  const v = TRI.map.map((gi) => {
    if (anim) k.mesh.getVertexPosition(gi, _v); else _v.fromBufferAttribute(pos, gi);
    return toModel(_v.applyMatrix4(mw));
  });
  const bones = k.mesh.skeleton.bones.map((b) => toModel(b.getWorldPosition(_v)));
  const out = { v, bones };
  cache.set(key, out); if (cache.size > 6) cache.delete(cache.keys().next().value);
  return out;
}

// source (1280x720) -> canvas affine; tf = [a, b, c, d, e, f] like fx.camTf
const apply = (tf, p) => [tf[0] * p[0] + tf[2] * p[1] + tf[4], tf[1] * p[0] + tf[3] * p[1] + tf[5], p[2]];

// faces ready for printMeshSolid, projected through the shared camera + turntable angle
export function prepTri(pose, { cam, rot = 0, tf, light = [-0.45, 0.75, 0.5] }) {
  const B = camBasis(cam), L = norm3(light);
  const wv = pose.v.map((p) => rotPoint(p, rot));
  const sv = pose.v.map((p) => apply(tf, projectSrc(p, cam, rot, B)));
  // face normals, then smooth vertex normals so the halftone bands follow the form, not every cloth wrinkle
  const fn = TRI.faces.map((q) => { const a = wv[q[0]], b = wv[q[1]], c = wv[q[2]]; return norm3(cross3(sub3(b, a), sub3(c, a))); });
  const vn = pose.v.map(() => [0, 0, 0]);
  TRI.faces.forEach((q, fi) => { for (const i of q) { vn[i][0] += fn[fi][0]; vn[i][1] += fn[fi][1]; vn[i][2] += fn[fi][2]; } });
  const out = [];
  TRI.faces.forEach((q, fi) => {
    const n = fn[fi];
    let cx = 0, cy = 0, cz = 0, z = 0, sx = 0, sy = 0, sz = 0;
    for (const i of q) { cx += wv[i][0]; cy += wv[i][1]; cz += wv[i][2]; z += sv[i][2]; sx += vn[i][0]; sy += vn[i][1]; sz += vn[i][2]; }
    const m = q.length, sn = norm3([sx, sy, sz]);
    const facing = n[0] * (cam.pos[0] - cx / m) + n[1] * (cam.pos[1] - cy / m) + n[2] * (cam.pos[2] - cz / m) > 0;
    out.push({ pts: q.map((i) => sv[i]), z: z / m, shade: Math.max(0, sn[0] * L[0] + sn[1] * L[1] + sn[2] * L[2]), facing, mat: 0 });
  });
  out.sort((x, y) => y.z - x.z);
  return out;
}
// the native quad wire, printed: paper faces, halftone shading, blue quads
export function printTri(g, riso, pose, o) {
  const faces = prepTri(pose, o);
  printMeshSolid(g, riso, faces, {
    mats: { 0: { ink: o.shadeInk || INK.black, bands: o.bands || [0, 0.1, 0.24, 0.4] } },
    wire: { ink: o.wireInk || INK.blue, width: o.width || 1.1 }, alpha: o.alpha ?? 1, paper: o.paper ?? "#F3EEE3",
  });
  return faces;
}

// Blender-style octahedral bones over everything. reveal 0..1 grows the rig out from the hips.
const SKIP = /Twist|^Root$/;
export function printSkeleton(g, riso, bones, { cam, rot = 0, tf, reveal = 1, alpha = 1, ink = INK.pink, joint = INK.yellow, scale = 1 }) {
  const B = camBasis(cam), P = bones.map((p) => apply(tf, projectSrc(p, cam, rot, B)));
  const keep = TRI.joints.map((n) => !SKIP.test(n));
  const up = (i) => { let p = TRI.parents[i]; while (p >= 0 && !keep[p]) p = TRI.parents[p]; return p; };
  const depth = TRI.parents.map((_, i) => { let d = 0, p = up(i); while (p >= 0) { d++; p = up(p); } return d; });
  const maxD = Math.max(...depth);
  const segs = [];
  for (let i = 0; i < P.length; i++) {
    if (!keep[i]) continue;
    const p = up(i); if (p < 0) continue;
    const k = clamp(reveal * (maxD + 1) - depth[i] + 1);
    if (k <= 0) continue;
    const a = P[p], b = [P[p][0] + (P[i][0] - P[p][0]) * k, P[p][1] + (P[i][1] - P[p][1]) * k];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) continue;
    segs.push([a, b, (P[p][2] + P[i][2]) / 2]);
  }
  segs.sort((x, y) => y[2] - x[2]);
  const kite = (q, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), w = Math.min(l * 0.14, 16 * scale);
    const nx = -dy / l * w, ny = dx / l * w, mx = a[0] + dx * 0.18, my = a[1] + dy * 0.18;
    q.moveTo(a[0], a[1]); q.lineTo(mx + nx, my + ny); q.lineTo(b[0], b[1]); q.lineTo(mx - nx, my - ny); q.closePath();
  };
  // paper under the bones so they read over the print, then pink body, black outline, yellow joints
  g.save(); g.globalAlpha = alpha; g.fillStyle = "#F3EEE3"; g.beginPath(); for (const [a, b] of segs) kite(g, a, b); g.fill(); g.restore();
  riso.ink(g, ink, (q) => { q.beginPath(); for (const [a, b] of segs) kite(q, a, b); q.fill(); }, { alpha, density: 0.55, angle: 15, grain: 0.3 });
  riso.ink(g, INK.black, (q) => { q.lineWidth = 2.4 * scale; q.lineJoin = "round"; q.beginPath(); for (const [a, b] of segs) kite(q, a, b); q.stroke(); }, { alpha, grain: 0.2 });
  const shown = new Set(segs.flatMap(([a, b]) => [a, b]));
  riso.ink(g, joint, (q) => { q.beginPath(); for (const p of shown) { q.moveTo(p[0] + 6 * scale, p[1]); q.arc(p[0], p[1], 6 * scale, 0, Math.PI * 2); } q.fill(); }, { alpha, grain: 0.2 });
  riso.ink(g, INK.black, (q) => { q.lineWidth = 2 * scale; q.beginPath(); for (const p of shown) { q.moveTo(p[0] + 6 * scale, p[1]); q.arc(p[0], p[1], 6 * scale, 0, Math.PI * 2); } q.stroke(); }, { alpha, grain: 0.2 });
  return segs.length;
}

// perspective floor grid (y = 0) that turns with the model: the viewport floor, printed
export function floorGrid(g, riso, { cam, rot = 0, tf, ext = 1.1, step = 0.1, alpha = 0.45, ink = INK.blue }) {
  const B = camBasis(cam), P = (x, z) => apply(tf, projectSrc([x, 0, z], cam, rot, B));
  const [cx, cy] = P(0, 0), r0 = 150 * tf[0], r1 = 560 * tf[0];
  riso.ink(g, ink, (q) => {
    q.lineWidth = 1.6; q.beginPath();
    for (let k = -ext; k <= ext + 1e-6; k += step) {
      let a = P(k, -ext), b = P(k, ext); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]);
      a = P(-ext, k); b = P(ext, k); q.moveTo(a[0], a[1]); q.lineTo(b[0], b[1]);
    }
    q.stroke();
    // fade the far edges out of the ink itself
    const gr = q.createRadialGradient(cx, cy, r0, cx, cy, r1);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    q.globalCompositeOperation = "destination-in"; q.fillStyle = gr; q.fillRect(0, 0, W, H); q.globalCompositeOperation = "source-over";
  }, { alpha, grain: 0.25 });
}

// screen box of a pose (canvas px), for framing tags
export function triBounds(pose, { cam, rot = 0, tf }) {
  const B = camBasis(cam); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pose.v.length; i += 7) { const p = apply(tf, projectSrc(pose.v[i], cam, rot, B)); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const fmt = (n) => n.toLocaleString("en-US");
