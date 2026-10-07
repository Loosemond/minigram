// Loads Furret's Frolic's files (tools/web_assets.py puts them in assets/furret/):
// Furret (object 142; layout 1, furret_end, for the show at the end), the
// Poké Balls (153: Poké, Great, Ultra and Master, by their points), the field
// (155: the field, the shadows along its edges and the boards on its ramps),
// a ball's shadow (image bank 307's dot) and the labels over each Furret (260:
// 1P-4P, COM); the badges over the goals are the shared ones (assets/ui,
// image bank 434). Lighting is done on the textures' display values, as the
// N64 does (see src/egg/assets.js, docs/colours.md).
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
    side: src.side, transparent: src.transparent, alphaTest: src.alphaTest, depthWrite: src.depthWrite,
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

const MODELS = ["furret", "furret_end", "field", "field_shadows", "boards", "ball1", "ball2", "ball3", "ball5"];
const PICTURES = ["shadow", "label0", "label1", "label2", "label3", "label4"];
const BADGES = ["com_blue", "com_green", "com_red", "com_yellow", "1p", "2p", "3p", "4p"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, badges] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(texture(base + p + ".png")))),
    Promise.all(BADGES.map((b) => job(texture(`assets/ui/badge_${b}.png`)))),
  ]);
  const out = { badges: {} };
  MODELS.forEach((name, i) => {
    const g = models[i];
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  BADGES.forEach((name, i) => { out.badges[name] = badges[i]; });
  return out;
}

// A model, at the game's scale (s), with its own mixer: a clip posed at a
// frame (looped, or held at its end)
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
    o.material = [o.material].flat().map((m) => {
      const c = m.clone();
      c.userData.base = c.color.clone();
      c.userData.transparent = c.transparent;
      mats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  return {
    root, model, mixer, mats,
    length: (i) => (a.clips[i] ? Math.max(1, Math.round(a.clips[i].duration * FPS)) : 1),
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
    // see-through by k (1: as it is), for a ball fading away at the end
    fade(k) {
      for (const m of mats) {
        const t = k < 1 || m.userData.transparent;
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = k;
      }
    },
  };
}
