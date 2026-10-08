// The arrow over this device's player, in its colour (the remake's: in most
// games the four look the same). A game makes it in its HUD and puts it each
// frame over a point of its scene (over its player's head), as a view shows
// it: { cam, x, y, w, h }, the view's camera and its place on the page.
// With below, it points up from under the point instead (under the player's
// feet), for a game where over its player is where the play comes from.
import * as THREE from "three";

const COLOURS = ["#2f5de0", "#23a043", "#dc3030", "#e8a412"]; // 1P-4P (main.js)
// its fill and, 1.5 lower, its shadow, on a 22 x 17 box; the tip's where it goes
const DOWN = { fill: "M2 2h18l-9 12z", shadow: "M2 3.5h18l-9 12z", tip: [11, 15] };
const UP = { fill: "M2 15h18l-9-12z", shadow: "M2 16.5h18l-9-12z", tip: [11, 2] };
const at = new THREE.Vector3();

// hud: the game's HUD element; seat: () => this device's seat
export function meMark(hud, seat, { below = false } = {}) {
  const A = below ? UP : DOWN;
  const el = document.createElement("i");
  el.className = "me-mark" + (below ? " below" : "");
  el.hidden = true;
  el.innerHTML = `<svg viewBox="0 0 22 17" aria-hidden="true"><path d="${A.shadow}" fill="rgba(0,0,0,0.45)"/>` +
    `<path class="fill" d="${A.fill}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  hud.prepend(el); // (under the game's own bits of HUD)
  let colour = -1;
  return {
    el,
    // over p (a point of the scene) in view; hidden with no view (or no p),
    // and while p's off the view or behind its camera
    place(view, p) {
      let on = !!(view && p);
      if (on) {
        view.cam.updateMatrixWorld(); // (where it is now: some games move it after it's drawn, before the next)
        at.copy(p).project(view.cam);
        const x = view.x + ((at.x + 1) / 2) * view.w, y = view.y + ((1 - at.y) / 2) * view.h;
        on = at.z > -1 && at.z < 1 && x >= view.x && x <= view.x + view.w && y >= view.y && y <= view.y + view.h;
        if (on) el.style.transform = `translate3d(${x - A.tip[0]}px, ${y - A.tip[1]}px, 0)`;
      }
      el.hidden = !on;
      const z = seat();
      if (on && z !== colour) { colour = z; el.style.setProperty("--c", COLOURS[z]); }
    },
  };
}
