// How far behind to show another device's player (s): long enough that the
// moves its device sends (through the server) get here before they're due,
// and no longer. A round starts from both devices' round trips to the server
// (the server passes them on in "start": rtt); then Lag follows how old the
// moves are when they get here: up quickly to cover a late one (the seat's
// clock runs at 3/4 speed meanwhile), and back down slowly once they're quick.
export const LAG = {
  min: 0.05, max: 0.6, // s
  spare: 0.05, // s over the way here: a frame, and the odd slow message
  fallback: 0.3, // s, with no round trips to go by
  up: 0.25, down: 0.02, // s the delay may change by a second
};

const clamp = (s) => Math.min(LAG.max, Math.max(LAG.min, s));

// the delay to start with, from this device's round trip and the seat's device's (ms)
export function startDelay(mine, theirs) {
  if (!(mine >= 0) || !(theirs >= 0)) return LAG.fallback;
  return clamp((mine + theirs) / 2 / 1000 + LAG.spare); // (there and back / 2, each way)
}

export class Lag {
  // delay: the seat's delay now; want: where it should get to (from startDelay)
  constructor(delay, want = delay) {
    this.delay = delay;
    this.worst = Math.max(0, want - LAG.spare); // the way here, the slowest lately
  }
  // one of the seat's moves got here, age s after its device made it (both on
  // the round's clock); a much older one is its device catching up after a
  // blip, or the server's own word on a drop, and doesn't count
  heard(age) {
    if (age >= 0 && age < 2 * LAG.max) this.worst = Math.max(this.worst, age);
  }
  // time goes by (dt s): the new delay
  step(dt) {
    this.worst = Math.max(0, this.worst - LAG.down * dt);
    const want = clamp(this.worst + LAG.spare);
    this.delay = want > this.delay ? Math.min(want, this.delay + LAG.up * dt) : Math.max(want, this.delay - LAG.down * dt);
    return this.delay;
  }
}

// Frames this device sends its own player's moves ahead of when they count,
// in the games that share one world (Barrier Ball, Rampage Rollout): enough
// for them to get to the other people's devices before those run that frame
// (so they needn't run the world again), and no more than LEAD_MOST (the
// moves count that much later here too: 100 ms at most). people: which seats
// are other people's; delay: each seat's (startDelay: the way here and back, /2,
// and the spare)
export const LEAD_MOST = 3;
export function leadFor(people, delay, fps = 30) {
  let way = -1;
  people.forEach((p, z) => { if (p) way = Math.max(way, (delay?.[z] ?? LAG.fallback) - LAG.spare); });
  return way < 0 ? 0 : Math.max(1, Math.min(LEAD_MOST, Math.ceil((way + 0.01) * fps)));
}
