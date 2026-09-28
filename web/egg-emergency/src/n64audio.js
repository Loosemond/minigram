// The game's own music and sound effects, played the way the N64 plays them.
// There are no recordings in the ROM: a song is a sequence (a MIDI-like
// script of a few KB) whose notes play soundfont instruments made of short
// VADPCM samples. This is a port of the sequence player of Nintendo EAD's
// audio engine (Zelda: Ocarina of Time and Majora's Mask; Stadium 2 uses
// Majora's Mask's commands), after the zeldaret/mm decomp, with Web Audio
// doing the mixing the N64's RSP did. tools/ps2tool/audio.py builds the file
// it plays (web/README.md, "Sound").
//
// Timing is the NTSC console's: 180 audio updates a second (3 per frame);
// every update runs the sequence scripts (tempo decides how many updates are
// a tick), the envelopes and the vibratos, and turns what changed into Web
// Audio events a little ahead of time.

import { fetchRetry } from "./retry.js";

const RATE = 32000; // samples play at 32 kHz times their frequency scale
const PER_FRAME = 3; // audio updates per 60 Hz frame
const UPDATES = 60 * PER_FRAME;
const MAX_TEMPO = 10770; // the tempo (48ths of a beat a minute) that ticks every update
const NOTE_TIME = (60 * PER_FRAME) / RATE / MAX_TEMPO; // a sample's length in ticks, per tempo unit
const ENV_SCALE = PER_FRAME / 4; // envelope delays count quarter frames
const AHEAD = 0.15; // seconds of audio scheduled ahead
const NONE = -1; // an empty IO port

const PITCH = Array.from({ length: 128 }, (_, i) => 2 ** ((i - 39) / 12));
const BEND_OCTAVE = Array.from({ length: 256 }, (_, i) => 2 ** ((Math.max(i, 1) - 128) / 127));
const BEND_TWO = Array.from({ length: 256 }, (_, i) => 2 ** ((Math.max(i, 1) - 128) / 127 / 6));
const SINE = Array.from({ length: 64 }, (_, i) => Math.round(32767 * Math.sin((i * Math.PI) / 32)));
const SHORT_VEL = [12, 25, 38, 51, 57, 64, 71, 76, 83, 89, 96, 102, 109, 115, 121, 127];
const SHORT_GATE = [229, 203, 177, 151, 139, 126, 113, 100, 87, 74, 61, 48, 36, 23, 10, 0];
const DEFAULT_ENV = [[1, 32000], [1000, 32000], [-1, 0]];
const DECAY = new Float32Array(256); // release rate -> fall per update (the release takes n frames)
{
  const rel = (frames) => 1 / (PER_FRAME * frames);
  DECAY[255] = rel(0.25); DECAY[254] = rel(0.33); DECAY[253] = rel(0.5); DECAY[252] = rel(0.66); DECAY[251] = rel(0.75);
  for (let i = 128; i < 251; i++) DECAY[i] = rel(251 - i);
  for (let i = 16; i < 128; i++) DECAY[i] = rel(4 * (143 - i));
  for (let i = 1; i < 16; i++) DECAY[i] = rel(60 * (23 - i));
}
// argument sizes of the commands 0xA0-0xFF (1: u8, 2: s16), Majora's Mask's
const ARGS = ["2", "", "2", "", "1", "", "12", "1", "22", "", "", "", "", "", "", "",
  "2", "", "2", "1", "", "", "", "2", "1", "1", "1", "12", "2", "2", "1", "",
  "", "1", "2", "", "", "", "1", "12", "1", "1", "1", "2", "1", "1", "2", "2",
  "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "2", "1", "1", "1", "2", "1",
  "1", "111", "111", "1", "", "1", "1", "2", "111", "1", "", "11", "", "1", "1", "21",
  "", "1", "1", "1", "1", "2", "", "", "1", "2", "2", "2", "2", "", "", ""].map((s) => [...s].map(Number));

const s8 = (v) => (v << 24) >> 24;
// a value changes over one update, as the N64's mixer eases volumes in
function glide(param, from, to, t) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(to, t + 1 / UPDATES);
}
const u8 = (v) => v & 0xff;

// ---- the file ------------------------------------------------------------

export async function loadBank(url) {
  const res = await fetchRetry(url);
  if (!res.ok) throw new Error(url + ": " + res.status);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (view.getUint32(0) !== 0x4e363441) throw new Error(url + ": not a sound bank"); // "N64A"
  const n = view.getUint32(4, true);
  const bank = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  bank.blob = new Uint8Array(buf, 8 + n);
  return bank;
}

// VADPCM: 9-byte frames of 16 samples, each half of 8 predicted from the two
// samples before it with one of the sample's codebook predictors, plus a
// scaled 4-bit residual (the reference decoder, as in n64 sdk tools).
export function decodeAdpcm(bytes, s) {
  const order = s.order, book = s.book, len = s.loop[1];
  const out = new Float32Array(len);
  const hist = new Int32Array(8), res = new Int32Array(8), x = new Int32Array(8);
  let n = 0;
  for (let f = 0; f + 9 <= bytes.length && n < len; f += 9) {
    const head = bytes[f], scale = 1 << (head >> 4), p = (head & 15) * order * 8;
    for (let half = 0; half < 2; half++) {
      for (let k = 0; k < 8; k++) {
        const b = bytes[f + 1 + half * 4 + (k >> 1)];
        let v = k & 1 ? b & 15 : b >> 4;
        if (v >= 8) v -= 16;
        x[k] = v * scale;
      }
      for (let k = 0; k < 8; k++) {
        let acc = 0;
        for (let j = 0; j < order; j++) acc += book[p + j * 8 + k] * hist[8 - order + j];
        for (let j = 0; j < k; j++) acc += book[p + (order - 1) * 8 + k - 1 - j] * x[j];
        let v = Math.floor(acc / 2048) + x[k];
        res[k] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
      }
      for (let k = 0; k < 8; k++) {
        hist[k] = res[k];
        if (n < len) out[n++] = res[k] / 32768;
      }
    }
  }
  return out;
}

// ---- the engine ------------------------------------------------------------

export class Engine {
  constructor(ctx, bank, dest) {
    this.ctx = ctx;
    this.bank = bank;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.reverb = reverb(ctx, this.out);
    this.buffers = new Map();
    this.voices = new Set();
    this.players = [0, 1, 2, 3].map((i) => new Player(this, i));
    this.update = 0;
    this.t0 = null;
    this.random = 0x13579bdf;
    this.timer = null;
    this.onCustom = null; // the game's hook for the 'custom' command (Majora's Mask: customSeqFunctions)
    this.missing = new Set(); // what the sequences asked for that the file hasn't got ("font:drum 12"...)
  }

  time(u = this.update) { return this.t0 + u / UPDATES; }

