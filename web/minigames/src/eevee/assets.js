// Loads Eager Eevee's files (tools/web_assets.py puts them in assets/eevee/):
// Eevee, Aipom on its rope with the basket, Pineco, the fruit (and the one
// strawberry that flies off a pile), the Pineco's blast (objects 203, 204,
// 207 and their recipes: fx.json, src/n64fx.js), the shadows' picture (bank
// 307's first) and the dash's dust (bank 159, module #64's particle); the
// field is field.js's, the HUD's pictures are loaded by the page. Lighting
// is done on the textures' display values, as the N64 does (see
// src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL, fetchRetry } from "../retry.js";
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
// a face picture, set up as the model's own one (glTF's way up, its wrap and filters)
const faceTexture = (url, like) => texture(url).then((t) => {
  t.flipY = false;
  if (like) {
    t.wrapS = like.wrapS; t.wrapT = like.wrapT;
    t.magFilter = like.magFilter; t.minFilter = like.minFilter;
  }
  t.generateMipmaps = false;
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
  m.userData = src.userData; // (ps2_face: a face channel's pictures)
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

const MODELS = ["eevee", "aipom", "pineco", "melon", "grapes", "strawberries", "strawberry", "blast", "puff", "smoke"];
const EFFECTS = new Set(["blast", "puff", "smoke"]); // (dressed in their recipes: fx.json)
// each one's texture clips (its .json: by number, the pictures of each face
// channel a frame) and the face pictures besides the ones the glTF has
const INFO = { eevee: [7, 8], aipom: [5, 6], strawberries: [1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23] };

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, infos, fx, shadow, dust] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(Object.keys(INFO).map((m) => job(fetchRetry(base + m + ".json").then((r) => r.json())))),
    loadFx(base, job),
    job(texture(base + "shadow.png")),
    Promise.all([0, 1].map((k) => job(texture(base + "dust" + k + ".png")))),
  ]);
  const out = { fx, shadow, dust };
  await Promise.all(MODELS.map(async (name, i) => {
    const g = models[i];
    if (EFFECTS.has(name)) tagPrims(g);
    else prepare(g.scene);
    if (name === "aipom") longRope(g.scene);
    // the clips in order (clip00, clip01 ...)
    const a = out[name] = { scene: g.scene, clips: g.animations.filter((c) => c.name.startsWith("clip")).sort((x, y) => x.name.localeCompare(y.name)) };
    const k = Object.keys(INFO).indexOf(name);
    if (k < 0) return;
    // its texture clips by number (the extractor files each with a clip of its
    // length: face_clip) and the pictures each frame puts on each face channel
    a.texanims = [];
    for (const c of infos[k].clips) if (Number.isInteger(c.face_clip) && c.face) a.texanims[c.face_clip] = c.face;
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like ||= o.material.map; });
    a.faces = {};
    await Promise.all(INFO[name].map((f) => job(faceTexture(`${base}${name}_face${f}.png`, like)).then((t) => { a.faces[f] = t; })));
  }));
  return out;
}

// A model with its own mixer, at the game's scale (s: the object's scale in
// the game, e.g. 1/6 for Eevee). pose(clip, frame, loop) puts it in a clip's
// frame (the game's, 30 a second; between frames as the clip goes between
// them), looped or held at its end; face(frames) puts a texture clip's
// frame's pictures on its face channels (frames: channel -> picture; null:
// their own).
export function makeModel(a, s) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const faceMats = {}; // channel -> its material (each model its own)
  model.traverse((o) => {
    if (!o.isMesh || !o.material.userData?.ps2_face) return;
    o.material = o.material.clone();
    const f = o.material.userData.ps2_face;
    faceMats[f.channel] = { mat: o.material, own: o.material.map, deflt: f.default };
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = (a.clips || []).map((c) => mixer.clipAction(c));
  let current = -1, action = null;
  const api = {
    root, model, mixer,
    get clip() { return current; },
    pose(i, frame, loop = false) {
      const next = actions[i];
      if (!next) return;
      if (i !== current) {
        action?.stop();
        next.reset();
        next.play();
        next.paused = true;
        current = i;
        action = next;
      }
      const d = action.getClip().duration, t = frame / FPS;
      action.time = loop && d > 0 ? ((t % d) + d) % d : Math.max(0, Math.min(d, t));
      mixer.update(0);
    },
    // the pictures on its face channels: frames { channel: picture number } (null: each one's own)
    face(frames) {
      for (const [c, fm] of Object.entries(faceMats)) {
        const k = frames?.[c], map = k === undefined || k === null || k === fm.deflt ? fm.own : a.faces?.[k] || fm.own;
        if (fm.mat.map !== map) fm.mat.map = map;
      }
    },
    // a texture clip's frame f (held at its last) on its face channels
    texanim(n, f) {
      const tracks = a.texanims?.[n];
      if (!tracks) { api.face(null); return; }
      const out = {};
      for (const [c, v] of Object.entries(tracks)) out[c] = v[Math.max(0, Math.min(v.length - 1, Math.floor(f)))];
      api.face(out);
    },
    // where a bone is in the world (its name, e.g. "bone_03")
    bone(name, v = new THREE.Vector3()) {
      const b = model.getObjectByName(name);
      return b ? b.getWorldPosition(v) : root.getWorldPosition(v);
    },
  };
  return api;
}
