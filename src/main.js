// Boot, camera, main loop and session management.
import { UI, ACHIEVEMENTS } from './i18n.js';
import { AudioSystem } from './audio/audio.js';
import { ScreenRenderer, W, H } from './game/renderer.js';
import { ScreenUI } from './game/ui.js';
import { Engine } from './game/engine.js';
import { SaveStore, newState } from './game/save.js';
import { Shell } from './shell.js';
import { quadTransform, quadAt } from './quad.js';

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage'), world = $('#world'), screenEl = $('#screen');
const store = new SaveStore();
let profile = store.loadProfile();
const audio = new AudioSystem();
const renderer = new ScreenRenderer($('#game'));
let story = null, engine = null, ui = null;
let mode = 'menu';
let screenBox = { x: 0.5125, y: 0.2285, w: 0.2734, h: 0.352 };
const parallax = { x: 0, y: 0 };
const video = $('#menu-video');
let track = null; // per-frame monitor-screen corners of the 3D menu loop

// ---------- profile ----------
function saveProfile(patch) {
  profile = { ...profile, ...patch };
  store.saveProfile(profile);
  shell.profile = profile;
}

function achieve(id) {
  if (!ACHIEVEMENTS[id] || profile.achievements.includes(id)) return;
  saveProfile({ achievements: [...profile.achievements, id] });
  audio.sfx('achievement');
  shell.achievementToast(id);
}

const shell = new Shell({
  profile, store, audio,
  actions: {
    resume: () => resume(),
    newGame: () => startSession(newState(), true),
    loadFrom: (slot) => { const s = store.loadSlot(slot); if (s) startSession(s, false); },
    saveTo: (slot) => !!engine && !engine.ended && store.saveSlot(slot, engine.state),
    setLang: (lang) => { saveProfile({ lang }); refreshTexts(); },
    setVolume: (kind, v) => { saveProfile({ volumes: { ...profile.volumes, [kind]: v } }); audio.setVolume(kind, v); },
    setCrt: (on) => { saveProfile({ crt: on }); stage.classList.toggle('crt-on', on); },
    testVoice: () => { audio.unlock(); menuVoice(); },
    setBackground: (bg) => { saveProfile({ bg }); location.reload(); },
    setView: (view) => { saveProfile({ view }); if (mode !== 'menu') setMode(view); shell.renderRoomControls(); },
    toMenu: () => toMenu(),
    achieve,
  },
});

function refreshTexts() {
  shell.render(!!engine && !engine.ended);
  ui?.setLabels(UI[profile.lang]);
}

// ---------- camera ----------
function applyCamera() {
  // The painted room must never be moved or scaled on its own: the game screen and the glass mask are
  // placed in the image's coordinates, so any parallax on the picture made the monitor "slide off" the game.
  $('.room-blur').style.transform = '';
  if (mode === 'full') { world.style.transform = 'none'; return; } // game only: no room, no camera
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const cx = screenBox.x + screenBox.w / 2, cy = screenBox.y + screenBox.h / 2;
  if (track) { world.style.transform = mode === 'full' ? fullShotOnTrack(sw, sh) : mode === 'menu' && profile.bg === '3d' ? menuShotOnTrack(sw, sh) : 'none'; return; }
  let s = 1, fx = 0.5, fy = 0.5, tx = 0.5, ty = 0.5;
  if (mode === 'menu') { s = 1.16; fx = cx; fy = cy; tx = 0.68 + parallax.x * 0.006; ty = 0.47 + parallax.y * 0.006; }
  if (mode === 'full') { s = Math.min(0.97 / screenBox.w, 0.97 / screenBox.h); fx = cx; fy = cy; }
  const x = tx * sw - fx * sw * s, y = ty * sh - fy * sh * s;
  world.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
}

// Menu: a gentle push-in that keeps the monitor to the right of the menu panel.
function menuShotOnTrack(sw, sh) {
  const MENU_ZOOM = 1.3;
  const q = track.quads[0];
  const cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4;
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v));
  const x = clamp(0.7 * sw - cx * sw * MENU_ZOOM, sw - sw * MENU_ZOOM);
  const y = clamp(0.5 * sh - cy * sh * MENU_ZOOM, sh - sh * MENU_ZOOM);
  return `translate(${x}px, ${y}px) scale(${MENU_ZOOM})`;
}

