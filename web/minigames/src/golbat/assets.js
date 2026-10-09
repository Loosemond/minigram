// Loads Gutsy Golbat's files (tools/web_assets.py puts them in
// assets/golbat/): Golbat (object 53), Jynx (110), the backdrops (image bank
// 221: the cave, its mouth, the meadow), the Magnemite and heart strips (banks
// 69 and 222), each player's glow (bank 343, coloured) and the badges over
// them (434, the shared ones: src/badge.js). Lighting is done on the
// textures' display values, as the N64 does (see src/egg/assets.js,
// docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
import { loadBadges } from "../badge.js";

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

const MODELS = ["golbat", "jynx"];
const PICTURES = ["cave", "mouth", "meadow", "magnemite", "hearts", "glow0", "glow1", "glow2", "glow3"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, badges] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(texture(base + p + ".png")))),
    loadBadges(job),
  ]);
  const out = { badges };
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
// (looped), and its materials can be tinted (the game's colour on it)
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
      // (three.js only loops a clip's time when it's run on, not when it's set: wrap it here)
      const d = a.clips[i].duration;
      action.time = d > 0 ? (Math.max(0, f) / FPS) % d : 0;
      mixer.update(0);
    },
    // a colour laid over it: towards rgb by k (0 none), and see-through by alpha
    tint(rgb, k, alpha = 1) {
      for (const m of mats) {
        m.color.copy(m.userData.base).lerp(rgb, k);
        m.emissive?.copy(rgb).multiplyScalar(k * 0.6);
        m.transparent = alpha < 1;
        m.opacity = alpha;
        m.depthWrite = alpha >= 1;
      }
    },
  };
}
