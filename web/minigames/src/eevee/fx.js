// Eager Eevee's effects, from image bank 307 (the module's puffs, glows and
// streaks) on sprites: a Pineco going off (0x86B052BC: a flash and smoke,
// then sparks round it at its frames 25, 28, 31, 40 and 43: 0x86B04244) and
// a sparkle as strawberries are got (made up: the game sends a strawberry off
// the pile for each one eaten, 0x86B04970). *By appearance*: the module's own
// effects are objects 203, 204 and 207 (flat shapes coloured as they're drawn).
import * as THREE from "three";

export class Fx {
  constructor(scene, textures) {
    this.scene = scene;
    this.tex = textures; // bank 307: 0, 1 white puffs, 2 a dot, 4 a glow, 6, 7 streaks, 8 a burst
    this.live = [];
    this.pool = [];
  }
  // light: added to what's behind (the flashes and sparks: the glow's edge is dark)
  sprite(tex, { pos, vel = [0, 0, 0], size = [20, 20], life = 0.6, color = 0xffffff, grav = 0, spin = 0, fadeIn = 0, light = false }) {
    const s = this.pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    s.material.map = this.tex[tex];
    s.material.blending = light ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.color.set(color);
    s.material.rotation = Math.random() * Math.PI * 2;
    s.material.needsUpdate = true;
    s.position.set(...pos);
    s.renderOrder = 5;
    s.userData = { vel: new THREE.Vector3(...vel), size, life, t: 0, grav, spin, fadeIn };
    this.scene.add(s);
    this.live.push(s);
    this.place(s);
    return s;
  }
  place(s) {
    const u = s.userData, k = Math.min(1, u.t / u.life);
    const w = u.size[0] + (u.size[1] - u.size[0]) * k;
    s.scale.set(w, w, 1);
    const a = u.fadeIn && u.t < u.fadeIn ? u.t / u.fadeIn : 1 - k;
    s.material.opacity = Math.max(0, a);
  }
  // a Pineco goes off at p (and its sparks after, at the frames the game has them)
  blast(p) {
    this.sprite(4, { pos: [p.x, 25, p.z], size: [40, 260], life: 0.45, color: 0xfff4d0, light: true });
    this.sprite(8, { pos: [p.x, 30, p.z], size: [30, 200], life: 0.35, color: 0xffd060, light: true });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.4, v = 90 + Math.random() * 90;
      this.sprite(1, { pos: [p.x, 20, p.z], vel: [Math.cos(a) * v, 40 + Math.random() * 80, Math.sin(a) * v], size: [30, 80],
                       life: 0.8 + Math.random() * 0.5, color: [0xdedad0, 0xb8b0a0, 0xf0ece0][k % 3] });
    }
    this.later = [25, 28, 31, 40, 43].map((f) => ({ at: f / 30, p: p.clone() }));
    this.clock = 0;
  }
  sparks(p) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 35; // (round it, within 35: 0x86B04254)
    const q = [p.x + Math.cos(a) * r, 15 + Math.random() * 30, p.z + Math.sin(a) * r];
    this.sprite(8, { pos: q, size: [10, 70], life: 0.3, color: 0xffe080, light: true });
    for (let k = 0; k < 4; k++) this.sprite(2, { pos: q, vel: [(Math.random() - 0.5) * 200, 60 + Math.random() * 120, (Math.random() - 0.5) * 200], size: [8, 4], life: 0.5, grav: 300, color: 0xfff0a0, light: true });
  }
  // a prize got, at p
  sparkle(p) {
    this.sprite(4, { pos: [p.x, 20, p.z], size: [20, 110], life: 0.4, color: 0xfff8c0, light: true });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, v = 60 + Math.random() * 40;
      this.sprite(k % 2 ? 0 : 2, { pos: [p.x, 18, p.z], vel: [Math.cos(a) * v, 90 + Math.random() * 60, Math.sin(a) * v], size: [14, 6],
                                   life: 0.7, grav: 200, color: k % 3 ? 0xffffa0 : 0xffffff, light: true });
    }
  }
  // a dash's dust, at an Eevee's feet
  dust(p) {
    for (let k = 0; k < 3; k++) {
      this.sprite(1, { pos: [p.x + (Math.random() - 0.5) * 10, 4, p.z + (Math.random() - 0.5) * 10],
                       vel: [(Math.random() - 0.5) * 30, 15 + Math.random() * 15, (Math.random() - 0.5) * 30],
                       size: [10, 26], life: 0.45, color: 0xd8c8a8 });
    }
  }
  update(dt) {
    if (this.later) {
      this.clock += dt;
      while (this.later.length && this.clock >= this.later[0].at) this.sparks(this.later.shift().p);
      if (!this.later.length) this.later = null;
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i], u = s.userData;
      u.t += dt;
      if (u.t >= u.life) {
        this.scene.remove(s);
        this.live.splice(i, 1);
        this.pool.push(s);
        continue;
      }
      u.vel.y -= u.grav * dt;
      s.position.addScaledVector(u.vel, dt);
      u.vel.multiplyScalar(Math.max(0, 1 - 1.5 * dt));
      this.place(s);
    }
  }
  clear() {
    for (const s of this.live) { this.scene.remove(s); this.pool.push(s); }
    this.live = [];
    this.later = null;
  }
}