// Zoom the whole world (video + screen) so the tracked monitor fills the stage.
function fullShotOnTrack(sw, sh) {
  const q = track.quads[0];
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const s = Math.min(0.97 / w, 0.97 / h);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return `translate(${sw / 2 - cx * sw * s}px, ${sh / 2 - cy * sh * s}px) scale(${s})`;
}

function placeScreenStatic() {
  Object.assign(screenEl.style, { left: `${screenBox.x * 100}%`, top: `${screenBox.y * 100}%`, width: `${screenBox.w * 100}%`, height: `${screenBox.h * 100}%`, transform: '' });
  screenEl.classList.remove('tracked');
  screenEl.classList.add('placed');
}

// In the 3D menu loop the screen follows the tracked monitor corners.
function placeScreenTracked() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const w = sw * 0.3, h = w * 0.75;
  const quad = quadAt(track, video.currentTime || 0).map(([x, y]) => [x * sw, y * sh]);
  Object.assign(screenEl.style, { left: '0px', top: '0px', width: `${w}px`, height: `${h}px`, transform: quadTransform(w, h, quad) });
  screenEl.classList.add('tracked', 'placed');
}

// "Game only" view: the 4:3 game, as big as fits, centred; the rest of the stage stays black.
function placeScreenFull() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  let h = sh, w = h * (4 / 3);
  if (w > sw) { w = sw; h = w * 0.75; }
  Object.assign(screenEl.style, { left: `${(sw - w) / 2}px`, top: `${(sh - h) / 2}px`, width: `${w}px`, height: `${h}px`, transform: '' });
  screenEl.classList.remove('tracked');
  screenEl.classList.add('placed');
}

function setMode(next) {
  mode = next;
  pickPaintedTrack();
  if (track && profile.bg === '3d') video.play().catch(() => {});
  if (!track) placeScreenStatic();
  stage.classList.remove('mode-menu', 'mode-room', 'mode-full');
  stage.classList.add(`mode-${next}`);
  applyCamera();
}

function staticFlash() {
  const f = $('#static-flash');
  f.classList.remove('on');
  void f.offsetWidth; // restart the animation
  f.classList.add('on');
  audio.sfx('static');
}

// ---------- sessions ----------
function persist(slot, state) { store.saveSlot(slot, state); }

function startSession(state, fresh) {
  audio.unlock();
  if (engine) engine.dead = true;
  ui?.root.remove();
  ui = new ScreenUI(screenEl, audio);
  ui.setLabels(UI[profile.lang]);
  renderer.showGirl = true;
  renderer.fx = { ...renderer.fx, red: 0, melt: 0, dim: 0 };
  engine = new Engine({
    renderer, ui, audio, story, ui18n: UI,
    getLang: () => profile.lang,
    onAchievement: achieve,
    onSave: persist,
    onExit: (ending) => { if (ending) engine = null; toMenu(); refreshTexts(); },
  });
  const session = engine;
  // the start fires after the camera move; skip it if another session replaced this one meanwhile
  enterGame(() => {
    if (engine !== session || mode === 'menu') return;
    if (fresh) titleScreen(() => engine === session && session.start(state, true));
    else session.start(state, false);
  });
}

function enterGame(then) {
  shell.closeModal();
  staticFlash();
  audio.sfx('crt');
  setMode(profile.view);
  stage.classList.add('osd-on');
  setTimeout(() => stage.classList.remove('osd-on'), 2200);
  if (engine) engine.paused = false;
  setTimeout(then, 900);
}

function resume() {
  if (engine?.ended) return; // an ending card is still on screen
  if (engine) { enterGame(() => {}); audio.playMusic(engine.inHub ? 'school' : audio.pendingTrack || 'school'); return; }
  const auto = store.loadSlot('auto');
  if (auto) startSession(auto, false); else startSession(newState(), true);
}

function toMenu() {
  if (engine) engine.paused = true;
  if (mode === 'menu') { refreshTexts(); return; }
  staticFlash();
  setMode('menu');
  audio.playMusic('menu');
  refreshTexts();
}

