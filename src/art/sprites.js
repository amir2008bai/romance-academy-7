// Bitmap Giffany (high-res pixel sprites) with live overlays drawn on top:
// eyes that grow with compliments, extra star highlights, blinking, a talking
// mouth and blush. Coordinates come from assets/giffany/meta.json (sprite pixels).

const BASE_ZOOM = 1.35;
const CLOSE_K = 2.4 / BASE_ZOOM;
const CLOSE_FACE_Y = 112;

// Several drawn poses per mood: the renderer picks one per line and never repeats the previous one.
const POSE_POOLS = {
  yandere: ['yandere'],
  angryPoint: ['angry'],
  angry: ['fist', 'pout'],
  sad: ['sad', 'shy'],
  surprised: ['surprised'],
  smug: ['smug', 'wink', 'sly', 'thinking'],
  books: ['books'],
  happyExcited: ['excited', 'love', 'wave'],
  happy: ['happy', 'laugh', 'wink', 'wave'],
  excited: ['excited', 'wave', 'love'],
  normal: ['neutral', 'neutral', 'thinking', 'shy', 'sly'],
};

function poolKey({ mood, pose: p }) {
  if (mood === 'yandere' || p === 'scream') return 'yandere';
  if (mood === 'angry') return p === 'point' ? 'angryPoint' : 'angry';
  if (p === 'fist') return 'angry';
  if (mood === 'sad') return 'sad';
  if (mood === 'surprised') return 'surprised';
  if (mood === 'smug') return 'smug';
  if (p === 'books') return 'books';
  if (p === 'point') return 'angryPoint';
  if (mood === 'happy') return p === 'excited' ? 'happyExcited' : 'happy';
  if (p === 'excited') return 'excited';
  return 'normal';
}

// mood/pose -> sprite name (the per-line pick when one was made, else the first of the pool)
export function spriteFor(pose) {
  if (pose.sprite) return pose.sprite;
  const { mood, pose: p } = pose;
  if (mood === 'yandere') return 'yandere';
  if (mood === 'angry') return p === 'point' ? 'angry' : 'fist';
  if (p === 'fist') return 'fist';
  if (mood === 'sad') return 'sad';
  if (mood === 'surprised') return 'surprised';
  if (mood === 'smug') return 'smug';
  if (p === 'books') return 'books';
  if (p === 'scream') return 'yandere';
  if (p === 'point') return 'angry';
  if (mood === 'happy') return p === 'excited' ? 'excited' : 'happy';
  if (p === 'excited') return 'excited';
  return 'neutral';
}

export class SpriteGiffany {
  constructor() {
    this.ready = false;
    this.imgs = {};
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
  }

