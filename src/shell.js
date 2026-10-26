// Main menu, modals, achievement toasts and Soos's desk hotspots.
import { UI, ACHIEVEMENTS } from './i18n.js';
import { caesar } from './game/cipher.js';
import { el } from './game/ui.js';

const $ = (sel) => document.querySelector(sel);

// Clickable props on Soos's desk, in percent of the room image.
const HOTSPOTS = [
  { id: 'photo', box: [20, 43.6, 14.4, 29.7], text: { ru: 'Фото Абуэлиты. Повёрнуто к стене — «чтобы не мешать молодым». Но она всё равно подглядывает.', en: "Abuelita's photo. Turned to the wall \"to give the young ones privacy\". She still peeks." }, ach: 'abuelita' },
  { id: 'can', box: [92.4, 60.6, 7.6, 21.2], text: { ru: 'Pitt Cola. Тёплая. Открыта тринадцать часов назад.', en: 'Pitt Cola. Warm. Opened thirteen hours ago.' }, ach: 'chips' },
  { id: 'chips', box: [83.7, 40.4, 8.5, 20], text: { ru: 'Чипакерз. Крошки в клавиатуре. Гиффани: «Не ешь над клавиатурой!»', en: 'Chipackerz. Crumbs in the keyboard. Giffany: "Don\'t eat over the keyboard!"' }, ach: 'chips' },
  { id: 'cd', box: [11.5, 69, 29, 19], text: { ru: 'Коробка «Академии Романтики 7». Наклейка: «УНИЧТОЖИТЬ ЛЮБОЙ ЦЕНОЙ!! (╯°□°）╯︵ ┻━┻». Возвращали три раза.', en: 'The Romance Academy 7 case. Sticker: "DESTROY AT ALL COSTS!! (╯°□°）╯︵ ┻━┻". Returned three times.' }, ach: 'sticker' },
  { id: 'joystick', box: [84.6, 61, 7.8, 24], text: { ru: 'Джойстик для Fight Fighters. Кнопка «удар» стёрта до блеска.', en: 'A Fight Fighters joystick. The punch button is worn shiny.' } },
  { id: 'note', box: [75.5, 65.4, 7.3, 10.6], action: 'password' },
  { id: 'poster', box: [51, 2, 8, 12], action: 'bill' },
  { id: 'window', text: { ru: 'Ночь. Луна над соснами. Гиффани: «Не смотри в окно. Смотри на меня».', en: 'Night. The moon over the pines. Giffany: "Don\'t look out the window. Look at me."' } },
  // props that exist only in the 3D room (positions come from assets/menu/hotspots.json)
  { id: 'ufo', text: { ru: '«Правда где-то рядом… в Орегоне». Зус уверен, что видел НЛО над Хижиной Чудес.', en: '"The truth is out there... in Oregon". Soos swears he saw a UFO over the Mystery Shack.' } },
  { id: 'calendar', text: { ru: 'Август. Один день обведён знаком вопроса — «зарплата в Хижине Чудес!»', en: 'August. One day is circled with a question mark: "payday at the Mystery Shack!"' } },
  { id: 'gnome', text: { ru: 'Фигурка гнома. Подозрительно похожа на тех, что живут в лесу. Кажется, она моргнула.', en: 'A gnome figurine. Suspiciously like the ones in the woods. Did it just blink?' } },
  { id: 'waddles', text: { ru: 'Плюшевый Пухля! Подарок от Мэйбл. Хрю.', en: 'A Waddles plush! A gift from Mabel. Oink.' } },
  { id: 'pudding', text: { ru: 'Три стаканчика пудинга. Зус ставит играм оценки в пудингах. Эта получила 4 из 5.', en: 'Three pudding cups. Soos rates games in pudding cups. This one got 4 out of 5.' }, ach: 'chips' },
  { id: 'qmark', box: [2.7, 31, 6.9, 12.6], text: { ru: 'Знак вопроса, как на футболке Зуса. Главный вопрос: почему компьютер работает, хотя не включён в розетку?', en: "A question mark, like on Soos's shirt. Big question: why does the computer work when it isn't even plugged in?" } },
  { id: 'plush', box: [83.7, 8.5, 15, 26], text: { ru: 'Синяя пушистая хрюшка с антеннками. Зус выиграл её в автомате с третьей попытки… или с тридцатой.', en: 'A fuzzy blue piggy with antennae. Soos won it from a claw machine on the third try... or the thirtieth.' } },
  { id: 'lava', text: { ru: 'Лава-лампа. Гипнотизирует почти как глаза Гиффани.', en: "A lava lamp. Almost as hypnotic as Giffany's eyes." } },
];

