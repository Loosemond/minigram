// Eager Eevee's field in 3D. In the game it is a pre-rendered picture
// (background 44), the field from the game's camera: a ring of coloured
// stripes in a clearing, trees round it. This rebuilds it with the picture's
// own measurements (its pixels put back on the ground through that camera),
// so every camera sees the same world: in portrait, more from above, the
// forest goes on round the front of the clearing, where the game's camera
// never looks.
//
// The ring: dirt in the middle to radius 63, 30 stripes of 12 degrees
// (mauve, blue, green, red, yellow, over and over; green faces the camera) to
// 108, a pale band to 131 (the Eevee walk at 130), a yellow one to 151, and a
// rim in the stripes' colours, darker, to 157. Round it dirt, and grass with
// flowers where the picture has it; the trees: the picture's five trunks at
// the back (184-224 from the middle), the leaves down to 20-35 over the
// ground. The rest of the forest is made up, the same all round. (Object 149,
// a field the module loads but doesn't draw, is a clearing from above with no
// ring: not used.)
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DEG = Math.PI / 180, TAU = 2 * Math.PI;
const RING = { dirt: 63, stripes: 108, pale: 131, yellow: 151, rim: 157 };
const STRIPES = 30, PHASE = 4 * DEG; // a stripe starts at 4 degrees (from +x towards +z, the ring's angles)
const STRIPE = ["#96748a", "#7a6ead", "#7ba561", "#c8715e", "#c9bd5f"]; // mauve, blue, green, red, yellow
const RIM = ["#785670", "#5a4c9e", "#5c8e3c", "#b8503c", "#bcb63c"];
const PALE = "#adb7a8", YELLOW = "#c8bc5c";
const COL = {
  dirt: "#b9a07f", grass: "#78a346", edge: "#647a3a", floor: "#3f5128", trunk: "#8f522e",
};
// the trunks' bases in the picture (where they meet the ground)
const TRUNKS = [[-193, -97], [-72, -169], [55, -176], [165, -127], [209, -81]];
// how far out the trees are, by angle: the picture's at the back, nearest
// there (184); further round, out of the game camera's sight, made up
const treeLine = (a) => { const s = Math.sin(a); return s < 0 ? 250 + 66 * s : 250 + 25 * s; };
// the picture's grass, round the ring (and, for portrait, in front of it):
// centre x, z and radii, in the game's units
const GRASS = [
  [-212, -2, 44, 40], [-168, -104, 42, 26], [168, -96, 46, 26], [228, -12, 40, 56],
  [-150, 168, 80, 40], [-214, 108, 40, 36], [160, 162, 76, 40], [214, 96, 36, 32],
  [-48, 228, 72, 30], [70, 242, 62, 28], [-250, 40, 30, 50], [258, 60, 30, 48],
];