  play(player, seq, fadeIn = 0) {
    this.players[player].start(seq, fadeIn);
    this.wake();
  }

  stop(player, fadeUpdates = 0) {
    const p = this.players[player];
    if (!p.enabled) return;
    if (!fadeUpdates) return p.disable(true);
    p.state = 2; // fading out, then disabled
    p.fadeTimer = fadeUpdates;
    p.fadeVelocity = -p.fadeVolume / fadeUpdates;
  }

  wake() {
    if (this.timer) return;
    this.timer = setInterval(() => this.run(), 25);
    this.run();
  }

  run() {
    const now = this.ctx.currentTime;
    if (this.t0 === null || this.time() < now) this.t0 = now + 0.02 - this.update / UPDATES; // start, or fell behind: skip ahead
    while (this.time() < now + AHEAD) this.step();
    if (!this.players.some((p) => p.enabled) && !this.voices.size) {
      clearInterval(this.timer);
      this.timer = null;
      this.t0 = null;
    }
  }

  step() {
    this.random = (this.random * 1103515245 + 12345) >>> 0;
    for (const p of this.players) {
      if (p.enabled) { p.processSequence(); p.processSound(); }
    }
    this.processNotes();
    this.update++;
  }

  buffer(i) {
    let b = this.buffers.get(i);
    if (!b) {
      const s = this.bank.samples[i];
      const pcm = decodeAdpcm(this.bank.blob.subarray(s.at), s);
      b = this.ctx.createBuffer(1, Math.max(pcm.length, 1), RATE);
      b.copyToChannel(pcm, 0);
      this.buffers.set(i, b);
    }
    return b;
  }

  font(id) { return this.bank.fonts[id]; }

  processNotes() {
    const t = this.time();
    for (const v of this.voices) {
      const layer = v.parent;
      if (layer && layer.note !== v) {
        // the layer moved on without letting go (a stolen note): release it quickly
        v.detach(layer, true);
      }
      if (v.adsrStep(t) === false || t >= v.ends) {
        v.stop(t);
        this.voices.delete(v);
        if (v.parent && v.parent.note === v) v.parent.note = null;
        continue;
      }
      v.apply(t);
    }
  }
}

function reverb(ctx, out) {
  // The N64's reverb is a delay line fed back on itself, heard through a low
  // pass; this is the same idea (the game's settings aren't in the ROM data
  // the tools read yet).
  const input = ctx.createGain(), delay = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
  delay.delayTime.value = 0.09;
  fb.gain.value = 0.5;
  lp.type = "lowpass";
  lp.frequency.value = 3500;
  wet.gain.value = 0.9;
  input.connect(delay);
  delay.connect(lp).connect(fb).connect(delay);
  lp.connect(wet).connect(out);
  return input;
}

// ---- sequence players, channels and layers ------------------------------------

class Script {
  constructor(pc = 0) { this.pc = pc; this.depth = 0; this.stack = [0, 0, 0, 0]; this.loops = [0, 0, 0, 0]; this.value = 0; }
}

class Player {
  constructor(engine, index) {
    this.engine = engine;
    this.index = index;
    this.enabled = false;
    this.channels = Array.from({ length: 16 }, (_, i) => new Channel(this, i));
    this.fadeVolumeScale = 1;
    this.io = new Int8Array(8).fill(NONE);
  }

  start(seqId, fadeIn) {
    this.disable();
    const e = this.engine, info = e.bank.seqs[seqId];
    this.seqId = seqId;
    this.seq = e.bank.blob.slice(info.at, info.at + info.len); // a copy: scripts write into themselves
    this.fonts = info.fonts;
    this.defaultFont = info.fonts[info.fonts.length - 1];
    this.script = new Script(0);
    Object.assign(this, {
      stopScript: false, delay: 0, state: 1, fadeTimer: 0, fadeTimerEu: 0, tempoAcc: 0, tempo: 120 * 48, tempoChange: 0,
      transposition: 0, noteAllocPolicy: 0, shortVel: SHORT_VEL, shortGate: SHORT_GATE, scriptCounter: 0,
      fadeVolume: 1, fadeVelocity: 0, muted: false, muteBehavior: 0, muteVolumeScale: 0.5, recalculateVolume: true,
      bend: 1, applyBend: false, finished: false,
    });
    if (fadeIn) { this.state = 0; this.fadeVolume = 0; this.fadeTimer = fadeIn; this.fadeVelocity = 1 / fadeIn; }
    for (const c of this.channels) c.init();
    this.io.fill(NONE);
    this.enabled = true;
  }

  disable(quick = false) {
    this.finished = quick; // finished players release their notes at once, others let them decay
    for (const c of this.channels) c.disable();
    this.enabled = false;
    this.finished = true;
  }

  u8(s) { return this.seq[s.pc++]; }
  s16(s) { const v = (this.seq[s.pc] << 8) | this.seq[s.pc + 1]; s.pc += 2; return (v << 16) >> 16; }
  u16(s) { const v = (this.seq[s.pc] << 8) | this.seq[s.pc + 1]; s.pc += 2; return v; }
  varlen(s) { let v = this.seq[s.pc++]; if (v & 0x80) v = ((v << 8) & 0x7f00) | this.seq[s.pc++]; return v; }
  at16(p) { return (this.seq[p] << 8) | this.seq[p + 1]; }

  // the control flow commands shared by sequences, channels and layers: the
  // number of ticks to wait, -1 at the end, or 0 to go on
  flow(s, cmd, arg) {
    switch (cmd) {
      case 0xff: if (s.depth === 0) return -1; s.pc = s.stack[--s.depth]; return 0;
      case 0xfd: return this.varlen(s);
      case 0xfe: return 1;
      case 0xfc: s.stack[s.depth++] = s.pc; s.pc = arg & 0xffff; return 0;
      case 0xf8: s.loops[s.depth] = arg; s.stack[s.depth++] = s.pc; return 0;
      case 0xf7:
        if (--s.loops[s.depth - 1] !== 0) s.pc = s.stack[s.depth - 1];
        else s.depth--;
        return 0;
      case 0xf6: s.depth--; return 0;
      case 0xf5: case 0xf9: case 0xfa: case 0xfb:
        if (cmd === 0xfa && s.value !== 0) return 0;
        if (cmd === 0xf9 && s.value >= 0) return 0;
        if (cmd === 0xf5 && s.value < 0) return 0;
        s.pc = arg & 0xffff;
        return 0;
      case 0xf2: case 0xf3: case 0xf4:
        if (cmd === 0xf3 && s.value !== 0) return 0;
        if (cmd === 0xf2 && s.value >= 0) return 0;
        s.pc += s8(arg);
        return 0;
    }
    return 0;
  }

