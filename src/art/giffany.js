// Parametric pixel-art Giffany. Everything is drawn from numbers each frame,
// so eye size, pupils and star highlights can grow with every compliment.
import { rgba, arc, bezier } from './raster.js';

const C = {
  line: rgba('#3a1430'), lineSoft: rgba('#7a2a5a'),
  skin: rgba('#f8d2ae'), skinShade: rgba('#e8a985'),
  hair: rgba('#ff5fa8'), hairLight: rgba('#ff9fcd'), hairShade: rgba('#d8347f'), hairDark: rgba('#a51f66'),
  pink: rgba('#ff4f98'), yellow: rgba('#ffe066'), blue: rgba('#46cbe6'), white: rgba('#ffffff'),
  conn: rgba('#3b7fd6'), connDark: rgba('#22508e'), metal: rgba('#c7cfda'), pin: rgba('#f2f6fa'),
  shirt: rgba('#fdfdff'), shirtShade: rgba('#cfd6ee'), collar: rgba('#2fb2d8'), collarDark: rgba('#1b7ea6'),
  bow: rgba('#ff4f8f'), bowDark: rgba('#c22a68'), skirt: rgba('#2a9fcc'),
  irisTop: rgba('#7d1a4c'), irisMid: rgba('#cf3a74'), irisLow: rgba('#ff8db9'), pupil: rgba('#33102a'),
  sclera: rgba('#ffffff'), blush: rgba('#ff8ea6'), mouth: rgba('#9a2045'), tongue: rgba('#ff7b9c'), teeth: rgba('#ffffff'),
  book: rgba('#5fd0e8'), bookDark: rgba('#2c8db0'), bookPage: rgba('#fff7e0'),
  shadow: rgba('#5a1d4a', 120),
};

export const GIFFANY_COLORS = C;

export function defaultPose() {
  return {
    mood: 'normal', pose: 'idle', mouth: 'smile',
    eyeScale: 1, pupilScale: 1, starScale: 1, highlights: 1,
    lookX: 0, lookY: 0, blink: 0, blush: 0, talking: false, glitch: 0,
  };
}

export function drawGiffany(r, s, t) {
  const cx = 160; // design space: 320x240, head centre (160, 88)
  const by = Math.round(Math.sin(t * 2.2) * 1.2); // breathing
  const sway = Math.sin(t * 1.6) * 2.5;
  drawHairBack(r, cx, by, sway);
  drawCablesBack(r, cx, by, sway);
  drawBody(r, cx, by, s);
  drawHead(r, cx, by, s, t);
  drawBow(r, cx, by, t);
  r.outline(C.line);
  drawArmsFront(r, cx, by, s, t);
}

function drawHairBack(r, cx, by, sway) {
  r.ellipse(cx, 84 + by, 42, 44, C.hair);
  r.poly([[cx - 42, 84 + by], [cx + 42, 84 + by], [cx + 72 + sway, 260], [cx - 72 + sway, 260]], C.hair);
  r.poly([[cx - 42, 100 + by], [cx - 34, 100 + by], [cx - 50 + sway, 260], [cx - 72 + sway, 260]], C.hairShade);
  r.poly([[cx + 34, 100 + by], [cx + 42, 100 + by], [cx + 72 + sway, 260], [cx + 52 + sway, 260]], C.hairShade);
  for (let i = -2; i <= 2; i++) r.line(cx + i * 14, 120 + by, cx + i * 22 + sway, 258, C.hairDark);
}

function cable(r, pts, width = 2) {
  const cols = [C.pink, C.yellow, C.blue];
  for (let k = 0; k < 3; k++) {
    const off = (k - 1) * width;
    const shifted = pts.map(([x, y], i) => {
      const [nx, ny] = normalAt(pts, i);
      return [x + nx * off, y + ny * off];
    });
    r.polyline(shifted, cols[k], width);
  }
}

