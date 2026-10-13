// The N64's colour combiner as three.js materials, for the effects the
// glTF can't hold. Models textured by material callbacks (each game's
// fx.json, which tools/web_assets.py writes from the ROM: docs/fragments.md)
// and pictures a game's code draws through a combiner of its own (Topsy-
// Turvy's and Barrier Ball's glows) are mostly I8: the RDP reads an I texel's
// grey as its alpha too, so they're clear where they're dark (the glTF's
// baked still reads them opaque: white, dark and flat boxes). All are drawn
// translucent (geo 0x22's layers 5 and up, 0x80094B04's table, or the game's
// own G_RM_AA_ZB_XLU_SURF): the colour by its alpha over what's there, the
// depth tested, not written. So here: never added on. And a plain model's
// textures that a callback scrolls (scrollMaps: Delibird's Delivery's belts).
// (Joints drawn facing the camera: src/facing.js; grey HUD pictures through
// a combiner: src/tint.js.)
import * as THREE from "three";
import { retry, attemptURL, fetchRetry } from "./retry.js";

const texLoader = new THREE.TextureLoader();
const texture = (url) => retry((n) => texLoader.loadAsync(attemptURL(url, n)), url).then((t) => {
  t.colorSpace = THREE.NoColorSpace;
  return t;
});

// A game's recipes (base: its folder) and their pictures, each once: { recipes,
// pics }. job wraps each load (the loading bar's count). A picture a game's
// code draws goes in pics too, by its file name. (A recipe's null where its
// callback has no colours of its own: a plain model's, for its scroll.)
export async function loadFx(base, job = (p) => p) {
  const recipes = await job(fetchRetry(base + "fx.json").then((r) => r.json()));
  const files = [...new Set(Object.values(recipes).flatMap((o) => o.recipes || []).filter(Boolean)
    .flatMap((s) => s.textures.filter(Boolean).flatMap((t) => [t.file, ...(t.frames || [])])))];
  const pics = Object.fromEntries(await Promise.all(files.map((f) => job(texture(base + f)).then((t) => [f, t]))));
  return { recipes, pics };
}

// Marks each mesh of a loaded glTF with its primitive's number, which a
// recipe list goes by (a model's clones keep it)
export function tagPrims(gltf) {
  gltf.scene.traverse((o) => {
    const a = o.isMesh && gltf.parser.associations.get(o);
    if (a && a.primitives !== undefined) o.userData.n64prim = a.primitives;
  });
}

// The combiner is (a - b) x c + d for the colour and for the alpha, once or
// twice (a second cycle that's all zero leaves the first: tools/ps2tool/
// combiner.py, which this follows). Its selectors, in a recipe's order:
const RGB = ["C.rgb", "t0.rgb", "t1.rgb", "prim.rgb", "shade.rgb", "env.rgb"];
const SEL_A = [...RGB, "vec3(1.0)", "vec3(0.5)"]; // (then 1, the noise)
const SEL_B = [...RGB, "vec3(0.5)", "vec3(0.0)"]; // (then the key's centre, K4)
const SEL_C = [...RGB, "vec3(1.0)", "vec3(C.a)", "vec3(t0.a)", "vec3(t1.a)", "vec3(prim.a)", "vec3(shade.a)", "vec3(env.a)", "vec3(0.0)", "vec3(plod)"]; // (6 the key's scale, as tools/ps2tool/combiner.py takes it; LOD 0; K5 0, past the end)
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

