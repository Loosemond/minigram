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
const FRAME_MS = 1000 / 30; // the minigames run at 30 frames a second
// Where the game pans a player's sound (0x80027A18): 64 + a byte of the pairs
// at 0x80090E64, picked by the sound's bank (0x800A3B78); banks 0, 5, 10 and
// 12 keep it in the middle
const SEAT_PANS = { 1: [14, 54, 74, 114], 2: [14, 44, 84, 114], 6: [14, 114, 14, 114], 11: [64, 124, 4, 64] };
for (const b of [3, 7, 8, 9]) SEAT_PANS[b] = SEAT_PANS[1];
SEAT_PANS[4] = SEAT_PANS[2];
// ...and two sounds a player's own pitch too (0x80027AE4): Streaming
// Stampede's count, Egg Emergency's catch
const SEAT_PITCH = { 0x3f02: [1.34, 1, 0.85, 0.68], 0x7f01: [0.97, 1, 0.98, 0.99] };
// (a sound file from before the sounds had their ids: the columns on the screen)
const OLD_SEAT_PAN = [20, 49, 78, 108];

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
// playing (null), fading over the given frames (some games fade their song
// for 40 as the play ends). once: a jingle, which is skipped rather than
// played late if the sound file isn't in yet.
export function music(name, fade = 0, once = false) {
  if (!pack) return;
  pack.song = once ? null : name;
  if (!pack.engine) return;
  if (name) playSong(name);
  else pack.engine.stop(MUSIC, fade * 3);
}

function playSong(name) {
  startSong(pack.engine, name);
}

export function startSong(engine, name) {
  if (!(name in engine.bank.songs)) return false; // (an older sound file)
  engine.play(MUSIC, engine.bank.songs[name]);
  const p = engine.players[MUSIC];
  p.fadeVolumeScale = MUSIC_VOLUME;
  if (engine.bank.tempo?.[name]) p.tempoChange = engine.bank.tempo[name] * 48; // (a song the game plays faster)
  return true;
}

// The song playing, faster by bpm beats a minute (audio command 0x49, as
// 0x80027628 sends it: Barrier Ball's last 30 seconds)
export function musicTempo(bpm) {
  const p = pack?.engine?.players[MUSIC];
  if (p?.enabled) p.tempoChange = bpm * 48;
}

// ---- sound effects ----

// One of the game's sounds on the effects sequence, as the game plays it
// (0x80027BC4, 0x8002701C): it fills a channel's state (volume, reverb, pan:
// the script reads them every update) and IO ports (the sound's table and
// number, then "go"). seat: whose it is (0-3), or none; how: { pan (0-127) or
// x (the place the game works out, a byte: 0x8002780C), pitch (times its
// own), frames (it stops after that many: 0x80027764) }.
export function trigger(engine, name, seat, how = {}) {
  if (seat !== null && typeof seat === "object") { how = seat; seat = undefined; } // (sound(name, { pan }))
  const s = engine.bank.sounds[name], p = engine.players[EFFECTS];
  if (!s || !p.enabled) return null;
  const c = channelFor(p, s, seat);
  const turn = (c.sfxTurn || 0) + 1;
  Object.assign(c, { sfxName: name, sfxSeat: seat, sfxTurn: turn });
  c.sfxState[0] = s.vol;
  c.sfxState[1] = s.rev;
  place(c, s, seat, how);
  c.io[3] = s.n >> 7;
  c.io[1] = (s.n << 24) >> 24;
  c.io[0] = 1;
  if (how.frames) {
    setTimeout(() => {
      if (c.sfxTurn !== turn || c.sfxName !== name) return; // (the channel's playing another by now)
      stopChannel(c);
      engine.wake();
    }, how.frames * FRAME_MS);
  }
  engine.wake();
  return c;
}

// The channels a sound may use (its entry's), turned round to the player's own
// if the game gives each player theirs for it (its flags' bit 1, not in bank
// 6: by the player x how many it has, 0x80027D00); a free one, else the first.
const isSeat = (z) => Number.isInteger(z) && z >= 0 && z < 4;
function channelFor(p, s, seat) {
  let mask = s.chans;
  if (s.flags & 2 && s.id >> 12 !== 6 && isSeat(seat)) {
    let n = 0;
    for (let i = 0; i < 16; i++) n += (mask >> i) & 1;
    const k = (seat * n) % 16;
    mask = ((mask << k) | (mask >>> (16 - k))) & 0xffff;
  }
  const chans = [];
  for (let i = 0; i < 16; i++) if (mask & (1 << i)) chans.push(p.channels[i]);
  return chans.find((ch) => ch.io[2] !== 1) || chans[0];
}

