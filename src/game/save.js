// Save slots + a global profile (settings, achievements) in localStorage.
// Storage is injectable so the logic can be tested in Node.

const PREFIX = 'ra7.';
export const SLOTS = ['auto', '1', '2', '3'];

export function newState() {
  return {
    aff: 0, obs: 0, compliments: 0, rivals: 0, insults: 0,
    dates: {}, flags: {}, topic: 0, playTime: 0, savedAt: null,
  };
}

export function defaultProfile() {
  return {
    lang: 'ru', view: 'room', crt: true, bg: 'paint',
    volumes: { music: 0.6, sfx: 0.7, voice: 0.9 },
    achievements: [], endings: [],
  };
}

function safeStorage(storage) {
  return {
    get(key) {
      try { return JSON.parse(storage.getItem(PREFIX + key)); } catch { return null; }
    },
    set(key, value) {
      try { storage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
    },
  };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem('probe');
    return s;
  } catch {
    const mem = new Map(); // storage blocked: keep saves in memory for this visit
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, d) => (Number.isFinite(v) ? v : d);

export class SaveStore {
  constructor(storage = defaultStorage()) {
    this.db = safeStorage(storage);
  }

  loadProfile() {
    const stored = this.db.get('profile') || {};
    const base = defaultProfile();
    return { ...base, ...stored, volumes: { ...base.volumes, ...(stored.volumes || {}) } };
  }

  saveProfile(profile) { return this.db.set('profile', profile); }

  saveSlot(slot, state) {
    if (!SLOTS.includes(slot)) throw new Error(`unknown slot ${slot}`);
    return this.db.set(`slot.${slot}`, { ...state, savedAt: new Date().toISOString() });
  }

  loadSlot(slot) {
    const data = this.db.get(`slot.${slot}`);
    if (!isObj(data)) return null;
    const base = newState();
    return {
      ...base,
      aff: num(data.aff, 0), obs: num(data.obs, 0), compliments: num(data.compliments, 0),
      rivals: num(data.rivals, 0), insults: num(data.insults, 0), topic: num(data.topic, 0),
      playTime: num(data.playTime, 0),
      dates: isObj(data.dates) ? data.dates : {}, flags: isObj(data.flags) ? data.flags : {},
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : null,
    };
  }

  listSlots() {
    return SLOTS.map((slot) => ({ slot, data: this.loadSlot(slot) }));
  }
}
