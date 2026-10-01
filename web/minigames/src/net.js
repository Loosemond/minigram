// The connection to the rooms server (tools/rooms.py): JSON messages over one
// WebSocket, reconnecting on its own, and a clock synced to the server's so
// every device starts the round and runs it at the same moment.
export class Net {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = {};
    this.samples = []; // ping round trips: {rtt, off}
    this.offset = 0; // server clock - performance.now(), in ms
    this.retry = 0;
    this.wanted = false;
    this.outbox = []; // a round's messages sent while offline, for when it's back
  }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  emit(t, m) { for (const fn of this.handlers[t] || []) fn(m); }
  get connected() { return this.ws?.readyState === WebSocket.OPEN; }
  now() { return performance.now() + this.offset; } // the server's clock

  // join a room: hello = {room, id, name, create}; no room makes a new one
  open(hello) {
    this.close();
    this.outbox = [];
    this.hello = { ...hello };
    this.wanted = true;
    this.retry = 0;
    this.connect();
  }
  connect() {
    const ws = (this.ws = new WebSocket(this.url));
    this.welcomed = false;
    this.emit("status", this.retry ? "reconnecting" : "connecting");
    ws.onopen = () => {
      this.samples = [];
      this.send("hello", this.hello);
      this.ping();
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "pong") return this.pong(m);
      if (m.t === "welcome") {
        this.retry = 0;
        this.hello.room = m.room; // reconnect to this room from now on
        this.hello.create = false;
        if (!this.samples.length) this.offset = m.now - performance.now(); // until the first pong
        this.welcomed = true;
        for (const text of this.outbox.splice(0)) ws.send(text);
        this.emit("status", "online");
      }
      if (m.t === "error") this.wanted = false; // no room, full: don't retry
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearTimeout(this.pinger);
      if (!this.wanted) return;
      this.emit("status", "reconnecting");
      this.timer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retry++));
    };
  }
  // keep: the round's leans and results; offline (or not yet back in the
  // room), they wait and go out once it's back
  send(t, data = {}, keep = false) {
    const text = JSON.stringify({ t, ...data });
    if (this.connected && (this.welcomed || !keep)) this.ws.send(text);
    else if (keep && this.wanted && this.outbox.length < 2000) this.outbox.push(text);
  }
  close() {
    this.wanted = false;
    clearTimeout(this.timer);
    clearTimeout(this.pinger);
    if (this.ws) {
      this.send("leave");
      this.ws.close();
      this.ws = null;
    }
  }

  // the clock: offset from the round trip with the least delay of the last
  // few. Each ping also tells the server a round trip to count on (typical),
  // which it passes on so the others know how far behind to show this
  // device's players (src/lag.js)
  ping() {
    const rtt = this.typical;
    this.send("ping", { c: performance.now(), rtt: rtt === undefined ? undefined : Math.round(rtt) });
    this.pinger = setTimeout(() => this.ping(), this.samples.length < 6 ? 1000 : 8000);
  }
  pong(m) {
    const t = performance.now(), rtt = t - m.c;
    this.samples.push({ rtt, off: m.s + rtt / 2 - t });
    if (this.samples.length > 12) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.off;
    this.rtt = best.rtt;
  }
  // a round trip to count on (ms): three in four of the last few were quicker
  get typical() {
    if (!this.samples.length) return undefined;
    const r = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    return r[Math.floor(0.75 * (r.length - 1))];
  }
}