// A sound's pan and pitch (0x8002701C). An entry with its flags' bit 0 is
// panned by its place, 64 + the game's byte (held to 0-127), or for a player
// by its column (0x80027A18); else, and with neither, it's in the middle. The
// pitch is the entry's, times what the game asks for (and a player's own, for two).
function place(c, s, seat, how) {
  const bySeat = isSeat(seat) && how.pan === undefined && how.x === undefined;
  let pan = 64;
  if (s.flags === undefined) pan = how.pan ?? (bySeat ? OLD_SEAT_PAN[seat] : 64);
  else if (s.flags & 1) {
    if (how.x !== undefined) pan = how.x >= 64 ? 127 : how.x < -64 ? 0 : 64 + how.x;
    else if (how.pan !== undefined) pan = how.pan;
    else if (bySeat) pan = SEAT_PANS[s.id >> 12]?.[seat] ?? 64;
  }
  c.sfxState[2] = Math.max(0, Math.min(127, Math.round(pan)));
  c.sfxPitch = s.pitch * (how.pitch ?? 1) * ((bySeat && SEAT_PITCH[s.id]?.[seat]) || 1);
}

// Stop a sound that plays until it's stopped (a crowd, say), as the game's
// sound manager does once the sound's no longer asked for: 0 on its channel's
// port 0 (port 2 is 1 while it plays). With a seat, only that player's. No
// name: every sound still playing (and the effects back on after a hush).
export function stopSound(name, seat) {
  for (const k of [...holding.keys()]) {
    const h = holding.get(k);
    if ((!name || h.name === name) && (seat === undefined || h.seat === seat)) holding.delete(k);
  }
  if (!pack?.engine) return;
  if (!name) hush(false);
  stopEffect(pack.engine, name, seat);
}

// A sound the game asks for every frame it lasts (a hum: its sound manager,
// 0x80027480, keeps one going while it's asked for and stops it once it isn't),
// on or off. For a seat, that player's (on its own channel if the game gives it
// one: Pichu's Power Plant's hum, Topsy-Turvy's); how as for sound(), its pan
// and pitch followed while it plays.
const holding = new Map(); // name/seat -> { name, seat }: the ones on
export function hold(name, seat, on, how = {}) {
  const key = name + "/" + seat;
  if (!on) {
    if (holding.delete(key) && pack?.engine) stopEffect(pack.engine, name, seat);
    return;
  }
  const e = pack?.engine, s = e?.bank.sounds[name];
  const c = s && e.players[EFFECTS].channels.find((ch) => ch.sfxName === name && ch.sfxSeat === seat && (ch.io[2] === 1 || ch.io[0] === 1));
  if (c) return place(c, s, seat, how); // (still going: where it is now)
  if (holding.has(key) && !e) return; // (its stand-in's played)
  holding.set(key, { name, seat });
  sound(name, seat, how);
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
export function stopEffect(engine, name, seat) {
  for (const c of engine.players[EFFECTS].channels) {
    if (c.sfxName && (!name || c.sfxName === name) && (seat === undefined || c.sfxSeat === seat)) stopChannel(c);
  }
  engine.wake();
}
function stopChannel(c) {
  if (c.io[2] === 1) c.io[0] = 0;
  else if (c.io[0] === 1) c.io[0] = -1; // asked for but not started yet: never mind
  c.sfxName = null;
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

// One of the game's sounds by name. seat: whose it is (0-3: on that player's
// channel if the game gives each one, panned to its column unless how says
// where); how: { pan, x, pitch, frames } (trigger, above). sound(name, { pan })
// pans one that's no one's.
export function sound(name, seat, how) {
  if (!ctx || muted || !pack) return;
  const e = pack.engine;
  if (e && (e.hushed ? name in e.bank.sounds : trigger(e, name, seat, how))) return;
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
  // module #64's results (0x87F0A098): song 55 and 0xCA0F for 36 frames when
  // someone won, song 56 and the crowd (0x1E09) for 40 when no one did
  results: (draw) => {
    if (!ctx || muted || !pack) return;
    if (!pack.engine) {
      (draw ? [523, 494, 466, 440] : [1047, 1319, 1568, 2093]).forEach((f, i) => tone(f, i * 0.11, 0.22, { type: "triangle", vol: 0.2 }));
      return;
    }
    music(draw ? "draw" : "win", 0, true);
    sound(draw ? "drawCrowd" : "winners", undefined, { frames: draw ? 40 : 36 });
  },
};

// for the tests and the console (?debug)
export const debug = {
  get engine() { return pack?.engine; },
  get ctx() { return ctx; },
  loaded: () => pack?.loading,
  get pack() { return pack?.id; },
};
