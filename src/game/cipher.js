// Gravity Falls style end-credit cryptograms.

const ALPHABETS = {
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
};

const alphabetFor = (text) => (/[А-ЯЁ]/i.test(text) ? ALPHABETS.ru : ALPHABETS.en);

export function caesar(text, shift) {
  const upper = text.toUpperCase();
  const abc = alphabetFor(upper);
  return [...upper].map((ch) => {
    const i = abc.indexOf(ch);
    return i < 0 ? ch : abc[(i + shift + abc.length * 10) % abc.length];
  }).join('');
}

export function atbash(text) {
  const upper = text.toUpperCase();
  const abc = alphabetFor(upper);
  return [...upper].map((ch) => {
    const i = abc.indexOf(ch);
    return i < 0 ? ch : abc[abc.length - 1 - i];
  }).join('');
}

export function a1z26(text) {
  const upper = text.toUpperCase();
  const abc = alphabetFor(upper);
  return upper.split(' ').map((word) =>
    [...word].map((ch) => abc.indexOf(ch) + 1).filter((n) => n > 0).join('-')).join(' ');
}