const rnd = (() => { let s = 61; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
const repeat = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

export function buildField(scene) {
  const group = new THREE.Group();
  group.add(ground(), ring(), trees());
  scene.add(group);
  scene.background = new THREE.Color(COL.floor); // (never seen: the forest's all round)
  return group;
}

// ---- the ground: dirt, grass, flowers, and the shade under the trees ----
const G = 380, N = 1024, S = N / (2 * G); // the canvas covers -G..G each way
function ground() {
  const X = (x) => (x + G) * S, Z = (z) => (z + G) * S;
  const inGrass = (x, z) => GRASS.some(([cx, cz, rx, rz]) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1)
    || Math.hypot(x, z) > treeLine(Math.atan2(z, x)) - 30;
  // a closed curve following the tree line, d further out
  const line = (g, d) => {
    g.beginPath();
    for (let k = 0; k <= 180; k++) {
      const a = (k / 180) * TAU, r = treeLine(a) + d;
      g[k ? "lineTo" : "moveTo"](X(r * Math.cos(a)), Z(r * Math.sin(a)));
    }
    g.closePath();
  };
  const tex = canvas(N, N, (g) => {
    g.fillStyle = COL.dirt;
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { // the dirt's grain and pebbles
      g.fillStyle = ["#c3aa86", "#ad9471", "#bfa784", "#a88f6c"][i % 4];
      g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() < 0.5 ? "#e6d8c4" : "#d9bfb0";
      g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 1.2 + rnd(), 1 + rnd() * 0.6, 0, 0, TAU); g.fill();
    }
    // the grass at the trees' feet, and the patches, with soft ragged edges
    const blob = (cx, cz, rx, rz, colour) => {
      g.fillStyle = colour;
      for (let k = 0; k < 14; k++) {
        const a = rnd() * TAU, d = rnd() * 0.45;
        g.beginPath();
        g.ellipse(X(cx + Math.cos(a) * rx * d), Z(cz + Math.sin(a) * rz * d), rx * S * (0.55 + rnd() * 0.25), rz * S * (0.55 + rnd() * 0.25), 0, 0, TAU);
        g.fill();
      }
      for (let k = 0; k < 50; k++) { // a ragged edge
        const a = rnd() * TAU, d = 0.85 + rnd() * 0.3, w = (3 + rnd() * 6) * S;
        g.beginPath(); g.arc(X(cx + Math.cos(a) * rx * d), Z(cz + Math.sin(a) * rz * d), w, 0, TAU); g.fill();
      }
    };
    g.fillStyle = COL.edge;
    line(g, -32); g.rect(N, 0, -N, N); g.fill("evenodd");
    for (const p of GRASS) blob(...p, COL.grass);
    // blades
    for (let i = 0; i < 16000; i++) {
      const x = rnd() * 2 * G - G, z = rnd() * 2 * G - G;
      if (!inGrass(x, z)) continue;
      g.strokeStyle = ["#6a9a3c", "#86b24e", "#709e40", "#8cb854"][i % 4];
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(x), Z(z)); g.lineTo(X(x) + (rnd() - 0.5) * 2, Z(z) - 2 - rnd() * 2); g.stroke();
    }
    // sprouts and flowers (orange and yellow, as the picture's)
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * 2 * G - G, z = rnd() * 2 * G - G, kind = rnd();
      if (!inGrass(x, z) || Math.hypot(x, z) > treeLine(Math.atan2(z, x)) + 40) continue;
      const px = X(x), py = Z(z);
      if (kind < 0.35) { // a sprout: two leaves
        g.strokeStyle = "#3d6d2a"; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(px - 3, py - 3); g.quadraticCurveTo(px - 1, py, px, py + 1); g.quadraticCurveTo(px + 1, py, px + 3, py - 3); g.stroke();
      } else if (kind < 0.62) {
        const petal = rnd() < 0.55 ? ["#f08c3a", "#c0521e"] : ["#f2e45c", "#c49a22"];
        g.fillStyle = "#3d6d2a"; g.fillRect(px - 0.5, py + 1, 1, 4);
        g.fillStyle = petal[0];
        for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2, 1.8, 0, TAU); g.fill(); }
        g.fillStyle = petal[1]; g.beginPath(); g.arc(px, py, 1.4, 0, TAU); g.fill();
      }
    }
    // the shade under the trees, darker further in
    for (let k = 0; k < 8; k++) {
      g.fillStyle = `rgba(40, 58, 22, ${k < 7 ? 0.14 : 0.5})`;
      line(g, -34 + k * 7); g.rect(N, 0, -N, N); g.fill("evenodd");
    }
  });
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const geo = new THREE.PlaneGeometry(2 * G, 2 * G).rotateX(-Math.PI / 2);
  const near = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, depthWrite: false }));
  near.renderOrder = -4;
  const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
                             new THREE.MeshBasicMaterial({ color: COL.floor, depthWrite: false }));
  far.position.y = -0.5;
  far.renderOrder = -5;
  const g = new THREE.Group();
  g.add(far, near);
  return g;
}

// ---- the ring, painted on the ground ----
function ring() {
  const pos = [], col = [], uv = [], c = new THREE.Color();
  const sector = (r0, r1, a0, a1, hex) => {
    c.set(hex).multiplyScalar(1 / 0.96); // (the grain's average)
    const p = (r, a) => [r * Math.cos(a), 0, r * Math.sin(a)];
    const A = p(r0, a0), B = p(r1, a0), C = p(r1, a1), D = p(r0, a1);
    for (const v of [A, B, C, A, C, D]) { pos.push(...v); col.push(c.r, c.g, c.b); uv.push(v[0] / 40, v[2] / 40); }
  };
  const STEP = 3 * DEG, PER = 4; // 4 steps a stripe
  for (let k = 0; k < STRIPES; k++) {
    for (let j = 0; j < PER; j++) {
      const a0 = PHASE + k * 12 * DEG + j * STEP, a1 = a0 + STEP;
      sector(RING.dirt, RING.stripes, a0, a1, STRIPE[k % 5]);
      sector(RING.stripes, RING.pale, a0, a1, PALE);
      sector(RING.pale, RING.yellow, a0, a1, YELLOW);
      sector(RING.yellow, RING.rim, a0, a1, RIM[k % 5]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  const grain = repeat(canvas(128, 128, (g, W, H) => {
    g.fillStyle = "#f5f5f5"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      const v = 226 + Math.floor(rnd() * 29);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 2);
    }
  }));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, map: grain, side: THREE.DoubleSide, depthWrite: false }));
  mesh.renderOrder = -3;
  return mesh;
}

