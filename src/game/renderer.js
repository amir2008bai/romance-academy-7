// Draws the in-game screen (logic in 320x240, pixels at 2x density): background, Giffany, particles and
// post effects (glitch, yandere red, disc melt, spontaneous combustion).
import { Raster, View } from '../art/raster.js';
import { drawGiffany, defaultPose } from '../art/giffany.js';
import { SpriteGiffany } from '../art/sprites.js';

export const W = 320, H = 240, SCALE = 2;
const PW = W * SCALE, PH = H * SCALE;
const BGS = ['classroom', 'rooftop', 'pizzeria', 'arcade', 'festival'];
const BLINK_HALF = 0.05, BLINK_CLOSED = 0.07; // seconds per blink phase
const NORMAL_ZOOM = 1.35, NORMAL_Y = 96, CLOSE_ZOOM = 2.4, CLOSE_Y = 122;
// One hidden one-eyed triangle per background (x, y in screen pixels).
const BILL_SPOTS = { classroom: [296, 44], rooftop: [22, 70], pizzeria: [286, 120], arcade: [36, 150], festival: [300, 30] };
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

export class ScreenRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;
    this.raster = new Raster(PW, PH);
    this.bgs = {};
    this.bg = 'classroom';
    this.pose = { ...defaultPose(), lookX: 0, lookY: 0 };
    this.boost = 0;
    this.highlights = 1;
    this.zoom = NORMAL_ZOOM; this.zoomTarget = NORMAL_ZOOM;
    this.ty = NORMAL_Y; this.tyTarget = NORMAL_Y;
    this.particles = [];
    this.fx = { glitch: 0, red: 0, shake: 0, melt: 0, fire: 0, flash: 0, dim: 0 };
    this.showGirl = true;
    this.blinkIn = 2;
    this.blinkLeft = 0;
    this.mouse = null;
    this.sprites = new SpriteGiffany();
  }

  load() {
    return Promise.all([this.sprites.load(), ...BGS.map((name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.bgs[name] = img; resolve(); };
      img.onerror = resolve;
      img.src = `assets/bg/${name}.png`;
    }))]);
  }

  setExpression({ mood, pose, mouth }) {
    if (mood) this.pose.mood = mood;
    if (pose) this.pose.pose = pose;
    if (mouth) this.pose.mouth = mouth;
    // a new line/expression gets one of several drawn poses for that mood (no repeats in a row)
    if ((mood || pose) && this.sprites?.ready) this.pose.sprite = this.sprites.pick(this.pose);
  }

  closeUp(on) {
    this.zoomTarget = on ? CLOSE_ZOOM : NORMAL_ZOOM;
    this.tyTarget = on ? CLOSE_Y : NORMAL_Y;
  }

  // Logical-space view (for hit tests) and pixel-space view (for drawing).
  view() { return new View(this.raster, this.zoom, 160, 88, 160, this.ty); }
  drawView() { return new View(this.raster, this.zoom * SCALE, 160, 88, 160 * SCALE, this.ty * SCALE); }

  eyeCenters() {
    if (this.sprites.ready) return this.sprites.eyeCenters(this.pose, this.zoom, this.ty);
    const v = this.view();
    return [[v.X(145), v.Y(91)], [v.X(175), v.Y(91)]];
  }

  isOnEyes(x, y) {
    const r = (this.sprites.ready ? this.sprites.meta.eyeR * this.zoom / 2.7 : 11 * this.zoom) * this.pose.eyeScale;
    return this.showGirl && this.eyeCenters().some(([ex, ey]) => Math.hypot(x - ex, y - ey) < r);
  }

  isOnFace(x, y) {
    if (this.sprites.ready) {
      const [fx, fy] = this.sprites.faceCenter(this.zoom, this.ty);
      const r = this.sprites.meta.faceR * this.zoom / 2.7;
      return this.showGirl && Math.hypot(x - fx, y - fy) < r;
    }
    const v = this.view();
    return this.showGirl && Math.hypot((x - v.X(160)) / (32 * this.zoom), (y - v.Y(92)) / (36 * this.zoom)) < 1;
  }

  isOnBill(x, y) {
    const spot = BILL_SPOTS[this.bg];
    return spot && Math.abs(x - spot[0]) < 9 && Math.abs(y - spot[1]) < 9;
  }

  burst(type, n = 12) {
    const [[lx, ly], [rx, ry]] = this.eyeCenters();
    for (let i = 0; i < n; i++) {
      const fromEye = type === 'star' && i % 2;
      this.particles.push({
        type,
        x: fromEye ? (i % 4 ? lx : rx) : 160 + (Math.random() - 0.5) * 120,
        y: fromEye ? (i % 4 ? ly : ry) : 80 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 50,
        life: 1.2 + Math.random(), size: 1 + Math.random() * 2,
      });
    }
  }

  update(dt, t) {
    const p = this.pose;
    this.boost = Math.max(0, this.boost - dt * 0.35);
    const b = this.boost;
    p.eyeScale = 1 + 0.13 * b;
    p.pupilScale = 1 + 0.28 * b;
    p.starScale = 1 + 0.55 * b;
    p.highlights = this.highlights;
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 5);
    this.ty += (this.tyTarget - this.ty) * Math.min(1, dt * 5);
    this.updateLook(dt);
    this.updateBlink(dt);
    for (const k of Object.keys(this.fx)) if (k !== 'red' && k !== 'dim') this.fx[k] = Math.max(0, this.fx[k] - dt * (k === 'melt' || k === 'fire' ? 0.25 : 1.2));
    this.particles = this.particles
      .map((q) => ({ ...q, x: q.x + q.vx * dt, y: q.y + q.vy * dt, vy: q.vy + (q.type === 'fire' ? -40 : 30) * dt, life: q.life - dt }))
      .filter((q) => q.life > 0);
    if (this.fx.fire > 0.05) for (let i = 0; i < 6; i++) this.particles.push({ type: 'fire', x: Math.random() * W, y: H + 4, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 80, life: 1.5, size: 2 + Math.random() * 3 });
  }

  updateLook(dt) {
    const p = this.pose;
    let tx = 0, ty = 0;
    if (this.mouse) {
      const v = this.view();
      tx = Math.max(-1, Math.min(1, (this.mouse.x - v.X(160)) / 90));
      ty = Math.max(-1, Math.min(1, (this.mouse.y - v.Y(91)) / 70));
    }
    p.lookX += (tx - p.lookX) * Math.min(1, dt * 8);
    p.lookY += (ty - p.lookY) * Math.min(1, dt * 8);
  }

  // Natural blink: lids half-close (50 ms) -> closed (70 ms) -> half-open (50 ms) -> open.
  // Every 2-6 s, sometimes a quick double blink.
  updateBlink(dt) {
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0;
      this.blinkIn = Math.random() < 0.2 ? 0.28 : 2 + Math.random() * 4;
    }
    if (this.blinkT === undefined || this.blinkT === null) { this.pose.blink = 0; return; }
    this.blinkT += dt;
    const t = this.blinkT;
    this.pose.blink = t < BLINK_HALF ? 1 : t < BLINK_HALF + BLINK_CLOSED ? 2 : t < BLINK_HALF * 2 + BLINK_CLOSED ? 1 : 0;
    if (this.pose.blink === 0) this.blinkT = null;
  }

  render(t) {
    const { ctx, fx } = this;
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    if (fx.shake > 0) {
      // zoom in a little while shaking so the moved picture never uncovers the screen's edge
      const z = 1 + 0.06 * Math.min(1, fx.shake);
      ctx.translate(W / 2, H / 2);
      ctx.scale(z, z);
      ctx.translate(-W / 2 + Math.round((Math.random() - 0.5) * 8 * fx.shake), -H / 2 + Math.round((Math.random() - 0.5) * 6 * fx.shake));
    }
    const bg = this.bgs[this.bg];
    if (bg) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#123'; ctx.fillRect(0, 0, W, H); }
    this.drawBill(t);
    if (this.showGirl) this.drawCharacter(t);
    this.drawParticles();
    if (fx.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${fx.dim})`; ctx.fillRect(0, 0, W, H); }
    if (fx.red > 0) this.tint(`rgba(200,0,40,${0.35 * fx.red})`);
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    if (fx.melt > 0) this.melt(fx.melt, t);
    if (fx.glitch > 0 || fx.red > 0.5) this.glitch(Math.max(fx.glitch, fx.red * 0.3 * (Math.sin(t * 7) > 0.6 ? 1 : 0)));
  }

  drawCharacter(t) {
    if (this.sprites?.ready) { this.sprites.draw(this.ctx, this.pose, t, this.zoom, this.ty); return; }
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.raster.clear();
    drawGiffany(this.drawView(), this.pose, t);
    this.raster.blitTo(ctx);
    ctx.restore();
  }

  tint(color) {
    this.ctx.globalCompositeOperation = 'multiply'; // called inside the scaled transform
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, W, H);
    this.ctx.globalCompositeOperation = 'source-over';
  }

  drawBill(t) {
    const spot = BILL_SPOTS[this.bg];
    if (!spot) return;
    const [x, y] = spot, c = this.ctx;
    c.fillStyle = '#e8c33a';
    for (let i = 0; i < 7; i++) c.fillRect(x - i, y - 3 + i, i * 2 + 1, 1);
    c.fillStyle = '#fff'; c.fillRect(x - 1, y + 1, 3, 2);
    c.fillStyle = '#000'; c.fillRect(x + (Math.sin(t) > 0 ? 0 : -1), y + 1, 1, 2);
  }

  drawParticles() {
    const c = this.ctx;
    for (const q of this.particles) {
      const a = Math.min(1, q.life);
      if (q.type === 'heart') {
        c.fillStyle = `rgba(255,80,150,${a})`;
        HEART.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && c.fillRect(Math.round(q.x) + i - 3, Math.round(q.y) + j - 3, 1, 1)));
      } else if (q.type === 'fire') {
        c.fillStyle = q.life > 1 ? '#ffe066' : q.life > 0.5 ? '#ff8a2a' : '#c22a1a';
        c.fillRect(Math.round(q.x), Math.round(q.y), Math.ceil(q.size), Math.ceil(q.size));
      } else {
        const s = Math.round(q.size + 1);
        c.fillStyle = `rgba(255,255,220,${a})`;
        c.fillRect(Math.round(q.x) - s, Math.round(q.y), s * 2 + 1, 1);
        c.fillRect(Math.round(q.x), Math.round(q.y) - s, 1, s * 2 + 1);
      }
    }
  }

  glitch(amount) {
    const { ctx } = this;
    const img = ctx.getImageData(0, 0, PW, PH);
    const d = img.data, src = new Uint8ClampedArray(d);
    const bands = Math.ceil(amount * 10);
    for (let k = 0; k < bands; k++) {
      const y0 = Math.floor(Math.random() * PH), h = (2 + Math.floor(Math.random() * 14)) * SCALE;
      const shift = Math.round((Math.random() - 0.5) * 40 * amount) * SCALE;
      for (let y = y0; y < Math.min(PH, y0 + h); y++) {
        for (let x = 0; x < PW; x++) {
          const sx = Math.min(PW - 1, Math.max(0, x - shift));
          const i = (y * PW + x) * 4, j = (y * PW + sx) * 4;
          d[i] = src[j + 4] ?? src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[Math.max(0, j - 4) + 2];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  melt(amount, t) {
    const { ctx } = this;
    const img = ctx.getImageData(0, 0, PW, PH);
    const d = img.data, src = new Uint8ClampedArray(d);
    const strength = ((1 - amount) * 120 + 10) * SCALE;
    for (let x = 0; x < PW; x++) {
      const drop = Math.max(0, Math.sin(Math.floor(x / SCALE) * 0.37 + t) * 0.5 + 0.5) * strength;
      for (let y = PH - 1; y >= 0; y--) {
        const sy = Math.max(0, Math.floor(y - drop));
        const i = (y * PW + x) * 4, j = (sy * PW + x) * 4;
        d[i] = Math.min(255, src[j] * 1.2); d[i + 1] = src[j + 1] * 0.6; d[i + 2] = src[j + 2] * 0.5;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
