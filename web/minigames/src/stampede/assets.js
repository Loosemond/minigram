// Loads Streaming Stampede's files (tools/web_assets.py puts them in
// assets/stampede/): the studio (the circus backdrop, the ramp, the books),
// the four booths, Cleffa and Igglybuff with their faces, a strip of
// pictures for each Pokemon that goes by, and the booths' digits. The question
// board's pictures are loaded by the page. Lighting is done on the textures'
// display values, as the N64 does (see src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL, fetchRetry } from "../retry.js";
import { KINDS } from "./rules.js";

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
// a face texture, set up like the one it stands in for
function faceTexture(url, like) {
  return texture(url).then((t) => {
    t.flipY = false; // (glTF's way, like the model's own)
    if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.magFilter = like.magFilter; t.minFilter = like.minFilter; }
    t.generateMipmaps = false;
    return t;
  });
}

const PROPS = ["backdrop", "ramp", "books"];
const PLAYERS = ["cleffa", "igglybuff"];
const FACES = { cleffa: [2, 3], igglybuff: [0, 1, 2, 3] };

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const banks = [...new Set(KINDS.map((k) => k.bank)), 201];
  const [props, booths, players, infos, strips, digits, gold] = await Promise.all([
    Promise.all(PROPS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all([0, 1, 2, 3].map((i) => job(gltf(base + "booth" + i + ".glb")))),
    Promise.all(PLAYERS.map((m) => job(gltf(base + m + ".glb")))),
    Promise.all(PLAYERS.map((m) => job(fetchRetry(base + m + ".json").then((r) => r.json())))),
    Promise.all(banks.map((b) => job(texture(base + "s" + b + ".png")))),
    Promise.all([...Array(10).keys()].map((i) => job(texture(base + "d" + i + ".png")))), // image bank 415
    Promise.all([...Array(10).keys()].map((i) => job(texture(base + "g" + i + ".png")))), // and in gold, for the counts
  ]);
  const out = { sprites: {}, digits, gold };
  PROPS.forEach((name, i) => { out[name] = prepare(props[i].scene); });
  out.booths = booths.map((g) => prepare(g.scene));
  banks.forEach((b, i) => { out.sprites[b] = strips[i]; });
  await Promise.all(PLAYERS.map(async (name, i) => {
    const g = players[i], info = infos[i];
    prepare(g.scene);
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like = o.material.map; });
    const faces = {};
    await Promise.all(FACES[name].map((k) => faceTexture(base + name + "_face" + k + ".png", like).then((t) => { faces[k] = t; })));
    // the clips in order (clip00 ...), and the face track each one has (by face channel)
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    const faceTracks = clips.map((c) => info.clips.find((m) => m.name === c.name)?.face || null);
    const blink = info.clips.find((m) => m.name === "texanim00")?.face || null;
    out[name] = { scene: g.scene, clips, faceTracks, blink, faces, frames: clips.map((c) => Math.round(c.duration * FPS)) };
  }));
  return out;
}

// A model, at the game's scale (s: its scale in the game), with its own
// mixer and faces: a clip's face track swaps them as it plays, and blink()
// plays the model's own texture clip once (its eyes).
export function makeModel(a, s) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const faceMats = [];
  model.traverse((o) => {
    if (o.isMesh && o.material.userData.ps2_face) {
      o.material = o.material.clone();
      faceMats.push(o.material);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = (a.clips || []).map((c) => mixer.clipAction(c));
  let current = -1, action = null, blinkAt = -1;
  const setFaces = (track, f) => {
    for (const m of faceMats) {
      const ch = m.userData.ps2_face.channel, list = track?.[ch];
      const k = list ? list[Math.min(list.length - 1, Math.max(0, f))] : m.userData.ps2_face.default;
      if (a.faces?.[k] && m.map !== a.faces[k]) m.map = a.faces[k];
    }
  };
  const api = {
    root, mixer,
    get clip() { return current; },
    play(i, { loop = true, fade = 0.12, from = 0, restart = false } = {}) {
      const next = actions[i];
      if (!next || (i === current && !restart)) return;
      next.reset();
      next.time = from / FPS;
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !loop;
      next.play();
      if (action && action !== next && fade > 0) action.crossFadeTo(next, fade, false);
      else if (action && action !== next) action.stop();
      current = i; action = next;
    },
    get done() { return !action || (!action.isRunning() && action.loop === THREE.LoopOnce); },
    frame() { return action ? Math.floor(action.time * FPS) : 0; },
    blink() { if (a.blink && blinkAt < 0) blinkAt = 0; },
    update(dt) {
      mixer.update(dt);
      const track = a.faceTracks?.[current];
      if (track) setFaces(track, Math.floor(action.time * FPS));
      else if (blinkAt >= 0) {
        setFaces(a.blink, Math.floor(blinkAt));
        blinkAt += dt * FPS;
        if (blinkAt >= Object.values(a.blink)[0].length) blinkAt = -1;
      } else setFaces(null, 0);
    },
  };
  return api;
}

// A Pokemon that goes by: a quad of its picture's size facing the camera's
// way (not turned to it: the game's are flat in the scene), centred on its
// spot, showing one picture of its bank's strip.
export function makeSprite(assets, kind) {
  const tex = assets.sprites[kind.bank].clone();
  const n = tex.image.width / kind.w;
  tex.repeat.set((kind.w - 1) / (n * kind.w), (kind.h - 1) / kind.h); // (half a texel in from each edge: no bleeding from the next picture)
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(kind.w, kind.h), mat);
  mesh.scale.setScalar(kind.scale);
  mesh.frustumCulled = false;
  mesh.userData.show = (k) => tex.offset.set((k * kind.w + 0.5) / (n * kind.w), 0.5 / kind.h);
  mesh.userData.show(0);
  return mesh;
}

// its shadow: image bank 201's grey dot, flat on the ground, grey at half
// strength (the game's prim colour 192, 192, 192, 128)
export function makeShadow(assets, kind) {
  const mat = new THREE.MeshBasicMaterial({ map: assets.sprites[201], color: 0xc0c0c0, transparent: true, opacity: 0.5, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(kind.shadow);
  mesh.visible = kind.shadow > 0;
  mesh.frustumCulled = false;
  return mesh;
}
