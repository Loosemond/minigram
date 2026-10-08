// Loads Clear Cut Challenge's files (tools/web_assets.py puts them in
// assets/clearcut/) and makes its things: Scyther with its clips, the log (the
// game draws it from its own code module: a hexagonal prism with three
// textures, rebuilt here from the module's numbers), Spinarak on its thread,
// the signpost and the cut's effects; the dizzy stars (190) are drawn through
// the game's colour combiner (fx.json: src/n64fx.js). Lighting is done on the
// textures' display values, as the N64 does (see src/egg/assets.js,
// docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
import { loadFx, tagPrims } from "../n64fx.js";

const FPS = 30; // the game's animation rate
const GLB = 100; // the exported models are in hundredths of the game's units

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const gltf = (url) => retry((n) => gltfLoader.loadAsync(attemptURL(url, n)), url);
const texture = (url) => retry((n) => texLoader.loadAsync(attemptURL(url, n)), url).then((t) => {
  t.colorSpace = THREE.NoColorSpace;
  return t;
});

function n64Material(src) {
  if (src.isMeshBasicMaterial) {
    if (src.map) src.map.colorSpace = THREE.NoColorSpace;
    return src;
  }
  const m = new THREE.MeshLambertMaterial({
    name: src.name, map: src.map, color: src.color, vertexColors: src.vertexColors,
    side: src.side, transparent: src.transparent, alphaTest: src.alphaTest,
  });
  if (m.map) m.map.colorSpace = THREE.NoColorSpace;
  return m;
}
function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(n64Material) : n64Material(o.material);
    o.frustumCulled = false;
  });
  return scene;
}

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [fx, scyther, signpost, stars, backdrop, bark, end, line, flash, ...spinarak] = await Promise.all([
    loadFx(base, job),
    job(gltf(base + "scyther.glb")),
    job(gltf(base + "signpost.glb")),
    job(gltf(base + "stars.glb")),
    job(texture(base + "backdrop.jpg")),
    job(texture(base + "log_bark.png")),
    job(texture(base + "log_end.png")),
    job(texture(base + "log_line.png")),
    job(texture(base + "flash.png")),
    ...[0, 1, 2].map((i) => job(texture(base + "spinarak" + i + ".png"))),
  ]);
  tagPrims(stars);
  for (const g of [scyther, signpost, stars]) prepare(g.scene);
  // the tiles the module's display lists set: the bark wraps (its tile is
  // 64 x 128 texels over a 32 x 64 texture), the ends and the line clamp / wrap
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  line.wrapS = THREE.RepeatWrapping;
  for (const t of [bark, end, line, ...spinarak, flash]) { t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  const sortClips = (g) => g.animations.slice().sort((a, b) => a.name.localeCompare(b.name));
  return {
    scyther: { scene: scyther.scene, clips: sortClips(scyther) },
    signpost: signpost.scene,
    stars: { scene: stars.scene, clips: sortClips(stars) },
    fx,
    slash: slashTexture(),
    backdrop,
    log: { bark, end, line },
    flash,
    spinarak,
  };
}

// A model with its own mixer, at the game's scale (s: the object's scale in
// the game, e.g. 0.25 for Scyther).
export function makeModel(a, s) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = (a.clips || []).map((c) => mixer.clipAction(c));
  let current = -1, action = null;
  const api = {
    root, mixer,
    get clip() { return current; },
    play(i, { loop = true, fade = 0.12, speed = 1, restart = false } = {}) {
      if (i === current && !restart) return;
      const next = actions[i];
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.timeScale = speed;
      next.play();
      if (action && fade > 0) action.crossFadeTo(next, fade, false);
      else if (action) action.stop();
      current = i; action = next;
    },
    get done() { return !action || (!action.isRunning() && action.loop === THREE.LoopOnce); },
    get t() { return action ? action.time : 0; }, // s into the clip
    frame() { return action ? Math.floor(action.time * FPS) : 0; },
    update(dt) { mixer.update(dt); },
  };
  return api;
}

// ---- the log ----
// The module's log (geo layout 0xC760): a hexagonal prism of radius 125 and
// 2000 long, drawn with the bark (vertices 0xBFC0, s 0-64 round it, t 0-128
// along), end caps (0xC0A0, the rings texture) and the white line, a band 70
// high at radius 131 (0xC160) that the game moves to the target. The game
// scales it by 0.3 across and (length / 2060) along; here it's built in the
// game's units at its drawn size, and a piece can be any stretch of it.
const R = 125 * 0.3, R_LINE = 131 * 0.3, LINE_H = 70 * (389 / 2060);
const HEX = [[63, 108], [-62, 108], [-125, 0], [-63, -108], [62, -108], [125, 0], [63, 108]]; // (x, z) round the bark, as in the module
const TEXELS_S = [0, 341, 682, 1024, 1365, 1706, 2048].map((s) => s / 32 / 32); // bark s at each corner (texels / 32 = repeats)