  flowArg(s, cmd) {
    const a = ARGS[cmd - 0xa0];
    return a.length ? (a[0] === 2 ? this.s16(s) : this.u8(s)) : 0;
  }

  processSequence() {
    if (this.muted && this.muteBehavior & 0x80) return;
    this.scriptCounter++;
    this.tempoAcc += this.tempo + this.tempoChange;
    if (this.tempoAcc < MAX_TEMPO) return;
    this.tempoAcc -= MAX_TEMPO;
    if (this.stopScript) return;
    if (this.delay > 1) this.delay--;
    else {
      this.recalculateVolume = true;
      const s = this.script;
      for (;;) {
        const cmd = this.u8(s);
        if (cmd >= 0xf2) {
          const d = this.flow(s, cmd, this.flowArg(s, cmd));
          if (d === 0) continue;
          if (d === -1) { this.disable(); return; }
          this.delay = d;
          break;
        }
        if (cmd >= 0xc0) {
          switch (cmd) {
            case 0xf1: this.u8(s); break; // reserve notes
            case 0xf0: break;
            case 0xdf: this.transposition = 0; // fall through
            case 0xde: this.transposition = s8(this.transposition + s8(this.u8(s))); break;
            case 0xdd: this.tempo = Math.max(1, Math.min(MAX_TEMPO, this.u8(s) * 48)); break;
            case 0xdc: this.tempoChange = s8(this.u8(s)) * 48; break;
            case 0xda: {
              const mode = this.u8(s), time = this.u16(s);
              if (mode === 0 || mode === 1) { if (this.state !== 2) { this.fadeTimerEu = time; this.state = mode; } }
              else if (mode === 2) { this.fadeTimer = time; this.state = mode; this.fadeVelocity = -this.fadeVolume / time; }
              break;
            }
            case 0xdb: {
              const v = this.u8(s);
              if (this.state === 1) { this.state = 0; this.fadeVolume = 0; }
              if (this.state === 0) {
                this.fadeTimer = this.fadeTimerEu;
                if (this.fadeTimerEu) this.fadeVelocity = (v / 127 - this.fadeVolume) / this.fadeTimer;
                else this.fadeVolume = v / 127;
              }
              break;
            }
            case 0xd9: this.fadeVolumeScale = s8(this.u8(s)) / 127; break;
            case 0xd7: { const bits = this.u16(s); for (let i = 0; i < 16; i++) if (bits & (1 << i)) this.channels[i].setup(); break; }
            case 0xd6: this.u16(s); break;
            case 0xd5: this.muteVolumeScale = s8(this.u8(s)) / 127; break;
            case 0xd4: this.muted = true; break;
            case 0xd3: this.muteBehavior = this.u8(s); break;
            case 0xd2: case 0xd1: {
              const at = this.u16(s), arr = this.seq.subarray(at, at + 16);
              if (cmd === 0xd2) this.shortVel = arr; else this.shortGate = arr;
              break;
            }
            case 0xd0: this.noteAllocPolicy = this.u8(s); break;
            case 0xce: { const n = this.u8(s); s.value = s8(n === 0 ? (this.engine.random >>> 2) & 0xff : (this.engine.random >>> 2) % n); break; }
            case 0xcd: {
              const at = this.u16(s);
              if (s.value !== NONE && s.depth !== 3) { s.stack[s.depth++] = s.pc; s.pc = this.at16(at + s.value * 2); }
              break;
            }
            case 0xcc: s.value = s8(this.u8(s)); break;
            case 0xc9: s.value = s8(s.value & this.u8(s)); break;
            case 0xc8: s.value = s8(s.value - this.u8(s)); break;
            case 0xc7: { const add = this.u8(s), at = this.u16(s); this.seq[at] = u8(s.value + add); break; }
            case 0xc6: this.stopScript = true; return;
            case 0xc5: this.scriptCounter = this.u16(s); break;
            case 0xef: this.u16(s); this.u8(s); break;
            case 0xc4: { const p = this.u8(s), id = this.u8(s); if ((p === 0xff ? this.index : p) === this.index) { this.start(id, 0); return; } this.engine.play(p, id); break; }
            case 0xc2: { const at = this.u16(s); if (s.value !== NONE) s.pc = this.at16(at + s.value * 2); break; }
            case 0xc3: {
              const at = this.u16(s);
              if (s.value !== NONE) { let m = this.at16(at + s.value * 2); for (const c of this.channels) { c.muted = !!(m & 1); m >>= 1; } }
              break;
            }
            default: break;
          }
          continue;
        }
        const lo = cmd & 15;
        switch (cmd & 0xf0) {
          case 0x00: s.value = this.channels[lo].enabled ? 0 : 1; break;
          case 0x50: s.value = s8(s.value - this.io[lo]); break;
          case 0x70: this.io[lo] = s.value; break;
          case 0x80: s.value = this.io[lo]; if (lo < 2) this.io[lo] = NONE; break;
          case 0x40: this.channels[lo].disable(); break;
          case 0x90: this.channels[lo].enable(this.u16(s)); break;
          case 0xa0: { const off = this.s16(s); this.channels[lo].enable(s.pc + off); break; }
          case 0xb0: this.u8(s); this.u16(s); break; // load a sequence: everything's loaded
          case 0x60: this.u8(s); this.u8(s); break;
        }
      }
    }
    for (const c of this.channels) if (c.enabled) c.processScript();
  }

  processSound() {
    if (this.fadeTimer) {
      this.fadeVolume = Math.min(1, Math.max(0, this.fadeVolume + this.fadeVelocity));
      this.recalculateVolume = true;
      if (--this.fadeTimer === 0 && this.state === 2) { this.disable(); return; }
    }
    if (this.recalculateVolume) this.appliedFadeVolume = this.fadeVolume * this.fadeVolumeScale;
    const t = this.engine.time();
    for (const c of this.channels) if (c.enabled) c.processSound(this.recalculateVolume, t);
    this.recalculateVolume = false;
  }
}

class Channel {
  constructor(player, index) {
    this.player = player;
    this.index = index;
    this.layers = [null, null, null, null];
    this.io = new Int8Array(8).fill(NONE);
    this.sfxState = new Int8Array(16).fill(NONE);
    this.enabled = false;
    const ctx = player.engine.ctx;
    this.gain = ctx.createGain(); // the channel's volume, squared, as the N64 applies it
    this.gain.gain.value = 0;
    this.gain.connect(player.engine.out);
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    this.gain.connect(this.send).connect(player.engine.reverb);
    this.init();
  }

