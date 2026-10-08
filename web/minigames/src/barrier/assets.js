// Loads Barrier Ball's files (tools/web_assets.py puts them in
// assets/barrier/): Mr. Mime (object 218 in the play, 129 for the countdown
// and the end), its barrier (141), the Poké Ball (154), the court's pieces
// (object 120: the floor, its lines, the hole and the four walls) and the
// glow round a ball (image bank 151); the barrier and the glow are drawn
// through the game's colour combiner (fx.json: src/n64fx.js). Lighting is
// done on the textures' display values, as the N64 does (see
// src/egg/assets.js, docs/colours.md).
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

export const COURT_PIECES = ["floor", "lines", "hole", "wall_top", "wall_left", "wall_bottom", "wall_right"];
const MODELS = ["mime", "mime_show", "barrier", "ball", ...COURT_PIECES];
const PICTURES = ["glow"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, fx] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(texture(base + p + ".png")))),
    loadFx(base, job),
  ]);
  const out = {};
  MODELS.forEach((name, i) => {
    const g = models[i];
    tagPrims(g);
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  out.fx = fx;
  fx.pics["glow.png"] = out.glow; // (drawn through the combiners 0x86303F50 and 0x863040C4 set: game.js)
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

// one of the court's pieces as it is (they don't move or animate)
export function piece(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  return model;
}
