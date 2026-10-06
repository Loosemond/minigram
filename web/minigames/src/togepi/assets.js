// Loads Tumbling Togepi's files (tools/web_assets.py puts them in
// assets/togepi/): Togepi (object 109), the treadmills' platform (60), what
// comes along the belts (flowers 62, rocks 63-64, logs 65-67, the dash arrow
// 202), the dash's aura (188), the scenery round it all (132-140), and the
// pictures: the track (image bank 226), the Diglett strip (205), the rank
// coins (387) and the shadows (307). Lighting is done on the textures' display values, as the N64
// does (see src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";

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

const MODELS = ["togepi", "platform", "flower", "rock_s", "rock", "log_s", "log_m", "log_l", "arrow", "aura",
  "hills", "plants", "grass_arc", "cacti", "thin_arc", "ring", "ring_dirt", "pieces", "arc"];
const PICTURES = ["track", "diglett", "shadow", "rank1", "rank2", "rank3", "rank4"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(texture(base + p + ".png")))),
  ]);
  const out = {};
  MODELS.forEach((name, i) => {
    const g = models[i];
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  return out;
}

// A model, at the game's scale (s: its scale in the game, a number or [x, y,
// z]), with its own mixer: a clip is posed at a frame of the rules' clock
// (they time things by it), or just played.
export function makeModel(a, s = 1) {
  const model = cloneSkinned(a.scene);
  if (Array.isArray(s)) model.scale.set(GLB * s[0], GLB * s[1], GLB * s[2]);
  else model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  let current = -1, action = null;
  const api = {
    root, model, mixer,
    get clip() { return current; },
    // clip i at frame f (looped)
    pose(i, f) {
      const next = actions[i];
      if (!next) return;
      if (i !== current) {
        if (action) action.stop();
        next.reset();
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.play();
        next.paused = true;
        current = i;
        action = next;
      }
      action.time = Math.max(0, f) / FPS;
      mixer.update(0);
    },
    // every material see-through by k (the aura)
    fade(k) {
      model.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [o.material].flat()) { m.transparent = true; m.opacity = k; m.depthWrite = false; }
      });
    },
  };
  return api;
}