// A recipe as a material (fx: loadFx's): sprite for a sprite's, shade if the
// mesh has vertex colours (else the shade is white, as tools/ps2tool/
// combiner.py takes it: a lit draw's lighting isn't here), flipY for a picture
// on a sprite (else glTF's way up), uv what to scale the mesh's texture
// coordinates by (tile 0's: fx.json's, for one the glTF has by another's
// tile). Its frame(f, loop) sets its colours and
// its tiles' scroll for frame f (the game's, 30 a second) of its colour
// track: between keys, linearly (as tools/blender reads them), held at its
// last (loop: round its period, back to its first); and a flipbook's picture
// (a texture table's: frame_time frames each, held at its last, or round
// again with loop: Eager Eevee's fire puffs, 204). Its opacity still fades
// it all.
export function combiner(fx, spec, { sprite = false, shade = false, flipY = false, uv = [1, 1] } = {}) {
  const s0 = spec.textures[0], s1 = spec.textures[1] || s0; // (no TEXEL1 of its own: null, tile 0's)
  const book = (s) => (s.frames?.length > 1 ? s.frames.map((f) => tile(fx.pics[f], s.wrap, flipY)) : null);
  const books = [book(s0), s1 === s0 ? null : book(s1)];
  const u = {
    prim: { value: new THREE.Vector4() }, env: { value: new THREE.Vector4() }, plod: { value: 1 },
    map1: { value: tile(fx.pics[s1.file], s1.wrap, flipY) },
    tile0: { value: new THREE.Vector4(1, 1, 0, 0) }, tile1: { value: new THREE.Vector4(1, 1, 0, 0) },
  };
  // (the model's texture coordinates are tile 0's: tile 1 has its own shift and size)
  const rel = (k) => uv[k] * (s1.sf[k] / s0.sf[k]) * (s0.size[k] / s1.size[k]);
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
  const opts = { map: tile(fx.pics[s0.file], s0.wrap, flipY), transparent: true, depthWrite: false };
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
      u.tile0.value.set(uv[0], uv[1], off(s0, 0), off(s0, 1));
      u.tile1.value.set(rel(0), rel(1), off(s1, 0), off(s1, 1));
      // a flipbook's picture now (tile 1 the same as tile 0's when it's the same texture)
      const page = (pics, s) => {
        const n = Math.floor(Math.max(0, f) / Math.max(1, s.frame_time || 1));
        return pics[loop ? n % pics.length : Math.min(n, pics.length - 1)];
      };
      if (books[0]) m.map = page(books[0], s0);
      if (books[1] || (books[0] && s1 === s0)) u.map1.value = books[1] ? page(books[1], s1) : m.map;
    },
  };
  m.n64.frame(0);
  return m;
}

// The meshes under root (a model, tagPrims'd) dressed in their recipes, as
// fx.json's name has them: each primitive the last callback before it in its
// render layer (tools/web_assets.py, fx_recipes). A primitive with a texture
// of its own (null) keeps the glTF's material. Returns the materials (to set
// their frame).
export function dress(fx, root, name) {
  const { recipes, prims, uv } = fx.recipes[name], mats = [];
  let k = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const i = o.userData.n64prim ?? k++;
    const spec = prims[i] === null ? null : recipes[prims[i]] || recipes[0];
    if (!spec) return;
    o.material = combiner(fx, spec, { shade: !!o.geometry.attributes.color, uv: uv?.[i] || undefined });
    mats.push(o.material);
  });
  return mats;
}

// A plain model's moving textures: the meshes under root (a model,
// tagPrims'd) whose glTF texture is a callback's that scrolls (fx.json's
// scroll, texels a frame: Delibird's Delivery's belts, 147 and 148, by
// 0x81000178), each kept in its material (lit, as the glTF has it) but its
// texture moved. frame(f) puts them where they are on frame f (the game's,
// 30 a second): the tile's origin moved on, the picture slides back, as
// combiner's do (a texel is a picture's pixel in the glTF's coordinates, a
// mirrored one doubled or not).
export function scrollMaps(fx, root, name) {
  const moves = fx.recipes[name]?.scroll || [], maps = [];
  root.traverse((o) => {
    const s = o.isMesh && moves[o.userData.n64prim];
    if (!s) return;
    for (const m of [o.material].flat()) {
      if (!m.map) continue;
      if (!m.map.userData.n64scroll) { // (its own texture, to move: the picture's the same)
        m.map = m.map.clone();
        m.map.userData.n64scroll = true;
        for (const [k, w] of [[0, "wrapS"], [1, "wrapT"]]) if (s[k] && m.map[w] === THREE.ClampToEdgeWrapping) m.map[w] = THREE.RepeatWrapping;
        m.map.needsUpdate = true;
      }
      maps.push([m.map, s]);
    }
  });
  return {
    maps: maps.map(([t]) => t),
    frame(f) {
      for (const [t, s] of maps) {
        const w = t.image?.width || 1, h = t.image?.height || 1;
        const per = (k) => ((k === 0 ? t.wrapS : t.wrapT) === THREE.MirroredRepeatWrapping ? 2 : 1);
        t.offset.set(((-s[0] * f) / w) % per(0), ((-s[1] * f) / h) % per(1));
      }
    },
  };
}