  init() {
    for (let i = 0; i < 4; i++) this.freeLayer(i);
    Object.assign(this, {
      enabled: false, finished: false, stopScript: false, muted: false, hasInstrument: false, transposition: 0,
      largeNotes: false, bookOffset: 0, newPan: 0x40, panChannelWeight: 0x80, velocityRandomVariance: 0,
      gateTimeRandomVariance: 0, reverbIndex: 0, targetReverbVol: 0, gainValue: 0, notePriority: 3, delay: 0,
      adsr: { envelope: -1, envSeq: false, decayIndex: 0xf0, sustain: 0 }, vibratoRateTarget: 0x800,
      vibratoRateStart: 0x800, vibratoDepthTarget: 0, vibratoDepthStart: 0, vibratoRateChangeDelay: 0,
      vibratoDepthChangeDelay: 0, vibratoDelay: 0, volume: 1, volumeScale: 1, freqScale: 1, startSamplePos: 0,
      instOrWave: 0, instrument: null, unk22: 0, dynTable: 0, muteBehavior: 0, noteAllocPolicy: 0,
      changes: { volume: true, pan: true, freqScale: true }, appliedVolume: 0, pan: 0x40 * 0x80, sentVolume: -1, sentReverb: -1,
    });
    this.script = new Script(0);
    this.fontId = this.player.defaultFont;
    this.io.fill(NONE);
  }

  setup() {
    this.fontId = this.player.defaultFont;
    this.muteBehavior = this.player.muteBehavior;
    this.noteAllocPolicy = this.player.noteAllocPolicy;
  }

  enable(pc) {
    this.enabled = true;
    this.finished = false;
    this.script = new Script(pc);
    this.delay = 0;
    for (let i = 0; i < 4; i++) if (this.layers[i]) this.freeLayer(i);
  }

  disable() {
    for (let i = 0; i < 4; i++) this.freeLayer(i);
    this.enabled = false;
    this.finished = true;
  }

  setLayer(i, pc) {
    let l = this.layers[i];
    if (!l) l = this.layers[i] = new Layer(this);
    else l.decay();
    l.reset(pc);
  }

  freeLayer(i) {
    const l = this.layers[i];
    if (!l) return;
    l.disable();
    this.layers[i] = null;
  }

  // a soundfont of the sequence's list, counted from its end
  fontFrom(n) {
    const p = this.player;
    return p.defaultFont !== 0xff ? p.fonts[p.fonts.length - 1 - n] : n;
  }

  setInstrument(id) {
    if (id >= 0x80) { this.instOrWave = id; this.instrument = null; }
    else if (id === 0x7f) { this.instOrWave = 0; this.instrument = null; }
    else if (id === 0x7e) { this.instOrWave = 1; this.instrument = null; }
    else {
      const inst = this.player.engine.font(this.fontId)?.inst[id];
      if (!inst) { this.hasInstrument = false; return; }
      this.instrument = inst;
      this.instOrWave = id + 2;
      this.adsr.envelope = inst[3]; this.adsr.envSeq = false; this.adsr.decayIndex = inst[2];
    }
    this.hasInstrument = true;
  }

