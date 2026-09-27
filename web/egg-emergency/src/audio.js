// Sound effects made with Web Audio (the game's audio isn't extracted yet).
// Browsers only allow sound after a tap or key press: call unlock() from one.
let ctx = null, master = null, noiseBuf = null, muted = false;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted() { return muted; }

function tone(freq, at, dur, { type = "square", vol = 0.15, to = null } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(at, dur, { vol = 0.3, filter = "lowpass", freq = 1000 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = filter;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  catch() { tone(988, 0, 0.06, { vol: 0.1 }); tone(1480, 0.05, 0.09, { vol: 0.1 }); },
  crack() { noise(0, 0.08, { vol: 0.25, filter: "highpass", freq: 2500 }); },
  boom() { noise(0, 0.6, { vol: 0.7, freq: 700 }); tone(130, 0, 0.4, { type: "sine", vol: 0.6, to: 35 }); },
  dud() { noise(0, 0.3, { vol: 0.25, freq: 500 }); },
  tick() { tone(660, 0, 0.12, { vol: 0.12 }); },
  go() { tone(1320, 0, 0.35, { vol: 0.12 }); },
  finish() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.16, { vol: 0.1 })); },
  win() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.11, 0.22, { type: "triangle", vol: 0.2 })); },
  lose() { [523, 494, 466, 392].forEach((f, i) => tone(f, i * 0.16, 0.25, { type: "triangle", vol: 0.2 })); },
  tap() { tone(1200, 0, 0.04, { vol: 0.06 }); },
};
