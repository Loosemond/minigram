// HUD pictures coloured as the game draws them. Many of the game's HUD
// pictures are grey (I or IA) and drawn through a combiner that makes a texel's
// colour (prim - env) x its grey + env, prim and env set as it draws (e.g.
// FC30B261 5566FF7F: Delibird's Delivery's clock and x2-x5, Gutsy Golbat's and
// Furret's Frolic's points by player; docs/colours.md): the extracted pictures
// are the plain grey. tint() is a coloured copy of one, made once for each
// picture and colours; tintURL() the same from a picture's URL, as an image's
// src for the HTML HUD.
//
// prim and env: [r, g, b] (0-255), 0xrrggbb or "#rrggbb". alpha: "own" (the
// picture's: an IA picture's), "grey" (an I picture, which the RDP reads as its
// grey: extracted opaque), "inverse" (1 - its grey) or a function (grey, a) ->
// 0-255; times: what the alpha's multiplied by (a combiner's prim or env alpha).
import { retry, attemptURL } from "./retry.js";

const rgb =(c) => (Array.isArray(c) ? c : typeof c === "number" ? [c >> 16, (c >> 8) & 255, c & 255]
  : [1, 3, 5].map((i) => parseInt(String(c).slice(i, i + 2), 16)));
const ALPHA = { own: (g, a) => a, grey: (g) => g, inverse: (g) => 255 - g };
const made = new WeakMap(); // picture -> (colours -> canvas)

// pic: a loaded image (an <img>, ImageBitmap or canvas); a canvas back
export function tint(pic, prim, env, { alpha = "own", times = 1 } = {}) {
  const p = rgb(prim), e = rgb(env), key = `${p}|${e}|${alpha}|${times}`;
  let mine = made.get(pic);
  if (!mine) made.set(pic, (mine = new Map()));
  if (mine.has(key)) return mine.get(key);
  const c = document.createElement("canvas");
  c.width = pic.naturalWidth || pic.width;
  c.height = pic.naturalHeight || pic.height;
  const g = c.getContext("2d");
  g.drawImage(pic, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data, a = typeof alpha === "function" ? alpha : ALPHA[alpha];
  for (let i = 0; i < px.length; i += 4) {
    const grey = px[i], k = grey / 255;
    px[i + 3] = Math.round(Math.max(0, Math.min(255, a(grey, px[i + 3]))) * times);
    for (let j = 0; j < 3; j++) px[i + j] = Math.round(e[j] + (p[j] - e[j]) * k);
  }
  g.putImageData(d, 0, 0);
  mine.set(key, c);
  return c;
}

const urls = new Map(); // url + colours -> a promise of the copy's (data) URL
const pictures = new Map(); // url -> a promise of the loaded picture
const once = (src) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error("can't load " + src));
  img.src = src;
});
function load(url) {
  if (!pictures.has(url)) pictures.set(url, retry((n) => once(attemptURL(url, n)), url).catch((err) => { pictures.delete(url); throw err; }));
  return pictures.get(url);
}
// the picture at url, tinted: a promise of a URL for an <img>
export function tintURL(url, prim, env, opts = {}) {
  const key = `${url}|${rgb(prim)}|${rgb(env)}|${opts.alpha || "own"}|${opts.times ?? 1}`;
  if (!urls.has(key)) urls.set(key, load(url).then((img) => tint(img, prim, env, opts).toDataURL()));
  return urls.get(key);
}