  processScript() {
    const p = this.player, s = this.script, seq = p.seq;
    if (this.stopScript) return this.processLayers();
    if (p.muted && this.muteBehavior & 0x80) return;
    if (this.delay >= 2) { this.delay--; return this.processLayers(); }
    for (;;) {
      const cmd = p.u8(s);
      if (cmd >= 0xa0) {
        const spec = ARGS[cmd - 0xa0], a = [];
        for (const n of spec) a.push(n === 2 ? p.s16(s) : p.u8(s));
        if (cmd >= 0xf2) {
          const d = p.flow(s, cmd, a[0] ?? 0);
          if (d === 0) continue;
          if (d === -1) this.disable();
          else this.delay = d;
          break;
        }
        switch (cmd) {
          case 0xea: this.stopScript = true; return this.processLayers();
          case 0xf1: case 0xf0: break; // reserve notes (voices aren't limited here)
          case 0xc2: this.dynTable = a[0] & 0xffff; break;
          case 0xc5: if (s.value !== NONE) this.dynTable = p.at16(this.dynTable + s.value * 2); break;
          case 0xeb: { const f = this.fontFrom(a[0]); if (p.engine.font(f)) this.fontId = f; this.setInstrument(a[1]); break; }
          case 0xc1: this.setInstrument(a[0]); break;
          case 0xc3: this.largeNotes = false; break;
          case 0xc4: this.largeNotes = true; break;
          case 0xdf: this.volume = a[0] / 127; this.changes.volume = true; break;
          case 0xe0: this.volumeScale = a[0] / 128; this.changes.volume = true; break;
          case 0xde: this.freqScale = (a[0] & 0xffff) / 32768; this.changes.freqScale = true; break;
          case 0xd3: this.freqScale = BEND_OCTAVE[u8(a[0] + 0x80)]; this.changes.freqScale = true; break;
          case 0xee: this.freqScale = BEND_TWO[u8(a[0] + 0x80)]; this.changes.freqScale = true; break;
          case 0xdd: this.newPan = a[0]; this.changes.pan = true; break;
          case 0xdc: this.panChannelWeight = a[0]; this.changes.pan = true; break;
          case 0xdb: this.transposition = s8(a[0]); break;
          case 0xda: this.adsr.envelope = a[0] & 0xffff; this.adsr.envSeq = true; break;
          case 0xd9: this.adsr.decayIndex = a[0]; break;
          case 0xd8: this.vibratoDepthTarget = a[0] * 8; this.vibratoDepthStart = 0; this.vibratoDepthChangeDelay = 0; break;
          case 0xd7: this.vibratoRateChangeDelay = 0; this.vibratoRateTarget = this.vibratoRateStart = a[0] * 32; break;
          case 0xe2: this.vibratoDepthStart = a[0] * 8; this.vibratoDepthTarget = a[1] * 8; this.vibratoDepthChangeDelay = a[2] * 16; break;
          case 0xe1: this.vibratoRateStart = a[0] * 32; this.vibratoRateTarget = a[1] * 32; this.vibratoRateChangeDelay = a[2] * 16; break;
          case 0xe3: this.vibratoDelay = a[0] * 16; break;
          case 0xd4: this.targetReverbVol = a[0]; break;
          case 0xc6: { const f = this.fontFrom(a[0]); if (p.engine.font(f)) this.fontId = f; break; }
          case 0xc7: seq[a[1] & 0xffff] = u8(s.value + a[0]); break;
          case 0xc8: s.value = s8(s.value - s8(a[0])); break;
          case 0xcc: s.value = s8(a[0]); break;
          case 0xc9: s.value = s8(s.value & s8(a[0])); break;
          case 0xcd: p.channels[a[0]]?.disable(); break;
          case 0xca: this.muteBehavior = a[0]; this.changes.volume = true; break;
          case 0xcb: s.value = s8(seq[(a[0] & 0xffff) + s.value]); break;
          case 0xce: this.unk22 = a[0] & 0xffff; break;
          case 0xcf: seq[a[0] & 0xffff] = (this.unk22 >> 8) & 0xff; seq[(a[0] & 0xffff) + 1] = this.unk22 & 0xff; break;
          case 0xd0: break; // stereo headset effects
          case 0xd1: this.noteAllocPolicy = a[0]; break;
          case 0xd2: this.adsr.sustain = a[0]; break;
          case 0xe5: this.reverbIndex = a[0]; break;
          case 0xe4:
            if (s.value !== NONE) { s.stack[s.depth++] = s.pc; s.pc = p.at16(this.dynTable + s.value * 2); }
            break;
          case 0xe6: this.bookOffset = a[0]; break;
          case 0xe7: {
            let at = a[0] & 0xffff;
            this.muteBehavior = seq[at++]; this.noteAllocPolicy = seq[at++]; this.priorities(seq[at++]);
            this.transposition = s8(seq[at++]); this.newPan = seq[at++]; this.panChannelWeight = seq[at++];
            this.targetReverbVol = seq[at++]; this.reverbIndex = seq[at++]; this.changes.pan = true;
            break;
          }
          case 0xe8:
            this.muteBehavior = a[0]; this.noteAllocPolicy = a[1]; this.priorities(a[2]);
            this.transposition = s8(p.u8(s)); this.newPan = p.u8(s); this.panChannelWeight = p.u8(s);
            this.targetReverbVol = p.u8(s); this.reverbIndex = p.u8(s); this.changes.pan = true;
            break;
          case 0xec:
            Object.assign(this, { vibratoDepthTarget: 0, vibratoDepthStart: 0, vibratoDepthChangeDelay: 0, vibratoRateTarget: 0,
              vibratoRateStart: 0, vibratoRateChangeDelay: 0, gainValue: 0, velocityRandomVariance: 0, gateTimeRandomVariance: 0,
              bookOffset: 0, freqScale: 1 });
            this.adsr.sustain = 0;
            break;
          case 0xe9: this.priorities(a[0]); break;
          case 0xed: this.gainValue = a[0]; break;
          case 0xb0: case 0xb1: case 0xb3: case 0xbb: break; // filters (not modelled)
          case 0xb2: this.unk22 = p.at16((a[0] & 0xffff) + s.value * 2); break;
          case 0xb4: this.dynTable = this.unk22; break;
          case 0xb5: this.unk22 = p.at16(this.dynTable + s.value * 2); break;
          case 0xb6: s.value = s8(seq[this.dynTable + s.value]); break;
          case 0xb7: this.unk22 = a[0] === 0 ? p.engine.random & 0xffff : p.engine.random % (a[0] & 0xffff); break;
          case 0xb8: s.value = s8(a[0] === 0 ? p.engine.random & 0xffff : p.engine.random % a[0]); break;
          case 0xa8: {
            const r = p.engine.random, n = a[0] & 0xffff;
            let v = ((n === 0 ? r & 0xffff : r % n) + (a[1] & 0xffff)) & 0xffff;
            this.unk22 = ((((v / 0x100) | 0) + 0x80) << 8 | (v % 0x100)) & 0xffff;
            break;
          }
          case 0xb9: this.velocityRandomVariance = a[0]; break;
          case 0xba: this.gateTimeRandomVariance = a[0]; break;
          case 0xbc: this.unk22 = (this.unk22 + a[0]) & 0xffff; break;
          case 0xbd: this.startSamplePos = a[0] & 0xffff; break;
          case 0xbe: if (a[0] < 5 && p.engine.onCustom) s.value = s8(p.engine.onCustom(a[0], s.value, this)); break;
          case 0xa0: case 0xa1: case 0xa2: case 0xa3: {
            const i = cmd === 0xa0 || cmd === 0xa2 ? a[0] & 0xffff : this.unk22;
            if (cmd <= 0xa1) s.value = this.sfxState[i & 15]; else this.sfxState[i & 15] = s.value;
            break;
          }
          case 0xa4: break; // surround effect
          case 0xa5: s.value = s8(s.value + this.index); break;
          case 0xa6: seq[(a[1] & 0xffff) + this.index] = u8(s.value + a[0]); break;
          case 0xa7: {
            const neg = s.value & 0x80;
            let v = a[0] & 0x80 ? u8(s.value) >> (a[0] & 15) : u8(s.value << (a[0] & 15));
            if (a[0] & 0x40) v = (v & 0x7f) | neg;
            s.value = s8(v);
            break;
          }
          default: break;
        }
        continue;
      }
      if (cmd >= 0x70) {
        let lo = cmd & 7;
        if ((cmd & 0xf8) !== 0x70 && lo >= 4) lo = 0;
        switch (cmd & 0xf8) {
          case 0x80: s.value = this.layers[lo] ? (this.layers[lo].finished ? 1 : 0) : NONE; break;
          case 0x88: { const at = p.u16(s); this.setLayer(lo, at); break; }
          case 0x90: this.freeLayer(lo); break;
          case 0x98: if (s.value !== NONE) this.setLayer(lo, p.at16(this.dynTable + s.value * 2)); break;
          case 0x70: this.io[lo] = s.value; break;
          case 0x78: { const off = p.s16(s); this.setLayer(lo, s.pc + off); break; }
        }
        continue;
      }
      const lo = cmd & 15;
      switch (cmd & 0xf0) {
        case 0x00: this.delay = lo; return this.processLayers();
        case 0x10: this.io[lo & 7] = 1; break; // load a sample: everything's loaded already
        case 0x60: s.value = this.io[lo]; if (lo < 2) this.io[lo] = NONE; break;
        case 0x50: s.value = s8(s.value - this.io[lo]); break;
        case 0x20: p.channels[lo].enable(p.u16(s)); break;
        case 0x30: { const port = p.u8(s); p.channels[lo].io[port] = s.value; break; }
        case 0x40: { const port = p.u8(s); s.value = p.channels[lo].io[port]; break; }
      }
    }
    this.processLayers();
  }

  priorities(v) { if (v & 15) this.notePriority = v & 15; }

  processLayers() {
    for (const l of this.layers) if (l) l.processScript();
  }

