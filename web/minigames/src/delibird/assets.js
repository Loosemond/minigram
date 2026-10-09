// Loads Delibird's Delivery's files (tools/web_assets.py puts them in
// assets/delibird/): Delibird and its sack (object 127, layouts 0 and 1), the
// Swinub (82 running right, 103 left), the gift boxes (92, 96 the big one),
// the gifts (by the rules' KINDS: 175, 176, 181, 169, 180, 174, 184, 177, 170),
// the stage (148 the field, 147 its walls), and its pictures: the shadow
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

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, badges] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PICTURES.map((p) => job(image(base + p + ".png")))),
    loadBadges(job),
  ]);
  const out = { badges };
  MODELS.forEach((name, i) => {
    const g = models[i];
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = texture(pics[i]); });
  // (the ring's sparkle goes on its model as its own texture did: glTF's way up)
  out.sparkle = PICTURES.filter((n) => n.startsWith("sparkle")).map((n) => { out[n].flipY = false; return out[n]; });
  // (a picture as the game's combiner draws a grey one: env to prim by its grey)
  out.fullFor = FULL_ENV.map((env) => texture(tint(pics[PICTURES.indexOf("full")], [255, 255, 255], env)));
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
    length: (i) => (a.clips[i] ? Math.round(a.clips[i].duration * FPS) + 1 : 1),
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
