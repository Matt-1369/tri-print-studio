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

// ---- TRI · Print Studio (demo/): a 40-beat routine: five segments cut from four Tripo dance presets --------------------------
// Each segment starts on a hip low of its preset and is time-scaled so the bounces land on the song's beat
// (d04 one low per beat, d01 one per bar, d02 two per beat, d03 one per beat). Segments crossfade over one beat
// and the routine loops (d04 → d04). Beat 0 = the first downbeat of the demo music clip (song 151.993).
export const BEAT = 60 / 128.02;
export const CHOREO = {
  beats: 40, fade: 1.0,
  segs: [
    { clip: "d04", beats: 8, t0: 1.542, speed: 1.4224 },   // arms-up groove
    { clip: "d01", beats: 8, t0: 2.458, speed: 1.022 },    // big arm sweeps
    { clip: "d02", beats: 8, t0: 6.167, speed: 1.245 },    // steps and kicks
    { clip: "d03", beats: 8, t0: 8.833, speed: 0.889 },    // lunges and a spin
    { clip: "d04", beats: 8, t0: 4.292, speed: 1.4224 },   // hands-up finale
  ],
  roots: null,   // gen/tripo/<model>_dance_roots.json: low-passed hip drift per clip, to keep her centred
};
export const CHOREO_CLIPS = [...new Set(CHOREO.segs.map((s) => s.clip))];
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
function rootOff(clip, time) {
  const R = CHOREO.roots; if (!R || !R.clips[clip]) return [0, 0];
  const tab = R.clips[clip], f = Math.min(tab.length - 1, Math.max(0, time * R.fps)), i = Math.floor(f), j = Math.min(tab.length - 1, i + 1), u = f - i;
  return [R.center[0] - (tab[i][0] * (1 - u) + tab[j][0] * u), R.center[1] - (tab[i][1] * (1 - u) + tab[j][1] * u)];
}
// clip mix at beat b: { mix: [{seg, clip, time, w}], off: [x, z] model-space re-centring }
export function choreoAt(beat) {
  const S = CHOREO.segs, n = S.length, total = CHOREO.beats, f = CHOREO.fade;
  const b = ((beat % total) + total) % total;
  let s0 = 0, k = 0;
  while (k < n - 1 && b >= s0 + S[k].beats) { s0 += S[k].beats; k++; }
  const t = (seg, start) => Math.max(0, seg.t0 + (b - start) * BEAT * seg.speed);
  const cur = S[k], b1 = s0 + cur.beats, mix = [];
  const wPrev = 1 - smooth((b - (s0 - f / 2)) / f), wNext = smooth((b - (b1 - f / 2)) / f);
  if (wPrev > 1e-3) { const p = (k + n - 1) % n; mix.push({ seg: p, clip: S[p].clip, time: t(S[p], s0 - S[p].beats), w: wPrev }); }
  if (wNext > 1e-3) { const q = (k + 1) % n; mix.push({ seg: q, clip: S[q].clip, time: t(S[q], b1), w: wNext }); }
  mix.push({ seg: k, clip: cur.clip, time: t(cur, s0), w: 1 - wPrev - wNext });
  const off = [0, 0];
  for (const m of mix) { const o = rootOff(m.clip, m.time); off[0] += o[0] * m.w; off[1] += o[1] * m.w; }
  return { mix, off };
}
// one three.js action per segment (a cloned clip, so d04 can crossfade into d04), all played
export function choreoActions(mixer, clips) {
  return CHOREO.segs.map((sg, i) => {
    const first = CHOREO.segs.findIndex((x) => x.clip === sg.clip) === i;
    const a = mixer.clipAction(first ? clips[sg.clip] : clips[sg.clip].clone());
    a.play(); return a;
  });
}
// pose the mixer at a choreoAt() mix
export function applyChoreo(actions, mixer, mix) {
  for (const a of actions) { a.enabled = false; a.setEffectiveWeight(0); }
  for (const m of mix) { const a = actions[m.seg]; a.enabled = true; a.time = m.time; a.setEffectiveWeight(m.w); }
  mixer.update(0);
}
export const DEMO = { frames: Math.round(CHOREO.beats * BEAT * 12), yaws: 8 };
for (let k = 0; k < DEMO.yaws; k++) {
  TRI_JOBS[`DEMO_DANCE_Y${k}`] = { glb: "tri_d04.glb", fps: 12, frames: DEMO.frames, cam: TRI_JOBS.TRI_TURN.cam, rot: () => k * Math.PI * 2 / DEMO.yaws, choreo: true };
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
