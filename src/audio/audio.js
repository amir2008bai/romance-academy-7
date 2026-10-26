// Mixer: music bus, sfx bus, voice bus. Created lazily on the first user
// gesture because browsers block audio until then.
import { Music } from './music.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.volumes = { music: 0.6, sfx: 0.7, voice: 0.9 };
    this.manifest = {};
    this.voiceEl = new Audio();
    this.pendingTrack = null;
  }

  async loadManifest() {
    try {
      const res = await fetch('assets/voice/manifest.json');
      if (res.ok) {
        const data = await res.json();
        this.manifest = Object.fromEntries(Object.entries(data).map(([lang, ids]) => [lang, new Set(ids)]));
      }
    } catch {
      this.manifest = {}; // no generated voice yet: blips only
    }
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    const comp = this.ctx.createDynamicsCompressor();
    comp.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(comp);
    this.sfxGain.connect(comp);
    this.applyVolumes();
    this.music = new Music(this.ctx, this.musicGain);
    // route the voice through an analyser so the mouth can follow its loudness
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.ctx.createMediaElementSource(this.voiceEl).connect(this.analyser).connect(comp);
    if (this.pendingTrack) this.music.play(this.pendingTrack);
  }

  setVolume(kind, v) {
    this.volumes = { ...this.volumes, [kind]: v };
    this.applyVolumes();
  }

  applyVolumes() {
    if (this.musicGain) this.musicGain.gain.value = this.volumes.music * 0.5;
    if (this.sfxGain) this.sfxGain.gain.value = this.volumes.sfx * 0.5;
    this.voiceEl.volume = this.volumes.voice;
  }

  playMusic(name) {
    this.pendingTrack = name;
    this.music?.play(name);
  }

  hasVoice(lang, id) { return !!this.manifest[lang]?.has(id); }

  speak(lang, id) {
    if (!this.hasVoice(lang, id)) return false;
    // the voice runs through the lip-sync analyser: a suspended context would silence it
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    this.voiceEl.pause();
    this.voiceEl.src = `assets/voice/${lang}/${id}.mp3`;
    this.voiceEl.play().catch(() => {});
    return true;
  }

  stopVoice() { this.voiceEl.pause(); }

  // 0..1 loudness of the voice right now (for lip-sync).
  voiceLevel() {
    if (!this.analyser || this.voiceEl.paused) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 6);
  }

  tone(type, f0, f1, len, vol, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.sfxGain);
    o.start(t); o.stop(t + len + 0.02);
  }

  noise(len, vol, freq = 2000, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  // Short pitched beep per character, like dating-sim text voices.
  blip(ch, mood) {
    if (!/[\p{L}\p{N}]/u.test(ch)) return;
    const base = mood === 'yandere' ? 180 : mood === 'angry' ? 330 : 620;
    const f = base + (ch.codePointAt(0) % 7) * 28;
    this.tone('square', f, f, 0.045, 0.05);
  }

  sfx(name) {
    const s = {
      click: () => this.tone('square', 880, 660, 0.05, 0.08),
      hover: () => this.tone('triangle', 1200, 1200, 0.03, 0.04),
      select: () => { this.tone('square', 660, 660, 0.06, 0.07); this.tone('square', 990, 990, 0.08, 0.07, 0.06); },
      sparkle: () => [1319, 1568, 1976, 2637].forEach((f, i) => this.tone('sine', f, f, 0.25, 0.08, i * 0.06)),
      heart: () => [784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.2, 0.09, i * 0.08)),
      giggle: () => [1200, 1400, 1250, 1500].forEach((f, i) => this.tone('square', f, f * 0.9, 0.06, 0.04, i * 0.07)),
      glitch: () => { this.noise(0.35, 0.25, 900); this.tone('sawtooth', 120, 40, 0.3, 0.12); },
      static: () => this.noise(0.8, 0.18, 3500),
      crt: () => { this.tone('sine', 15000, 15000, 0.6, 0.02); this.tone('square', 90, 40, 0.15, 0.15); this.noise(0.3, 0.1, 1500, 0.05); },
      melt: () => { this.tone('sawtooth', 440, 30, 2.5, 0.15); this.noise(2.5, 0.12, 400); },
      achievement: () => [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.06, i * 0.09)),
      error: () => this.tone('square', 220, 110, 0.25, 0.1),
    }[name];
    s?.();
  }
}
