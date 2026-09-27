// triGL.js: the native-quad wire of TRI drawn with WebGL, for interactive use (demo/). Same look and projection as
// tri3d.printTri (paper faces, halftone shading bands, blue quad edges) but ~100x faster: the edges are drawn in the
// fragment shader from per-corner coordinates (the triangulation diagonal is hidden), hidden lines go through a depth
// pre-pass, and each ink comes back as an image that riso.ink prints like any other pass.
import * as THREE from "../vendor/three.module.js";
import { W, H, STYLE } from "./core.js";
import { INK, LOOK } from "./riso.js";
import { TRI } from "./tri3d.js";
import { camBasis, rotPoint } from "./tri_cam.js";

const VERT = /* glsl */`
attribute vec3 bc;
uniform vec3 uCamPos, uF, uR, uU, uTfA, uTfB;
uniform float uK, uRot;
uniform vec2 uRes;
varying vec3 vBc, vN, vW;
void main() {
  float c = cos(uRot), s = sin(uRot);
  vec3 w = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z);
  vN = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
  vW = w; vBc = bc;
  vec3 d = w - uCamPos;
  float z = dot(d, uF);
  vec3 src = vec3(640.0 + dot(d, uR) * uK / z, 360.0 - dot(d, uU) * uK / z, 1.0);
  vec2 cv = vec2(dot(uTfA, src), dot(uTfB, src));
  vec2 ndc = vec2(cv.x / uRes.x * 2.0 - 1.0, 1.0 - cv.y / uRes.y * 2.0);
  float zn = clamp((z - 0.2) / 8.0, 0.0, 1.0) * 2.0 - 1.0;
  gl_Position = vec4(ndc * z, zn * z, z);
}`;
const FRAG = /* glsl */`
uniform int uMode;          // 0 coverage, 1 shade, 2 wire
uniform vec3 uColor, uLight, uCamPos;
uniform vec4 uBands;
uniform float uCell, uWidth, uCel;
varying vec3 vBc, vN, vW;
void main() {
  if (uMode == 0) { gl_FragColor = vec4(1.0); return; }
  if (uMode == 2) {
    vec3 fw = fwidth(vBc);                  // every edge is shared by two faces: each draws half the line width
    float hw = 0.5 * uWidth;
    vec3 a = smoothstep(fw * max(0.0, hw - 0.5), fw * (hw + 0.5), vBc);
    float e = 1.0 - min(min(a.x, a.y), a.z);
    if (e < 0.02) discard;
    gl_FragColor = vec4(uColor, e); return;
  }
  vec3 n = normalize(vN);
  if (dot(n, uCamPos - vW) < 0.0) n = -n;
  float sh = max(0.0, dot(n, uLight));
  int bi = int(min(3.0, floor((1.0 - sh) * 4.0)));
  float d = bi == 0 ? uBands.x : bi == 1 ? uBands.y : bi == 2 ? uBands.z : uBands.w;
  if (d <= 0.0) discard;
  if (uCel > 0.5) { gl_FragColor = vec4(uColor, d); return; }
  // halftone dots, 45 degrees, like riso.halftonePattern
  vec2 p = vec2(gl_FragCoord.x - gl_FragCoord.y, gl_FragCoord.x + gl_FragCoord.y) * 0.70710678 / uCell;
  float r = min(sqrt(d / 3.14159265) * 1.02, 0.72), dd = length(fract(p) - 0.5);
  float aa = fwidth(dd);
  float dot_ = 1.0 - smoothstep(r - aa, r + aa, dd);
  if (dot_ < 0.02) discard;
  gl_FragColor = vec4(uColor, dot_);
}`;

