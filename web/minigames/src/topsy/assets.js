// Loads Topsy-Turvy's files (tools/web_assets.py puts them in assets/topsy/):
// Hitmontop (object 115) with its faces, the shadow (79), the rings round a
// Hitmontop after its RAPID SPIN (195-198, one in each player's colour) and
// the sparks of a bump (199, and 200 with a RAPID SPIN), with the recipes the
// rings and sparks are drawn by (fx.json: below); and the ring itself, the
// game's background picture (image bank 223), and the glow (151) that
// trails a Hitmontop sent reeling. Lighting is done on the
// textures' display values, as the N64 does (see src/egg/assets.js,
// docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL, fetchRetry } from "../retry.js";

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
    job(fetchRetry(base + "fx.json").then((r) => r.json())),
  ]);
  // the recipes' pictures, each once
  const files = [...new Set(Object.values(fx).flat().flatMap((s) => s.textures.filter(Boolean).map((t) => t.file)))];
  const fxPics = Object.fromEntries(await Promise.all(files.map((f) => job(texture(base + f)).then((t) => [f, t]))));
  const out = {};
  await Promise.all(MODELS.map(async (name, i) => {
    const g = models[i];
    prepare(g.scene);
    const clips = g.animations.filter((a) => a.name.startsWith("clip")).sort((a, b) => a.name.localeCompare(b.name));
    out[name] = { scene: g.scene, clips, faces: {} };
    if (name !== "hitmontop") return;
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like = o.material.map; });
    await Promise.all(FACES.map((k) => job(faceTexture(`${base}face${k}.png`, like)).then((t) => { out[name].faces[k] = t; })));
  }));
  // Hitmontop's face tracks, by clip (its blink, texanim00, the rest of the time)
  const H = out.hitmontop;
  H.faceTracks = H.clips.map((c) => info.clips.find((m) => m.name === c.name)?.face || null);
  H.blink = info.clips.find((m) => m.name.startsWith("texanim"))?.face || null;
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  out.fx = fx;
  out.fxPics = { ...fxPics, "glow.png": out.glow };
  return out;
}

// ---- the effects: the game's colour combiner ----
// The rings and the sparks are textured by material callbacks (fx.json, which
// tools/web_assets.py writes from the ROM: docs/fragments.md), and the glow by
// the combiner 0x86000CCC sets. Their pictures are I8: the RDP reads an I
// texel's grey as its alpha too, so they're clear where they're dark (the
// glTF's baked still reads them opaque: white and dark boxes). All are drawn
// translucent (the sparks and rings in geo 0x22's layers 6 and 8, 0x80094B04's
// table: G_RM_AA_ZB_XLU_SURF and _INTER; the glow in G_RM_AA_ZB_XLU_SURF
// itself): the colour by its alpha over what's there, the depth tested, not
// written. So here: never added on.
//
// The combiner is (a - b) x c + d for the colour and for the alpha, once or
// twice (a second cycle that's all zero leaves the first: tools/ps2tool/
// combiner.py, which this follows). Its selectors, in a recipe's order:
const RGB = ["C.rgb", "t0.rgb", "t1.rgb", "prim.rgb", "shade.rgb", "env.rgb"];
const SEL_A = [...RGB, "vec3(1.0)", "vec3(0.5)"]; // (then 1, the noise)
const SEL_B = [...RGB, "vec3(0.5)", "vec3(0.0)"]; // (then the key's centre, K4)
const SEL_C = [...RGB, "vec3(C.a)", "vec3(t0.a)", "vec3(t1.a)", "vec3(prim.a)", "vec3(shade.a)", "vec3(env.a)", "vec3(0.0)", "vec3(plod)"];
const SEL_D = [...RGB, "vec3(1.0)", "vec3(0.0)"];
const ALPHA = ["C.a", "t0.a", "t1.a", "prim.a", "shade.a", "env.a", "1.0", "0.0"]; // (a, b and d)
const ALPHA_C = ["0.0", "t0.a", "t1.a", "prim.a", "shade.a", "env.a", "plod", "0.0"];
const cycle = (s) => `C = vec4((${SEL_A[s[0]] ?? "vec3(0.0)"} - ${SEL_B[s[1]] ?? "vec3(0.0)"}) * ${SEL_C[s[2]] ?? "vec3(0.0)"} + ${SEL_D[s[3]] ?? "vec3(0.0)"},
  (${ALPHA[s[4]] ?? "0.0"} - ${ALPHA[s[5]] ?? "0.0"}) * ${ALPHA_C[s[6]] ?? "0.0"} + ${ALPHA[s[7]] ?? "0.0"});`;
const oneCycle = (m) => m.slice(8, 12).every((s, k) => s === 31 || (k === 2 ? s === 7 : s >= 7)) && m.slice(12).every((s) => s === 7 || s === 31);
// a tile's picture as the RDP wraps it (1 mirror, 2 clamp, else repeat)
const WRAP = (m) => (m & 2 ? THREE.ClampToEdgeWrapping : m & 1 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping);
const tiles = new Map();
function tile(pic, wrap, flipY) {
  const key = `${pic.uuid}:${wrap}:${flipY}`;
  if (!tiles.has(key)) {
    const t = pic.clone();
    [t.wrapS, t.wrapT] = wrap.map(WRAP);
    t.flipY = flipY;
    t.generateMipmaps = false;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    tiles.set(key, t);
  }
  return tiles.get(key);
}
const lerp = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);

