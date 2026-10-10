// Loads Delibird's Delivery's files (tools/web_assets.py puts them in
// assets/delibird/): Delibird and its sack (object 127, layouts 0 and 1), the
// Swinub (82 running right, 103 left), the gift boxes (92, 96 the big one),
// the gifts (by the rules' KINDS: 175, 176, 181, 169, 180, 174, 184, 177, 170),
// the stage (148 the field, 147 its walls; their belts' scroll in fx.json:
// src/n64fx.js scrollMaps), and its pictures: the shadow
// (image bank 307's dot), FULL (379, tinted per player as the game's combiner
// does) and the ring's sparkle (its texture's 13 frames); the badges over each
// Delibird are the shared ones (434: src/badge.js). Lighting is done on the
// textures' display values, as the N64 does (see src/egg/assets.js,
// docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
import { loadBadges } from "../badge.js";
import { tint } from "../tint.js";
import { loadFx, tagPrims } from "../n64fx.js";

const FPS = 30; // the exported clips' rate
const GLB = 100; // the exported models are in hundredths of the game's units

const gltfLoader = new GLTFLoader();
const imgLoader = new THREE.ImageLoader();
const gltf = (url) => retry((n) => gltfLoader.loadAsync(attemptURL(url, n)), url);
const image = (url) => retry((n) => imgLoader.loadAsync(attemptURL(url, n)), url);
function texture(img) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

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
  m.customProgramCacheKey = () => "delibird-shade";
  return m;
}
function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    // (a part with no normals is drawn unlit, its vertex colours as they are: the walls' plain faces)
    const lit = !!o.geometry.attributes.normal;
    const make = (m) => {
      if (lit) return n64Material(m);
      const b = new THREE.MeshBasicMaterial({ name: m.name, map: m.map, vertexColors: !!o.geometry.attributes.color, side: m.side,
        transparent: m.transparent, alphaTest: m.alphaTest, depthWrite: m.depthWrite });
      if (b.map) b.map.colorSpace = THREE.NoColorSpace;
      return b;
    };
    o.material = Array.isArray(o.material) ? o.material.map(make) : make(o.material);
    o.frustumCulled = false;
  });
  return scene;
}

const GIFTS = 9;
const MODELS = ["delibird", "sack", "field", "walls", "swinub_right", "swinub_left", "box", "box_big",
  ...Array.from({ length: GIFTS }, (_, k) => "gift" + k)];
const PICTURES = ["shadow", "full", ...Array.from({ length: 13 }, (_, k) => "sparkle" + k)];
// FULL's colours (0x86A0BB40: white, through each player's dark colour)
const FULL_ENV = [[0, 0, 0x9b], [0, 0x82, 0], [0x9b, 0, 0], [0xc3, 0x64, 0]];
// the clips that go round (their flag 1, 0x8003E7BC: from the last frame back
// to the first), by clip: the frame they go back to. Delibird standing,
// turning and walking, the sack's at the end, the Swinub running; and
// Delibird's cheer and sulk, which its draw sends back to frames 9 and 42
// (0x86A01EF0). Each gets that frame again one on from its last, to be drawn
// between the two
const ROUND = { delibird: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 9, 7: 42 }, sack: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 13: 0, 14: 0 },
  swinub_right: { 0: 0 }, swinub_left: { 0: 0 } };

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, badges, fx] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(image(base + p + ".png")))),
    loadBadges(job),
    loadFx(base, job),
  ]);
  const out = { badges, fx };
  MODELS.forEach((name, i) => {
    const g = models[i];
    tagPrims(g); // (the belts' primitives, by number: fx.json's)
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    const frames = clips.map((c) => Math.round(c.duration * FPS) + 1);
    for (const [k, back] of Object.entries(ROUND[name] || {})) if (clips[k]) closeLoop(clips[k], frames[k], back);
    out[name] = { scene: g.scene, clips, frames };
  });
  PICTURES.forEach((name, i) => { out[name] = texture(pics[i]); });
  // (the ring's sparkle goes on its model as its own texture did: glTF's way up)
  out.sparkle = PICTURES.filter((n) => n.startsWith("sparkle")).map((n) => { out[n].flipY = false; return out[n]; });
  // (a picture as the game's combiner draws a grey one: env to prim by its grey)
  out.fullFor = FULL_ENV.map((env) => texture(tint(pics[PICTURES.indexOf("full")], [255, 255, 255], env)));
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
// frame (between frames; past its last towards its first again, for one that
// goes round, else held there)
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
      c.userData.transparent = c.transparent;
      mats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  return {
    root, model, mixer, mats,
    // the clip's frames (the game's: the export's last key, and one)
    length: (i) => a.frames[i] ?? 1,
    // clip i at frame f
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
      const d = a.clips[i].duration;
      action.time = d > 0 ? Math.max(0, Math.min(f / FPS, d - 1e-4)) : 0;
      mixer.update(0);
    },
    // see-through by k (1: as it is)
    fade(k) {
      for (const m of mats) {
        const t = k < 1 || m.userData.transparent;
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = k;
      }
    },
  };
}
