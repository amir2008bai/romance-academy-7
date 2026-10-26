// Tiny software rasterizer that draws hard-edged pixels (no anti-aliasing),
// so everything we draw at 320x240 reads as real pixel art when upscaled.

export function rgba(hex, a = 255) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
    this.mask = null; // optional Set of colors that may be overwritten
  }

  clear() { this.data.fill(0); }

  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (this.mask && !this.mask.has(this.data[i])) return;
    this.data[i] = c;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y | 0) * this.w + (x | 0)];
  }

  rect(x, y, w, h, c) {
    for (let j = Math.round(y); j < Math.round(y + h); j++)
      for (let i = Math.round(x); i < Math.round(x + w); i++) this.px(i, j, c);
  }

  ellipse(cx, cy, rx, ry, c) {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const dx = rx * Math.sqrt(1 - dy * dy);
      for (let x = Math.round(cx - dx); x < Math.round(cx + dx); x++) this.px(x, y, c);
    }
  }

  poly(pts, c) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, c);
    }
  }

  line(x0, y0, x1, y1, c, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = Math.floor((th - 1) / 2);
    for (;;) {
      if (th === 1) this.px(x0, y0, c); else this.rect(x0 - o, y0 - o, th, th, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  polyline(pts, c, th = 1) {
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, th);
  }

  // Outline every empty pixel that touches a filled one (4-neighbourhood).
  outline(c) {
    const { w, h, data } = this;
    const src = data.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) continue;
        if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) data[i] = c;
      }
    }
  }

  withMask(colors, fn) {
    const prev = this.mask;
    this.mask = new Set(colors);
    fn();
    this.mask = prev;
  }

  blitTo(ctx, x = 0, y = 0) {
    if (!this._img) {
      this._canvas = document.createElement('canvas');
      this._canvas.width = this.w;
      this._canvas.height = this.h;
      this._cctx = this._canvas.getContext('2d');
      this._img = this._cctx.createImageData(this.w, this.h);
    }
    new Uint32Array(this._img.data.buffer).set(this.data);
    this._cctx.putImageData(this._img, 0, 0);
    ctx.drawImage(this._canvas, x, y);
  }
}

// Same drawing API as Raster, but scaled around an anchor, so a sprite designed
// once can be drawn as a full-body shot or a close-up while staying pixel-crisp.
export class View {
  constructor(r, k, ax, ay, tx = ax, ty = ay) {
    Object.assign(this, { r, k, ax, ay, tx, ty });
  }
  X(x) { return this.tx + (x - this.ax) * this.k; }
  Y(y) { return this.ty + (y - this.ay) * this.k; }
  P(pts) { return pts.map(([x, y]) => [this.X(x), this.Y(y)]); }
  T(th) { return Math.max(1, Math.round(th * this.k)); }
  px(x, y, c) { this.r.rect(this.X(x), this.Y(y), this.T(1), this.T(1), c); }
  rect(x, y, w, h, c) { this.r.rect(this.X(x), this.Y(y), w * this.k, h * this.k, c); }
  ellipse(cx, cy, rx, ry, c) { this.r.ellipse(this.X(cx), this.Y(cy), rx * this.k, ry * this.k, c); }
  poly(pts, c) { this.r.poly(this.P(pts), c); }
  line(x0, y0, x1, y1, c, th = 1) { this.r.line(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), c, this.T(th)); }
  polyline(pts, c, th = 1) { this.r.polyline(this.P(pts), c, this.T(th)); }
  outline(c) { this.r.outline(c); }
  withMask(colors, fn) { this.r.withMask(colors, fn); }
}

// Points on an ellipse arc, useful for cables and curves.
export function arc(cx, cy, rx, ry, a0, a1, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// Quadratic bezier sampled into points.
export function bezier(p0, p1, p2, steps = 12) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
  }
  return pts;
}
