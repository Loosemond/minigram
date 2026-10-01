// Egg Emergency's stage in 3D. In the game it is a pre-rendered picture
// (background 19): a brick building on a bridge over a river, one bay per
// player under a fish-scale roof in the player's colour, lamp posts between
// the bays, and a stone bridge with an arch under each bay. This rebuilds it
// with the picture's own measurements (73.25 px per bay, rows in game.js), so
// every camera sees the same world. The windows show the picture's own window
// paintings, with the Pokemon behind the curtains; beyond the four player bays
// the building carries on with bays of its own, then ends, and there is sky.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { zoneX, ZONE_W, PX, WATER_Y, BACKDROP } from "./game.js";

const Y = (row) => (BACKDROP.feet - row) * PX; // a picture row -> world height
const HALF = ZONE_W / 2; // bays meet at the lamp posts
const FRONT_HALF = 0.58; // each bay is three-sided: a front and two angled sides
const Z_FRONT = -0.5, Z_JOINT = -0.71;
const WALL_TOP = 3.6, CORNICE_TOP = Y(30); // the dark band under the roofs
const BRIDGE_FRONT = 0.22; // eggs fall just in front of it, into the water
const BRIDGE_HALF = 12;
const EXTRA = 2; // bays beyond the players' on each side

// sampled from the picture (the roof samples include the tiles' dark outlines,
// so the tiles are drawn a little lighter)
const ROOF = ["#2f64a0", "#4a9866", "#a04a50", "#a3824a"]; // blue, green, red, yellow
const FRAME = ["#3a4cb4", "#34a048", "#bc3444", "#c4a63a"];
const COL = {
  brick: "#735e4c", brickSide: "#735e4c", mortar: "#4c3d31", cornice: "#4d4e57",
  bridge: "#bb9470", bridgeMortar: "#e6dccb", coping: "#c0a486", archBack: "#3c3027", rim: "#a28a70",
  grass: "#5c7f4d", pole: "#d4c2b8", iron: "#2a2624", sill: "#9c8872",
};

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
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
function shade(hex, k) {
  const c = new THREE.Color(hex);
  return "#" + c.multiplyScalar(k).getHexString();
}

// bricks: rows offset by half a brick; w x h pixels per brick
function brickTexture(base, mortar, cols = 4, rows = 4, bw = 64, bh = 30) {
  return repeat(canvas(cols * bw, rows * bh, (g, W, H) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
        g.fillStyle = shade(base, 0.88 + rnd() * 0.24);
        g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        g.fillStyle = "rgba(255,255,255,0.08)";
        g.fillRect(x + 3, y + 3, bw - 6, 4);
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.fillRect(x + 3, y + bh - 7, bw - 6, 4);
      }
    }
  }));
}

// fish-scale roof tiles: two scales across, two rows (staggered) down; each
// row's rounded bottoms hang over the row below. The eave version is one row
// with the gaps under the scales left clear, for the scalloped lower edge.
const SCALE_W = 0.56, SCALE_H = 0.32; // world size of one texture tile (the picture's scales are ~12 x 7 px)
function scaleTexture(base, eave) {
  const S = 64, R = S / 2, ROW = 38;
  return canvas(S * 2, eave ? S : ROW * 2, (g, W, H) => {
    const drawScale = (x, bottom) => {
      const grad = g.createRadialGradient(x + R, bottom - R * 0.7, 2, x + R, bottom - R * 0.9, R * 1.15);
      grad.addColorStop(0, shade(base, 1.4));
      grad.addColorStop(0.65, shade(base, 1.05));
      grad.addColorStop(1, shade(base, 0.62));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x + 1, bottom - S);
      g.lineTo(x + 1, bottom - R);
      g.arc(x + R, bottom - R, R - 1, Math.PI, 0, true);
      g.lineTo(x + S - 1, bottom - S);
      g.closePath();
      g.fill();
      g.strokeStyle = shade(base, 0.42);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x + R, bottom - R, R - 2.5, Math.PI * 0.95, Math.PI * 0.05, true);
      g.stroke();
    };
    if (eave) { for (let c = 0; c < 2; c++) drawScale(c * S, H - 1); return; }
    for (let r = 2; r >= -1; r--) { // lower rows first; rows -1 and 2 wrap the tile
      const odd = ((r % 2) + 2) % 2;
      for (let c = -1; c < 3; c++) drawScale(c * S + (odd ? R : 0), (r + 1) * ROW);
    }
  });
}