// Romance Academy 7 title screen inside the monitor, with the SHIZENHAKKA egg.
function titleScreen(onStart) {
  const t = UI[profile.lang];
  renderer.bg = 'classroom';
  renderer.setExpression({ mood: 'happy', pose: 'excited', mouth: 'grin' });
  audio.playMusic('school');
  ui.showCard((card, el) => {
    card.classList.add('title-card');
    el('div', 'ra7-jp', card).textContent = 'ロマンスアカデミー 7';
    el('h2', 'ra7-logo', card).textContent = 'ROMANCE\nACADEMY 7';
    const start = el('button', 'choice', card);
    start.textContent = t.start;
    start.addEventListener('click', () => { audio.sfx('select'); ui.hideCard(); card.classList.remove('title-card'); onStart(); });
    const quit = el('button', 'choice', card);
    quit.textContent = t.quit;
    quit.addEventListener('click', () => { ui.hideCard(); card.classList.remove('title-card'); engine = null; toMenu(); });
    const shizen = el('button', 'choice shizen', card);
    shizen.textContent = 'SHIZENHAKKA';
    shizen.addEventListener('click', () => {
      achieve('shizen');
      renderer.fx.fire = 1;
      audio.sfx('melt');
      setTimeout(() => renderer.burst('star', 10), 1500);
    });
  });
}

// ---------- input ----------
function toCanvas(e) {
  const r = screenEl.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
}

window.addEventListener('pointermove', (e) => {
  const p = toCanvas(e);
  renderer.mouse = { x: p.x, y: p.y };
  const rect = stage.getBoundingClientRect();
  parallax.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  parallax.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  if (mode === 'menu') {
    applyCamera();
    renderer.boost = p.inside ? Math.max(renderer.boost, 1.2) : renderer.boost;
  }
});

screenEl.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (mode === 'menu') { monitorBurst(e); return; } // the menu monitor is a toy, not a start button
  const p = toCanvas(e);
  if (e.target.closest('button, input, .dialog, form')) return;
  engine?.pointerDown(p.x, p.y);
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) shell.closeModal(); else if (mode !== 'menu') toMenu(); }
  if ((e.key === 'v' || e.key === 'м') && mode !== 'menu') shell.actions.setView(profile.view === 'room' ? 'full' : 'room');
  if ((e.key === ' ' || e.key === 'Enter') && mode !== 'menu') ui?.onDialogClick();
});
window.addEventListener('pointerdown', () => { audio.unlock(); if (mode === 'menu') audio.playMusic('menu'); }, { once: true });
window.addEventListener('resize', applyCamera);

// ---------- menu monitor voice ----------
const MENU_LINES = ['c1_a', 'c1_b', 'c2_a', 'face_a', 'egg_gif', 'egg_soos', 'nt_c', 'lv_a'];
let menuVoiceBusy = false;

// Poking the menu monitor makes her answer out loud (so the voice is heard right away).
function menuVoice() {
  if (menuVoiceBusy) return;
  const id = MENU_LINES[Math.floor(Math.random() * MENU_LINES.length)];
  if (!audio.speak(profile.lang, id)) return;
  menuVoiceBusy = true;
  renderer.pose.talking = true;
  audio.voiceEl.onended = () => { menuVoiceBusy = false; renderer.pose.talking = false; };
}

// ---------- menu monitor particles ----------
const burstCanvas = $('#fx-burst');
const burstCtx = burstCanvas.getContext('2d');
let sparks = [];
const SPARK_COLORS = ['#ff5fa8', '#46cbe6', '#ffe066', '#ffffff', '#ff9fcd'];
const HEART_PX = ['.##.##.', '#######', '.#####.', '..###..', '...#...'];

function monitorBurst(e) {
  const r = world.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * burstCanvas.width;
  const y = ((e.clientY - r.top) / r.height) * burstCanvas.height;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.9 + Math.random() * 0.8,
      size: 2 + Math.floor(Math.random() * 3), color: SPARK_COLORS[i % SPARK_COLORS.length], heart: i % 7 === 0 });
  }
  audio.sfx(Math.random() < 0.5 ? 'sparkle' : 'giggle');
  menuVoice();
  renderer.boost = Math.max(renderer.boost, 2.2);
  renderer.burst('star', 10);
  renderer.fx.glitch = 0.35;
  renderer.setExpression({ mood: 'happy', pose: 'excited', mouth: 'grin' });
}