function normalAt(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

function connector(r, x, y) {
  r.rect(x - 9, y, 18, 9, C.conn);
  r.rect(x - 9, y + 7, 18, 2, C.connDark);
  for (let i = -7; i <= 6; i += 3) r.rect(x + i, y + 2, 2, 3, C.pin);
  r.rect(x - 4, y - 3, 8, 3, C.metal);
}

function drawCablesBack(r, cx, by, sway) {
  const left = bezier([cx - 12, 50 + by], [cx - 74, 58 + by], [cx - 58 + sway, 132 + by], 20);
  const right = bezier([cx + 12, 50 + by], [cx + 74, 58 + by], [cx + 58 + sway, 132 + by], 20);
  cable(r, left, 3);
  cable(r, right, 3);
  connector(r, cx - 58 + sway, 132 + by);
  connector(r, cx + 58 + sway, 132 + by);
}

function drawBow(r, cx, by, t) {
  const wob = Math.sin(t * 3) * 0.8;
  const loopL = arc(cx - 27, 38 + by, 24, 14 + wob, -Math.PI * 0.05, Math.PI * 2 - 0.1, 30);
  const loopR = arc(cx + 27, 38 + by, 24, 14 - wob, Math.PI * 1.05, Math.PI * 3 - 0.1, 30);
  cable(r, loopL, 3);
  cable(r, loopR, 3);
  r.rect(cx - 7, 34 + by, 14, 12, C.metal);
  r.rect(cx - 5, 36 + by, 10, 6, C.conn);
  r.rect(cx - 3, 37 + by, 6, 2, C.pin);
  r.rect(cx - 7, 44 + by, 14, 2, C.lineSoft);
}

function drawBody(r, cx, by, s) {
  // neck
  r.rect(cx - 7, 116 + by, 14, 22, C.skin);
  r.rect(cx - 7, 124 + by, 14, 4, C.skinShade);
  // torso
  r.poly([[cx - 36, 146 + by], [cx + 36, 146 + by], [cx + 46, 240], [cx - 46, 240]], C.shirt);
  r.poly([[cx + 22, 160 + by], [cx + 36, 150 + by], [cx + 46, 240], [cx + 30, 240]], C.shirtShade);
  // shoulders / puffed sleeves
  r.ellipse(cx - 38, 156 + by, 13, 13, C.shirt);
  r.ellipse(cx + 38, 156 + by, 13, 13, C.shirt);
  r.rect(cx - 51, 162 + by, 26, 5, C.collar);
  r.rect(cx + 25, 162 + by, 26, 5, C.collar);
  // sailor collar with ribbon-cable stripes
  r.poly([[cx - 40, 140 + by], [cx + 40, 140 + by], [cx + 44, 156 + by], [cx, 186 + by], [cx - 44, 156 + by]], C.collar);
  r.poly([[cx - 18, 140 + by], [cx + 18, 140 + by], [cx, 176 + by]], C.shirt);
  r.polyline([[cx - 42, 150 + by], [cx, 180 + by], [cx + 42, 150 + by]], C.pink, 2);
  r.polyline([[cx - 42, 154 + by], [cx, 184 + by], [cx + 42, 154 + by]], C.yellow, 1);
  // pink bow
  r.poly([[cx, 178 + by], [cx - 14, 170 + by], [cx - 14, 186 + by]], C.bow);
  r.poly([[cx, 178 + by], [cx + 14, 170 + by], [cx + 14, 186 + by]], C.bow);
  r.poly([[cx - 2, 180 + by], [cx - 8, 200 + by], [cx - 3, 199 + by]], C.bowDark);
  r.poly([[cx + 2, 180 + by], [cx + 8, 200 + by], [cx + 3, 199 + by]], C.bowDark);
  r.rect(cx - 3, 175 + by, 6, 6, C.bowDark);
  // skirt peeking at the bottom
  r.poly([[cx - 46, 232], [cx + 46, 232], [cx + 50, 240], [cx - 50, 240]], C.skirt);
  // arms down by default (other poses draw in front later)
  if (s.pose === 'idle' || s.pose === 'point') {
    r.poly([[cx - 50, 168 + by], [cx - 40, 168 + by], [cx - 46, 226], [cx - 56, 224]], C.skin);
    if (s.pose === 'idle') r.poly([[cx + 40, 168 + by], [cx + 50, 168 + by], [cx + 56, 224], [cx + 46, 226]], C.skin);
  }
}

function drawHead(r, cx, by, s, t) {
  const hy = 88 + by;
  // face
  r.ellipse(cx, hy, 31, 30, C.skin);
  r.poly([[cx - 30, hy + 2], [cx + 30, hy + 2], [cx + 18, hy + 26], [cx, hy + 33], [cx - 18, hy + 26]], C.skin);
  // ears hidden by side locks; side locks
  r.poly([[cx - 33, hy - 20], [cx - 22, hy - 20], [cx - 24, hy + 40], [cx - 34, hy + 52]], C.hair);
  r.poly([[cx + 22, hy - 20], [cx + 33, hy - 20], [cx + 34, hy + 52], [cx + 24, hy + 40]], C.hair);
  r.line(cx - 28, hy - 10, cx - 30, hy + 44, C.hairLight);
  r.line(cx + 28, hy - 10, cx + 30, hy + 44, C.hairLight);
  // blunt bangs with a jagged edge
  const bang = [[cx - 34, hy - 18], [cx - 30, hy - 40], [cx, hy - 46], [cx + 30, hy - 40], [cx + 34, hy - 18]];
  for (let x = cx + 30; x >= cx - 30; x -= 6) bang.push([x, hy - 14 + ((x / 6) % 2 === 0 ? 3 : 0)], [x - 3, hy - 9]);
  r.poly(bang, C.hair);
  r.polyline([[cx - 20, hy - 38], [cx - 6, hy - 42], [cx + 10, hy - 41]], C.hairLight, 2);
  for (let x = cx - 24; x <= cx + 24; x += 12) r.line(x, hy - 30, x - 1, hy - 14, C.hairShade);
  if (s.mood === 'yandere') r.withMask([C.skin, C.skinShade], () => r.rect(cx - 31, hy - 14, 62, 10, C.shadow));
  drawBrows(r, cx, hy, s);
  drawEye(r, cx - 15, hy + 3, s, t, -1);
  drawEye(r, cx + 15, hy + 3, s, t, 1);
  drawBlush(r, cx, hy, s);
  drawMouth(r, cx, hy + 22, s, t);
}

function drawBrows(r, cx, hy, s) {
  const angry = s.mood === 'angry' || s.mood === 'yandere';
  const sad = s.mood === 'sad';
  for (const side of [-1, 1]) {
    const x0 = cx + side * 6, x1 = cx + side * 22;
    const inner = angry ? hy - 8 : sad ? hy - 13 : hy - 12;
    const outer = angry ? hy - 13 : sad ? hy - 9 : hy - 12;
    r.line(x0, inner, x1, outer, C.lineSoft, angry ? 2 : 1);
  }
}

function drawEye(r, ex, ey, s, t, side) {
  const k = s.eyeScale;
  const rx = 8.5 * k, ry = 11 * k;
  if (s.blink > 0.5 || s.mood === 'happy') {
    const pts = s.mood === 'happy' ? arc(ex, ey + 3, rx, 5, Math.PI, Math.PI * 2, 10) : arc(ex, ey - 1, rx, 3, 0, Math.PI, 10);
    r.polyline(pts, C.line, 2);
    return;
  }
  const narrow = s.mood === 'angry' ? 4 : 0;
  r.ellipse(ex, ey, rx, ry - narrow / 2, C.sclera);
  const yan = s.mood === 'yandere';
  const ir = yan ? 0.55 : 1;
  const ix = ex + s.lookX * 2 * k, iy = ey + s.lookY * 1.5 * k + (yan ? 0 : 1);
  r.withMask([C.sclera], () => {
    r.ellipse(ix, iy, 6.8 * k * ir, 9.4 * k * ir, C.irisMid);
    r.withMask([C.irisMid], () => {
      r.rect(ix - 9 * k, iy - 11 * k, 18 * k, 5.4 * k * ir, C.irisTop);
      r.rect(ix - 9 * k, iy + 3.6 * k * ir, 18 * k, 7 * k, C.irisLow);
    });
  });
  const p = s.pupilScale * (yan ? 0.35 : 1);
  r.withMask([C.irisMid, C.irisTop, C.irisLow], () => r.ellipse(ix, iy, 2.9 * k * p, 4.1 * k * p, C.pupil));
  if (!yan && s.mood !== 'angry') drawStars(r, ix, iy, k, s, t, side);
  // upper lash (thick) with an outer flick, lower lash thin
  const top = arc(ex, ey + 1, rx + 1, ry + 1 - narrow, Math.PI * 1.08, Math.PI * 1.92, 12);
  r.polyline(top, C.line, 2);
  const end = top[side < 0 ? 0 : top.length - 1];
  r.line(end[0], end[1], end[0] + side * 3, end[1] - 2, C.line, 2);
  r.polyline(arc(ex, ey, rx - 1, ry, Math.PI * 0.25, Math.PI * 0.75, 6), C.lineSoft, 1);
  if (s.mood === 'angry') r.withMask([C.sclera, C.irisMid, C.irisTop, C.irisLow, C.pupil], () =>
    r.poly([[ex - rx - 2, ey - ry - 2], [ex + rx + 2, ey - ry - 2], [ex + side * -rx, ey - 2], [ex + side * rx, ey - 6]], C.skin));
}

// Star highlights: one more star per compliment (up to 7); they swell with starScale.
function drawStars(r, ix, iy, k, s, t, side) {
  const slots = [[-2.2, -3.4, 1], [2.4, 2.8, 0.6], [2.6, -3.6, 0.55], [-2.8, 2.2, 0.5], [0.2, -5.4, 0.45], [-0.4, 4.4, 0.45], [3.6, -0.2, 0.4]];
  const n = Math.max(1, Math.min(7, s.highlights));
  for (let i = 0; i < n; i++) {
    const [ox, oy, size] = slots[i];
    const pulse = 1 + Math.sin(t * 6 + i * 1.7) * 0.12;
    const sz = Math.max(1, size * 2.6 * k * s.starScale * pulse);
    star(r, ix + ox * k - side * 0.4, iy + oy * k, sz);
  }
}

export function star(r, x, y, size, c = C.white) {
  const s = Math.round(size);
  r.line(x - s, y, x + s, y, c);
  r.line(x, y - s, x, y + s, c);
  if (s >= 2) r.rect(x - 1, y - 1, 2, 2, c);
  if (s >= 3) { r.line(x - s + 2, y - 1, x + s - 2, y - 1, c); r.line(x - 1, y - s + 2, x - 1, y + s - 2, c); }
}

function drawBlush(r, cx, hy, s) {
  const strength = Math.max(0.35, s.blush);
  const w = 4 + strength * 3;
  for (const side of [-1, 1]) {
    r.withMask([C.skin, C.skinShade], () => r.ellipse(cx + side * 19, hy + 13, w, 2.5, C.blush));
    if (strength > 0.6) for (let i = -1; i <= 1; i++) r.line(cx + side * 19 + i * 3 - 1, hy + 14, cx + side * 19 + i * 3 + 1, hy + 12, C.lineSoft);
  }
  r.px(cx - 23, hy + 9, C.white);
  r.px(cx + 23, hy + 9, C.white);
}

function drawMouth(r, mx, my, s, t) {
  let m = s.mouth;
  if (s.talking) m = Math.sin(t * 18) > 0 ? (m === 'shout' ? 'shout' : 'open') : 'small';
  switch (m) {
    case 'open': r.ellipse(mx, my + 1, 4, 3.5, C.mouth); r.ellipse(mx, my + 3, 3, 1.5, C.tongue); break;
    case 'small': r.line(mx - 2, my, mx + 2, my, C.mouth); break;
    case 'o': r.ellipse(mx, my + 1, 2.5, 3, C.mouth); break;
    case 'grin':
      r.poly([[mx - 7, my - 1], [mx + 7, my - 1], [mx + 3, my + 5], [mx - 3, my + 5]], C.mouth);
      r.rect(mx - 6, my - 1, 12, 2, C.teeth); r.ellipse(mx, my + 4, 3, 1.4, C.tongue); break;
    case 'shout':
      r.poly([[mx - 9, my - 3], [mx + 9, my - 3], [mx + 6, my + 9], [mx - 6, my + 9]], C.mouth);
      r.rect(mx - 8, my - 3, 16, 2, C.teeth); r.ellipse(mx, my + 7, 4, 2, C.tongue); break;
    case 'scream': {
      r.poly([[mx - 13, my - 6], [mx + 13, my - 6], [mx + 9, my + 14], [mx - 9, my + 14]], C.mouth);
      for (let x = mx - 12; x < mx + 12; x += 4) {
        r.poly([[x, my - 6], [x + 4, my - 6], [x + 2, my - 1]], C.teeth);
        r.poly([[x + 1, my + 14], [x + 5, my + 14], [x + 3, my + 9]], C.teeth);
      }
      break;
    }
    case 'frown': r.polyline(arc(mx, my + 4, 4, 3, Math.PI * 1.15, Math.PI * 1.85, 6), C.mouth, 1); break;
    default: r.polyline(arc(mx, my - 2, 4, 3, Math.PI * 0.15, Math.PI * 0.85, 6), C.mouth, 1);
  }
}

function drawArmsFront(r, cx, by, s, t) {
  const skin = (pts) => r.poly(pts, C.skin);
  if (s.pose === 'excited') {
    skin([[cx - 50, 166 + by], [cx - 40, 166 + by], [cx - 22, 190 + by], [cx - 30, 198 + by]]);
    skin([[cx + 40, 166 + by], [cx + 50, 166 + by], [cx + 30, 198 + by], [cx + 22, 190 + by]]);
    fist(r, cx - 22, 186 + by); fist(r, cx + 22, 186 + by);
  } else if (s.pose === 'books') {
    r.rect(cx - 26, 176 + by, 52, 40, C.book);
    r.rect(cx - 26, 176 + by, 6, 40, C.bookDark);
    r.rect(cx + 22, 178 + by, 4, 36, C.bookPage);
    r.polyline([[cx - 27, 175 + by], [cx + 26, 175 + by], [cx + 26, 216 + by], [cx - 27, 216 + by], [cx - 27, 175 + by]], C.line);
    fist(r, cx - 20, 196 + by); fist(r, cx + 20, 192 + by);
  } else if (s.pose === 'point') {
    skin([[cx + 40, 166 + by], [cx + 50, 166 + by], [cx + 84, 150 + by], [cx + 82, 142 + by]]);
    fist(r, cx + 86, 144 + by);
    r.rect(cx + 90, 142 + by, 8, 3, C.skin);
  } else if (s.pose === 'fist') {
    skin([[cx + 40, 166 + by], [cx + 50, 166 + by], [cx + 60, 128 + by], [cx + 50, 126 + by]]);
    fist(r, cx + 56, 120 + by + Math.round(Math.sin(t * 20) * 2));
  } else if (s.pose === 'scream') {
    fist(r, cx - 30, 108 + by); fist(r, cx + 30, 108 + by);
  }
}

function fist(r, x, y) {
  r.ellipse(x, y, 7, 6, C.skin);
  r.line(x - 4, y - 1, x + 4, y - 1, C.skinShade);
  r.line(x - 4, y + 2, x + 4, y + 2, C.skinShade);
  r.polyline(arc(x, y, 7, 6, 0, Math.PI * 2, 14), C.line, 1);
}