export class Shell {
  constructor({ profile, store, audio, actions }) {
    Object.assign(this, { profile, store, audio, actions });
    this.stage = $('#stage');
    this.modal = $('#modal');
    this.box = $('.modal-box');
    this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.closeModal(); });
    document.querySelectorAll('.lang-switch button').forEach((b) =>
      b.addEventListener('click', () => this.actions.setLang(b.dataset.lang)));
    this.buildHotspots();
    this.buildRoomControls();
  }

  get lang() { return this.profile.lang; }
  get t() { return UI[this.lang]; }

  render(sessionActive) {
    const t = this.t;
    document.documentElement.lang = this.lang;
    $('.logo-main').textContent = t.title;
    $('.logo-sub').textContent = t.subtitle;
    $('.disclaimer').textContent = t.credits;
    $('.monitor-hint').textContent = t.clickMonitor;
    document.querySelectorAll('.lang-switch button').forEach((b) => b.classList.toggle('on', b.dataset.lang === this.lang));
    const auto = this.store.loadSlot('auto');
    const found = this.profile.achievements.length, total = Object.keys(ACHIEVEMENTS).length;
    const items = [
      { label: t.continue, on: sessionActive || !!auto, act: () => this.actions.resume() },
      { label: t.newGame, on: true, act: () => this.actions.newGame() },
      { label: t.load, on: true, act: () => this.slotsModal('load') },
      { label: t.save, on: sessionActive, act: () => this.slotsModal('save') },
      { label: t.eggs, extra: `${found}/${total}`, on: true, act: () => this.eggsModal() },
      { label: t.settings, on: true, act: () => this.settingsModal() },
    ];
    const list = $('.menu-items');
    list.replaceChildren();
    for (const it of items) {
      const b = el('button', 'menu-item', list);
      b.textContent = it.label;
      if (it.extra) el('small', '', b).textContent = it.extra;
      b.disabled = !it.on;
      b.addEventListener('mouseenter', () => this.audio.sfx('hover'));
      b.addEventListener('click', () => { this.audio.unlock(); this.audio.sfx('select'); it.act(); });
    }
    this.renderRoomControls();
  }

  // ---------- modals ----------
  openModal(title, build) {
    this.box.replaceChildren();
    el('h2', '', this.box).textContent = title;
    build(this.box);
    const row = el('div', 'modal-row', this.box);
    const close = el('button', 'btn', row);
    close.textContent = this.t.close;
    close.addEventListener('click', () => this.closeModal());
    this.modal.classList.remove('hidden');
  }

  closeModal() { this.modal.classList.add('hidden'); }

  slotsModal(mode) {
    const t = this.t;
    this.openModal(mode === 'save' ? t.save : t.load, (box) => {
      for (const { slot, data } of this.store.listSlots()) {
        if (mode === 'save' && slot === 'auto') continue;
        const b = el('button', 'btn slot', box);
        b.textContent = slot === 'auto' ? t.autosave : `${t.slot} ${slot}`;
        const info = el('span', '', b);
        info.textContent = data ? `♥ ${data.aff}% · ✦ ${Math.min(7, 1 + data.compliments)} · ${new Date(data.savedAt).toLocaleString(this.lang)}` : t.empty;
        b.disabled = mode === 'load' && !data;
        b.addEventListener('click', () => {
          if (mode === 'save') {
            const ok = this.actions.saveTo(slot);
            if (ok) this.toast(t.saved, `${t.slot} ${slot}`); else this.audio.sfx('error');
            this.slotsModal('save');
            return;
          }
          this.closeModal();
          this.actions.loadFrom(slot);
        });
      }
    });
  }

  eggsModal() {
    const t = this.t;
    const got = new Set(this.profile.achievements);
    this.openModal(`${t.eggs} ${got.size}/${Object.keys(ACHIEVEMENTS).length}`, (box) => {
      const grid = el('div', 'eggs-grid', box);
      for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
        const card = el('div', `egg ${got.has(id) ? '' : 'locked'}`, grid);
        el('b', '', card).textContent = got.has(id) ? a[this.lang] : '???';
        el('span', '', card).textContent = a.d[this.lang];
      }
    });
  }

  settingsModal() {
    const t = this.t;
    this.openModal(t.settings, (box) => {
      for (const kind of ['music', 'sfx', 'voice']) {
        const row = el('label', '', box);
        el('span', '', row).textContent = t[kind];
        const range = el('input', '', row);
        Object.assign(range, { type: 'range', min: 0, max: 1, step: 0.05, value: this.profile.volumes[kind] });
        range.addEventListener('input', () => this.actions.setVolume(kind, Number(range.value)));
      }
      const test = el('button', 'btn', box);
      test.textContent = t.testVoice;
      test.addEventListener('click', () => this.actions.testVoice());
      const crt = el('label', '', box);
      el('span', '', crt).textContent = t.crt;
      const cb = el('input', '', crt);
      Object.assign(cb, { type: 'checkbox', checked: this.profile.crt });
      cb.addEventListener('change', () => this.actions.setCrt(cb.checked));
      el('span', '', box).textContent = t.view;
      const views = el('div', 'modal-row', box);
      for (const [v, label] of [['room', t.viewRoom], ['full', t.viewFull]]) {
        const b = el('button', `btn ${this.profile.view === v ? 'on' : ''}`, views);
        b.textContent = label;
        b.addEventListener('click', () => { this.actions.setView(v); this.settingsModal(); });
      }
      el('span', '', box).textContent = t.background;
      const bgs = el('div', 'modal-row', box);
      for (const [v, label] of [['paint', t.bgPaint], ['3d', t.bg3d]]) {
        const b = el('button', `btn ${(this.profile.bg || 'paint') === v ? 'on' : ''}`, bgs);
        b.textContent = label;
        b.addEventListener('click', () => this.actions.setBackground(v));
      }
    });
  }

  passwordModal() {
    const t = this.t;
    this.openModal(t.password, (box) => {
      const form = el('form', '', box);
      const input = el('input', '', form);
      input.type = 'password';
      input.autocomplete = 'off';
      const msg = el('p', '', box);
      setTimeout(() => input.focus(), 30);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim().toLowerCase() !== 'fixinit1') { msg.textContent = t.wrongPassword; this.audio.sfx('error'); return; }
        this.actions.achieve('password');
        this.audio.sfx('achievement');
        form.remove();
        msg.className = 'journal';
        msg.textContent = t.journal;
      });
    });
  }

  toast(title, text) {
    const n = el('div', 'toast', $('#toasts'));
    el('b', '', n).textContent = title;
    el('span', '', n).textContent = text;
    setTimeout(() => n.remove(), 4200);
  }

  achievementToast(id) {
    const a = ACHIEVEMENTS[id];
    const t = this.t;
    this.toast(`${t.unlocked} ${this.profile.achievements.length}/${Object.keys(ACHIEVEMENTS).length}`, a[this.lang]);
  }

  // ---------- Soos's desk ----------
  // 3D room: replace the 2D-illustration boxes with boxes projected from Blender.
  useHotspots(boxes) {
    this.buildHotspots(HOTSPOTS.filter((h) => boxes[h.id]).map((h) => ({ ...h, box: boxes[h.id] })));
  }

  buildHotspots(list = HOTSPOTS.filter((h) => h.box)) {
    const root = $('#hotspots');
    root.replaceChildren();
    for (const h of list) {
      const b = el('button', 'hotspot', root);
      const [x, y, w, hgt] = h.box;
      Object.assign(b.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${hgt}%` });
      b.setAttribute('aria-label', h.id);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.audio.sfx('click'); this.hotspot(h); });
    }
  }

  hotspot(h) {
    if (h.action === 'password') { this.passwordModal(); return; }
    if (h.action === 'bill') {
      this.actions.achieve('bill');
      this.audio.sfx('glitch');
      const screen = document.querySelector('#screen');
      screen.classList.add('glitching');
      setTimeout(() => screen.classList.remove('glitching'), 650);
      const secret = this.lang === 'ru' ? caesar('СУС, Я ВИЖУ ТЕБЯ', 3) : caesar('SOOS, I SEE YOU', 3);
      this.bubble(h, secret);
      return;
    }
    if (h.ach) this.actions.achieve(h.ach);
    this.bubble(h, h.text[this.lang]);
  }

  bubble(h, text) {
    const b = $('#bubble');
    const [x, y, w] = h.box;
    b.textContent = text;
    b.style.left = `${Math.min(84, Math.max(14, x + w / 2))}%`;
    b.style.top = `${Math.max(16, y)}%`;
    b.classList.remove('hidden');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => b.classList.add('hidden'), 4500);
  }

  buildRoomControls() {
    this.ctrl = el('div', 'room-ctrl', this.stage);
  }

  renderRoomControls() {
    const t = this.t;
    this.ctrl.replaceChildren();
    const menu = el('button', '', this.ctrl);
    menu.textContent = `${t.menu} [Esc]`;
    menu.addEventListener('click', () => this.actions.toMenu());
    const view = el('button', '', this.ctrl);
    view.textContent = `${this.profile.view === 'room' ? t.viewFull : t.viewRoom} [V]`;
    view.addEventListener('click', () => this.actions.setView(this.profile.view === 'room' ? 'full' : 'room'));
  }
}
