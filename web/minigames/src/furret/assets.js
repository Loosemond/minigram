// Loads Furret's Frolic's files (tools/web_assets.py puts them in assets/furret/):
// Furret (object 142; layout 1, furret_end, for the show at the end), the
// Poké Balls (153: Poké, Great, Ultra and Master, by their points), the field
// (155: the field, the shadows along its edges and the boards on its ramps),
// a ball's shadow (image bank 307's dot) and the labels over each Furret (260:
// 1P-4P, COM); the badges over the goals are the shared ones (image bank 434:
// src/badge.js). Lighting is done on the textures' display values, as the
// N64 does (see src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
import { loadBadges } from "../badge.js";
import { LOOP } from "./rules.js";

const FPS = 30; // the game's animation rate
const GLB = 100; // the exported models are in hundredths of the game's units

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const gltf = (url) => retry((n) => gltfLoader.loadAsync(attemptURL(url, n)), url);
const texture = (url) => retry((n) => texLoader.loadAsync(attemptURL(url, n)), url).then((t) => {
  t.colorSpace = THREE.NoColorSpace;
  return t;
});

// A lit part as the RSP lights it: its shade the ambient and the lights' N.L
// (index.js: the game's), held to 1, times the texel; never brighter than its texture
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
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
      "vec3 outgoingLight = min(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, diffuseColor.rgb) + totalEmissiveRadiance;");
  };
  m.customProgramCacheKey = () => "furret-shade";
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
    // (Furret's clips go round, 0-4, as their flag 1 has them: each gets the frame it goes back to again, one
    // on from its last, to be drawn between the two; 5 and 6 are held)
    if (name.startsWith("furret")) clips.forEach((c, k) => { if (k < 5) closeLoop(c, Math.round(c.duration * FPS) + 1, LOOP[k]); });
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  return out;
}

// clip's frame back again at frame n (its tracks have a key every frame, or one)
function closeLoop(clip, n, back) {
  clip.tracks = clip.tracks.map((t) => {
    const k = t.getValueSize(), times = new Float32Array(t.times.length + 1), values = new Float32Array(t.values.length + k);
    const from = t.times.length > 1 ? back * k : 0;
    times.set(t.times);
    times[t.times.length] = n / FPS;
    values.set(t.values);
    values.set(t.values.subarray(from, from + k), t.values.length);
    return new t.constructor(t.name, times, values, t.getInterpolation());
  });
  clip.resetDuration();
}

// A model, at the game's scale (s), with its own mixer: a clip posed at a
// frame (between frames; past the last of one that goes round, towards the
// frame it goes back to)
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
      c.onBeforeCompile = m.onBeforeCompile; // (the shade held to 1: clone() leaves it)
      c.customProgramCacheKey = m.customProgramCacheKey;
      c.userData.base = c.color.clone();
      c.userData.transparent = c.transparent;
      mats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const twins = []; // (a clip's second action, to weigh it against itself at another frame)
  const on = new Set(); // (the actions posed)
  return {
    root, model, mixer, mats,
    length: (i) => (a.clips[i] ? Math.max(1, Math.round(a.clips[i].duration * FPS)) : 1),
    // clip i at frame f (0 to its length: for one that goes round, from its last towards the frame it
    // goes back to); or, k of the way from it to clip j at frame g (the clip changed between two
    // frames, or started again)
    pose(i, f, j = -1, g = 0, k = 0) {
      if (!actions[i]) return;
      const second = j === i ? (twins[i] ||= mixer.clipAction(a.clips[i].clone())) : actions[j];
      const use = k > 0 && second ? [[actions[i], i, f, 1 - k], [second, j, g, k]] : [[actions[i], i, f, 1]];
      for (const act of on) if (!use.some(([x]) => x === act)) { act.stop(); on.delete(act); }
      for (const [act, n, at, w] of use) {
        const d = a.clips[n].duration;
        if (!on.has(act)) {
          act.reset();
          act.setLoop(THREE.LoopRepeat, Infinity);
          act.play();
          act.paused = true;
          on.add(act);
        }
        act.setEffectiveWeight(w);
        act.time = d > 0 ? Math.max(0, Math.min(at / FPS, d - 1e-4)) : 0;
      }
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
