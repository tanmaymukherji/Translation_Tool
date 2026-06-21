import nspell from 'nspell';

let spellInstance = null;
let spellPromise = null;

function detectLang(text) {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

export async function initSpellcheck() {
  if (spellInstance) return spellInstance;
  if (spellPromise) return spellPromise;

  spellPromise = (async () => {
    const base = import.meta.env.BASE_URL || '/';
    const affRes = await fetch(`${base}dict/hi.aff`);
    const dicRes = await fetch(`${base}dict/hi.dic`);
    const aff = await affRes.text();
    const dic = await dicRes.text();
    spellInstance = nspell(aff, dic);
    return spellInstance;
  })();

  return spellPromise;
}

export function isCorrect(word, lang) {
  if (lang === 'hi' && spellInstance) {
    return spellInstance.correct(word);
  }
  return true;
}

export function suggestWord(word, lang) {
  if (lang === 'hi' && spellInstance) {
    return spellInstance.suggest(word).slice(0, 6);
  }
  return [];
}
