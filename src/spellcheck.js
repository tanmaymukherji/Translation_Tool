import nspell from 'nspell';

let spellInstance = null;
let spellPromise = null;

const SIMILAR_CHARS = {
  '\u0915': '\u0916\u0917\u0918', // क→ख,ग,घ
  '\u0916': '\u0915\u0917\u0918',
  '\u0917': '\u0915\u0916\u0918',
  '\u0918': '\u0915\u0916\u0917',
  '\u091A': '\u091B\u091C\u091D', // च→छ,ज,झ
  '\u091B': '\u091A\u091C\u091D',
  '\u091C': '\u091A\u091B\u091D\u091C',
  '\u091D': '\u091A\u091B\u091C',
  '\u091F': '\u0920\u0921\u0922', // ट→ठ,ड,ढ
  '\u0920': '\u091F\u0921\u0922',
  '\u0921': '\u091F\u0920\u0922\u0921',
  '\u0922': '\u091F\u0920\u0921',
  '\u0924': '\u0925\u0926\u0927', // त→थ,द,ध
  '\u0925': '\u0924\u0926\u0927',
  '\u0926': '\u0924\u0925\u0927',
  '\u0927': '\u0924\u0925\u0926',
  '\u092A': '\u092B\u092C\u092D', // प→फ,ब,भ
  '\u092B': '\u092A\u092C\u092D',
  '\u092C': '\u092A\u092B\u092D',
  '\u092D': '\u092A\u092B\u092C',
  '\u0936': '\u0937\u0938', // श→ष,स
  '\u0937': '\u0936\u0938',
  '\u0938': '\u0936\u0937',
  '\u0928': '\u0923', // न→ण
  '\u0923': '\u0928',
  '\u092E': '\u092D', // म→भ
  '\u092D': '\u092E',
  '\u0930': '\u0931', // र→ऱ
  '\u0932': '\u0933', // ल→ळ
};

const CONFUSABLES = [
  ['\u093F', '\u0940'],  // ि vs ी
  ['\u0941', '\u0942'],  // ु vs ू
  ['\u0947', '\u0948'],  // े vs ै
  ['\u094B', '\u094C'],  // ो vs ौ
  ['\u0902', '\u0901', ''], // ं vs ँ vs nothing
];

function colorizeDiff(original, candidate) {
  let result = '';
  const maxLen = Math.max(original.length, candidate.length);
  for (let i = 0; i < maxLen; i++) {
    if (original[i] !== candidate[i]) {
      result += candidate[i] || '';
    } else {
      result += candidate[i] || '';
    }
  }
  return result;
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

export function isCorrect(word) {
  return spellInstance ? spellInstance.correct(word) : true;
}

export function suggestWord(word) {
  if (!spellInstance) return [];
  return spellInstance.suggest(word).filter((s) => s !== word).slice(0, 6);
}

function genOneEditVariants(word) {
  const seen = new Set();
  const chars = [...word];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Substitute with similar character
    const subs = SIMILAR_CHARS[ch] || '';
    for (const s of subs) {
      const variant = chars.slice(0, i).join('') + s + chars.slice(i + 1).join('');
      if (variant !== word) seen.add(variant);
    }

    // Substitute with matra-like confusions (vowel signs)
    for (const group of CONFUSABLES) {
      for (const alt of group) {
        if (alt && alt !== ch) {
          const variant = chars.slice(0, i).join('') + alt + chars.slice(i + 1).join('');
          if (variant !== word) seen.add(variant);
        }
      }
    }
  }

  // Delete each character
  for (let i = 0; i < chars.length; i++) {
    const variant = chars.slice(0, i).join('') + chars.slice(i + 1).join('');
    if (variant.length > 0) seen.add(variant);
  }

  return [...seen];
}

export function findSimilarWords(word) {
  if (!spellInstance) return [];

  // First, check if word is already correct — then generate similar alternatives
  const variants = genOneEditVariants(word);
  const valid = variants
    .filter((v) => spellInstance.correct(v))
    .slice(0, 12);

  return valid;
}

export async function fetchSuggestions(word, fullText, selStart, selEnd) {
  // Step 1: Try Hunspell for Hindi
  const lang = detectLang(fullText);
  if (lang === 'hi') {
    await initSpellcheck();
    const corrected = suggestWord(word);
    if (corrected.length > 0) {
      return { type: 'corrections', alternatives: corrected };
    }
    const similar = findSimilarWords(word);
    if (similar.length > 0) {
      return { type: 'alternatives', alternatives: similar };
    }
    return { type: 'none', alternatives: [] };
  }

  // Step 2: LanguageTool for supported languages
  try {
    const ltLang = LT_LANGS.has(lang) ? lang : 'en-US';
    const params = new URLSearchParams({ text: fullText, language: ltLang, enabledOnly: 'false' });
    const res = await fetch(LT_URL, { method: 'POST', body: params });
    const data = await res.json();
    const matches = data?.matches || [];
    const overlapping = matches.filter((m) => {
      const mEnd = m.offset + m.length;
      return m.offset < selEnd && mEnd > selStart;
    });
    const all = overlapping.flatMap((m) =>
      (m.replacements || []).map((r) => r.value)
    ).filter(Boolean);
    const alternatives = [...new Set(all)].filter((s) => s !== word).slice(0, 6);
    return { type: alternatives.length > 0 ? 'corrections' : 'none', alternatives };
  } catch {
    return { type: 'none', alternatives: [] };
  }
}

const LT_URL = 'https://api.languagetool.org/v2/check';

const LT_LANGS = new Set([
  'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-NZ', 'en-ZA',
  'de', 'de-DE', 'de-AT', 'de-CH',
  'fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH',
  'es', 'es-ES', 'es-AR',
  'pt', 'pt-BR', 'pt-PT', 'pt-AO', 'pt-MZ',
  'it', 'it-IT', 'nl', 'nl-NL', 'nl-BE',
  'ru-RU', 'uk-UA', 'be-BY',
  'pl-PL', 'cs-CZ', 'sk-SK', 'sl-SI',
  'ro-RO', 'da-DK', 'sv-SE', 'nb', 'no',
  'fi-FI', 'et-EE', 'lv-LV', 'lt-LT',
  'el-GR', 'hu-HU', 'bg-BG', 'sr-SR',
  'hr-HR', 'ca-ES', 'gl-ES',
  'ja-JP', 'zh-CN', 'ko-KR',
  'ta-IN', 'km-KH', 'th-TH',
  'ar', 'fa', 'fa-IR', 'he',
  'tr-TR', 'id-ID', 'ms-MY', 'tl-PH', 'vi-VN',
]);

function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
  return 'en-US';
}
