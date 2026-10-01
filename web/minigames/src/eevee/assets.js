// Loads Eager Eevee's files (tools/web_assets.py puts them in assets/eevee/):
// Eevee, Aipom on its rope with the basket, Pineco, the fruit and the
// effects' pictures (the field is field.js's; the HUD's pictures are loaded
// by the page). Lighting is done on the textures' display values, as the N64
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

// Aipom's rope (its first part, a thin prism on bone 1) ends in mid-air over
// the game's screen, out of its camera's sight; here it goes on up out of any
// camera's (portrait looks more from above)
function longRope(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || !o.material.name?.endsWith("_tex00")) return;
    const p = o.geometry.attributes.position, uv = o.geometry.attributes.uv;
    let top = -Infinity, bottom = Infinity;
    for (let i = 0; i < p.count; i++) { top = Math.max(top, p.getY(i)); bottom = Math.min(bottom, p.getY(i)); }
    const more = 36; // (to 2000 or so over the ground, at Aipom's scale)
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < top - 1e-4) continue;
      p.setY(i, top + more);
      uv.setY(i, uv.getY(i) - more / (top - bottom));
    }
    p.needsUpdate = uv.needsUpdate = true;
    o.geometry.computeBoundingSphere();
    if (o.material.map) { o.material.map.wrapT = THREE.RepeatWrapping; o.material.map.needsUpdate = true; }
  });
}

const MODELS = ["eevee", "aipom", "pineco", "melon", "grapes", "strawberries"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [fx, ...models] = await Promise.all([
    Promise.all([...Array(10).keys()].map((i) => job(texture(base + "fx" + i + ".png")))), // image bank 307
    ...MODELS.map((m) => job(gltf(base + m + ".glb"))),
  ]);
  const out = { fx };
  MODELS.forEach((name, i) => {
    const g = models[i];
    prepare(g.scene);
    if (name === "aipom") longRope(g.scene);
    // the clips in order (clip00, clip01 ...; a texture's own clips after them)
    out[name] = { scene: g.scene, clips: g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name)) };
  });
  return out;
}

// A model with its own mixer, at the game's scale (s: the object's scale in
// the game, e.g. 1/6 for Eevee).
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
      const next = actions[i];
      if (!next) return;
      if (i === current && !restart) return;
      next.reset();
      next.paused = false;
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.timeScale = speed;
      next.play();
      if (action && action !== next && fade > 0) action.crossFadeTo(next, fade, false);
      else if (action && action !== next) action.stop();
      current = i; action = next;
    },
    // hold the clip on at frame f (for a clip the game plays by hand: Aipom's fakes)
    seek(f) {
      if (!action) return;
      action.paused = true;
      action.time = Math.max(0, Math.min(action.getClip().duration, f / FPS));
    },
    get done() { return !action || (!action.isRunning() && action.loop === THREE.LoopOnce); },
    frame() { return action ? Math.floor(action.time * FPS) : 0; },
    update(dt) { mixer.update(dt); },
  };
  return api;
}
