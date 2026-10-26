// Generative chiptune / lo-fi soundtrack built with Web Audio. Each track is a
// chord progression plus a motif generator, so the music never loops exactly.

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

// Chords are scale degrees (0-based); 7ths are added for the lo-fi tracks.
export const TRACKS = {
  menu: { bpm: 72, root: 53, scale: 'major', prog: [3, 2, 1, 0], sevenths: true, lead: 'keys', arp: 0.35, drums: 'lofi', crackle: true, swing: 0.12 },
  school: { bpm: 96, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'pulse', arp: 0.8, drums: 'soft' },
  sunset: { bpm: 66, root: 56, scale: 'major', prog: [0, 4, 5, 3], sevenths: true, lead: 'bell', arp: 0.45, drums: null, crackle: true },
  arcade: { bpm: 118, root: 57, scale: 'dorian', prog: [0, 0, 6, 3], lead: 'square', arp: 1, drums: 'chip' },
  pizza: { bpm: 92, root: 50, scale: 'minor', prog: [0, 3, 4, 0], lead: 'box', arp: 0.5, drums: null, waltz: true },
  festival: { bpm: 84, root: 58, scale: 'major', prog: [0, 4, 5, 3], sevenths: true, lead: 'bell', arp: 0.7, drums: 'soft' },
  yandere: { bpm: 70, root: 45, scale: 'phrygian', prog: [0, 1, 0, 4], lead: 'drone', arp: 0.2, drums: 'heart' },
  credits: { bpm: 76, root: 55, scale: 'major', prog: [0, 3, 5, 4], sevenths: true, lead: 'keys', arp: 0.5, drums: 'lofi', crackle: true },
};

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.current = null;
    this.reverb = this.makeReverb(2.6);
    this.reverb.connect(out);
    this.noise = this.makeNoise();
  }

  makeReverb(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  makeNoise() {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  play(name) {
    if (this.current?.name === name) return;
    this.stop(1.6);
    const def = TRACKS[name];
    if (!def) return;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0, this.ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2);
    const dry = this.ctx.createGain(); dry.gain.value = 0.8;
    const wet = this.ctx.createGain(); wet.gain.value = 0.35;
    bus.connect(dry).connect(this.out);
    bus.connect(wet).connect(this.reverb);
    const track = { name, def, bus, step: 0, next: this.ctx.currentTime + 0.1, rnd: mulberry(Math.random() * 1e9), motifs: [] };
    if (def.crackle) track.crackle = this.startCrackle(bus);
    track.timer = setInterval(() => this.schedule(track), 25);
    this.current = track;
  }

  stop(fade = 0.8) {
    const t = this.current;
    if (!t) return;
    this.current = null;
    clearInterval(t.timer);
    const now = this.ctx.currentTime;
    t.bus.gain.cancelScheduledValues(now);
    t.bus.gain.setValueAtTime(t.bus.gain.value, now);
    t.bus.gain.linearRampToValueAtTime(0, now + fade);
    setTimeout(() => { t.crackle?.stop(); t.bus.disconnect(); }, fade * 1000 + 200);
  }

  startCrackle(bus) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = this.ctx.createGain(); g.gain.value = 0.012;
    src.connect(hp).connect(g).connect(bus);
    src.start();
    return src;
  }

  schedule(track) {
    const { def } = track;
    const stepDur = 60 / def.bpm / 2; // eighth notes
    const perBar = def.waltz ? 6 : 8;
    if (track.next < this.ctx.currentTime) track.next = this.ctx.currentTime + 0.05; // skip notes missed while throttled
    while (track.next < this.ctx.currentTime + 0.15) {
      const bar = Math.floor(track.step / perBar);
      const inBar = track.step % perBar;
      const swing = def.swing && inBar % 2 ? stepDur * def.swing : 0;
      this.stepNotes(track, bar, inBar, perBar, track.next + swing, stepDur);
      track.next += stepDur;
      track.step++;
    }
  }

  chordTones(def, bar) {
    const sc = SCALES[def.scale];
    const deg = def.prog[bar % def.prog.length];
    const tone = (d) => def.root + sc[d % 7] + 12 * Math.floor(d / 7);
    const tones = [tone(deg), tone(deg + 2), tone(deg + 4)];
    if (def.sevenths) tones.push(tone(deg + 6));
    return { tones, tone, deg };
  }

  // Motif per 4-bar phrase in AABA shape so melodies feel composed, not random.
  motif(track, bar) {
    const phrase = Math.floor(bar / 4) % 4;
    const slot = [0, 0, 1, 0][bar % 4];
    const key = `${phrase}:${slot}`;
    if (!track.motifs[key]) {
      const r = track.rnd, steps = [];
      let deg = Math.floor(r() * 5) + 7;
      for (let i = 0; i < 8; i++) {
        deg += Math.round((r() - 0.5) * 3);
        deg = Math.max(5, Math.min(14, deg));
        steps.push(r() < (i % 2 ? 0.45 : 0.2) ? null : deg);
      }
      track.motifs[key] = steps;
    }
    return track.motifs[key];
  }

  stepNotes(track, bar, inBar, perBar, t, dur) {
    const { def, bus } = track;
    const { tones, tone } = this.chordTones(def, bar);
    if (inBar === 0) {
      for (const m of tones) this.voice(bus, 'pad', NOTE(m), t, dur * perBar, 0.05);
      this.voice(bus, 'bass', NOTE(tones[0] - 12), t, dur * 3, 0.16);
    }
    if (inBar === perBar / 2 && !def.waltz) this.voice(bus, 'bass', NOTE(tones[def.lead === 'drone' ? 0 : 2] - 12), t, dur * 3, 0.12);
    if (def.waltz && inBar % 2 === 0 && inBar > 0) for (const m of tones.slice(1, 3)) this.voice(bus, 'box', NOTE(m + 12), t, dur, 0.04);
    if (track.rnd() < def.arp) this.voice(bus, 'arp', NOTE(tones[inBar % tones.length] + 12), t, dur * 0.9, 0.035);
    const note = this.motif(track, bar)[inBar % 8];
    if (note !== null && def.lead !== 'drone') this.voice(bus, def.lead, NOTE(tone(note) + (def.lead === 'bell' ? 12 : 0)), t, dur * 1.6, 0.07);
    if (def.lead === 'drone' && inBar === 0) this.voice(bus, 'drone', NOTE(tones[0] + 6), t, dur * perBar, 0.05);
    this.drums(track, inBar, t);
  }

  drums(track, inBar, t) {
    const kind = track.def.drums;
    if (!kind) return;
    const { bus } = track;
    if (kind === 'heart') { if (inBar === 0 || inBar === 1) this.kick(bus, t, 0.35, 55); return; }
    if (inBar === 0 || (kind === 'chip' && inBar === 4) || (kind === 'lofi' && inBar === 5)) this.kick(bus, t, kind === 'lofi' ? 0.3 : 0.25, 60);
    if (inBar === 4 || (kind === 'chip' && inBar === 2 && track.rnd() < 0.3)) this.hit(bus, t, 0.09, 1800, 0.12);
    if (kind !== 'soft' || inBar % 2 === 0) this.hit(bus, t, 0.025, 8000, 0.03);
  }

  voice(bus, type, f, t, len, vol) {
    const { ctx } = this;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const shapes = { pad: 'triangle', bass: 'triangle', arp: 'square', pulse: 'square', square: 'square', keys: 'sine', bell: 'sine', box: 'triangle', drone: 'sawtooth' };
    o.type = shapes[type] || 'sine';
    o.frequency.value = f;
    o.detune.value = Math.sin(t * 2.2) * 7; // tape wow, sampled per note
    lp.frequency.value = { pad: 1400, arp: 2200, pulse: 2600, square: 3200, drone: 700 }[type] || 5000;
    const atk = { pad: len * 0.35, drone: len * 0.4, keys: 0.01, bell: 0.005, box: 0.004 }[type] ?? 0.01;
    const rel = { bell: 1.6, keys: 0.9, box: 0.6 }[type] ?? len * 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.02, rel));
    o.connect(lp).connect(g).connect(bus);
    if (type === 'keys' || type === 'bell') {
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * (type === 'bell' ? 3.01 : 2);
      const g2 = ctx.createGain(); g2.gain.value = type === 'bell' ? 0.25 : 0.15;
      o2.connect(g2).connect(g); o2.start(t); o2.stop(t + rel + 0.1);
    }
    o.start(t);
    o.stop(t + Math.max(atk + 0.05, rel) + 0.1);
  }

  kick(bus, t, vol, f) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(f * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + 0.32);
  }

  hit(bus, t, len, freq, vol) {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
  }
}