// ---- the trees: trunks, and leaves in heaps round the clearing ----
function trees() {
  const leafTex = repeat(canvas(256, 256, (g, W, H) => {
    g.fillStyle = "#78a446"; g.fillRect(0, 0, W, H);
    const leaf = (x, y, a, l, w, fill) => {
      for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
        const px = x + dx, py = y + dy;
        if (px < -l || px > W + l || py < -l || py > H + l) continue;
        g.save(); g.translate(px, py); g.rotate(a);
        g.beginPath(); g.moveTo(0, -l / 2); g.quadraticCurveTo(w, -l / 6, 0, l / 2); g.quadraticCurveTo(-w, -l / 6, 0, -l / 2);
        g.fillStyle = fill; g.fill();
        g.strokeStyle = "rgba(52, 92, 26, 0.75)"; g.lineWidth = 1.6; g.stroke();
        g.beginPath(); g.moveTo(0, -l / 2 + 4); g.lineTo(0, l / 2 - 4);
        g.strokeStyle = "rgba(90, 130, 50, 0.6)"; g.lineWidth = 1; g.stroke();
        g.restore();
      }
    };
    const fills = ["#8cb652", "#a2c866", "#b4d476", "#c6df8c", "#d8eaa4", "#98be5a"];
    for (let i = 0; i < 380; i++) leaf(rnd() * W, rnd() * H, Math.PI + (rnd() - 0.5) * 1.8, 30 + rnd() * 16, 9 + rnd() * 5, fills[i % fills.length]);
  }));
  const barkTex = repeat(canvas(64, 128, (g, W, H) => {
    g.fillStyle = COL.trunk; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = rnd() < 0.6 ? "#6f3a1e" : "#a8653c";
      g.lineWidth = 1 + rnd() * 2;
      const x = rnd() * W;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 8, H / 3, x + (rnd() - 0.5) * 8, (2 * H) / 3, x, H); g.stroke();
    }
  }));

  // leaves: squashed balls, darker underneath, in rings round the clearing
  const blobs = [];
  const LAYERS = [ // out from the tree line, ball radius, height, spacing, detail
    [12, 36, 48, 30, 14], [48, 46, 66, 42, 14], [90, 62, 80, 56, 14], [170, 80, 98, 76, 12],
    [280, 100, 112, 100, 12], [410, 130, 122, 130, 10], [570, 165, 128, 170, 10],
  ];
  for (const [dr, rb, h, sp, seg] of LAYERS) {
    for (let a = rnd() * 0.1; a < TAU; ) {
      const r = treeLine(a) + dr * (0.92 + rnd() * 0.16), b = rb * (0.88 + rnd() * 0.24);
      const geo = new THREE.SphereGeometry(b, seg, Math.round(seg * 0.65)).scale(1, 0.7, 1);
      const n = geo.attributes.normal, uvs = geo.attributes.uv, colours = [];
      const tint = 0.92 + rnd() * 0.14;
      for (let i = 0; i < n.count; i++) {
        const y = n.getY(i), k = (y >= 0 ? 0.95 + 0.1 * y : 0.95 + 0.42 * y) * tint;
        colours.push(k, k, k);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
      const nu = Math.max(1, Math.round((TAU * b) / 120)), nv = Math.max(1, Math.round((Math.PI * b * 0.7) / 120));
      for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * nu, uvs.getY(i) * nv);
      geo.rotateY(rnd() * TAU).translate(r * Math.cos(a), h + (rnd() - 0.5) * 10, r * Math.sin(a));
      blobs.push(geo);
      a += sp / (treeLine(a) + dr);
    }
  }
  // past the last heaps, a roof of leaves (for the widest screens)
  const roof = new THREE.RingGeometry(700, 4000, 48, 1).rotateX(-Math.PI / 2).translate(0, 118, 0);
  const ru = roof.attributes.uv, rp = roof.attributes.position, rc = [];
  for (let i = 0; i < ru.count; i++) { ru.setXY(i, rp.getX(i) / 120, rp.getZ(i) / 120); rc.push(0.8, 0.8, 0.8); }
  roof.setAttribute("color", new THREE.Float32BufferAttribute(rc, 3));
  blobs.push(roof);
  const leaves = new THREE.Mesh(mergeGeometries(blobs.map((g) => g.index ? g.toNonIndexed() : g)),
                                new THREE.MeshLambertMaterial({ map: leafTex, vertexColors: true }));

  // trunks: the picture's, and more on round, under the leaves
  const spots = TRUNKS.map(([x, z]) => [x, z]);
  for (let a = -21 * DEG + 0.42; a < (360 - 153) * DEG - 0.3; a += 0.4 + rnd() * 0.12) {
    const r = treeLine(a) + 10 + rnd() * 20;
    spots.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const parts = [];
  for (const [x, z] of spots) {
    const tall = 44, w = 9 + rnd() * 2; // (up into the leaves)
    parts.push(new THREE.CylinderGeometry(w * 0.8, w, tall, 10, 1, true).translate(x, tall / 2, z));
    parts.push(new THREE.CylinderGeometry(w, w * 1.3, 5, 10, 1, true).translate(x, 2.5, z)); // its roots
  }
  for (const p of parts) { const u = p.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 2, u.getY(i)); }
  const trunks = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ map: barkTex }));

  const g = new THREE.Group();
  g.add(trunks, leaves);
  for (const m of [trunks, leaves]) m.frustumCulled = false;
  trunks.renderOrder = -2;
  leaves.renderOrder = -1;
  // then the rest is drawn over the field, as it's drawn over the game's
  // picture: the leaves hang low, and an Eevee blown out of the ring stands
  // where they are
  leaves.onAfterRender = (renderer) => renderer.clearDepth();
  return g;
}