function drawSparks(dt) {
  burstCtx.clearRect(0, 0, burstCanvas.width, burstCanvas.height);
  sparks = sparks.filter((s) => (s.life -= dt) > 0);
  for (const s of sparks) {
    s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    burstCtx.globalAlpha = Math.min(1, s.life * 1.5);
    burstCtx.fillStyle = s.color;
    if (s.heart) HEART_PX.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && burstCtx.fillRect(Math.round(s.x) + i * 2, Math.round(s.y) + j * 2, 2, 2)));
    else burstCtx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
  }
  burstCtx.globalAlpha = 1;
}

// ---------- loop ----------
const noiseCtx = $('#noise').getContext('2d');
const noiseImg = noiseCtx.createImageData(160, 120);
let attractT = 0, attractIdx = 0, noiseT = 0;
const ATTRACT = [
  { mood: 'normal', pose: 'idle', mouth: 'smile' },
  { mood: 'happy', pose: 'excited', mouth: 'grin' },
  { mood: 'normal', pose: 'books', mouth: 'smile' },
  { mood: 'smug', pose: 'point', mouth: 'smile' },
];

function attract(dt) {
  attractT += dt;
  if (attractT > 4) {
    attractT = 0;
    attractIdx = (attractIdx + 1) % ATTRACT.length;
    renderer.setExpression(ATTRACT[attractIdx]);
    if (attractIdx === 1) renderer.burst('star', 8);
    if (Math.random() < 0.25) renderer.fx.glitch = 0.5;
  }
  renderer.bg = 'classroom';
  renderer.showGirl = true;
}

