// DOM layer that lives inside the game screen: dialogue box with typewriter
// text, choices, the compliment input, HUD, eye-contact meter and cards.
// All dynamic text goes through textContent (player input is never parsed as HTML).

const TYPE_CPS = 38;

function el(tag, cls, parent) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.append(node);
  return node;
}

export class ScreenUI {
  constructor(root, audio) {
    this.audio = audio;
    this.root = el('div', 'screen-ui', root);
    this.hud = el('div', 'hud hidden', this.root);
    this.affLabel = el('span', 'aff-label', this.hud);
    const bar = el('div', 'bar', this.hud);
    this.affFill = el('i', '', bar);
    this.stars = el('span', 'stars', this.hud);
    this.hub = el('div', 'hub hidden', this.root);
    this.eye = el('div', 'eye-meter hidden', this.root);
    this.eyeLabel = el('span', '', this.eye);
    this.eyeFill = el('i', '', el('div', 'bar', this.eye));
    this.dialog = el('div', 'dialog hidden', this.root);
    this.name = el('div', 'name', this.dialog);
    this.text = el('div', 'text', this.dialog);
    el('div', 'next', this.dialog).textContent = '▼';
    this.choices = el('div', 'choices hidden', this.root);
    this.form = el('form', 'say-form hidden', this.root);
    this.input = el('input', '', this.form);
    this.input.maxLength = 120;
    this.input.autocomplete = 'off';
    this.sendBtn = el('button', '', this.form);
    this.hint = el('div', 'hint hidden', this.root);
    this.card = el('div', 'card hidden', this.root);
    this.player = el('div', 'player-line hidden', this.root);
    this.typing = false;
    this.advance = null;
    this.dialog.addEventListener('click', () => this.onDialogClick());
  }

  setLabels(t) {
    this.affLabel.textContent = t.affection;
    this.input.placeholder = t.placeholder;
    this.sendBtn.textContent = t.send;
    this.hint.textContent = t.hint;
    this.t = t;
  }

  show(node, on = true) { node.classList.toggle('hidden', !on); }

  setStats(aff, stars) {
    this.affFill.style.transform = `scaleX(${Math.max(0, Math.min(100, aff)) / 100})`;
    this.stars.textContent = `✦ ×${stars}`;
  }

  onDialogClick() {
    if (this.typing) { this.typing = false; return; }
    const fn = this.advance;
    this.advance = null;
    fn?.();
  }

  // Types text out; resolves after the player clicks once it is fully shown.
  say(name, text, { mood, blips = true, narr = false } = {}) {
    this.show(this.dialog);
    this.dialog.classList.toggle('narr', narr);
    this.name.textContent = name || '';
    this.show(this.name, !!name);
    this.text.textContent = '';
    this.typing = true;
    return new Promise((resolve) => {
      const chars = [...text];
      let i = 0, acc = 0, last = performance.now();
      const step = (now) => {
        acc += ((now - last) / 1000) * TYPE_CPS;
        last = now;
        if (!this.typing) i = chars.length;
        while (acc >= 1 && i < chars.length) {
          if (blips && i % 2 === 0) this.audio.blip(chars[i], mood);
          i++; acc -= 1;
        }
        this.text.textContent = chars.slice(0, i).join('');
        if (i < chars.length) { requestAnimationFrame(step); return; }
        this.typing = false;
        this.advance = resolve;
      };
      requestAnimationFrame(step);
    });
  }

  hideDialog() { this.show(this.dialog, false); }

  choose(options) {
    this.choices.replaceChildren();
    this.show(this.choices);
    return new Promise((resolve) => {
      options.forEach((opt, i) => {
        const b = el('button', 'choice', this.choices);
        b.textContent = opt.label;
        b.disabled = !!opt.disabled;
        b.addEventListener('mouseenter', () => this.audio.sfx('hover'));
        b.addEventListener('click', () => {
          this.audio.sfx('select');
          this.show(this.choices, false);
          resolve(i);
        });
      });
    });
  }

  // Free text input. Resolves with the typed text.
  ask(showHint = false) {
    this.show(this.form);
    this.show(this.hint, showHint);
    this.input.value = '';
    setTimeout(() => this.input.focus(), 50);
    return new Promise((resolve) => {
      this.form.onsubmit = (e) => {
        e.preventDefault();
        const value = this.input.value.trim();
        if (!value) return;
        this.form.onsubmit = null;
        this.show(this.form, false);
        this.show(this.hint, false);
        resolve(value);
      };
    });
  }

  // Persistent input in the hub: calls back on every submit.
  listen(onSubmit) {
    this.show(this.form);
    this.form.onsubmit = (e) => {
      e.preventDefault();
      const value = this.input.value.trim();
      if (!value) return;
      this.input.value = '';
      onSubmit(value);
    };
  }

  showPlayerLine(text) {
    this.player.textContent = `» ${text}`;
    this.show(this.player);
    clearTimeout(this.playerTimer);
    this.playerTimer = setTimeout(() => this.show(this.player, false), 3500);
  }

  setHub(buttons) {
    this.hub.replaceChildren();
    for (const { label, action, cls } of buttons) {
      const b = el('button', `hub-btn ${cls || ''}`, this.hub);
      b.textContent = label;
      b.addEventListener('mouseenter', () => this.audio.sfx('hover'));
      b.addEventListener('click', () => { this.audio.sfx('click'); action(); });
    }
  }

  eyeMeter(label, value) {
    this.show(this.eye, value !== null);
    if (value === null) return;
    this.eyeLabel.textContent = label;
    this.eyeFill.style.transform = `scaleX(${Math.min(1, value)})`;
  }

  showCard(build) {
    this.card.replaceChildren();
    build(this.card, el);
    this.show(this.card);
  }

  hideCard() { this.show(this.card, false); }
}

export { el };