  processSound(recalc, t) {
    const p = this.player;
    if (this.changes.volume || recalc) {
      let v = this.volume * this.volumeScale * p.appliedFadeVolume;
      if (p.muted && this.muteBehavior & 0x20) v *= p.muteVolumeScale;
      this.appliedVolume = v * v;
      if (this.appliedVolume !== this.sentVolume) {
        glide(this.gain.gain, Math.max(0, this.sentVolume), this.appliedVolume, t);
        this.sentVolume = this.appliedVolume;
      }
    }
    if (this.targetReverbVol !== this.sentReverb) {
      glide(this.send.gain, Math.max(0, this.sentReverb) / 127, this.targetReverbVol / 127, t);
      this.sentReverb = this.targetReverbVol;
    }
    if (this.changes.pan) this.pan = this.newPan * this.panChannelWeight;
    const freq = this.freqScale * (p.applyBend ? p.bend : 1);
    for (const l of this.layers) {
      if (!l || !l.enabled || !l.note) continue;
      if (l.needInit || this.changes.freqScale || p.applyBend) l.noteFreqScale = l.freqScale * freq;
      if (l.needInit || this.changes.pan) l.notePan = (this.pan + l.pan * (0x80 - this.panChannelWeight)) >> 7;
      l.needInit = false;
    }
    this.changes.volume = this.changes.pan = this.changes.freqScale = false;
  }
}

class Layer {
  constructor(channel) { this.channel = channel; this.note = null; }

  reset(pc) {
    const c = this.channel;
    Object.assign(this, {
      adsr: { envelope: c.adsr.envelope, envSeq: c.adsr.envSeq, decayIndex: 0, sustain: c.adsr.sustain },
      enabled: true, finished: false, muted: false, continuous: false, ignoreDrumPan: false, needInit: false,
      portamento: 0, portamentoTarget: 0, portamentoTime: 0, gateTime: 0x80, pan: 0x40, transposition: 0, delay: 0,
      gateDelay: 0, lastDelay: 0, shortDelay: 0, instrument: null, instOrWave: 0xff, freqScale: 1, bend: 1,
      velocitySquare: 0, velocitySquare2: 0, tunedSample: null, noteFreqScale: 1, notePan: 0x40, semitone: 0,
    });
    this.script = new Script(pc);
  }

  disable() {
    if (this.channel.player.finished) this.release(); else this.decay();
    this.enabled = false;
    this.finished = true;
  }

  decay() { this.letGo(false); }
  release() { this.letGo(true); }

  letGo(release) {
    const v = this.note;
    if (!v) return;
    v.detach(this, release);
    this.note = null;
  }

  processScript() {
    if (!this.enabled) return;
    if (this.delay > 1) {
      this.delay--;
      if (!this.muted && this.delay <= this.gateDelay) { this.decay(); this.muted = true; }
      return;
    }
    if (!this.continuous) this.decay();
    if (this.portamento && ((this.portamento & 0x7f) === 1 || (this.portamento & 0x7f) === 2)) this.portamento = 0;
    this.needInit = true;
    let cmd;
    do {
      cmd = this.commands();
      if (cmd === -1) return;
      cmd = this.noteCommand(cmd);
    } while (cmd === -1 && this.delay === 0);
    if (cmd !== -1) cmd = this.pickSample(cmd);
    if (cmd !== -1) this.startNote(cmd);
    if (this.muted && (this.note || this.continuous)) this.decay();
  }

  commands() {
    const c = this.channel, p = c.player, s = this.script;
    for (;;) {
      const cmd = p.u8(s);
      if (cmd <= 0xc0) return cmd;
      if (cmd >= 0xf2) {
        if (p.flow(s, cmd, p.flowArg(s, cmd)) === 0) continue;
        this.disable();
        return -1;
      }
      switch (cmd) {
        case 0xc1: { const v = p.u8(s); this.velocitySquare = (v * v) / (127 * 127); break; }
        case 0xca: this.pan = p.u8(s); break;
        case 0xc9: this.gateTime = p.u8(s); break;
        case 0xc2: this.transposition = p.u8(s); break;
        case 0xc4: case 0xc5: this.continuous = cmd === 0xc4; this.decay(); break;
        case 0xc3: this.shortDelay = p.varlen(s); break;
        case 0xc6: {
          const id = p.u8(s);
          if (id >= 0x7e) {
            this.instOrWave = id === 0x7e ? 1 : id === 0x7f ? 0 : id;
            if (id > 0x7f) this.instrument = null;
            if (id === 0xff) this.adsr.decayIndex = 0;
          } else {
            const inst = p.engine.font(c.fontId)?.inst[id];
            if (inst) { this.instrument = inst; this.instOrWave = id + 2; this.adsr.envelope = inst[3]; this.adsr.envSeq = false; this.adsr.decayIndex = inst[2]; }
            else this.instOrWave = 0xff;
          }
          break;
        }
        case 0xc7: {
          this.portamento = p.u8(s);
          let n = u8(p.u8(s) + c.transposition + this.transposition + p.transposition);
          if (n >= 0x80) n = 0;
          this.portamentoTarget = n;
          this.portamentoTime = this.portamento & 0x80 ? p.u8(s) : p.varlen(s);
          break;
        }
        case 0xc8: this.portamento = 0; break;
        case 0xcb: this.adsr.envelope = p.u16(s); this.adsr.envSeq = true; // fall through
        case 0xcf: this.adsr.decayIndex = p.u8(s); break;
        case 0xcc: this.ignoreDrumPan = true; break;
        case 0xcd: p.u8(s); break; // stereo effects
        case 0xce: this.bend = BEND_TWO[u8(p.u8(s) + 0x80)]; break;
        case 0xf0: p.u16(s); break; // Majora's Mask: which values follow the channel
        case 0xf1: p.u8(s); break; // surround effect
        default:
          if ((cmd & 0xf0) === 0xd0) { const v = p.shortVel[cmd & 15]; this.velocitySquare = (v * v) / (127 * 127); }
          else if ((cmd & 0xf0) === 0xe0) this.gateTime = p.shortGate[cmd & 15];
      }
    }
  }

  noteCommand(cmd) {
    const c = this.channel, p = c.player, s = this.script;
    if (cmd === 0xc0) { this.delay = p.varlen(s); this.muted = true; return -1; }
    this.muted = false;
    let delay;
    const kind = cmd & 0xc0;
    if (c.largeNotes) {
      let vel;
      if (kind === 0x00) { delay = p.varlen(s); vel = p.u8(s); this.gateTime = p.u8(s); this.lastDelay = delay; }
      else if (kind === 0x40) { delay = p.varlen(s); vel = p.u8(s); this.gateTime = 0; this.lastDelay = delay; }
      else { delay = this.lastDelay; vel = p.u8(s); this.gateTime = p.u8(s); }
      if (vel > 127) vel = 127;
      this.velocitySquare = (vel * vel) / (127 * 127);
    } else if (kind === 0x00) { delay = p.varlen(s); this.lastDelay = delay; }
    else if (kind === 0x40) delay = this.shortDelay;
    else delay = this.lastDelay;
    cmd -= kind;
    this.velocitySquare2 = this.velocitySquare;
    if (c.velocityRandomVariance) {
      const r = p.engine.random;
      let d = (this.velocitySquare * (r % c.velocityRandomVariance)) / 100;
      if (r & 0x8000) d = -d;
      this.velocitySquare2 = Math.min(1, Math.max(0, this.velocitySquare + d));
    }
    this.delay = delay;
    this.gateDelay = (this.gateTime * delay) >> 8;
    if (c.gateTimeRandomVariance && c.velocityRandomVariance) {
      const r = p.engine.random;
      let d = ((this.gateDelay * (r % c.velocityRandomVariance)) / 100) | 0;
      if (r & 0x4000) d = -d;
      this.gateDelay = Math.min(this.delay, Math.max(0, this.gateDelay + d));
    }
    if ((p.muted && c.muteBehavior & 0x50) || c.muted) { this.muted = true; return -1; }
    return cmd;
  }

