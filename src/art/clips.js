// Short animated reactions cut from the episode (assets/clips, built by tools/prep_clips.py).
// A clip temporarily replaces the drawn sprite, then the sprite comes back.

const MIN_SEC = 1.2;  // short clips loop until at least this long
const MAX_SEC = 2.6;  // long clips are cut here

export class ClipLibrary {
  constructor() {
    this.clips = {};
    this.active = null;
  }

  async load() {
    try {
      const index = await (await fetch('assets/clips/index.json')).json();
      await Promise.all(Object.entries(index).map(([name, c]) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { this.clips[name] = { ...c, img, loop: c.durations_ms.reduce((a, b) => a + b, 0) / 1000 }; resolve(); };
        img.onerror = resolve;
        img.src = `assets/clips/${c.file}`;
      })));
    } catch {
      this.clips = {}; // no clip pack: the game just keeps using the sprites
    }
  }

  has(name) { return Boolean(this.clips[name]); }

  play(name, t) {
    const c = this.clips[name];
    if (!c) return false;
    const len = Math.min(MAX_SEC, Math.max(MIN_SEC, c.loop));
    this.active = { c, start: t, end: t + len };
    return true;
  }

  stop() { this.active = null; }

  isPlaying(t) {
    if (this.active && t >= this.active.end) this.active = null;
    return Boolean(this.active);
  }

  frameAt(c, elapsed) {
    // durations are per original episode frame; redrawn clips map each one to a key pose
    let ms = (elapsed * 1000) % (c.loop * 1000);
    let i = 0;
    while (i < c.durations_ms.length - 1 && (ms -= c.durations_ms[i]) >= 0) i++;
    return c.map ? c.map[i] : i;
  }

  closeUp() { return Boolean(this.active?.c.closeUp); }

  // Redrawn clips go through the sprite placement (sprites.drawFrame); episode clips are
  // drawn in device pixels, centred and standing on the bottom edge.
  draw(ctx, t, pw, ph, sprites, zoom) {
    const { c, start } = this.active;
    if (c.sprite && sprites?.ready) {
      sprites.drawFrame(ctx, c.img, this.frameAt(c, t - start) * c.w, t, zoom);
      return;
    }
    const s = Math.min((pw * 0.98) / c.w, (ph * 0.92) / c.h);
    const dw = Math.round(c.w * s), dh = Math.round(c.h * s);
    const i = this.frameAt(c, t - start);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.img, i * c.w, 0, c.w, c.h, Math.round((pw - dw) / 2), ph - dh, dw, dh);
    ctx.restore();
  }
}
