// Loads the extracted models and images (see tools/web_assets.py) and sets the
// models up to look like the N64: lighting is done on the texture's display
// values (no sRGB decode or encode), Lambert only, no specular. See docs/colours.md.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL, fetchRetry } from "../retry.js";

THREE.ColorManagement.enabled = false; // colours are the game's own values

const FPS = 30; // the game's animation rate

const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

function n64Material(src) {
  if (src.isMeshBasicMaterial) { // unlit: already shows the raw colours
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
    o.frustumCulled = false; // skinned bounds don't follow the animation
  });
  return scene;
}

const gltf = (url) => retry((n) => gltfLoader.loadAsync(attemptURL(url, n)), url);
const texture = (url) => retry((n) => texLoader.loadAsync(attemptURL(url, n)), url);

function loadTexture(url, like) {
  return texture(url).then((t) => {
    t.flipY = false; // glTF convention, like the model's own textures
    t.colorSpace = THREE.NoColorSpace;
    if (like) {
      t.wrapS = like.wrapS; t.wrapT = like.wrapT;
      t.magFilter = like.magFilter; t.minFilter = like.minFilter;
    }
    t.generateMipmaps = false;
    return t;
  });
}

function spriteTexture(url) {
  return texture(url).then((t) => { t.colorSpace = THREE.NoColorSpace; return t; });
}

function image(url) {
  return retry((n) => {
    const img = new Image();
    img.src = attemptURL(url, n);
    return img.decode().then(() => img);
  }, url);
}

// base: Egg Emergency's own files (assets/egg/)
export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const frames = (name, n, pad) => Promise.all([...Array(n)].map((_, i) =>
    job(spriteTexture(base + name + String(i).padStart(pad, "0") + ".png"))));
  const [chansey, info, egg, voltorb, splash, spark, perfect, backdrop] = await Promise.all([
    job(gltf(base + "chansey.glb")),
    job(fetchRetry(base + "chansey.json").then((r) => r.json())),
    job(gltf(base + "egg.glb")),
    frames("voltorb", 6, 1),
    frames("splash", 12, 2),
    job(spriteTexture(base + "spark.png")),
    job(image(base + "perfect.png")),
    job(spriteTexture(base + "backdrop.jpg")),
  ]);
  prepare(chansey.scene);
  prepare(egg.scene);

  // face textures, swapped per frame by the clips that have a face track
  let faceMat = null;
  chansey.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) faceMat = o.material; });
  const faces = {};
  if (faceMat) {
    const f = faceMat.userData.ps2_face;
    await Promise.all(Object.keys(f.files).map((k) =>
      loadTexture(base + "chansey_face" + k + ".png", faceMat.map).then((t) => { faces[k] = t; })));
  }
  const clips = chansey.animations.slice().sort((a, b) => a.name.localeCompare(b.name));
  const faceTracks = clips.map((c) => {
    const meta = info.clips.find((m) => m.name === c.name);
    return meta && meta.face ? meta.face["0"] : null;
  });

  return {
    chansey: { scene: chansey.scene, clips, faceTracks, faces, faceDefault: faceMat?.userData.ps2_face.default },
    egg: egg.scene,
    voltorb, // 6 frames, 24x24
    backdrop,
    fx: { splash, spark },
    perfect, // "PERFECT" (image bank 433), grey: coloured per player as it's drawn
  };
}

// One Chansey at scale s: its own mixer and its own face material, a clip posed
// at a frame of the game's (pose), a colour laid over it (tint), and where its
// attachment point (bone 3, the head) is.
export function makeChansey(assets, s) {
  const a = assets.chansey;
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(s);
  const root = new THREE.Group();
  root.add(model);
  let face = null, head = null;
  const mats = [];
  model.traverse((o) => {
    if (o.name === "bone_03") head = o;
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => {
      const c = m.clone();
      c.userData = { ...m.userData, base: c.color.clone() };
      if (m.userData.ps2_face) face = c;
      mats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  let current = -1, action = null;
  const setFace = (k) => { if (face && a.faces[k] && face.map !== a.faces[k]) face.map = a.faces[k]; };
  const at = new THREE.Vector3();

  return {
    root, mixer,
    get clip() { return current; },
    // clip i at frame f of the game's (0 to its last)
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
      action.time = Math.min(Math.max(0, f) / FPS, d - 1e-4);
      mixer.update(0);
      const track = a.faceTracks[i];
      if (track) setFace(track[Math.min(track.length - 1, Math.max(0, Math.floor(f)))]);
      else setFace(a.faceDefault);
    },
    // a colour laid over it: towards rgb by k (0 none)
    tint(rgb, k) {
      for (const m of mats) {
        m.color.copy(m.userData.base).lerp(rgb, k);
        if (m.emissive) m.emissive.copy(rgb).multiplyScalar(k * 0.6);
      }
    },
    // its head's height, in the scene (where the game's attachment point is)
    headY() { root.updateMatrixWorld(true); return head ? head.getWorldPosition(at).y : root.position.y; },
  };
}

// objects of player i's area are on layer i + 1, so each player's own view
// can leave the others out (layer 0 is shared)
export function setLayer(obj, n) { obj.traverse((o) => o.layers.set(n)); }

// the egg at scale s; see-through (an egg knocked out) at opacity
export function makeEgg(assets, s, opacity = 1) {
  const m = cloneSkinned(assets.egg);
  m.scale.setScalar(s);
  if (opacity < 1) {
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = [o.material].flat().map((x) => { const c = x.clone(); c.transparent = true; c.opacity = opacity; c.depthWrite = false; return c; });
      if (o.material.length === 1) o.material = o.material[0];
    });
  }
  return m;
}

// In Egg Emergency Voltorb is a 2D sprite (image bank 227), not a 3D model.
export function makeVoltorb(assets, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.voltorb[0], transparent: true, alphaTest: 0.1 }));
  s.scale.setScalar(size);
  s.userData.frames = assets.voltorb;
  return s;
}