// A recipe as a material: sprite for a sprite's, shade if the mesh has vertex
// colours, flipY for a picture on a sprite (else glTF's way up). Its frame(f,
// loop) sets its colours and its tiles' scroll for frame f (the game's, 30 a
// second) of its colour track: between keys, linearly (as tools/blender reads
// them), held at its last (loop: round its period, back to its first)
export function combiner(assets, spec, { sprite = false, shade = false, flipY = false } = {}) {
  const [s0, s1 = s0] = spec.textures;
  const u = {
    prim: { value: new THREE.Vector4() }, env: { value: new THREE.Vector4() }, plod: { value: 1 },
    map1: { value: tile(assets.fxPics[s1.file], s1.wrap, flipY) },
    tile0: { value: new THREE.Vector4(1, 1, 0, 0) }, tile1: { value: new THREE.Vector4(1, 1, 0, 0) },
  };
  // (the model's texture coordinates are tile 0's: tile 1 has its own shift and size)
  const rel = (k) => (s1.sf[k] / s0.sf[k]) * (s0.size[k] / s1.size[k]);
  const read = (map, uv, s) => (s.fmt === 4 ? `vec4(texture2D(${map}, ${uv}).r)` : `texture2D(${map}, ${uv})`);
  const body = `vec4 t0 = ${read("map", "vMapUv * tile0.xy + tile0.zw", s0)};
    vec4 t1 = ${read("map1", "vMapUv * tile1.xy + tile1.zw", s1)};
    #if defined( USE_COLOR_ALPHA )
      vec4 shade = vColor;
    #elif defined( USE_COLOR )
      vec4 shade = vec4(vColor, 1.0);
    #else
      vec4 shade = vec4(1.0);
    #endif
    vec4 C = vec4(0.0);
    ${cycle(spec.mux.slice(0, 8))}
    ${oneCycle(spec.mux) ? "" : cycle(spec.mux.slice(8))}
    diffuseColor *= clamp(C, 0.0, 1.0);`;
  const opts = { map: tile(assets.fxPics[s0.file], s0.wrap, flipY), transparent: true, depthWrite: false };
  const m = sprite ? new THREE.SpriteMaterial(opts) : new THREE.MeshBasicMaterial({ ...opts, side: THREE.DoubleSide, vertexColors: shade });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = "uniform vec4 prim, env, tile0, tile1;\nuniform float plod;\nuniform sampler2D map1;\n"
      + sh.fragmentShader.replace("#include <map_fragment>", body).replace("#include <color_fragment>", "");
  };
  const key = `n64:${spec.mux}:${s0.fmt}:${s1.fmt}:${sprite}`;
  m.customProgramCacheKey = () => key;
  const still = [...spec.prim, spec.lod ?? 255];
  m.n64 = {
    prim: u.prim.value, env: u.env.value,
    frame(f, loop = false) {
      const t = spec.track;
      let p = still, e = spec.env;
      if (t) {
        const keys = t.times.map((at, i) => [at, t.prim?.[i] || still, t.env?.[i] || spec.env]);
        if (loop && t.period > keys[keys.length - 1][0]) keys.push([t.period, keys[0][1], keys[0][2]]);
        const at = loop ? ((f % t.period) + t.period) % t.period : Math.max(0, Math.min(f, keys[keys.length - 1][0]));
        let i = 0;
        while (i < keys.length - 2 && at >= keys[i + 1][0]) i++;
        const [a, pa, ea] = keys[i], [b, pb, eb] = keys[Math.min(i + 1, keys.length - 1)];
        const k = b > a ? Math.max(0, Math.min(1, (at - a) / (b - a))) : 0;
        p = lerp(pa, pb, k);
        e = lerp(ea, eb, k);
      }
      u.prim.value.set(p[0] / 255, p[1] / 255, p[2] / 255, p[3] / 255);
      u.plod.value = (p[4] ?? 255) / 255;
      u.env.value.set(e[0] / 255, e[1] / 255, e[2] / 255, e[3] / 255);
      // a scroll (texels a frame) moves the tile's origin on: the picture slides back (mod 2: a mirror's period)
      const off = (s, k) => (((-(s.scroll?.[k] || 0) * f) / s.size[k]) % 2 + 2) % 2;
      u.tile0.value.set(1, 1, off(s0, 0), off(s0, 1));
      u.tile1.value.set(rel(0), rel(1), off(s1, 0), off(s1, 1));
    },
  };
  m.n64.frame(0);
  return m;
}
// a model's meshes dressed in their recipes (by their materials' callbacks: "..._cb01" is recipe 1)
export function dress(assets, model, specs) {
  const mats = [];
  model.model.traverse((o) => {
    if (!o.isMesh) return;
    const spec = specs[+/_cb(\d+)$/.exec(o.material.name)?.[1]] || specs[0];
    o.material = combiner(assets, spec, { shade: !!o.geometry.attributes.color });
    mats.push(o.material);
  });
  return mats;
}

// A model, at the game's scale (s), with its own mixer and faces: a clip
// posed at a frame (looped, or held at its end) sets them from its face
// track, or the blink does
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
    // clip i at frame f (looped; or held on its last frame); blink: the blink's frame, between clips
    pose(i, f, hold = false, blink = 0) {
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
      const track = a.faceTracks?.[i], k = Math.floor(action.time * FPS);
      for (const m of faceMats) {
        const ch = m.userData.ps2_face.channel, list = track?.[ch] || (a.blink && blink >= 0 ? a.blink[ch] : null);
        const at = track?.[ch] ? k : blink;
        setFace(m, list ? list[Math.min(list.length - 1, Math.max(0, at))] : m.userData.ps2_face.default);
      }
    },
    // a colour laid over it: towards rgb by k (0 none)
    tint(rgb, k) {
      for (const m of mats) {
        m.color.copy(m.userData.base).lerp(rgb, k);
        m.emissive?.copy(rgb).multiplyScalar(k * 0.6);
      }
    },
  };
}