// A stretch of log from height y0 to y1 (0 = its bottom; the whole log is 389
// long), with its bark mapped as on the whole log, and caps at the ends
// (cut: that end shows the rings, lighter, as a fresh cut).
export function makeLogPiece(tex, y0, y1) {
  const g = new THREE.Group();
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k < 6; k++) {
    const [ax, az] = HEX[k], [bx, bz] = HEX[k + 1];
    const n = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2).normalize();
    const base = pos.length / 3;
    for (const [x, z, s] of [[ax, az, TEXELS_S[k]], [bx, bz, TEXELS_S[k + 1]]]) {
      for (const y of [y0, y1]) {
        pos.push(x * 0.3, y, z * 0.3);
        uv.push(s, (2 * y) / 389); // t: 0 at the top to 128 texels (2 repeats) at the bottom (three's v runs up)
        nor.push(n.x, 0, n.z);
      }
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); // (anticlockwise seen from outside, as the module's)
  }
  const bark = new THREE.BufferGeometry();
  bark.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bark.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  bark.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  bark.setIndex(idx);
  g.add(new THREE.Mesh(bark, new THREE.MeshLambertMaterial({ map: tex.bark })));
  for (const [y, up] of [[y0, false], [y1, true]]) {
    const cap = new THREE.BufferGeometry();
    const cp = [0, y, 0], cu = [0.5, 0.5], ci = [];
    for (let k = 0; k < 6; k++) {
      const [x, z] = HEX[k];
      cp.push(x * 0.3, y, z * 0.3);
      cu.push(0.5 + x / 250, 0.5 + z / 216); // the module's s, t (0-32 texels), with v up
    }
    for (let k = 0; k < 6; k++) ci.push(0, 1 + k, 1 + ((k + 1) % 6));
    cap.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
    cap.setAttribute("uv", new THREE.Float32BufferAttribute(cu, 2));
    cap.setIndex(up ? ci.slice().reverse() : ci);
    cap.computeVertexNormals();
    g.add(new THREE.Mesh(cap, new THREE.MeshLambertMaterial({ map: tex.end })));
  }
  return g;
}

// The white line: a band round the log at height y (from the log's bottom).
export function makeLine(tex) {
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < 6; k++) {
    const [ax, az] = HEX[k], [bx, bz] = HEX[k + 1];
    const base = pos.length / 3;
    for (const [x, z, s] of [[ax, az, k / 3], [bx, bz, (k + 1) / 3]]) {
      for (const y of [-LINE_H / 2, LINE_H / 2]) { pos.push(x * 0.3 * (131 / 125), y, z * 0.3 * (131 / 125)); uv.push(s, y > 0 ? 1 : 0); }
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.line, transparent: true, depthWrite: false })); // (back faces culled, as the module's list sets)
}
export const LOG_RADIUS = R, LINE_RADIUS = R_LINE;

// The cut's streak of light at the blade. (The game draws objects 130 and 131
// there, with colours its code sets as it draws them; a soft white streak
// stands in.)
function slashTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 32;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 16, 2, 64, 16, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,240,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.setTransform(1, 0, 0, 0.25, 0, 12);
  g.beginPath(); g.arc(64, 16, 64, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
export function makeSlash(assets) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
                           new THREE.MeshBasicMaterial({ map: assets.slash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.visible = false;
  return m;
}

// ---- Spinarak on its thread ----
// Image bank 397 on the module's sprite quad (0xCFC4..: 40 x 34, scaled 2.4 by
// the game, at z 48), shown in the order 0, 1, 2, 1, six frames each; its
// thread is a white quad (0xCEE0) 900 long, scaled 0.1 across, at z 45.
export function makeSpinarak(assets) {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: assets.spinarak[0], transparent: true, alphaTest: 0.1, depthWrite: false });
  const body = new THREE.Mesh(new THREE.PlaneGeometry(40 * 2.4, 34 * 2.4), mat);
  body.position.set(0, (34 * 2.4) / 2 - 20, 48);
  const thread = new THREE.Mesh(new THREE.PlaneGeometry(35 * 0.1, 900), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  thread.position.set(0, 450 + 30, 45);
  root.add(thread, body);
  root.userData = { mat, frames: assets.spinarak };
  return root;
}
