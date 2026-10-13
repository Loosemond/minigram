// Loads Barrier Ball's files (tools/web_assets.py puts them in
// assets/barrier/): Mr. Mime (object 218 in the play, 129 for the countdown
// and the end, with its mouth's two pictures), its barrier (141), the Poké
// Ball (154), the court's pieces (object 120: the floor, its lines, the hole
// and the four walls) and the glow round a ball (image bank 151); the barrier
// and the glow are drawn through the game's colour combiner (fx.json:
// src/n64fx.js). Lighting is done on the textures' display values, as the N64
// does (see src/egg/assets.js, docs/colours.md).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { retry, attemptURL } from "../retry.js";
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

// A material drawn as the game's models are. The RSP's shade is the ambient
// and the light's N.L, held to 1, and the texel's times it: never brighter
// than its texture (index.js has the lights). And the object's colour (its
// +0xC4: rgb and how much) laid over it as the draw's fog colour, by its
// alpha (0x8003BF3C hands it to 0x8003DBD0; the first cycle's
// G_RM_FOG_PRIM_A, 0x8003D098): out = fog x a + in x (1 - a), never
// see-through (the Poke Ball's smash flash). fog: { value: Vector4(r, g, b,
// a) }, 0-1, shared by a model's materials.
const NO_FOG = { value: new THREE.Vector4(1, 1, 1, 0) };
function n64Look(m, fog = NO_FOG) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.n64fog = fog;
    sh.fragmentShader = "uniform vec4 n64fog;\n" + sh.fragmentShader
      .replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        "vec3 outgoingLight = min(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, diffuseColor.rgb) + totalEmissiveRadiance;")
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, n64fog.rgb, n64fog.a);");
  };
  m.customProgramCacheKey = () => "barrier-n64";
  m.needsUpdate = true;
  return m;
}

function n64Material(src) {
  if (src.isMeshBasicMaterial) {
    if (src.map) src.map.colorSpace = THREE.NoColorSpace;
    return n64Look(src);
  }
  const m = new THREE.MeshLambertMaterial({
    name: src.name, map: src.map, color: src.color, vertexColors: src.vertexColors,
    side: src.side, transparent: src.transparent, alphaTest: src.alphaTest,
  });
  if (m.map) m.map.colorSpace = THREE.NoColorSpace;
  m.userData = src.userData;
  return n64Look(m);
}
function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(n64Material) : n64Material(o.material);
    o.frustumCulled = false;
  });
  return scene;
}
// a face picture, set up like the one it stands in for
function faceTexture(url, like) {
  return texture(url).then((t) => {
    t.flipY = false; // (glTF's way, like the model's own)
    if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.magFilter = like.magFilter; t.minFilter = like.minFilter; }
    t.generateMipmaps = false;
    return t;
  });
}

export const COURT_PIECES = ["floor", "lines", "hole", "wall_top", "wall_left", "wall_bottom", "wall_right"];
const MODELS = ["mime", "mime_show", "barrier", "ball", ...COURT_PIECES];
const PICTURES = ["glow"];
const FACES = [9, 10]; // Mr. Mime's (129) mouth: shut, open (its texture clip 0)

export async function loadAssets(base, onProgress = () => {}) {
  const jobs = [];
  let done = 0;
  const job = (p) => { jobs.push(p); return p.then((x) => { onProgress(++done / jobs.length); return x; }); };
  const [models, pics, fx] = await Promise.all([
    Promise.all(MODELS.map((m) => job(gltf(base + m + ".glb")))),
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
    if (name !== "mime_show") return;
    let like = null;
    g.scene.traverse((o) => { if (o.isMesh && o.material.userData.ps2_face) like = o.material.map; });
    await Promise.all(FACES.map((k) => job(faceTexture(`${base}mime_face${k}.png`, like)).then((t) => { out[name].faces[k] = t; })));
  }));
  PICTURES.forEach((name, i) => { out[name] = pics[i]; });
  out.fx = fx;
  fx.pics["glow.png"] = out.glow; // (drawn through the combiners 0x86303F50 and 0x863040C4 set: game.js)
  return out;
}

// A model, at the game's scale, with its own mixer: a clip is posed at a frame
// (looped, or held at its end), a face picture put on, the object's colour
// laid over it (fog()) and its alpha
export function makeModel(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = a.clips.map((c) => mixer.clipAction(c));
  const fog = { value: new THREE.Vector4(1, 1, 1, 0) };
  const mats = [], faceMats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [o.material].flat().map((m) => {
      const c = n64Look(m.clone(), fog); // (clone() leaves onBeforeCompile behind)
      c.userData.blend = c.transparent; // (its own: the Poke Ball's glint, an IA picture in layer 6)
      mats.push(c);
      if (c.userData.ps2_face) faceMats.push([c, c.map]); // (and its own picture)
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  let current = -1, action = null;
  return {
    root, model, mixer,
    get clip() { return current; },
    length: (i) => (a.clips[i] ? Math.round(a.clips[i].duration * FPS) + 1 : 1),
    // clip i at frame f (looped: its n frames, the last shown for one before the
    // first again; or held on its last frame)
    pose(i, f, hold = false) {
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
      action.time = d > 0 ? Math.min(hold ? t : t % (d + 1 / FPS), d - 1e-4) : 0;
      mixer.update(0);
    },
    // its face picture k (a.faces'), or its own
    face(k) {
      for (const [m, own] of faceMats) {
        const pic = a.faces?.[k] || own;
        if (m.map !== pic) m.map = pic;
      }
    },
    // the object's colour over it (rgb, a THREE.Color, by alpha 0-1: 0 none)
    fog(rgb, alpha) { fog.value.set(rgb.r, rgb.g, rgb.b, Math.max(0, Math.min(1, alpha))); },
    // see-through at alpha (1: as it is)
    alpha(alpha) {
      for (const m of mats) {
        m.transparent = alpha < 1 || m.userData.blend;
        m.opacity = alpha;
        m.depthWrite = alpha >= 1 && !m.userData.blend;
      }
    },
  };
}

// one of the court's pieces as it is (they don't move or animate)
export function piece(a, s = 1) {
  const model = cloneSkinned(a.scene);
  model.scale.setScalar(GLB * s);
  return model;
}

// (the remake's, not the game's) a wall shutting an empty seat's lane: a bar
// len long (along x), thick across (y: 0 its face, out to -thick) and high (z),
// in the grey of the court's rims (the lines' first picture, a ramp from dark
// to light: across its top dark, light, dark, its long sides dark), lit as the
// walls are
export function shutWall(lines, len, thick, high) {
  let pic = null;
  lines.scene.traverse((o) => {
    if (!o.isMesh || pic) return;
    for (const m of [o.material].flat()) if (m.name === "120_court_lines_tex00" && m.map) pic = m.map;
  });
  const map = pic?.clone();
  if (map) { map.wrapS = THREE.MirroredRepeatWrapping; map.needsUpdate = true; }
  const geo = new THREE.BoxGeometry(len, thick, high);
  geo.translate(0, -thick / 2, high / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ((pos.getY(i) + thick) / thick) * 2, 0.5);
  const mesh = new THREE.Mesh(geo, n64Look(new THREE.MeshLambertMaterial(map ? { map } : { color: 0x484848 })));
  mesh.frustumCulled = false;
  return mesh;
}
