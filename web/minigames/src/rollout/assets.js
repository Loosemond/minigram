// Loads Rampage Rollout's files (tools/web_assets.py puts them in
// assets/rollout/): Donphan (object 108: walking, and rolling), the track
// (113: its field and the red frame round it), and the pictures: a dust cloud
// in each player's colours (image bank 150, 16 frames side by side), the dust
// a Donphan kicks up (159, 8 frames), the stars over a Donphan (384, in each
// player's colours) and the shadows (307). Lighting is done on the textures'
// display values, as the N64 does (see src/egg/assets.js, docs/colours.md).
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

const MODELS = ["donphan", "donphan_rolling", "field", "frame"];
const PICTURES = ["dust", "shadow", "cloud0", "cloud1", "cloud2", "cloud3", "star0", "star1", "star2", "star3"];

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

// A model, at the game's scale, with its own mixer: a clip is posed at a frame
// (looped, or held at its end), and its materials can be tinted
export function makeModel(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => { const c = m.clone(); c.userData.base = c.color.clone(); mats.push(c); return c; });
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  return {
    root, model, mixer,
    get clip() { return current; },
    length: (i) => (a.clips[i] ? Math.round(a.clips[i].duration * FPS) : 1),
    // clip i at frame f (looped; or held on its last frame)
    pose(i, f, hold = false) {
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
      // (three.js only loops a clip's time when it's run on, not when it's set: wrap it here)
      const d = a.clips[i].duration, t = Math.max(0, f) / FPS;
      action.time = d > 0 ? (hold ? Math.min(t, d - 1e-4) : t % d) : 0;
      mixer.update(0);
    },
    // a colour laid over it: towards rgb by k (0 none)
    tint(rgb, k) {
      for (const m of mats) {
        m.color.copy(m.userData.base).lerp(rgb, k);
        m.emissive?.copy(rgb).multiplyScalar(k * 0.6);
      }
    },
  };
}

// one of the track's pieces as it is (they don't move or animate)
export function piece(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  return model;
}