  pickSample(semitone) {
    const c = this.channel, p = c.player, font = p.engine.font(c.fontId);
    let kind = this.instOrWave, same = true;
    if (kind === 0xff) {
      if (!c.hasInstrument) return -1;
      kind = c.instOrWave;
    }
    if (kind === 0) {
      semitone = u8(semitone + c.transposition + this.transposition);
      this.semitone = semitone;
      const d = font?.drums[semitone];
      if (!d || d[3] === null) { p.engine.missing.add(c.fontId + ":drum " + semitone); this.muted = true; return -1; }
      this.adsr.envelope = d[2]; this.adsr.envSeq = false; this.adsr.decayIndex = d[0];
      if (!this.ignoreDrumPan) this.pan = d[1];
      this.tunedSample = [d[3], d[4]];
      this.freqScale = d[4];
    } else if (kind === 1) {
      this.semitone = semitone;
      const x = font?.sfx[(this.transposition << 6) + semitone];
      if (!x) { p.engine.missing.add(c.fontId + ":sfx " + ((this.transposition << 6) + semitone)); this.muted = true; return -1; }
      this.tunedSample = x;
      this.freqScale = x[1];
    } else {
      semitone = u8(semitone + p.transposition + c.transposition + this.transposition);
      this.semitone = semitone;
      if (semitone >= 0x80) { this.muted = true; return -1; }
      const inst = this.instOrWave === 0xff ? c.instrument : this.instrument;
      if (!inst) { this.muted = true; return -1; } // synthetic waves aren't used by these sequences
      const range = (n) => (n < inst[0] ? 4 : n <= inst[1] ? 5 : 6);
      if (this.portamento) {
        const top = semitone > this.portamentoTarget ? semitone : this.portamentoTarget;
        const ts = inst[range(top)];
        if (!ts) { p.engine.missing.add(c.fontId + ":note " + top); this.muted = true; return -1; }
        same = this.tunedSample === ts;
        this.tunedSample = ts;
        const f2 = PITCH[semitone] * ts[1], f14 = PITCH[this.portamentoTarget] * ts[1];
        const mode = this.portamento & 0x7f;
        let from = f2, to = f2;
        if (mode === 1 || mode === 3 || mode === 5) { to = f2; from = f14; }
        else if (mode === 2 || mode === 4) { from = f2; to = f14; }
        this.portamentoExtent = to / from - 1;
        let speed;
        if (this.portamento & 0x80) {
          speed = ((p.tempo * 0x8000) / MAX_TEMPO) | 0;
          if (this.delay) speed = ((speed * 0x100) / (this.delay * this.portamentoTime)) | 0;
        } else speed = (0x20000 / (this.portamentoTime * PER_FRAME)) | 0;
        this.portamentoSpeed = Math.max(1, Math.min(0x7fff, speed));
        this.freqScale = from;
        if (mode === 5) this.portamentoTarget = semitone;
      } else {
        const ts = inst[range(semitone)];
        if (!ts) { p.engine.missing.add(c.fontId + ":note " + semitone); this.muted = true; return -1; }
        same = ts === this.tunedSample;
        this.tunedSample = ts;
        this.freqScale = PITCH[semitone] * ts[1];
      }
    }
    this.freqScale *= this.bend;
    if (this.delay === 0) {
      const sample = p.engine.bank.samples[this.tunedSample[0]];
      let time = (sample.loop[1] * p.tempo * NOTE_TIME) / this.freqScale;
      if (time > 0x7ffe) time = 0x7ffe;
      this.gateDelay = 0;
      this.delay = (time | 0) + 1;
      if (this.portamento & 0x80) {
        let speed = ((p.tempo * 0x8000) / MAX_TEMPO) | 0;
        speed = ((speed * 0x100) / (this.delay * this.portamentoTime)) | 0;
        this.portamentoSpeed = Math.max(1, Math.min(0x7fff, speed));
      }
    }
    return same ? 1 : 0;
  }

  startNote(same) {
    const v = this.note;
    if (this.continuous && v && same && v.parent === this && !v.released) return; // legato: the note goes on at the new pitch
    if (!same) this.decay();
    const e = this.channel.player.engine;
    this.note = new Voice(e, this);
    e.voices.add(this.note);
  }
}

// ---- notes -------------------------------------------------------------------

class Voice {
  constructor(engine, layer) {
    this.engine = engine;
    this.parent = layer;
    this.layer = layer;
    this.channel = layer.channel;
    this.sample = layer.tunedSample[0];
    this.pending = true;
    this.released = false;
    this.ends = Infinity;
    const env = layer.adsr.decayIndex === 0 ? layer.channel.adsr : layer.adsr;
    this.env = env.envSeq ? this.readEnv(env.envelope) : env.envelope >= 0 ? this.engine.bank.envelopes[env.envelope] : DEFAULT_ENV;
    this.adsr = { state: 1, index: 0, delay: 0, current: 0, target: 0, velocity: 0, fadeOutVel: 0, sustain: 0, decay: false, release: false };
    const c = layer.channel;
    this.vib = {
      time: 0, delay: c.vibratoDelay,
      depthTimer: c.vibratoDepthChangeDelay, depth: c.vibratoDepthChangeDelay ? c.vibratoDepthStart : c.vibratoDepthTarget,
      rateTimer: c.vibratoRateChangeDelay, rate: c.vibratoRateChangeDelay ? c.vibratoRateStart : c.vibratoRateTarget,
    };
    this.port = layer.portamento ? { mode: layer.portamento, cur: 0, speed: layer.portamentoSpeed, extent: layer.portamentoExtent } : null;
    this.startPos = c.startSamplePos;
    this.sent = { freq: 0, pan: -1 };
  }

  readEnv(at) {
    const seq = this.channel.player.seq, pts = [];
    for (let i = 0; i < 64; i++, at += 4) {
      const d = ((seq[at] << 8) | seq[at + 1]) << 16 >> 16, a = ((seq[at + 2] << 8) | seq[at + 3]) << 16 >> 16;
      pts.push([d, a]);
      if (d <= 0 && d >= -3) break;
    }
    return pts;
  }