// a balcony railing: rails, a band of scrolls, bars, and vines
function railingTexture(colour) {
  return canvas(256, 200, (g, W) => {
    g.strokeStyle = colour;
    g.lineCap = "round";
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(6, 12); g.lineTo(W - 6, 12); g.moveTo(6, 58); g.lineTo(W - 6, 58); g.moveTo(6, 150); g.lineTo(W - 6, 150); g.stroke();
    g.lineWidth = 5;
    for (let i = 0; i < 5; i++) { // scrolls between the top rails
      const cx = 28 + i * 50;
      g.beginPath();
      for (let a = 0; a < Math.PI * 3.2; a += 0.1) {
        const r = 17 - a * 1.6, x = cx + Math.cos(a) * r, y = 35 + Math.sin(a) * r * 0.9;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.lineWidth = 5;
    for (let x = 14; x < W; x += 26) { g.beginPath(); g.moveTo(x, 58); g.lineTo(x, 150); g.stroke(); }
    // ivy over the railing, hanging below it
    for (let i = 0; i < 26; i++) {
      const x = 20 + rnd() * (W - 40), y = 20 + rnd() * 170;
      g.fillStyle = ["#2f6a2c", "#3f8538", "#2a5a28"][i % 3];
      g.beginPath();
      g.ellipse(x, y, 11, 6, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// a dim room behind the glass with the curtains tied back to the sides;
// inside(g) draws whoever is at the window
function drawRoom(g, W, H, inside) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#3a3840"); grad.addColorStop(1, "#1c1a20");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (inside) inside(g);
  for (const side of [0, 1]) {
    const x0 = side ? W : 0, x1 = side ? W * 0.8 : W * 0.2;
    const cg = g.createLinearGradient(x0, 0, x1, 0);
    cg.addColorStop(0, "#a9a6b0"); cg.addColorStop(1, "#77747f");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(x0, 0); g.lineTo(x1, 0);
    g.quadraticCurveTo(side ? W * 0.93 : W * 0.07, H * 0.35, x0, H * 0.5);
    g.fill();
  }
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.fillRect(W * 0.5 - 2, 0, 4, H);
}
function glassTexture() { return canvas(128, 128, drawRoom); } // the bays that aren't a player's

function pokeBallTexture() {
  return canvas(128, 64, (g, W, H) => {
    g.fillStyle = "#e23a32"; g.fillRect(0, 0, W, H / 2);
    g.fillStyle = "#f4f0ea"; g.fillRect(0, H / 2, W, H / 2);
    g.fillStyle = "#1c1a1a"; g.fillRect(0, H / 2 - 3, W, 6);
    g.beginPath(); g.arc(W * 0.25, H / 2, 9, 0, Math.PI * 2); g.fill(); // u = 0.25 faces +z
    g.fillStyle = "#f4f0ea"; g.beginPath(); g.arc(W * 0.25, H / 2, 5, 0, Math.PI * 2); g.fill();
  });
}
function lanternTexture() {
  return canvas(128, 64, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#fff29a"); grad.addColorStop(1, "#e8b820");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#7a5a10"; g.lineWidth = 3;
    for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  });
}

function grassFringeTexture() {
  return repeat(canvas(256, 48, (g, W, H) => {
    for (let i = 0; i < 220; i++) {
      const x = rnd() * W, h = 14 + rnd() * 30;
      g.strokeStyle = ["#4d7440", "#65904f", "#3f6436", "#78a35c"][i % 4];
      g.lineWidth = 3 + rnd() * 3;
      g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + (rnd() - 0.5) * 10, H - h * 0.6, x + (rnd() - 0.5) * 14, H - h); g.stroke();
    }
  }));
}

// UVs from world positions, per face direction, in units of the texture's tile
function worldUV(geo, tileW, tileH) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    if (Math.abs(ny) > 0.7) uv.setXY(i, x / tileW, z / tileH);
    else uv.setXY(i, (x * nz - z * nx) / tileW, y / tileH);
  }
  uv.needsUpdate = true;
  return geo;
}

// a vertical wall from (x0, z0) to (x1, z1), y0..y1
function wallQuad(x0, z0, x1, z1, y0, y1) {
  const g = new THREE.BufferGeometry();
  const nx = z1 - z0, nz = -(x1 - x0), l = Math.hypot(nx, nz); // outward = to the right of the direction of travel... flipped below
  g.setAttribute("position", new THREE.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0], 3));
  const N = [-nx / l, 0, -nz / l];
  g.setAttribute("normal", new THREE.Float32BufferAttribute([...N, ...N, ...N, ...N, ...N, ...N], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  return g;
}

export function buildStage(scene, assets) {
  const parts = new Map(); // material -> geometries, merged at the end (few draw calls per view)
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo.index ? geo.toNonIndexed() : geo); };
  const lambert = (o) => new THREE.MeshLambertMaterial(o);
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  const mats = {
    brick: lambert({ map: brickTexture(COL.brick, COL.mortar) }),
    bridge: lambert({ map: brickTexture(COL.bridge, COL.bridgeMortar, 4, 4, 64, 28) }),
    coping: lambert({ map: repeat(canvas(128, 32, (g, W, H) => { g.fillStyle = COL.coping; g.fillRect(0, 0, W, H); g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, 0, 3, H); g.fillRect(64, 0, 3, H); g.fillRect(0, H - 3, W, 3); })) }),
    cornice: lambert({ color: COL.cornice }),
    archBack: lambert({ color: COL.archBack }),
    rim: lambert({ color: COL.rim }),
    grass: lambert({ map: repeat(canvas(64, 64, (g, W, H) => { g.fillStyle = COL.grass; g.fillRect(0, 0, W, H); for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? "#4d6f40" : "#6d9357"; g.fillRect(rnd() * W, rnd() * H, 2, 5); } })) }),
    fringe: lambert({ map: grassFringeTexture(), alphaTest: 0.4, side: THREE.DoubleSide }),
    pole: lambert({ color: COL.pole }),
    iron: lambert({ color: COL.iron }),
    sill: lambert({ color: COL.sill }),
    glass: lambert({ map: glassTexture() }),
    ball: lambert({ map: pokeBallTexture() }),
    lantern: new THREE.MeshBasicMaterial({ map: lanternTexture() }), // lit
    roof: ROOF.map((c) => lambert({ map: repeat(scaleTexture(c, false)), side: THREE.DoubleSide })),
    eave: ROOF.map((c) => lambert({ map: (() => { const t = scaleTexture(c, true); t.wrapS = THREE.RepeatWrapping; return t; })(), alphaTest: 0.5, side: THREE.DoubleSide })),
    frame: FRAME.map((c) => lambert({ color: c })),
    railing: FRAME.map((c) => lambert({ map: railingTexture(c), alphaTest: 0.5, side: THREE.DoubleSide })),
  };

  // --- the building: bays from -EXTRA to 3 + EXTRA
  const windowRows = [{ top: 49, bottom: 95 }, { top: 111, bottom: 159 }]; // picture rows
  const atlas = windowAtlas(assets.backdrop.image, windowRows);
  const paint = lambert({ map: atlas.texture });
  for (let b = -EXTRA; b < 4 + EXTRA; b++) {
    const xc = zoneX(b), col = ((b % 4) + 4) % 4;
    const outline = (o) => [[xc - HALF, Z_JOINT + o], [xc - FRONT_HALF, Z_FRONT + o], [xc + FRONT_HALF, Z_FRONT + o], [xc + HALF, Z_JOINT + o]];
    const walls = outline(0);
    for (let k = 0; k < 3; k++) add(mats.brick, worldUV(wallQuad(...walls[k], ...walls[k + 1], 0, WALL_TOP), 0.84, 0.42));
    const corn = outline(0.05);
    for (let k = 0; k < 3; k++) add(mats.cornice, wallQuad(...corn[k], ...corn[k + 1], WALL_TOP, CORNICE_TOP));
    roof(outline(0.1), outline(-0.6), 3.72, 6.4, mats.roof[col]);
    eave(outline(0.13), 3.66, 3.66 + SCALE_H * 64 / 76, mats.eave[col]);

    // two windows on the front face
    windowRows.forEach((rows, r) => {
      const y0 = Y(rows.bottom), y1 = Y(rows.top), w = 41 * PX, z = Z_FRONT + 0.012;
      const player = b >= 0 && b < 4;
      const face = new THREE.PlaneGeometry(w, y1 - y0).translate(xc, (y0 + y1) / 2, z);
      if (player) { atlas.setUV(face, b, r); add(paint, face); } else add(mats.glass, face);
      const f = mats.frame[col], t = 0.05, d = 0.06;
      add(f, box(w + t, t, d, xc, y1, z));
      add(f, box(w + t, t, d, xc, y0, z));
      add(f, box(t, y1 - y0, d, xc - w / 2, (y0 + y1) / 2, z));
      add(f, box(t, y1 - y0, d, xc + w / 2, (y0 + y1) / 2, z));
      add(f, box(t * 0.6, y1 - y0, d * 0.6, xc, (y0 + y1) / 2, z)); // mullion
      add(mats.sill, box(w + 0.16, 0.05, 0.16, xc, y0 - 0.04, Z_FRONT + 0.06));
      // the balcony railing in front of the lower part, with a small floor
      // the texture's rails run from row 12 to row 150 of 200 (ivy hangs below):
      // the top rail sits 13 px under the window's top, as painted in the picture
      const railTop = y1 - 13 * PX, k = (railTop - y0) / 138, rw = 47 * PX;
      add(mats.railing[col], new THREE.PlaneGeometry(rw, 200 * k).translate(xc, railTop + 12 * k - 100 * k, Z_FRONT + 0.13));
      add(f, box(rw, 0.03, 0.13, xc, y0 + 0.01, Z_FRONT + 0.07));
    });
  }
  // the building's ends
  for (const s of [-1, 1]) {
    const x = s * (HALF * 2 * (2 + EXTRA));
    add(mats.brick, worldUV(wallQuad(x, s < 0 ? -4 : Z_JOINT, x, s < 0 ? Z_JOINT : -4, 0, WALL_TOP), 0.84, 0.42));
  }

  // --- lamp posts between the bays: a Poke Ball lamp, then a lantern, and so on
  for (let k = -EXTRA; k <= 4 + EXTRA; k++) {
    const x = zoneX(k) - HALF, z = Z_JOINT + 0.1;
    add(mats.pole, new THREE.CylinderGeometry(0.022, 0.03, 3.62, 8).translate(x, 1.81, z));
    add(mats.iron, box(0.2, 0.035, 0.06, x, 3.64, z));
    add(mats.iron, new THREE.ConeGeometry(0.07, 0.07, 8).translate(x, 3.88, z));
    const head = new THREE.SphereGeometry(0.1, 16, 10).translate(x, 3.76, z + 0.02);
    add(k % 2 === 0 ? mats.ball : mats.lantern, head);
  }

  // --- the bridge: brick front with an arch under each bay, stone coping, grass on top
  const face = new THREE.Shape();
  const bottom = WATER_Y - 0.6, top = -0.17;
  face.moveTo(-BRIDGE_HALF, bottom); face.lineTo(BRIDGE_HALF, bottom); face.lineTo(BRIDGE_HALF, top); face.lineTo(-BRIDGE_HALF, top); face.closePath();
  const a = 0.46, spring = Y(205) - a;
  for (let k = -6; k <= 9; k++) {
    const x = zoneX(k);
    if (Math.abs(x) > BRIDGE_HALF - a - 0.2) continue;
    const hole = new THREE.Path();
    hole.moveTo(x - a, bottom + 0.1);
    hole.lineTo(x - a, spring);
    hole.absarc(x, spring, a, Math.PI, 0, true);
    hole.lineTo(x + a, bottom + 0.1);
    hole.closePath();
    face.holes.push(hole);
    add(mats.rim, new THREE.RingGeometry(a, a + 0.08, 20, 1, 0, Math.PI).translate(x, spring, BRIDGE_FRONT + 0.004));
    for (const s of [-1, 1]) add(mats.rim, new THREE.PlaneGeometry(0.08, spring - WATER_Y).translate(x + s * (a + 0.04), (spring + WATER_Y) / 2, BRIDGE_FRONT + 0.004));
  }
  const depth = 0.9;
  add(mats.bridge, worldUV(new THREE.ExtrudeGeometry(face, { depth, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, BRIDGE_FRONT - depth), 0.8, 0.36));
  add(mats.archBack, new THREE.PlaneGeometry(BRIDGE_HALF * 2, top - WATER_Y + 0.2).translate(0, (top + WATER_Y) / 2, BRIDGE_FRONT - depth + 0.02));
  add(mats.coping, worldUV(box(BRIDGE_HALF * 2, 0.17, 0.16, 0, -0.085, BRIDGE_FRONT - 0.02), 0.8, 0.17));
  add(mats.grass, worldUV(box(BRIDGE_HALF * 2, 0.02, BRIDGE_FRONT - Z_FRONT + 0.4, 0, -0.01, (BRIDGE_FRONT + Z_FRONT - 0.4) / 2), 0.5, 0.5));
  const fringe = new THREE.PlaneGeometry(BRIDGE_HALF * 2, 0.16).translate(0, 0.05, BRIDGE_FRONT + 0.05);
  fringe.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 0) arr[i] = v * BRIDGE_HALF * 2 / 0.9; });
  add(mats.fringe, fringe);

  function roof(lo, hi, y0, y1, mat) {
    const pos = [], uv = [], tile = SCALE_W, tileV = SCALE_H;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const [ax, az] = lo[k], [bx, bz] = lo[k + 1], [cx, cz] = hi[k + 1], [dx, dz] = hi[k];
      const len = Math.hypot(bx - ax, bz - az), slope = Math.hypot(y1 - y0, 0.7);
      const u0 = s / tile, u1 = (s + len) / tile, v1 = slope / tileV;
      pos.push(ax, y0, az, bx, y0, bz, cx, y1, cz, ax, y0, az, cx, y1, cz, dx, y1, dz);
      uv.push(u0, 0, u1, 0, u1, v1, u0, 0, u1, v1, u0, v1);
      s += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    add(mat, g);
  }
  function eave(line, y0, y1, mat) {
    const pos = [], uv = [], tile = SCALE_W;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1], len = Math.hypot(bx - ax, bz - az);
      const u0 = s / tile, u1 = (s + len) / tile;
      pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
      s += len;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    add(mat, g);
  }

  // --- merge per material
  const group = new THREE.Group();
  for (const [mat, list] of parts) {
    const geo = mergeGeometries(list.map((g) => { g.deleteAttribute("uv1"); return g; }));
    group.add(new THREE.Mesh(geo, mat));
  }
  group.add(water(), farBank());
  scene.add(group);
  scene.background = canvas(4, 256, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#5ea8e4"); grad.addColorStop(0.7, "#aad6f4"); grad.addColorStop(1, "#dcf0fa");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  });
  return { update: (t) => { waterTime.value = t; } };
}

