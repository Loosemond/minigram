// Loads Topsy-Turvy's files (tools/web_assets.py puts them in assets/topsy/):
// Hitmontop (object 115) with its faces, the shadow (79), the rings round a
// Hitmontop after its RAPID SPIN (195-198, one in each player's colour) and
// the sparks of a bump (199, and 200 with a RAPID SPIN), with the recipes the
// rings and sparks are drawn by (fx.json: src/n64fx.js); and the ring itself, the
// game's background picture (image bank 223), and the glow (151) that
// trails a Hitmontop sent reeling. Lighting is done on the
// textures' display values, as the N64 does (see src/egg/assets.js,
// docs/colours.md).
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

const MODELS = ["hitmontop", "shadow", "ring0", "ring1", "ring2", "ring3", "spark", "flash"];
const FACES = [2, 3, 4, 5, 6, 8, 9, 10]; // Hitmontop's eyes (2-6) and mouth (8-10)
const PICTURES = ["ring", "glow", "bricks"];

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, info, pics, fx] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
    job(fetchRetry(base + "hitmontop.json").then((r) => r.json())),
    Promise.all(PICTURES.map((p) => job(texture(base + p + ".png")))),
    loadFx(base, job),
  ]);
  const out = {};
  await Promise.all(MODELS.map(async (name, i) => {
    const g = models[i];
    tagPrims(g);
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips, faces: {} };
    if (name !== "hitmontop") return;
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like = o.material.map; });
    await Promise.all(FACES.map((k) => job(faceTexture(`${base}face${k}.png`, like)).then((t) => { out[name].faces[k] = t; })));
  }));
  // Hitmontop's texture clips (its face: 0 a blink, then those of clips 7, 9, 11 and 12), by number. The
  // extractor files each with a clip of its length (face_clip), so the one of clip 12 is with clip 3; the
  // game says which plays with which (0x8600D540: game.js)
  const H = out.hitmontop;
  H.texanims = [];
  for (const m of info.clips) if (Number.isInteger(m.face_clip) && m.face) H.texanims[m.face_clip] = m.face;
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  out.fx = fx;
  fx.pics["glow.png"] = out.glow; // (drawn through the combiner 0x86000CCC sets: game.js)
  return out;
}

// A model, at the game's scale (s), with its own mixer and faces: a clip
// posed at a frame (looped, or held at its end), and a texture clip's frame
// on its face (else its own)
export function makeModel(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  const mats = [], faceMats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => {
      const c = m.clone();
      c.userData.base = c.color.clone();
      c.userData.own = { transparent: c.transparent, opacity: c.opacity, depthWrite: c.depthWrite };
      mats.push(c);
      if (c.userData.ps2_face) faceMats.push(c);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  const setFace = (m, k) => { if (a.faces?.[k] && m.map !== a.faces[k]) m.map = a.faces[k]; };
  return {
    root, model, mixer, mats,
    get clip() { return current; },
    length: (i) => (a.clips[i] ? Math.max(1, Math.round(a.clips[i].duration * FPS)) : 1), // (at least a frame: clip 0's is one pose)
    // clip i at frame f (looped; or held on its last frame); face: [texture clip, its frame], or none
    pose(i, f, hold = false, face = null) {
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
      // (a texture clip's frame past its end: its last, *by assumption*)
      const track = face && a.texanims?.[face[0]];
      for (const m of faceMats) {
        const ch = m.userData.ps2_face.channel, list = track?.[ch];
        setFace(m, list ? list[Math.min(list.length - 1, Math.max(0, face[1]))] : m.userData.ps2_face.default);
      }
    },
    // a colour laid over it: towards rgb by k (0 none)
    tint(rgb, k) {
      for (const m of mats) {
        m.color.copy(m.userData.base).lerp(rgb, k);
        m.emissive?.copy(rgb).multiplyScalar(k * 0.6);
      }
    },
    // see-through, at alpha k (1: as it is): the game draws an object under 0xFF in its translucent
    // layers, which don't hide what's behind (0x8003D8E8)
    alpha(k) {
      for (const m of mats) {
        const own = m.userData.own, see = k < 1;
        if (m.transparent !== (see || own.transparent)) { m.transparent = see || own.transparent; m.needsUpdate = true; }
        m.opacity = see ? k * own.opacity : own.opacity;
        m.depthWrite = see ? false : own.depthWrite;
      }
    },
  };
}
