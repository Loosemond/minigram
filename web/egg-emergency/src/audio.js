// Music and sound effects: the game's own, played by n64audio.js from
// assets/sound.bin (the song, the fanfare, the effects and just the samples
// they use, as in the ROM; tools/web_assets.py makes it). It's fetched after
// the first tap with the sound on, so players with the sound off never
// download it. Until it's in (or if it can't load), simple Web Audio stand-ins
// play instead. Browsers only allow sound after a tap or key press: call
// unlock() from one.
import { Engine, loadBank } from "./n64audio.js";

// The sequence players the game uses: music on 0, sound effects on 2, at the
// volumes it gives them (0x41 commands: the song's volume, 127/127, x 0.81;
// effects 0.648).
const MUSIC = 0, EFFECTS = 2;
const MUSIC_VOLUME = 0.81, EFFECTS_VOLUME = 0.648;
const LEVEL = 1.6; // overall loudness: the N64 mixes quietly
// The game pans a player's sounds to their column (x = 13..306 of 320 on the
// original screen, four columns)
const SEAT_PAN = [20, 49, 78, 108];

let ctx = null, master = null, noiseBuf = null, muted = false;
let engine = null, loading = null, song = null;

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
    document.addEventListener("visibilitychange", () => {
      // the game pauses in the background; so does the sound
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
  }
  if (ctx.state !== "running" && !document.hidden) ctx.resume(); // suspended, or "interrupted" on iOS
  if (!muted) load();
}

function load() {
  if (loading || !ctx) return;
  loading = loadBank("assets/sound.bin").then((bank) => {
    const out = ctx.createGain();
    out.gain.value = LEVEL;
    out.connect(master);
    engine = new Engine(ctx, bank, out);
    startEffects(engine);
    if (song) playSong(song);
  }).catch((e) => console.warn("sound:", e.message)); // the stand-ins stay
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
  if (!m) load();
}
export function isMuted() { return muted; }

// ---- music ----

// Start a song by name ("egg", "win"), or stop the one playing (null), fading
// over the given frames (the game fades its song for 40 at the finish).
export function music(name, fade = 0) {
  song = name;
  if (!engine) return;
  if (name) playSong(name);
  else engine.stop(MUSIC, fade * 3);
}

function playSong(name) {
  startSong(engine, name);
  if (name === "win") song = null; // a fanfare: plays once
}

export function startSong(engine, name) {
  engine.play(MUSIC, engine.bank.songs[name]);
  engine.players[MUSIC].fadeVolumeScale = MUSIC_VOLUME;
}

// ---- sound effects ----

// One of the game's sounds on the effects sequence, as the game plays it: it
// fills a channel's state (volume, reverb, pan: the script reads them every
// update) and IO ports (the sound's table and number, then "go"). The game
// picks a free channel among the ones the sound may use.
export function trigger(engine, name, seat) {
  const s = engine.bank.sounds[name], p = engine.players[EFFECTS];
  if (!s || !p.enabled) return false;
  const chans = [];
  for (let i = 0; i < 16; i++) if (s.chans & (1 << i)) chans.push(p.channels[i]);
  const c = chans.find((ch) => ch.io[2] !== 1) || chans[0];
  c.sfxState[0] = s.vol;
  c.sfxState[1] = s.rev;
  c.sfxState[2] = seat === undefined ? 64 : SEAT_PAN[seat];
  c.sfxPitch = s.pitch;
  c.io[3] = s.n >> 7;
  c.io[1] = (s.n << 24) >> 24;
  c.io[0] = 1;
  engine.wake();
  return true;
}

// the effects sequence running, as the game starts it
export function startEffects(engine) {
  engine.onCustom = custom;
  engine.play(EFFECTS, engine.bank.soundSeq);
  engine.players[EFFECTS].fadeVolumeScale = EFFECTS_VOLUME;
}

// the game's hook in the effects script ('custom 0', every update of a
// playing sound): sets the channel's pitch from its state
function custom(index, value, channel) {
  if (index === 0 && channel.sfxPitch && channel.freqScale !== channel.sfxPitch) {
    channel.freqScale = channel.sfxPitch;
    channel.changes.freqScale = true;
  }
  return value;
}

function sound(name, seat, standIn) {
  if (!ctx || muted) return;
  if (!(engine && trigger(engine, name, seat))) standIn();
}

// ---- stand-ins (Web Audio tones), while the game's sounds load ----

function tone(freq, at, dur, { type = "square", vol = 0.15, to = null } = {}) {
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

// seat: whose sound it is (panned to their column)
export const sfx = {
  catch: (seat) => sound("catch", seat, () => { tone(988, 0, 0.06, { vol: 0.1 }); tone(1480, 0.05, 0.09, { vol: 0.1 }); }),
  shock: (seat) => sound("shock", seat, () => { noise(0, 0.6, { vol: 0.7, freq: 700 }); tone(130, 0, 0.4, { type: "sine", vol: 0.6, to: 35 }); }),
  lost: (seat) => sound("lost", seat, () => {}),
  splash: (seat) => sound("splash", seat, () => noise(0, 0.3, { vol: 0.25, freq: 500 })),
  count: () => sound("count", undefined, () => tone(660, 0, 0.12, { vol: 0.12 })),
  go: () => sound("go", undefined, () => tone(1320, 0, 0.35, { vol: 0.12 })),
  finish: () => sound("finish", undefined, () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.16, { vol: 0.1 }))),
  tap: () => sound("tap", undefined, () => tone(1200, 0, 0.04, { vol: 0.06 })),
  win: () => {
    if (!ctx || muted) return;
    if (engine) music("win");
    else [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.11, 0.22, { type: "triangle", vol: 0.2 }));
  },
};

// for the tests and the console (?debug)
export const debug = { get engine() { return engine; }, get ctx() { return ctx; }, loaded: () => loading };
