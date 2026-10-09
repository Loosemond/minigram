// The 1P-4P / COM badges over the players (image bank 434: assets/ui/badge_*.png,
// tools/web_assets.py). Module #64's labels (0x87F029EC loads the bank; its
// draw, 0x87F02878) show one over a player's model: 1P-4P for a person
// (0x87F0F650: pictures 6-9), for a CPU its COM in the seat's colour
// (0x87F0F640: 2-5, blue, green, red, yellow). Its quad (0x87F0F680) is 38 x
// 28 round the object's place, the 36 x 28 picture across it, times the
// object's scale (Delibird's Delivery 0.9, Gutsy Golbat 1.75); it's turned to
// the camera (model flag 8), drawn in layer 6 (translucent: depth tested, not
// written) with T0 x ENV, so its alpha is the env's (0xB4, 0xC8). A game's own
// pool sprites with a badge (Tumbling Togepi's on each belt) are on the shared
// quad instead: the picture's size, centred (docs/minigames.md).
import * as THREE from "three";
import { retry, attemptURL } from "./retry.js";

export const QUAD = [38, 28]; // module #64's label (0x87F0F680)
export const PICTURE = [36, 28]; // the picture's, a pool sprite's quad
export const COM = ["com_blue", "com_green", "com_red", "com_yellow"];
// seat z's badge: 1P-4P, or a CPU's COM in its colour
export const badgeName = (z, cpu) => (cpu ? COM[z] : `${z + 1}p`);

const loader = new THREE.TextureLoader();
let loading = null;
// the eight pictures (once for all games), by name: "1p"-"4p", "com_blue"...;
// job wraps each load (the loading bar's count)
export function loadBadges(job = (p) => p) {
  loading ||= Promise.all(["1p", "2p", "3p", "4p", ...COM].map((name) =>
    job(retry((n) => loader.loadAsync(attemptURL(`assets/ui/badge_${name}.png`, n)), `badge_${name}.png`)).then((t) => {
      t.colorSpace = THREE.NoColorSpace;
      return [name, t];
    }))).then(Object.fromEntries, (err) => { loading = null; throw err; });
  return loading;
}

// A badge, its picture from textures (loadBadges'): a sprite turned to the
// camera, or (flat) a plane for the game to turn. size: its quad (QUAD, or
// PICTURE for a pool sprite's), times scale; opacity: the env's alpha;
// depthTest: false to draw it over everything. Its seat(z, cpu) picks the
// picture; top() is how far its top edge is over its middle.
export function makeBadge(textures, { scale = 1, size = QUAD, opacity = 1, depthTest = true, flat = false, renderOrder = 5 } = {}) {
  const opts = { transparent: true, opacity, depthTest, depthWrite: false };
  const w = size[0] * scale, h = size[1] * scale;
  let o;
  if (flat) o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ ...opts, side: THREE.DoubleSide }));
  else {
    o = new THREE.Sprite(new THREE.SpriteMaterial(opts));
    o.scale.set(w, h, 1);
  }
  o.renderOrder = renderOrder;
  o.seat = (z, cpu) => {
    const map = textures[badgeName(z, cpu)];
    if (o.material.map !== map) { o.material.map = map; o.material.needsUpdate = true; }
    return o;
  };
  o.top = () => (flat ? h * o.scale.y : o.scale.y) / 2;
  return o;
}
