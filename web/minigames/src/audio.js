// Music and sound effects: the games' own, played by n64audio.js from each
// game's assets/<game>/sound.bin (its songs, the effects it plays and just
// the samples they use, as in the ROM; tools/web_assets.py makes them). A
// game's file is fetched after the first tap with the sound on, once that game
// is picked, so players with the sound off never download one. Until it's in
// (or if it can't load), simple Web Audio stand-ins play instead. Browsers only
// allow sound after a tap or key press: call unlock() from one.
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
let pack = null; // the game whose sounds play: { url, standIns, engine, loading, song }
const packs = new Map();

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

// Make this game's sounds the ones that play: url, its sound.bin; standIns,
// {name: (tone, noise) => ...} for while it loads. The other game's stop.
export function useSounds(id, url, standIns = {}) {
  if (pack?.id === id) return;
  stopSound();
  if (pack?.engine) { pack.engine.stop(MUSIC); pack.engine.stop(EFFECTS); }
  if (pack) pack.song = null;
  pack = packs.get(id) || { id, url, standIns, engine: null, loading: null, song: null };
  packs.set(id, pack);
  if (pack.engine) startEffects(pack.engine);
  if (ctx && !muted) load();
}

function load() {
  const p = pack;
  if (!p || p.loading || !ctx) return;
  p.loading = loadBank(p.url).then((bank) => {
    const out = ctx.createGain();
    out.gain.value = LEVEL;
    out.connect(master);
    p.engine = new Engine(ctx, bank, out);
    if (pack !== p) return; // picked another game meanwhile
    startEffects(p.engine);
    if (p.song) playSong(p.song);
  }).catch((e) => console.warn("sound:", e.message)); // the stand-ins stay
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
  if (!m) load();
}
export function isMuted() { return muted; }

// ---- music ----

// Start one of the game's songs by name ("egg", "win"...), or stop the one
// playing (null), fading over the given frames (the games fade their song for
// 40 at the finish). once: a jingle, which is skipped rather than played late
// if the sound file isn't in yet.
export function music(name, fade = 0, once = false) {
  if (!pack) return;
  pack.song = once ? null : name;
  if (!pack.engine) return;
  if (name) playSong(name);
  else pack.engine.stop(MUSIC, fade * 3);
}

function playSong(name) {
  startSong(pack.engine, name);
  if (name === "win") pack.song = null; // a fanfare: plays once
}

export function startSong(engine, name) {
  engine.play(MUSIC, engine.bank.songs[name]);
  const p = engine.players[MUSIC];
  p.fadeVolumeScale = MUSIC_VOLUME;
  if (engine.bank.tempo?.[name]) p.tempoChange = engine.bank.tempo[name] * 48; // (a song the game plays faster)
}

// The song playing, faster by bpm beats a minute (audio command 0x49, as
// 0x80027628 sends it: Barrier Ball's last 30 seconds)
export function musicTempo(bpm) {
  const p = pack?.engine?.players[MUSIC];
  if (p?.enabled) p.tempoChange = bpm * 48;
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
  c.sfxName = name;
  c.sfxState[0] = s.vol;
  c.sfxState[1] = s.rev;
  c.sfxState[2] = seat === undefined ? 64 : typeof seat === "object" ? seat.pan : SEAT_PAN[seat];
  c.sfxPitch = s.pitch;
  c.io[3] = s.n >> 7;
  c.io[1] = (s.n << 24) >> 24;
  c.io[0] = 1;
  engine.wake();
  return true;
}

// Stop a sound that plays until it's stopped (a crowd, say), as the game's
// sound manager does once the sound's no longer asked for: 0 on its channel's
// port 0 (port 2 is 1 while it plays). No name: every sound still playing
// (and the effects back on after a hush).
export function stopSound(name) {
  if (!pack?.engine) return;
  if (!name) hush(false);
  stopEffect(pack.engine, name);
}

// A hush (Eager Eevee's, before each of Aipom's fakes: 0x800280B0, sound
// 0xFFE): the song goes quiet at once (command 0x4B: its volume scaled to 0 in
// an update) and the effects fade out over 20 updates and stop (0x83); what the
// game asks to play meanwhile isn't heard. hush(false) (0x800280DC, 0xFFF)
// starts the effects again (0x80027E20) and puts the song back at its volume (0x4C).
export function hush(on) {
  const e = pack?.engine;
  if (!e || !on === !e.hushed) return;
  const m = e.players[MUSIC];
  if (on) {
    e.hushed = { script: m.script, volume: m.fadeVolume };
    if (m.enabled && m.state !== 2) { m.fadeVolume = 0; m.recalculateVolume = true; }
    e.stop(EFFECTS, 20);
    return;
  }
  const h = e.hushed;
  startEffects(e);
  if (m.enabled && m.state !== 2 && m.script === h.script) { m.fadeVolume = h.volume; m.recalculateVolume = true; }
}
export function stopEffect(engine, name) {
  for (const c of engine.players[EFFECTS].channels) {
    if (!c.sfxName || (name && c.sfxName !== name)) continue;
    if (c.io[2] === 1) c.io[0] = 0;
    else if (c.io[0] === 1) c.io[0] = -1; // asked for but not started yet: never mind
    c.sfxName = null;
  }
  engine.wake();
}

// the effects sequence running, as the game starts it
export function startEffects(engine) {
  engine.onCustom = custom;
  engine.hushed = null;
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

// one of the game's sounds by name; seat: whose it is (panned to their column),
// or { pan } (0-127: Gutsy Golbat pans by where the Golbat is)
export function sound(name, seat) {
  if (!ctx || muted || !pack) return;
  const e = pack.engine;
  if (e && (e.hushed ? name in e.bank.sounds : trigger(e, name, seat))) return;
  pack.standIns[name]?.(tone, noise);
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

// the stand-ins every game has (the minigames share these sounds)
export const SHARED_STAND_INS = {
  count: (tone) => tone(660, 0, 0.12, { vol: 0.12 }),
  go: (tone) => tone(1320, 0, 0.35, { vol: 0.12 }),
  finish: (tone) => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.16, { vol: 0.1 })),
  tap: (tone) => tone(1200, 0, 0.04, { vol: 0.06 }),
};

// the shell's sounds, the same in every game
export const sfx = {
  count: () => sound("count"),
  go: () => sound("go"),
  finish: () => sound("finish"),
  tap: () => sound("tap"),
  win: () => {
    if (!ctx || muted || !pack) return;
    if (pack.engine) music("win");
    else [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.11, 0.22, { type: "triangle", vol: 0.2 }));
  },
};

// for the tests and the console (?debug)
export const debug = {
  get engine() { return pack?.engine; },
  get ctx() { return ctx; },
  loaded: () => pack?.loading,
  get pack() { return pack?.id; },
};