// the players' eight windows in one texture: the same room and curtains as
// the other windows, with the Pokemon from the picture's window paintings.
// In the paintings they stand behind the balcony, so only the band from the
// window's top to just past the railing's top is used (their heads, peeking
// over it), with soft edges; the 3D railing covers the rest.
function windowAtlas(img, rows) {
  const poles = [13, 86.25, 159.5, 232.75], cw = 41, SCALE = 4;
  const H = Math.max(...rows.map((r) => r.bottom - r.top));
  const c = document.createElement("canvas");
  c.width = cw * SCALE * 4; c.height = H * SCALE * 2;
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  const cellW = cw * SCALE;
  const tmp = document.createElement("canvas"), t = tmp.getContext("2d");
  poles.forEach((p, b) => rows.forEach((r, k) => {
    const cellH = (r.bottom - r.top) * SCALE, x = b * cellW, y = k * H * SCALE;
    const band = 22; // picture rows: 2 below the frame's top to ~7 past the railing's top
    tmp.width = cellW; tmp.height = band * SCALE;
    t.imageSmoothingQuality = "high";
    t.drawImage(img, p + 17, r.top + 2, cw - 6, band, 0, 0, cellW, band * SCALE);
    t.globalCompositeOperation = "destination-in";
    const fx = t.createLinearGradient(0, 0, cellW, 0);
    fx.addColorStop(0, "rgba(0,0,0,0)"); fx.addColorStop(0.18, "rgba(0,0,0,1)"); fx.addColorStop(0.82, "rgba(0,0,0,1)"); fx.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = fx; t.fillRect(0, 0, cellW, band * SCALE);
    const fy = t.createLinearGradient(0, 0, 0, band * SCALE);
    fy.addColorStop(0, "rgba(0,0,0,0.6)"); fy.addColorStop(0.15, "rgba(0,0,0,1)"); fy.addColorStop(0.7, "rgba(0,0,0,1)"); fy.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = fy; t.fillRect(0, 0, cellW, band * SCALE);
    g.save(); g.translate(x, y);
    drawRoom(g, cellW, cellH, (gg) => gg.drawImage(tmp, 0, 2 * SCALE));
    g.restore();
  }));
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.NoColorSpace;
  return {
    texture,
    setUV(geo, b, k) {
      const uv = geo.attributes.uv, u0 = b / 4, u1 = (b + 1) / 4, h = (rows[k].bottom - rows[k].top) / H;
      const v1 = 1 - k / 2, v0 = v1 - h / 2;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    },
  };
}