  async load() {
    try {
      const res = await fetch('assets/giffany/meta.json');
      if (!res.ok) return false;
      this.meta = await res.json();
    } catch {
      return false;
    }
    const { w, h, sprites } = this.meta;
    this.buf.width = w; this.buf.height = h;
    this.bctx.imageSmoothingEnabled = false;
    const frames = [...sprites, ...(this.meta.blinkFrames || [])];
    await Promise.all(frames.map((name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.imgs[name] = img; resolve(); };
      img.onerror = resolve;
      img.src = `assets/giffany/${name}.png`;
    })));
    if (this.meta.blinkMask) await this.prepareBlinkFrames();
    this.ready = !!this.imgs.neutral;
    return this.ready;
  }

  // Cut the blink frames down to the pixels that actually change (lids, lashes, iris),
  // so the original open-eye lashes never show through while she blinks.
  async prepareBlinkFrames() {
    const mask = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'assets/giffany/blink_mask.png';
    });
    if (!mask) return;
    this.blinkCut = {};
    for (const name of this.meta.blinkFrames || []) {
      const frame = this.imgs[name];
      if (!frame) continue;
      const c = document.createElement('canvas');
      c.width = this.meta.w; c.height = this.meta.h;
      const x = c.getContext('2d');
      x.drawImage(frame, 0, 0);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(mask, 0, 0);
      this.blinkCut[name] = c;
    }
  }

  // Choose a pose for a new line: random from the mood's pool, never the same as the last one.
  pick(pose) {
    const pool = (POSE_POOLS[poolKey(pose)] || ['neutral']).filter((n) => this.imgs[n]);
    if (!pool.length) return 'neutral';
    const options = pool.length > 1 ? pool.filter((n) => n !== this.lastPick) : pool;
    const choice = options[Math.floor(Math.random() * options.length)];
    this.lastPick = choice;
    return choice;
  }

  info(name) {
    const m = this.meta;
    return { eyes: m.eyes[name] || m.eyes.neutral, mouth: m.mouth[name] || m.mouth.neutral, ...(m.flags[name] || {}) };
  }

  // Sprite placement in logical (320x240) screen space. Sprites are stored at
  // 2x density; zoom 1.35 is the normal shot, larger zooms move toward a face close-up.
  placement(zoom) {
    const { w, face } = this.meta;
    const k = zoom / BASE_ZOOM;
    const s = k / 2;
    const t = Math.max(0, Math.min(1, (k - 1) / (CLOSE_K - 1)));
    const nx = 160, ny = 2 + face[1] / 2; // face position in the normal shot
    const fx = nx + (160 - nx) * t, fy = ny + (CLOSE_FACE_Y - ny) * t;
    return { scale: s, x: fx - face[0] * s, y: fy - face[1] * s, w };
  }

  toScreen(zoom, ty, sx, sy) {
    const p = this.placement(zoom);
    return [p.x + sx * p.scale, p.y + sy * p.scale];
  }

  eyeCenters(pose, zoom, ty) {
    const { eyes } = this.info(spriteFor(pose));
    return eyes.map(([x, y]) => this.toScreen(zoom, ty, x, y));
  }

  faceCenter(zoom, ty) { return this.toScreen(zoom, ty, this.meta.face[0], this.meta.face[1]); }

  draw(ctx, pose, t, zoom, ty) {
    const name = spriteFor(pose);
    const img = this.imgs[name] || this.imgs.neutral;
    const b = this.bctx, m = this.meta, inf = this.info(name);
    b.clearRect(0, 0, m.w, m.h);
    const bob = Math.round(Math.sin(t * 2.2) * m.px * 0.6);
    b.drawImage(img, 0, bob);
    if (!inf.closedEyes && !inf.creepy && !inf.noEyeFx) {
      if (pose.blink) this.blink(inf, pose.blink, bob);
      else {
        if (pose.eyeScale > 1.01) this.growEyes(img, inf, pose.eyeScale, bob);
        this.stars(inf, pose, t, bob);
      }
    }
    if (pose.blush > 0.3) this.blush(inf, pose.blush, bob);
    if (pose.talking) this.mouth(inf, pose.mouthOpen ?? 0.5, bob);
    const p = this.placement(zoom);
    ctx.drawImage(this.buf, p.x, p.y, m.w * p.scale, m.h * p.scale);
  }

  // Copy each eye (elliptical mask) and paste it back scaled up around its centre.
  growEyes(img, inf, s, bob) {
    const { eyeRX: rx, eyeRY: ry } = this.meta;
    const b = this.bctx;
    for (const [ex, ey] of inf.eyes) {
      b.save();
      b.beginPath();
      b.ellipse(ex, ey + bob, rx * s, ry * s, 0, 0, Math.PI * 2);
      b.clip();
      const w = rx * 2, h = ry * 2;
      b.drawImage(img, ex - rx, ey - ry, w, h, Math.round(ex - rx * s), Math.round(ey - ry * s) + bob, Math.round(w * s), Math.round(h * s));
      b.restore();
    }
  }

  block(x, y, w, h, color) {
    const px = this.meta.px;
    this.bctx.fillStyle = color;
    this.bctx.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, Math.max(px, Math.round(w / px) * px), Math.max(px, Math.round(h / px) * px));
  }

  starShape(x, y, size, color = '#ffffff') {
    const px = this.meta.px, s = Math.max(1, Math.round(size));
    this.block(x - s * px, y, (s * 2 + 1) * px, px, color);
    this.block(x, y - s * px, px, (s * 2 + 1) * px, color);
    if (s >= 2) this.block(x - px, y - px, px * 3, px * 3, color);
  }

  // One more star per compliment, kept inside the iris; they swell with starScale.
  stars(inf, pose, t, bob) {
    const ri = this.meta.irisR * pose.eyeScale;
    const slots = [[-0.45, -0.45, 1], [0.4, 0.35, 0.65], [0.45, -0.5, 0.55], [-0.5, 0.3, 0.5], [0, -0.7, 0.45], [-0.05, 0.6, 0.45], [0.6, -0.05, 0.4]];
    const n = Math.max(1, Math.min(7, pose.highlights));
    for (const [ex, ey] of inf.eyes) {
      for (let i = 0; i < n; i++) {
        const [ox, oy, size] = slots[i];
        const pulse = 1 + Math.sin(t * 6 + i * 1.7) * 0.15;
        this.starShape(ex + ox * ri, ey + 1 + oy * ri + bob, size * 0.9 * pose.starScale * pulse);
      }
    }
  }

  // stage 1 = half-closed lids, 2 = closed. Uses the hand-drawn blink frames (aligned with the
  // base sprite) pasted through a soft eye-shaped mask; falls back to a drawn lash line.
  blink(inf, stage, bob) {
    const name = stage >= 2 ? 'blink_closed' : 'blink_half';
    const cut = this.blinkCut?.[name];
    if (cut) {
      this.bctx.drawImage(cut, 0, bob); // pixel-exact eye region, aligned with every emotion
      return;
    }
    const frame = this.imgs[name];
    if (frame) {
      const { eyeRX: rx, eyeRY: ry } = this.meta;
      const b = this.bctx;
      for (const [ex, ey] of inf.eyes) {
        // eye + lashes only: keeps each emotion's own eyebrows (e.g. angry brows) while blinking
        const w = Math.round(rx * 2.7), h = Math.round(ry * 2.3);
        const x = Math.round(ex - w / 2), y = Math.round(ey - h / 2);
        b.save();
        b.beginPath();
        b.ellipse(ex, ey + bob, w / 2, h / 2, 0, 0, Math.PI * 2);
        b.clip();
        b.drawImage(frame, x, y, w, h, x, y + bob, w, h);
        b.restore();
      }
      return;
    }
    const R = this.meta.eyeR, m = this.meta;
    for (const [ex, ey] of inf.eyes) {
      this.block(ex - R * 0.85, ey - R * 0.75 + bob, R * 1.7, R * 1.5, m.skin);
      this.block(ex - R * 0.8, ey + bob, R * 1.6, m.px * 2, m.outline);
    }
  }

  blush(inf, amount, bob) {
    const m = this.meta, R = m.eyeR;
    this.bctx.globalAlpha = Math.min(0.7, amount * 0.6);
    for (const [ex, ey] of inf.eyes) this.block(ex - R * 0.6, ey + R * 1.05 + bob, R * 1.2, m.px * 2, '#ff6f9a');
    this.bctx.globalAlpha = 1;
  }

  // Lip-sync: cover the drawn mouth with skin and paint a pixel mouth whose
  // openness follows the voice level (0 = closed .. 1 = wide open).
  mouth(inf, open, bob) {
    if (inf.noLipSync) return;
    const m = this.meta, px = m.px;
    const [cx, cy, w, h] = inf.mouth;
    const level = inf.openMouth ? 0.35 + open * 0.65 : open;
    if (!inf.openMouth && level < 0.15) return; // closed: keep the original smile
    this.block(cx - w / 2 - px, cy - h / 2 - px + bob, w + px * 2, h + px * 2, m.skin);
    const mw = Math.max(px * 3, (inf.openMouth ? w : 18) * (0.6 + 0.4 * level));
    const mh = Math.max(px * 2, (inf.openMouth ? h : 15) * level);
    this.pixelMouth(cx, cy + bob, mw, mh);
  }

  pixelMouth(cx, cy, w, h) {
    const m = this.meta, px = m.px, b = this.bctx;
    const cols = Math.max(2, Math.round(w / px)), rows = Math.max(2, Math.round(h / px));
    const x0 = Math.round((cx - (cols * px) / 2) / px) * px, y0 = Math.round((cy - (rows * px) / 2) / px) * px;
    const inside = (i, j) => {
      const u = (i + 0.5) / cols * 2 - 1, v = (j + 0.5) / rows * 2 - 1;
      return u * u + v * v * (v < 0 ? 1.6 : 1) <= 1; // flatter top lip, rounder bottom
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!inside(i, j)) continue;
        const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
        let color = m.mouthInside;
        if (edge) color = m.mouthInk;
        else if (j >= rows * 0.6) color = m.tongue;
        else if (j === 1 && rows >= 5) color = '#ffffff'; // top teeth line
        b.fillStyle = color;
        b.fillRect(x0 + i * px, y0 + j * px, px, px);
      }
    }
  }
}
