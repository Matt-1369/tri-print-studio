// tri_cam.js: shared cameras + turntables for the real Tripo model of TRI. The same numbers drive
// the offline three.js renders (engine/r3d.html -> roto source frames) and the live quad-wire /
// skeleton overlays, so everything lines up. Model space: height 1, feet on y=0, centred.
// Projection lands in 1280x720 source units (the roto space); drawClip's tf maps it to the canvas.
export const SRC_W = 1280, SRC_H = 720;

// jobs rendered offline to build/r3d/<name>/ and traced to build/roto_hq/<name>/
//   frames at `fps` (one drawing each, played on twos), rot(i) turntable angle, anim: clip + time(i)
// dance_04 bounces every 0.667 s; at 1.4224x it bounces on every beat of the song (128.02 BPM)
export const DANCE = { speed: 1.4224, t0: 3.352, s0: 166.33 };   // anim time t0 at song time s0 (a hip low lands on 166.991)
export const danceTime = (songT) => Math.max(0, DANCE.t0 + (songT - DANCE.s0) * DANCE.speed);
export const TRI_JOBS = {
  // full body; starts with her back to camera, faces front (0.35 rad) at drawing 52.44 = 161.37 in the reveal cut, 8 s per turn
  TRI_TURN: { glb: "tri_tex.glb", fps: 12, frames: 96, cam: { pos: [0, 0.5, 2.5], target: [0, 0.5, 0], fov: 30 }, rot: (i) => 0.35 + (i - 52.44) / 96 * Math.PI * 2 },
  // the generated result in the prompt UI (MV ending, f-f / o-a): gentle turn, drawing 0 = song 165.45
  TRI_PANEL: { glb: "tri_tex.glb", fps: 12, frames: 48, cam: { pos: [0, 0.52, 2.15], target: [0, 0.52, 0], fov: 30 }, rot: (i) => -0.5 + i / 12 * 0.28 },
  // the dance (Tripo retarget preset dance_04), full body, slight three-quarter; drawing 0 = song 166.33
  TRI_DANCE: { glb: "tri_d04.glb", fps: 12, frames: 48, cam: { pos: [0, 0.5, 2.5], target: [0, 0.5, 0], fov: 30 }, rot: () => 0.2, anim: { clip: 0, t0: DANCE.t0, speed: DANCE.speed } },
};

// TRI · Print Studio (demo/): a 12-beat dance loop starting on a downbeat-aligned hip low (1.625 = 4.292 − one bar),
// rendered at 8 yaws so the printed model can dance from any side; drawing i = loop time i / 12 s
export const DEMO_LOOP = { t0: 1.625, speed: DANCE.speed, beats: 12, frames: 68, yaws: 8 };
for (let k = 0; k < DEMO_LOOP.yaws; k++) {
  TRI_JOBS[`DEMO_DANCE_Y${k}`] = { glb: "tri_d04.glb", fps: 12, frames: DEMO_LOOP.frames, cam: TRI_JOBS.TRI_TURN.cam, rot: () => k * Math.PI * 2 / DEMO_LOOP.yaws, anim: { clip: 0, t0: DEMO_LOOP.t0, speed: DEMO_LOOP.speed } };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// same basis as three.js Object3D.lookAt with up = +Y
export function camBasis(cam) {
  const f = norm(sub(cam.target, cam.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  return { f, r, u, k: SRC_H * 0.5 / Math.tan(cam.fov * Math.PI / 360) };
}
// model-space point -> [x, y, depth] in source units, after a turntable rotation about +Y
export function projectSrc(p, cam, rot = 0, B = camBasis(cam)) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const w = [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  const d = sub(w, cam.pos), z = dot(d, B.f);
  return [SRC_W / 2 + dot(d, B.r) * B.k / z, SRC_H / 2 - dot(d, B.u) * B.k / z, z];
}
export const rotPoint = (p, rot) => { const c = Math.cos(rot), s = Math.sin(rot); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