const hex3 = (h) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export class TriGL {
  constructor() {
    this.canvas = document.createElement("canvas"); this.canvas.width = W; this.canvas.height = H;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(W, H, false); this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.scratch = document.createElement("canvas"); this.scratch.width = W; this.scratch.height = H;
    // non-indexed triangles from the quads; bc hides the diagonal of every quad
    const corner = [], bc = [];
    for (const q of TRI.faces) {
      if (q.length === 4) {
        corner.push(q[0], q[1], q[2], q[0], q[2], q[3]);
        bc.push(1, 1, 0, 0, 2, 0, 0, 1, 1, /**/ 1, 0, 1, 0, 1, 1, 0, 0, 2);
      } else { corner.push(q[0], q[1], q[2]); bc.push(1, 0, 0, 0, 1, 0, 0, 0, 1); }
    }
    this.corner = Uint32Array.from(corner);
    const n = corner.length;
    this.pos = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute("bc", new THREE.BufferAttribute(Float32Array.from(bc), 3));
    this.geo = geo;
    this.uniforms = {
      uCamPos: { value: new THREE.Vector3() }, uF: { value: new THREE.Vector3() }, uR: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3() },
      uTfA: { value: new THREE.Vector3() }, uTfB: { value: new THREE.Vector3() }, uK: { value: 1 }, uRot: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) },
      uMode: { value: 0 }, uColor: { value: new THREE.Vector3() }, uLight: { value: new THREE.Vector3(-0.45, 0.75, 0.5).normalize() },
      uBands: { value: new THREE.Vector4(0, 0.1, 0.24, 0.4) }, uCell: { value: LOOK.cell }, uWidth: { value: 1.1 }, uCel: { value: STYLE === "cel" ? 1 : 0 },
    };
    const common = { uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide };
    this.depthMat = new THREE.ShaderMaterial({ ...common, colorWrite: false });
    this.inkMat = new THREE.ShaderMaterial({ ...common, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth });
    this.mesh = new THREE.Mesh(geo, this.depthMat); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.cam = new THREE.Camera();
    this.poseRef = null;
  }
  setPose(pose) {
    if (this.poseRef === pose) return;
    this.poseRef = pose;
    const v = pose.v, nv = v.length, vn = new Float32Array(nv * 3);
    for (const q of TRI.faces) {          // smooth vertex normals from the quad faces
      const a = v[q[0]], b = v[q[1]], c = v[q[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
      for (const i of q) { vn[i * 3] += nx / l; vn[i * 3 + 1] += ny / l; vn[i * 3 + 2] += nz / l; }
    }
    const { corner, pos, nrm } = this;
    for (let k = 0; k < corner.length; k++) {
      const i = corner[k], p = v[i];
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      nrm[k * 3] = vn[i * 3]; nrm[k * 3 + 1] = vn[i * 3 + 1]; nrm[k * 3 + 2] = vn[i * 3 + 2];
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }
  pass(mode, color) {
    const u = this.uniforms; if (color) u.uColor.value.copy(hex3(color));
    this.renderer.clear();
    u.uMode.value = 0;                       // depth pre-pass: solid faces (the ink modes discard pixels)
    this.mesh.material = this.depthMat; this.renderer.render(this.scene, this.cam);
    u.uMode.value = mode;
    this.mesh.material = this.inkMat; this.renderer.render(this.scene, this.cam);
    return this.canvas;
  }
  // print the quad wire like tri3d.printTri: paper under the model, halftone shade, blue quads
  print(g, riso, pose, { cam, rot = 0, tf, width = 1.2, alpha = 1, bands = [0, 0.1, 0.24, 0.4], wireInk = INK.blue, shadeInk = INK.black, paper = true }) {
    this.setPose(pose);
    const B = camBasis(cam), u = this.uniforms;
    u.uCamPos.value.set(...cam.pos); u.uF.value.set(...B.f); u.uR.value.set(...B.r); u.uU.value.set(...B.u); u.uK.value = B.k; u.uRot.value = rot;
    u.uTfA.value.set(tf[0], tf[2], tf[4]); u.uTfB.value.set(tf[1], tf[3], tf[5]);
    u.uBands.value.set(...bands); u.uWidth.value = width;
    if (paper) {                             // knock the model out on clean paper stock
      const s = this.scratch.getContext("2d");
      s.globalCompositeOperation = "source-over"; s.clearRect(0, 0, W, H); s.drawImage(riso.paper, 0, 0);
      s.globalCompositeOperation = "destination-in"; s.drawImage(this.pass(0), 0, 0);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.drawImage(this.scratch, 0, 0); g.restore();
    }
    const shade = this.pass(1, shadeInk);
    riso.ink(g, shadeInk, (q) => q.drawImage(shade, 0, 0), { alpha, grain: 0.3 });
    const wire = this.pass(2, wireInk);
    riso.ink(g, wireInk, (q) => q.drawImage(wire, 0, 0), { alpha, grain: 0.3 });
  }
}
export { rotPoint };
