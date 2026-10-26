// Story runner + free interaction hub. The story is data (src/data/story.json);
// this file turns it into a dating sim: compliments, eye contact, dates, jealousy.
import { analyzeMessage } from './compliments.js';
import { a1z26, atbash, caesar } from './cipher.js';

const MAX_STARS = 7;
const YANDERE_AT = 100;
const IDLE_SECONDS = 75;
const EYE_OK = 3, EYE_CREEPY = 8;
const THIRTEEN_MINUTES = 13 * 60;
const DATES = [
  { id: 'rooftop', need: 15 },
  { id: 'arcade', need: 30 },
  { id: 'pizzeria', need: 45 },
  { id: 'festival', need: 60, dates: 3 },
];
const CRYPTO = {
  love: { ru: () => caesar('ЗАХОДИ ЗАВТРА, СУС', 3), en: () => caesar('COME BACK TOMORROW, SOOS', 3) },
  melt: { ru: () => a1z26('ОНА ВСЕ ЕЩЕ ЗДЕСЬ'), en: () => a1z26('SHE IS STILL HERE') },
  forever: { ru: () => atbash('ТЫ НЕ ВЫЙДЕШЬ'), en: () => atbash('YOU WILL NOT LEAVE') },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Engine {
  constructor({ renderer, ui, audio, story, ui18n, getLang, onAchievement, onExit, onSave }) {
    Object.assign(this, { renderer, ui, audio, story, ui18n, getLang, onAchievement, onExit, onSave });
    this.state = null;
    this.busy = false;
    this.inHub = false;
    this.eyeT = 0; this.eyeRewarded = false; this.eyeCreeped = false; this.eyeWaiting = null;
    this.idleT = 0;
    this.faceClicks = 0;
    this.pausedGag = false;
    this.ended = false;
    this.depth = 0;
    this.paused = false;
    this.dead = false;
  }

  get t() { return this.ui18n[this.getLang()]; }
  L(obj) { return obj[this.getLang()] ?? obj.ru; }

  async start(state, fresh) {
    this.state = state;
    this.ended = false;
    this.syncStats();
    this.ui.show(this.ui.hud);
    if (fresh) await this.runNode('intro');
    else this.enterHub();
  }

  syncStats() {
    const s = this.state;
    this.renderer.highlights = clamp(1 + s.compliments, 1, MAX_STARS);
    this.ui.setStats(s.aff, this.renderer.highlights);
  }

  change({ aff = 0, obs = 0 }) {
    this.state = { ...this.state, aff: clamp(this.state.aff + aff, 0, 100), obs: clamp(this.state.obs + obs, 0, 100) };
    if (aff > 0) this.renderer.burst('heart', 4);
    this.syncStats();
  }

  ach(id) { if (id) this.onAchievement(id); }

  // ---------- story ----------
  music(name) {
    if (!this.dead && !this.paused) this.audio.playMusic(name);
  }

  async runNode(id) {
    if (this.dead) return undefined;
    const node = this.story.nodes[id] || this.story.subtopics[id];
    if (!node) return this.enterHub();
    this.inHub = false;
    this.ui.show(this.ui.hub, false);
    this.ui.show(this.ui.form, false);
    if (node.bg) this.renderer.bg = node.bg;
    if (node.music) this.music(node.music);
    const next = await this.runSteps(node.steps);
    if (next === 'end') return undefined;
    return next ? this.runNode(next) : this.enterHub();
  }

  async runSteps(steps) {
    this.busy = true;
    try {
      for (const step of steps) {
        if (this.dead) return 'end';
        const next = await this.runStep(step);
        if (next) return next;
      }
      return null;
    } finally {
      this.busy = false;
    }
  }

  async runStep(step) {
    if (step.fx) this.effect(step.fx);
    if (step.ach) this.ach(step.ach);
    if (step.zoom !== undefined) this.renderer.closeUp(step.zoom > 2);
    if (step.boost) this.renderer.boost = step.boost;
    if (step.bg) this.renderer.bg = step.bg;
    if (step.say) { await this.sayLine({ id: step.id, ...step.say, mood: step.mood, pose: step.pose, mouth: step.mouth }); this.renderer.closeUp(false); }
    if (step.narr) { await this.ui.say('', this.L(step.narr), { narr: true, blips: false }); }
    if (step.choice) return this.runChoice(step.choice);
    if (step.ask) await this.askCompliment(true);
    if (step.eye) await this.eyeChallenge();
    if (step.set) this.change(step.set);
    if (step.date) this.state = { ...this.state, dates: { ...this.state.dates, [step.date]: true } };
    if (step.end) { await this.ending(step.end); return 'end'; }
    if (step.goto) return step.goto;
    return null;
  }

  async runChoice(options) {
    this.ui.hideDialog();
    const usable = options.map((o) => ({
      label: this.L(o.t),
      disabled: o.need?.aff !== undefined && this.state.aff < o.need.aff,
    }));
    const i = await this.ui.choose(usable);
    const o = options[i];
    this.change({ aff: o.aff || 0, obs: o.obs || 0 });
    this.ach(o.ach);
    return o.go || null;
  }

  async sayLine(line) {
    const lang = this.getLang();
    this.renderer.setExpression(line);
    const voiced = this.audio.speak(lang, line.id);
    this.renderer.pose.talking = true;
    const done = this.ui.say(lang === 'ru' ? 'Гиффани' : 'Giffany', line[lang] ?? line.ru, { mood: line.mood, blips: !voiced });
    const stopTalk = setInterval(() => {
      if (this.dead) { clearInterval(stopTalk); return; }
      const voicePlaying = voiced && !this.audio.voiceEl.paused && !this.audio.voiceEl.ended;
      if (!this.ui.typing && !voicePlaying) this.renderer.pose.talking = false;
    }, 80);
    await done;
    clearInterval(stopTalk);
    this.renderer.pose.talking = false;
    this.audio.stopVoice();
  }

  async react(key) {
    const pool = this.story.react[key];
    if (pool) await this.sayLine(pick(pool));
  }

  // ---------- hub ----------
  enterHub() {
    if (this.ended || this.dead) return;
    this.inHub = true;
    this.idleT = 0;
    this.renderer.bg = 'classroom';
    this.renderer.setExpression({ mood: 'normal', pose: 'idle', mouth: 'smile' });
    this.renderer.fx.red = 0;
    this.music('school');
    this.ui.hideDialog();
    const t = this.t;
    this.ui.setHub([
      { label: t.talk, action: () => this.hubAction(() => this.talk()) },
      { label: t.date, action: () => this.hubAction(() => this.dateMenu()) },
      { label: t.pause, action: () => this.hubAction(() => this.pauseGag()), cls: 'warn' },
      { label: t.menu, action: () => this.onExit() },
    ]);
    this.ui.show(this.ui.hub);
    this.ui.listen((text) => this.hubAction(() => this.handleMessage(text)));
    this.onSave('auto', this.state);
    if (this.depth === 0 && this.state.obs >= YANDERE_AT) this.hubAction(() => this.runNode('yandere'));
  }

  async hubAction(fn) {
    if (this.busy || !this.inHub) return;
    this.idleT = 0;
    this.busy = true;
    this.depth++;
    this.ui.show(this.ui.hub, false);
    this.ui.show(this.ui.form, false);
    try {
      await fn();
    } finally {
      this.busy = false;
      this.depth--;
    }
    if (!this.dead && this.depth === 0 && this.inHub && !this.ended) {
      this.ui.hideDialog();
      this.ui.show(this.ui.hub);
      this.ui.show(this.ui.form);
      this.onSave('auto', this.state);
      if (this.state.obs >= YANDERE_AT) this.hubAction(() => this.runNode('yandere'));
    }
  }

  async talk() {
    const topics = this.story.topics;
    const topic = topics[this.state.topic % topics.length];
    this.state = { ...this.state, topic: this.state.topic + 1 };
    this.inHub = false;
    const next = await this.runSteps(topic.steps);
    if (next && next !== 'end' && this.story.subtopics[next]) await this.runSteps(this.story.subtopics[next].steps);
    this.inHub = true;
    this.busy = true; // hubAction resets it
  }

  async dateMenu() {
    const t = this.t;
    const options = DATES.map((d) => {
      const done = this.state.dates[d.id];
      const open = this.state.aff >= d.need && Object.keys(this.state.dates).length >= (d.dates || 0);
      return { label: `${t.dates[d.id]} ${done ? `(${t.done})` : open ? '' : `🔒 ${d.need}%`}`.trim(), open };
    });
    this.ui.hideDialog();
    const i = await this.ui.choose([...options.map((o) => ({ label: o.label })), { label: t.back }]);
    if (i >= DATES.length) return;
    if (!options[i].open) { await this.react('locked'); return; }
    this.inHub = false;
    this.busy = false;
    await this.runNode(`date_${DATES[i].id}`);
    this.busy = true;
  }

  async pauseGag() {
    this.ach('pause');
    this.renderer.showGirl = false;
    this.renderer.fx.dim = 0.6;
    this.ui.showCard((card, el) => { el('div', 'pause-title', card).textContent = this.t.paused; });
    this.audio.music?.stop(0.3);
    await new Promise((r) => setTimeout(r, 1600));
    this.ui.hideCard();
    this.audio.sfx('glitch');
    this.renderer.fx.glitch = 1;
    this.renderer.fx.dim = 0;
    this.renderer.showGirl = true;
    this.renderer.closeUp(true);
    this.change({ obs: 12 });
    await this.react('pause');
    this.renderer.closeUp(false);
    this.music('school');
  }

  // ---------- free text ----------
  async askCompliment(showHint) {
    const text = await this.ui.ask(showHint);
    await this.handleMessage(text);
  }

  async handleMessage(text) {
    this.ui.showPlayerLine(text);
    const r = analyzeMessage(text);
    if (r.egg) this.ach({ password: 'password', bill: 'bill', squid: 'squid', senpai: 'senpai', rumble: 'rumble', abuelita: 'abuelita', pause: 'pause', gif: 'gif' }[r.egg]);
    if (r.kind === 'compliment' || r.kind === 'love') return this.compliment(r);
    if (r.kind === 'rival') return this.rival();
    if (r.kind === 'insult') {
      this.state = { ...this.state, insults: this.state.insults + 1 };
      this.change({ aff: -5, obs: 6 });
      return this.react('insult');
    }
    if (r.egg && this.story.react.eggs[r.egg]) return this.sayLine(pick(this.story.react.eggs[r.egg]));
    return this.react('neutral');
  }

  async compliment(r) {
    const score = r.score || 1;
    this.state = { ...this.state, compliments: this.state.compliments + 1 };
    this.syncStats();
    this.renderer.boost = Math.max(this.renderer.boost, score);
    this.renderer.burst('star', 6 * score);
    if (score >= 2) this.renderer.burst('heart', 3 * score);
    this.audio.sfx('sparkle');
    this.change({ aff: 2 + score * 2 });
    if (this.renderer.highlights >= MAX_STARS && !this.state.flags.maxStars) {
      this.state = { ...this.state, flags: { ...this.state.flags, maxStars: true } };
      this.ach('stars7');
      return this.react('max_stars');
    }
    return this.react(r.kind === 'love' ? 'love' : `comp${Math.min(3, score)}`);
  }

  async rival() {
    const n = this.state.rivals + 1;
    this.state = { ...this.state, rivals: n };
    this.ach('rival');
    this.audio.sfx('glitch');
    this.renderer.fx.glitch = 1;
    if (n >= 3) { this.change({ obs: 100 }); return; }
    this.change({ obs: n === 1 ? 20 : 30, aff: -3 });
    this.renderer.setExpression({ mood: 'angry' });
    await this.sayLine(this.story.react.rival[Math.min(n, 2) - 1]);
  }

  // ---------- mouse interactions (called by main) ----------
  pointerDown(x, y) {
    if (this.renderer.isOnBill(x, y)) {
      this.ach('bill');
      this.audio.sfx('glitch');
      this.renderer.fx.glitch = 1.5;
      return true;
    }
    if (this.inHub && !this.busy && this.renderer.isOnFace(x, y)) {
      this.faceClicks++;
      this.audio.sfx('giggle');
      this.renderer.boost = Math.max(this.renderer.boost, 0.6);
      this.renderer.setExpression({ mood: 'happy', mouth: 'grin' });
      setTimeout(() => this.inHub && !this.busy && this.renderer.setExpression({ mood: 'normal', mouth: 'smile' }), 500);
      if (this.faceClicks === 10) { this.ach('face'); this.hubAction(() => this.react('face')); }
      return true;
    }
    return false;
  }

  // ---------- eye contact ----------
  eyeChallenge() {
    this.eyeT = 0;
    this.ui.hideDialog();
    return new Promise((resolve) => {
      // the challenge only times out while the game is on screen (not in the menu)
      let left = 15;
      const timeout = setInterval(() => { if (!this.paused && --left <= 0) finish(false); }, 1000);
      const finish = (ok) => {
        clearInterval(timeout);
        this.eyeWaiting = null;
        this.ui.eyeMeter('', null);
        if (ok) { this.change({ aff: 6 }); this.ach('eye'); this.audio.sfx('heart'); }
        resolve();
      };
      this.eyeWaiting = finish;
    });
  }

  tick(dt) {
    if (!this.state || this.ended) return;
    this.updateMouth(dt);
    this.state.playTime += dt;
    if (this.state.playTime >= THIRTEEN_MINUTES) this.ach('hours13');
    const onEyes = this.renderer.mouse && this.renderer.isOnEyes(this.renderer.mouse.x, this.renderer.mouse.y);
    this.eyeT = onEyes ? this.eyeT + dt : Math.max(0, this.eyeT - dt * 2);
    if (!this.busy || this.eyeWaiting) this.renderer.pose.blush = clamp(this.eyeT / 2, 0, 1);
    if (this.eyeWaiting) {
      this.ui.eyeMeter(this.getLang() === 'ru' ? 'Смотри ей в глаза' : 'Look into her eyes', this.eyeT / EYE_OK);
      if (this.eyeT >= EYE_OK) this.eyeWaiting(true);
      return;
    }
    if (!this.inHub || this.busy) return;
    if (this.eyeT >= EYE_OK && !this.eyeRewarded) {
      this.eyeRewarded = true;
      this.change({ aff: 2 });
      this.ach('eye');
      this.hubAction(() => this.react('eye_blush'));
    }
    if (this.eyeT >= EYE_CREEPY && !this.eyeCreeped) {
      this.eyeCreeped = true;
      this.ach('stare');
      this.change({ obs: 5 });
      this.hubAction(() => this.react('eye_creepy'));
    }
    if (this.eyeT === 0) { this.eyeRewarded = false; this.eyeCreeped = false; }
    this.idleT += dt;
    if (this.idleT > IDLE_SECONDS) { this.idleT = 0; this.change({ obs: 3 }); this.hubAction(() => this.react('idle')); }
  }

  // Voiced lines: mouth follows the audio level. Blip-only lines: a talk cycle.
  updateMouth(dt) {
    const pose = this.renderer.pose;
    this.mouthT = (this.mouthT || 0) + dt;
    const voice = this.audio.voiceLevel();
    const cycle = [0, 0.5, 1, 0.5][Math.floor(this.mouthT * 11) % 4];
    const target = voice > 0 ? voice : this.ui.typing ? cycle : 0;
    pose.mouthOpen = (pose.mouthOpen || 0) + (target - (pose.mouthOpen || 0)) * Math.min(1, dt * 18);
  }

  effect(name) {
    const r = this.renderer;
    if (name === 'glitch') { r.fx.glitch = 1; this.audio.sfx('glitch'); }
    if (name === 'shake') r.fx.shake = 1.5;
    if (name === 'red') { r.fx.red = 1; this.audio.sfx('static'); }
    if (name === 'stars') { r.burst('star', 20); this.audio.sfx('sparkle'); }
    if (name === 'hearts') { r.burst('heart', 10); this.audio.sfx('heart'); }
    if (name === 'melt') { r.fx.melt = 1; this.audio.sfx('melt'); }
  }

  // ---------- endings ----------
  async ending(kind) {
    this.ended = true;
    this.inHub = false;
    this.ach(kind);
    this.ui.hideDialog();
    this.ui.show(this.ui.hub, false);
    this.ui.show(this.ui.form, false);
    if (kind === 'melt') { this.renderer.fx.melt = 1; await new Promise((r) => setTimeout(r, 2600)); }
    this.renderer.showGirl = false;
    this.renderer.fx.red = 0;
    this.music(kind === 'forever' ? 'yandere' : 'credits');
    const t = this.t;
    const code = CRYPTO[kind][this.getLang()]();
    await new Promise((resolve) => this.ui.showCard((card, el) => {
      card.classList.add('end-card');
      el('h2', '', card).textContent = t.endings[kind];
      el('p', 'credits', card).textContent = t.credits;
      el('p', 'cipher', card).textContent = code;
      const b = el('button', 'choice', card);
      b.textContent = t.toMenu;
      b.addEventListener('click', resolve);
      setTimeout(() => this.ach('cipher'), 6000);
    }));
    this.ui.hideCard();
    if (kind === 'melt') await this.postCredits();
    this.renderer.showGirl = true;
    this.onExit(kind);
  }

  async postCredits() {
    this.renderer.bg = 'arcade';
    this.renderer.showGirl = true;
    this.renderer.fx.melt = 0;
    this.music('arcade');
    this.ach('rumble');
    await this.sayLine(this.story.react.post[0]);
  }
}