// the far bank of the river, hazy: seen past the building's ends on wide screens
function farBank() {
  const g = new THREE.Group();
  const haze = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(new THREE.Color("#cfe6f2"), 0.45) });
  const bank = new THREE.Mesh(new THREE.BoxGeometry(140, 0.5, 2), haze("#6f9a6a"));
  bank.position.set(0, WATER_Y + 0.1, -32);
  g.add(bank);
  const hills = [[], [], []];
  for (let i = 0; i < 16; i++) {
    hills[i % 3].push(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(5 + rnd() * 5, 1.5 + rnd() * 2.5, 3).translate(-60 + i * 8 + rnd() * 4, WATER_Y + 0.2, -34 - rnd() * 6));
  }
  ["#5f8f60", "#6d9c68", "#58835a"].forEach((c, k) => g.add(new THREE.Mesh(mergeGeometries(hills[k]), haze(c))));
  return g;
}

const waterTime = { value: 0 };
function water() {
  const geo = new THREE.PlaneGeometry(90, 60, 1, 1).rotateX(-Math.PI / 2).translate(0, WATER_Y, -20);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: waterTime },
    vertexShader: "varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }",
    fragmentShader: `uniform float time; varying vec3 vP;
      void main() {
        vec2 p = vP.xz * vec2(3.0, 7.0);
        float w = sin(p.x * 0.9 + time * 1.2 + 2.0 * sin(p.y * 0.5 - time * 0.7)) * sin(p.y * 0.8 + time * 0.9);
        float glint = smoothstep(0.55, 1.0, w);
        vec3 near = vec3(0.12, 0.36, 0.45), far = vec3(0.45, 0.66, 0.74);
        vec3 c = mix(near, far, clamp(-vP.z / 25.0, 0.0, 1.0));
        c *= vP.z < ${BRIDGE_FRONT.toFixed(2)} && vP.z > -3.0 ? 0.55 : 1.0; // under the bridge
        gl_FragColor = vec4(mix(c, vec3(0.75, 0.9, 0.95), glint * 0.35), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}
