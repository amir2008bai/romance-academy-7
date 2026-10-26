// Map an element's rectangle onto an arbitrary quad with CSS matrix3d
// (projective homography), so the live game screen sticks to the 3D monitor.

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * @param {number} w element width in px
 * @param {number} h element height in px
 * @param {number[][]} quad target corners [TL, TR, BR, BL] in px
 * @returns {string} CSS transform value
 */
export function quadTransform(w, h, quad) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const [a, bb, c, d, e, f, g, hh] = solve(A, b);
  const m = [a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((x) => x.toFixed(8)).join(',')})`;
}

// Linear interpolation between tracked frames for smooth sub-frame motion.
export function quadAt(track, seconds) {
  const f = (seconds * track.fps) % track.frames;
  const i = Math.floor(f), j = (i + 1) % track.frames, k = f - i;
  return track.quads[i].map(([x, y], n) => [x + (track.quads[j][n][0] - x) * k, y + (track.quads[j][n][1] - y) * k]);
}
