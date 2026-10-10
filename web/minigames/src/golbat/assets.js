// Loads Gutsy Golbat's files (tools/web_assets.py puts them in
// assets/golbat/): Golbat (object 53), Jynx (110), the backdrops (image bank
// 221: the cave, its mouth, the meadow), the Magnemite and heart strips (banks
// 69 and 222), each player's glow (bank 343, coloured), module #64's particles
// (bank 224's burst and 225's lightning, strips of 8, and 147's star in each
// player's colours and Jynx's) and the badges over them (434, the shared
// ones: src/badge.js). Lighting is done on the textures' display values, as
// the N64 does (see src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
import { loadBadges } from "../badge.js";

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

// A material drawn as the game's models are. The RSP's shade is ambient + the
// lights' N.L, held to 1, and the texel's times it: so with the scene's
// ambient of 250/255 (index.js) a model is lit almost flat, never brighter
// than its texture. And the object's colour (its +0xC4: rgb and how much)
// laid over it as the draw's fog colour, blended by its alpha (the first
// cycle's G_RM_FOG_PRIM_A, OR'd on every layer's render mode at 0x8003D140,
// the colour from SetFogColor at 0x8003D0D4): out = fog x a + in x (1 - a).
// fog: { value: Vector4(r, g, b, a) }, 0-1, shared by a model's materials;
// for sprites too (the Magnemite's flash).
export function n64Look(m, fog) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.n64fog = fog;
    sh.fragmentShader = "uniform vec4 n64fog;\n" + sh.fragmentShader
      .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        "vec3 outgoingLight = min(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, diffuseColor.rgb) + totalEmissiveRadiance;")
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, n64fog.rgb, n64fog.a);");
  };
  m.customProgramCacheKey = () => "golbat-n64";
  m.needsUpdate = true;
  return m;
}

const MODELS = ["golbat", "jynx"];
const PICTURES = ["cave", "mouth", "meadow", "magnemite", "hearts", "glow0", "glow1", "glow2", "glow3",
  "spark", "bolt", "star0", "star1", "star2", "star3", "star_jynx"];

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
    out[name] = { scene: g.scene, clips };
  });
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  return out;
}

// A model, at the game's scale, with its own mixer: a clip is posed at a frame
// (looped), and the object's colour laid over it (fog())
export function makeModel(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  const fog = { value: new THREE.Vector4(1, 1, 1, 0) };
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => n64Look(m.clone(), fog));
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  return {
    root, model, mixer,
    get clip() { return current; },
    length: (i) => (a.clips[i] ? Math.round(a.clips[i].duration * FPS) : 1),
    // clip i at frame f (looped)
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
      // (three.js only loops a clip's time when it's run on, not when it's set: wrap it here)
      const d = a.clips[i].duration;
      action.time = d > 0 ? (Math.max(0, f) / FPS) % d : 0;
      mixer.update(0);
    },
    // the object's colour over it (n64Look): rgb (a THREE.Color) by alpha (0-1: 0 none)
    fog(rgb, alpha) { fog.value.set(rgb.r, rgb.g, rgb.b, Math.max(0, Math.min(1, alpha))); },
  };
}
