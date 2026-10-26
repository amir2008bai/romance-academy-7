// Each nested compliment array is one scoring group (including spelling variants).
export const LEXICON = freezeLexicon({
  compliments: {
    ru: [
      ['красив'], ['мил', 'мила'], ['прекрасн'], ['умн', 'умниц'], ['кавай'],
      ['симпатичн'], ['очаровательн'], ['классн'], ['кльов', 'клев'], ['лучш'],
      ['идеальн'], ['солнышк'], ['звездочк'], ['богин'], ['принцесс'],
      ['нравишься'], ['восхитительн'], ['офигенн'], ['крут'],
    ],
    en: [
      ['beautiful'], ['pretty'], ['cute'], ['lovely'], ['gorgeous'], ['smart'],
      ['clever'], ['adorable'], ['perfect'], ['amazing'], ['awesome'], ['best'],
      ['kawaii'], ['sweet'], ['stunning'], ['princess'], ['goddess'], ['wonderful'],
    ],
  },
  tech: {
    ru: ['многопиксельн', 'пиксел', 'высоком разрешени', 'графон', '4к', '4k',
      'hd', 'фпс', '60 кадр', 'без лагов'],
    en: ['multi-pixel', 'multipixel', 'pixel', 'high-res', 'hi-res',
      'high resolution', '4k', 'hd', '60 fps', 'no lag', 'graphics'],
  },
  love: {
    ru: ['люблю', 'любимая', 'влюб', 'обожаю'],
    en: ['love you', 'i love', 'adore', 'my girl'],
  },
  intensifiers: {
    ru: ['очень', 'самая', 'самый', 'супер', 'невероятно', 'безумно', 'так', 'такая', 'мега'],
    en: ['very', 'so', 'most', 'super', 'incredibly', 'really', 'extremely', 'such'],
  },
  insults: {
    ru: ['глуп', 'страшн', 'урод', 'дура', 'тупая', 'некрасив', 'скучн',
      'бесишь', 'ненавижу', 'просто игра', 'просто программ', 'ненастоящ', 'бот'],
    en: ['ugly', 'stupid', 'dumb', 'boring', 'hate you', 'just a game',
      'just a program', 'not real', 'bot'],
  },
  rivals: {
    ru: ['мелоди', 'другая девушк', 'другую девушк', 'венди', 'пасифик',
      'мэйбл', 'мейбл', 'настоящая девушк'],
    en: ['melody', 'another girl', 'other girl', 'wendy', 'pacifica', 'mabel', 'real girl'],
  },
  eggs: {
    password: ['fixinit1'],
    bill: ['билл', 'bill cipher', 'сайфер', 'cipher'],
    squid: ['кальмар', 'squid'],
    pause: ['пауза', 'pause'],
    gif: ['гиф', 'джиф', 'gif', 'jif'],
    rumble: ['рамбл', 'rumble'],
    abuelita: ['абуэлит', 'бабушк', 'abuelita', 'grandma'],
    senpai: ['сенпай', 'семпай', 'senpai'],
    soos: ['сус', 'soos'],
    pizza: ['пицц', 'pizza', 'ху-ха', 'hoo-ha'],
  },
  negations: ['не', 'not', "isn't", 'no'],
});

function freezeLexicon(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeLexicon);
    Object.freeze(value);
  }
  return value;
}

const complimentGroups = Object.values(LEXICON.compliments).flat();
const stemsFor = (category) => Object.values(LEXICON[category]).flat();
const wordsIn = (text) => text.match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? [];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Stems must start a word, so "бот" does not fire inside "работа".
const hitsIn = (text, stems) => stems.filter((stem) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(stem)}`, 'u').test(text));

function hasNegatedCompliment(text, stems) {
  return stems.some((stem) => {
    let index = text.indexOf(stem);
    while (index !== -1) {
      // Exclude a partial word before an internal stem, e.g. multi|pixel.
      const before = text.slice(0, index).replace(/[\p{L}\p{N}']+$/u, '');
      const previousWords = wordsIn(before).slice(-2);
      if (previousWords.some((word) => LEXICON.negations.includes(word))) return true;
      index = text.indexOf(stem, index + 1);
    }
    return false;
  });
}

function findMatches(text) {
  const words = wordsIn(text);
  return {
    compliments: hitsIn(text, complimentGroups.flat()),
    tech: hitsIn(text, stemsFor('tech')),
    love: hitsIn(text, stemsFor('love')),
    insults: hitsIn(text, stemsFor('insults')),
    rivals: hitsIn(text, stemsFor('rivals')),
    intensifiers: stemsFor('intensifiers').filter((stem) => words.includes(stem)),
    eggs: hitsIn(text, Object.values(LEXICON.eggs).flat()),
  };
}

function messageKind(text, hits) {
  if (!text) return 'empty';
  if (hits.rivals.length) return 'rival';
  if (hits.insults.length || hasNegatedCompliment(text, [...hits.compliments, ...hits.tech])) {
    return 'insult';
  }
  if (hits.love.length) return 'love';
  if (hits.compliments.length || hits.tech.length) return 'compliment';
  return 'neutral';
}

function complimentScore(hits, exclamations, allCaps) {
  const techBonus = Number(hits.tech.length > 0);
  const groups = complimentGroups.filter((group) =>
    group.some((stem) => hits.compliments.includes(stem))).length + techBonus;
  const intensityBonus = Number(hits.intensifiers.length > 0);
  const emphasisBonus = Number(exclamations > 0 || allCaps);
  return Math.min(3, Math.max(1, Math.min(2, groups) + techBonus + intensityBonus + emphasisBonus));
}

/**
 * Classify a Russian/English player message without side effects.
 * @param {string} text
 * @returns {{kind: 'compliment'|'love'|'insult'|'rival'|'neutral'|'empty',
 *   score: number, lang: 'ru'|'en', egg: string|null, matched: string[]}}
 */
export function analyzeMessage(text) {
  const lang = /(?=\p{L})\p{Script=Cyrillic}/u.test(text) ? 'ru' : 'en';
  const exclamations = (text.match(/!/g) ?? []).length;
  const originalWords = text.match(/\p{L}+/gu) ?? [];
  const allCaps = originalWords.some((word) =>
    [...word].length >= 3 && word === word.toUpperCase() && word !== word.toLowerCase());
  const normalized = text.toLowerCase().replace(/ё/g, 'е').replace(/’/g, "'")
    .replace(/\s+/gu, ' ').trim();
  const hits = findMatches(normalized);
  const kind = messageKind(normalized, hits);
  const egg = Object.entries(LEXICON.eggs).find(([, stems]) =>
    stems.some((stem) => hits.eggs.includes(stem)))?.[0] ?? null;
  const score = kind === 'love' ? 3
    : kind === 'compliment' ? complimentScore(hits, exclamations, allCaps) : 0;
  const matched = [...new Set(Object.values(hits).flat())];
  return { kind, score, lang, egg, matched };
}
