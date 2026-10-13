// Eager Eevee's effects, as module #61 makes them: a Pineco going off and its
// smoke (objects 203, 204 and 207, dressed in their recipes: src/n64fx.js),
// and the dust of a dash or a feint (module #64's particle). Each lives so
// many of the game's frames from the one it's made on; it's drawn where the
// game has it between frames (now: the game's frame, a fraction between),
// its clip, colours and flipbook on that frame. All are translucent: drawn
// over what's there, never added on.
import * as THREE from "three";
import { dress } from "../n64fx.js";
import { makeModel } from "./assets.js";

// The blast's objects are made at 1.3 x 1.47222 (0x86B05310, 0x86B054BC)
const SCALE = 1.3 * 1.47222;
// a flash (203) lives 9 frames (freed on its 9th: 0x86B05268), the fire
// puffs (204) 8 (0x86B05284), the smoke (207) 24 (0x86B05454)
const LIFE = { blast: 9, puff: 8, smoke: 24 };
// the flash throws a puff on its frames 0, 2, 4, 6 and 8 (0x86B051C8-0x86B05254),
// 0.4 x 45 from the middle at a random angle, up and across (0x86B05388)
const PUFFS = [0, 2, 4, 6, 8], PUFF_OUT = 45 * 0.4;
// the dust (0x86B065D4, 0x87F03F38): bank 159's 32 x 32 quad at 2.25, growing
// 1.01 a frame, white at alpha 127, an 8th of a picture a frame (0x87F04018:
// the first two pictures), fading over its second half; 15 frames
const DUST = { size: 32 * 2.25, grow: 1.01, alpha: 127 / 255, life: 15, step: 32 / 256 };

export class Fx {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.live = [];
    this.pool = { blast: [], puff: [], smoke: [], dust: [] };
  }
  // one of the blast's objects (a model in its recipes), out of the pool
  model(kind) {
    let o = this.pool[kind].pop();
    if (!o) {
      const m = makeModel(this.assets[kind], SCALE);
      const mats = dress(this.assets.fx, m.model, kind);
      m.model.traverse((x) => { if (x.isMesh) x.frustumCulled = false; });
      m.root.renderOrder = 6;
      o = { kind, m, mats, obj: m.root };
    }
    this.scene.add(o.obj);
    return o;
  }
  // the dust: a sprite facing the camera (module #64's particles are drawn square on)
  sprite() {
    let o = this.pool.dust.pop();
    if (!o) {
      const mat = new THREE.SpriteMaterial({ map: this.assets.dust[0], transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.renderOrder = 5;
      o = { kind: "dust", obj: s };
    }
    this.scene.add(o.obj);
    return o;
  }
  add(o, at, pos) {
    Object.assign(o, { at, pos });
    o.obj.position.copy(pos);
    o.obj.visible = false;
    this.live.push(o);
    return o;
  }
  // a Pineco goes off on frame at, in the middle (0x86B03C4C: 0x86B052BC(0))
  blast(at) {
    this.add(this.model("blast"), at, new THREE.Vector3(0, 0, 0));
    for (const f of PUFFS) {
      const a = Math.random() * Math.PI * 2;
      this.add(this.model("puff"), at + f, new THREE.Vector3(Math.sin(a) * PUFF_OUT, Math.cos(a) * PUFF_OUT, 0));
    }
  }
  // dark smoke on frame at, at (x, y, z) in the game's units (0x86B05484)
  smoke(at, x, y, z) { this.add(this.model("smoke"), at, new THREE.Vector3(x, y, z)); }
  // a dash's or a feint's dust on frame at, by an Eevee at (x, z): 10 up and
  // 20 towards the camera (0x86B0658C)
  dust(at, x, z) { this.add(this.sprite(), at, new THREE.Vector3(x, 10, z + 20)); }

  // draw them as the game's frame now has them (a fraction between frames)
  update(now) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const o = this.live[i], k = now - o.at;
      const life = o.kind === "dust" ? DUST.life + 1 : LIFE[o.kind];
      if (k >= life) { this.drop(i); continue; }
      o.obj.visible = k >= 0;
      if (k < 0) continue;
      if (o.kind === "dust") {
        const n = Math.floor(k), mat = o.obj.material, map = this.assets.dust[Math.min(1, Math.floor(n * DUST.step))];
        if (mat.map !== map) { mat.map = map; mat.needsUpdate = true; }
        o.obj.scale.setScalar(DUST.size * DUST.grow ** k);
        mat.opacity = DUST.alpha * Math.min(1, 2 * (1 - k / DUST.life));
        continue;
      }
      o.m.pose(0, k);
      for (const mat of o.mats) mat.n64.frame(k);
    }
  }
  drop(i) {
    const o = this.live[i];
    this.scene.remove(o.obj);
    this.live.splice(i, 1);
    this.pool[o.kind].push(o);
  }
  clear() {
    for (let i = this.live.length - 1; i >= 0; i--) this.drop(i);
  }
}
