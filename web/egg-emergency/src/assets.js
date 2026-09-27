// Loads the extracted models and images (see tools/web_assets.py) and sets the
// models up to look like the N64: lighting is done on the texture's display
// values (no sRGB decode or encode), Lambert only, no specular. See docs/colours.md.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

THREE.ColorManagement.enabled = false; // colours are the game's own values

const FPS = 30; // the game's animation rate
const OBJECT_SCALE = 1 / 11.5; // objects table units -> Chansey is 1 unit tall

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

function loadTexture(url, like) {
  return texLoader.loadAsync(url).then((t) => {
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
  return texLoader.loadAsync(url).then((t) => { t.colorSpace = THREE.NoColorSpace; return t; });
}

function image(url) {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const frames = (name, n, pad) => Promise.all([...Array(n)].map((_, i) =>
    job(spriteTexture(base + name + String(i).padStart(pad, "0") + ".png"))));
  const big = Promise.all([...Array(10)].map((_, i) => job(image(base + "ui/big" + i + ".png"))));
  const [chansey, info, egg, voltorb, splash, smoke, burst, sparks, backdrop, digits, plus, minus] = await Promise.all([
    job(gltfLoader.loadAsync(base + "chansey.glb")),
    job(fetch(base + "chansey.json").then((r) => r.json())),
    job(gltfLoader.loadAsync(base + "egg.glb")),
    frames("voltorb", 6, 1),
    frames("splash", 12, 2),
    job(spriteTexture(base + "fx_smoke.png")),
    job(spriteTexture(base + "fx_burst.png")),
    job(spriteTexture(base + "fx_sparks.png")),
    job(spriteTexture(base + "backdrop.jpg")),
    big,
    job(image(base + "ui/plus.png")),
    job(image(base + "ui/minus.png")),
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
    fx: { smoke, burst, sparks, splash },
    digits: { big: digits, plus, minus },
  };
}

// One Chansey: its own mixer and its own face material.
export function makeChansey(assets) {
  const a = assets.chansey;
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(OBJECT_SCALE);
  const root = new THREE.Group();
  root.add(model);
  let face = null;
  model.traverse((o) => {
    if (o.isMesh && o.material.userData.ps2_face) { o.material = o.material.clone(); face = o.material; }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  let current = -1, currentAction = null;
  const setFace = (k) => { if (face && a.faces[k] && face.map !== a.faces[k]) face.map = a.faces[k]; };

  const api = {
    root, mixer,
    get clip() { return current; },
    // play clip i; {loop, fade, speed, restart}
    play(i, { loop = true, fade = 0.12, speed = 1, restart = false } = {}) {
      if (i === current && !restart) { currentAction.timeScale = speed; return; }
      const next = actions[i];
      next.reset();
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.timeScale = speed;
      next.play();
      if (currentAction && fade > 0) currentAction.crossFadeTo(next, fade, false);
      else if (currentAction) currentAction.stop();
      current = i; currentAction = next;
    },
    get done() { return !currentAction || (!currentAction.isRunning() && currentAction.loop === THREE.LoopOnce); },
    update(dt) {
      mixer.update(dt);
      const track = a.faceTracks[current];
      if (track) setFace(track[Math.min(track.length - 1, Math.floor(currentAction.time * FPS))]);
      else setFace(a.faceDefault);
    },
    seek(t) { mixer.setTime(t); api.update(0); },
  };
  return api;
}

// objects of player i's area are on layer i + 1, so each player's own view
// can leave the others out (layer 0 is shared)
export function setLayer(obj, n) { obj.traverse((o) => o.layers.set(n)); }

export function makeEgg(assets) {
  const m = cloneSkinned(assets.egg);
  m.scale.setScalar(OBJECT_SCALE);
  return m;
}

// In Egg Emergency Voltorb is a 2D sprite (image bank 227), not a 3D model.
export function makeVoltorb(assets, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: assets.voltorb[0], transparent: true, alphaTest: 0.1 }));
  s.scale.setScalar(size);
  s.userData.frames = assets.voltorb;
  return s;
}