  // the layer lets go: decay (its release rate, down to the channel's
  // sustain level) or a quick release
  detach(layer, release) {
    if (this.parent !== layer) return;
    this.attrs = { freq: layer.noteFreqScale, pan: layer.notePan };
    this.parent = null;
    this.released = true;
    const a = this.adsr;
    if (release) { a.fadeOutVel = 1 / PER_FRAME; a.release = true; }
    else {
      a.decay = true;
      a.fadeOutVel = DECAY[layer.adsr.decayIndex === 0 ? layer.channel.adsr.decayIndex : layer.adsr.decayIndex];
      a.sustain = (layer.channel.adsr.sustain * a.current) / 256;
    }
  }

  start(t) {
    const e = this.engine, ctx = e.ctx, s = e.bank.samples[this.sample];
    const src = (this.src = ctx.createBufferSource());
    src.buffer = e.buffer(this.sample);
    if (s.loop[2] !== 0 && s.loop[0] < s.loop[1]) {
      src.loop = true;
      src.loopStart = s.loop[0] / RATE;
      src.loopEnd = s.loop[1] / RATE;
    }
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    src.connect(this.g).connect(this.pan).connect(this.channel.gain);
    src.onended = () => { src.disconnect(); this.g.disconnect(); this.pan.disconnect(); };
    this.vel = this.layer.velocitySquare2;
    let at = this.startPos === 1 ? s.loop[0] : this.startPos;
    if (at >= s.loop[1]) at = 0;
    const f = this.freq();
    src.playbackRate.setValueAtTime(f, t);
    this.sent.freq = f;
    src.start(t, at / RATE);
    if (!src.loop) this.ends = t + (s.loop[1] - at) / (RATE * f) + 0.05;
    this.pending = false;
  }

  freq() {
    const base = this.parent ? this.parent.noteFreqScale : this.attrs.freq;
    return Math.min(3.99996, base * (this.vibScale ?? 1) * (this.portScale ?? 1));
  }

  stop(t) {
    if (!this.src) return;
    try { this.src.stop(t + 0.01); } catch (e) { /* already stopped */ }
  }

  // one update of the envelope (Majora's Mask: AudioEffects_UpdateAdsr).
  // Web Audio gets a ramp per segment: at each change of state, the gain
  // from here to where the segment ends. false once the note is silent.
  adsrStep(t) {
    const a = this.adsr;
    if (a.state === 0) return false;
    let changed = false;
    switch (a.state) {
      case 1: case 2: a.index = 0; a.state = 3; // fall through
      case 3:
        for (let guard = 0; guard < 64 && a.state === 3; guard++) {
          const [delay, level] = this.env[a.index] ?? [0, 0];
          changed = true;
          if (delay === 0) a.state = 0;
          else if (delay === -1) a.state = 5;
          else if (delay === -2) a.index = level;
          else if (delay === -3) a.state = 1;
          else {
            a.delay = Math.trunc(delay * ENV_SCALE) || 1;
            a.target = (level / 32767) ** 2;
            a.velocity = (a.target - a.current) / a.delay;
            a.state = 4;
            a.index++;
          }
        }
        if (a.state !== 4) break;
      // fall through
      case 4:
        a.current += a.velocity;
        if (--a.delay <= 0) a.state = 3;
        break;
      case 6: case 7:
        a.current -= a.fadeOutVel;
        if (a.sustain !== 0 && a.state === 6) {
          if (a.current < a.sustain) { a.current = a.sustain; a.delay = 128; a.state = 8; changed = true; }
          break;
        }
        if (a.current < 0.00001) { a.current = 0; a.state = 0; changed = true; }
        break;
      case 8:
        if (--a.delay === 0) { a.state = 7; changed = true; }
        break;
    }
    if (a.decay) { a.state = 6; a.decay = false; changed = true; }
    if (a.release) { a.state = 7; a.release = false; changed = true; }
    if (this.parent && this.parent.velocitySquare2 !== this.vel && this.vel !== undefined) { this.vel = this.parent.velocitySquare2; changed = true; }
    if (changed) this.emit(t);
    return true;
  }

  emit(t) {
    if (this.pending) this.start(t);
    const a = this.adsr, gain = this.g.gain, vel = this.vel;
    const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(vel * clamp(a.current), t);
    if (a.state === 4 && a.delay > 0) gain.linearRampToValueAtTime(vel * clamp(a.target), t + a.delay / UPDATES);
    else if (a.state === 6 || a.state === 7) {
      const floor = a.state === 6 ? a.sustain : 0;
      gain.linearRampToValueAtTime(vel * clamp(floor), t + Math.max(1, (a.current - floor) / a.fadeOutVel) / UPDATES);
    }
  }

  // vibrato, portamento and pan for this update
  apply(t) {
    if (this.pending) this.start(t);
    const c = this.channel, v = this.vib;
    if (this.port && this.port.mode) {
      const p = this.port;
      p.cur += p.speed;
      let lo = (p.cur >> 8) & 0xff;
      if (lo >= 127) { lo = 127; p.mode = 0; }
      this.portScale = 1 + p.extent * (BEND_OCTAVE[lo + 128] - 1);
    }
    if (v.delay) v.delay--;
    else {
      if (v.depthTimer) { v.depth = v.depthTimer === 1 ? c.vibratoDepthTarget : v.depth + (c.vibratoDepthTarget - v.depth) / v.depthTimer; v.depthTimer--; }
      else if (c.vibratoDepthTarget !== v.depth && (v.depthTimer = c.vibratoDepthChangeDelay) === 0) v.depth = c.vibratoDepthTarget;
      if (v.rateTimer) { v.rate = v.rateTimer === 1 ? c.vibratoRateTarget : v.rate + (c.vibratoRateTarget - v.rate) / v.rateTimer; v.rateTimer--; }
      else if (c.vibratoRateTarget !== v.rate && (v.rateTimer = c.vibratoRateChangeDelay) === 0) v.rate = c.vibratoRateTarget;
      if (v.depth) {
        v.time = (v.time + v.rate) | 0;
        const pc = SINE[(v.time >> 10) & 63] + 32768, depth = v.depth / 4096 + 1, inv = 1 / depth;
        this.vibScale = 1 / (((depth - inv) * pc) / 65536 + inv);
      } else this.vibScale = 1;
    }
    const f = this.freq();
    if (Math.abs(f - this.sent.freq) > 1e-6) {
      this.src.playbackRate.setValueAtTime(f, t);
      this.sent.freq = f;
    }
    const pan = this.parent ? this.parent.notePan : this.attrs.pan;
    if (pan !== this.sent.pan) {
      this.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, (pan & 0x7f) / 63.5 - 1)), t);
      this.sent.pan = pan;
    }
  }
}