function drawNoise(dt) {
  noiseT += dt;
  if (noiseT < 0.066 || !profile.crt) return;
  noiseT = 0;
  const d = new Uint32Array(noiseImg.data.buffer);
  for (let i = 0; i < d.length; i++) { const v = (Math.random() * 255) | 0; d[i] = (255 << 24) | (v << 16) | (v << 8) | v; }
  noiseCtx.putImageData(noiseImg, 0, 0);
  const now = new Date();
  $('.osd-time').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} SP`;
}

const ambientCtx = $('#ambient').getContext('2d');
const dust = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.6, v: 0.004 + Math.random() * 0.01, p: Math.random() * 6 }));

// Floating dust lit by the monitor: cheap, but the painted room no longer feels like a still.
function drawAmbient(t) {
  const c = ambientCtx, w = 960, h = 540;
  c.clearRect(0, 0, w, h);
  const q = track?.quads[0];
  const cx = q ? (q[0][0] + q[2][0]) / 2 : 0.62, cy = q ? (q[0][1] + q[2][1]) / 2 : 0.43;
  for (const d of dust) {
    d.y -= d.v / 60;
    if (d.y < 0) { d.y = 1; d.x = Math.random(); }
    const x = (d.x + Math.sin(t * 0.3 + d.p) * 0.01) * w, y = d.y * h;
    const near = Math.max(0, 1 - Math.hypot(d.x - cx, (d.y - cy) * 0.8) * 2.2);
    if (near <= 0.02) continue;
    c.fillStyle = `rgba(170, 235, 255, ${0.55 * near * (0.6 + 0.4 * Math.sin(t * 2 + d.p))})`;
    c.fillRect(x, y, d.s, d.s);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (mode === 'menu') { attract(dt); renderer.pose.mouthOpen = audio.voiceLevel(); }
  else engine?.tick(dt);
  if (mode === 'full') placeScreenFull();
  else if (track) placeScreenTracked();
  drawAmbient(t);
  drawSparks(dt);
  renderer.update(dt, t);
  renderer.render(t);
  drawNoise(dt);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
// The painted room: the screen quad from room.json drives the same tracked overlay.
let roomTrack = null, deskTrack = null, deskHotspots = null;
const toTrack = (meta) => ({ fps: 1, frames: 1, quads: [meta.screen.map(([x, y]) => [x / 100, y / 100])] });

async function loadDesk() {
  try {
    const res = await fetch('assets/desk.json');
    if (!res.ok) return;
    const desk = await res.json();
    deskTrack = toTrack(desk);
    deskHotspots = desk.hotspots || null;
    $('.desk-img').src = 'assets/desk.jpg';
  } catch {
    deskTrack = null; // no close-up painted yet: play on the wide room
  }
}

// Painted backgrounds: the wide room in the menu, the desk close-up while playing.
function setGlassMask(url) {
  const clip = $('#screen-clip');
  const value = url ? `url(${url})` : 'none';
  clip.style.webkitMaskImage = value;
  clip.style.maskImage = value;
  screenEl.classList.toggle('masked', !!url);
}

function pickPaintedTrack() {
  if (mode === 'full') { setGlassMask(null); return; } // game only: plain rectangle, no monitor glass
  if (profile.bg === '3d' || !roomTrack) return;
  const useDesk = mode !== 'menu' && !!deskTrack;
  track = useDesk ? deskTrack : roomTrack;
  setGlassMask(useDesk ? 'assets/desk_glass.png' : 'assets/room_glass.png');
  stage.classList.toggle('use-desk', useDesk);
  if (useDesk && deskHotspots) shell.useHotspots(deskHotspots); else if (!useDesk) shell.buildHotspots();
}

function useStaticTrack(room) {
  if (!room) return;
  roomTrack = toTrack(room);
  track = roomTrack;
  placeGlow();
  applyCamera();
}

function placeGlow() {
  return; // the painted monitor has its own glow
  const q = track.quads[0];
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const pad = 0.04;
  Object.assign($('.screen-glow').style, {
    left: `${(Math.min(...xs) - pad) * 100}%`, top: `${(Math.min(...ys) - pad) * 100}%`,
    width: `${(Math.max(...xs) - Math.min(...xs) + pad * 2) * 100}%`, height: `${(Math.max(...ys) - Math.min(...ys) + pad * 2) * 100}%`,
  });
}

async function loadMenuLoop() {
  try {
    const res = await fetch('assets/menu/screen_track.json');
    if (!res.ok) return;
    const data = await res.json();
    video.addEventListener('loadeddata', () => {
      track = data;
      stage.classList.add('has-video');
      applyCamera();
      video.play().catch(() => {});
      fetch('assets/menu/hotspots.json').then((r) => (r.ok ? r.json() : null)).then((boxes) => boxes && shell.useHotspots(boxes)).catch(() => {});
    }, { once: true });
    video.src = 'assets/menu/room_loop.mp4';
  } catch {
    track = null; // no 3D loop rendered yet: keep the 2D room
  }
}

async function boot() {
  const [storyData, room] = await Promise.all([
    fetch('src/data/story.json').then((r) => r.json()),
    fetch('assets/room.json').then((r) => r.json()).catch(() => null),
    renderer.load(),
    audio.loadManifest(),
  ]);
  story = storyData;
  if (room) {
    const xs = room.screen.map((p) => p[0]), ys = room.screen.map((p) => p[1]);
    const inset = 0.35;
    screenBox = { x: (Math.min(...xs) + inset) / 100, y: (Math.min(...ys) + inset) / 100, w: (Math.max(...xs) - Math.min(...xs) - inset * 2) / 100, h: (Math.max(...ys) - Math.min(...ys) - inset * 2) / 100 };
    placeScreenStatic();
  }
  if (profile.bg === '3d') await loadMenuLoop();
  else { useStaticTrack(room); await loadDesk(); }
  Object.entries(profile.volumes).forEach(([k, v]) => audio.setVolume(k, v));
  stage.classList.toggle('crt-on', profile.crt);
  setMode('menu');
  refreshTexts();
  audio.playMusic('menu');
  requestAnimationFrame(frame);
}

boot();

// Dev hook for testing (only with ?debug in the URL).
if (new URLSearchParams(location.search).has('debug')) {
  window.ra7 = { renderer, audio, get engine() { return engine; }, startSession, newState };
}
