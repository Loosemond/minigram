// Loads Pichu's Power Plant's files (tools/web_assets.py puts them in
// assets/pichu/): the power plant's frame (object 56: the four rooms and the
// B/A sign), the Electrode lamps (57), Pichu (107) with its faces, the dizzy
// stars (190), and the sparks' and the lightning's pictures (image banks 224
// and 225, a strip each). The gauges' pictures are loaded by the page.
// Lighting is done on the textures' display values, as the N64 does (see
// src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL, fetchRetry } from "../retry.js";

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
  m.userData = src.userData;
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
// a face texture, set up like the one it stands in for
function faceTexture(url, like) {
  return texture(url).then((t) => {
    t.flipY = false; // (glTF's way, like the model's own)
    if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.magFilter = like.magFilter; t.minFilter = like.minFilter; }
    t.generateMipmaps = false;
    return t;
  });
}

// the models, and the face pictures each has (by number)
const MODELS = {
  frame: [6, 7, 8, 9, 10, 11], // the sign: a blue A (6-8, dim to bright) and a green B (9-11)
  lamp: [2, 3, 4, 5, 6, 7, 8], // red (off), blue A (3-5), green B (6-8)
  pichu: [...Array(28).keys()],
  stars: [],
};

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const names = Object.keys(MODELS);
  const [models, info, strips] = await Promise.all([
    Promise.all(names.map((m) => job(gltf(base + m + ".glb")))),
    job(fetchRetry(base + "pichu.json").then((r) => r.json())),
    Promise.all(["spark", "bolt"].map((s) => job(texture(base + s + ".png")))),
  ]);
  const out = { spark: strips[0], bolt: strips[1] };
  await Promise.all(names.map(async (name, i) => {
    const g = models[i];
    prepare(g.scene);
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like = o.material.map; });
    const faces = {};
    await Promise.all(MODELS[name].map((k) => job(faceTexture(`${base}${name}_face${k}.png`, like)).then((t) => { faces[k] = t; })));
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips, faces, frames: clips.map((c) => Math.round(c.duration * FPS)) };
  }));
  // Pichu's face tracks, by clip: the clip's own, or for the turns (clips
  // 1-4) the texture clip the game starts with them (texanim01-04)
  const P = out.pichu;
  P.faceTracks = P.clips.map((c, k) => info.clips.find((m) => m.name === c.name)?.face ||
    info.clips.find((m) => m.name.startsWith("texanim") && m.face_clip === k)?.face || null);
  return out;
}

// A model, at the game's scale (s: its scale in the game), with its own
// mixer and faces: a clip's face track swaps them as it plays, or face(ch, k)
// sets one by hand (the lamps and the sign).
export function makeModel(a, s) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const faceMats = [];
  model.traverse((o) => {
    if (o.isMesh && o.material.userData.ps2_face) {
      o.material = o.material.clone();
      faceMats.push(o.material);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = (a.clips || []).map((c) => mixer.clipAction(c));
  let current = -1, action = null;
  const setFace = (m, k) => { if (a.faces?.[k] && m.map !== a.faces[k]) m.map = a.faces[k]; };
  const setFaces = (track, f) => {
    for (const m of faceMats) {
      const ch = m.userData.ps2_face.channel, list = track?.[ch];
      setFace(m, list ? list[Math.min(list.length - 1, Math.max(0, f))] : m.userData.ps2_face.default);
    }
  };
  const api = {
    root, mixer,
    get clip() { return current; },
    // play clip i: looped or once (held on its last frame), from frame `from`
    play(i, { loop = true, fade = 0.1, from = 0, restart = false } = {}) {
      const next = actions[i];
      if (!next || (i === current && !restart)) return;
      next.reset();
      next.time = from / FPS;
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.play();
      if (action && action !== next && fade > 0) action.crossFadeTo(next, fade, false);
      else if (action && action !== next) action.stop();
      current = i; action = next;
    },
    get done() { return !action || (!action.isRunning() && action.loop === THREE.LoopOnce); },
    frame() { return action ? action.time * FPS : 0; },
    seek(f) { if (action) action.time = f / FPS; },
    // a clip held at frame f (the lamps', set each frame by the game)
    pose(i, f) {
      if (current !== i) { api.play(i, { loop: false, fade: 0 }); action.paused = true; }
      action.time = f / FPS;
    },
    face(ch, k) { for (const m of faceMats) if (m.userData.ps2_face.channel === ch) setFace(m, k); },
    update(dt, faces = true) {
      mixer.update(dt);
      if (!faces) return;
      const track = a.faceTracks?.[current];
      setFaces(track, Math.floor(action ? action.time * FPS : 0));
    },
  };
  return api;
}

// One of a strip's pictures (n of them, side by side) on a quad w x h,
// facing the camera's way; show(k) picks the picture. The strips are made
// from the game's grey pictures (tools/web_assets.py), coloured as it draws them.
export function makeStrip(tex, n, w, h) {
  const t = tex.clone();
  t.repeat.set(1 / n, 1);
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.frustumCulled = false;
  mesh.userData.show = (k) => t.offset.set(k / n, 0);
  mesh.userData.show(0);
  return mesh;
}
