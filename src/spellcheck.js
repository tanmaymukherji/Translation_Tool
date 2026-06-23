import nspell from 'nspell';
import CONFIG from './config.js';

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

const COMMON_CHARS = '\u0905\u0906\u0907\u0908\u0909\u090A\u090B\u090F\u0910\u0913\u0914' + // vowels
  '\u0915\u0916\u0917\u0918\u0919' + // क ख ग घ ङ
  '\u091A\u091B\u091C\u091D\u091E' + // च छ ज झ ञ
  '\u091F\u0920\u0921\u0922\u0923' + // ट ठ ड ढ ण
  '\u0924\u0925\u0926\u0927\u0928' + // त थ द ध न
  '\u092A\u092B\u092C\u092D\u092E' + // प फ ब भ म
  '\u092F\u0930\u0932\u0935\u0936\u0937\u0938\u0939'; // य र ल व श ष स ह

function genOneEditVariants(word) {
  const seen = new Set();
  const chars = [...word];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Substitute with similar character
    const subs = SIMILAR_CHARS[ch] || '';
    for (const s of subs) {
      const variant = chars.slice(0, i).join('') + s + chars.slice(i + 1).join('');
      seen.add(variant);
    }

    // Substitute with matra-like confusions
    for (const group of CONFUSABLES) {
      for (const alt of group) {
        if (alt && alt !== ch) {
          const variant = chars.slice(0, i).join('') + alt + chars.slice(i + 1).join('');
          seen.add(variant);
        }
      }
    }
  }

  // Delete each character
  for (let i = 0; i < chars.length; i++) {
    const variant = chars.slice(0, i).join('') + chars.slice(i + 1).join('');
    if (variant.length > 0) seen.add(variant);
  }

  // Swap adjacent characters (transposition)
  for (let i = 0; i < chars.length - 1; i++) {
    const swapped = [...chars];
    [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
    seen.add(swapped.join(''));
  }

  // Insert common characters at each position
  for (let i = 0; i <= chars.length; i++) {
    for (const c of COMMON_CHARS) {
      const variant = chars.slice(0, i).join('') + c + chars.slice(i).join('');
      seen.add(variant);
    }
  }

  return [...seen];
}

export function findSimilarWords(word) {
  if (!spellInstance) return [];
  const variants = genOneEditVariants(word);
  return variants.filter((v) => spellInstance.correct(v)).slice(0, 12);
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = src instanceof Blob ? URL.createObjectURL(src) : null;
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = (error) => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    img.src = objectUrl || src;
  });
}

export function parseMarkdownTable(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pipeLines = lines.filter((line) => line.includes('|'));
  const candidates = pipeLines.length >= 2 ? pipeLines : lines;
  const rows = candidates
    .filter((line) => !/^\|?\s*:?-{3,}/.test(line))
    .map((line) => {
      if (line.includes('|')) return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      return line.split(/\t|\s{2,}/).map((cell) => cell.trim()).filter(Boolean);
    })
    .filter((row) => row.length >= 2);
  const colCount = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length < 2 || colCount < 2) return null;
  const normalized = rows.map((row) => Array.from({ length: colCount }, (_, index) => row[index] || ''));
  return {
    type: 'table',
    rows: normalized,
    colCount,
    text: normalized.map((row) => row.join('\t')).join('\n'),
  };
}

export function hasMeaningfulOcrText(text) {
  const normalized = String(text || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length >= 3 || normalized.replace(/\s/g, '').length >= 12;
}

export function hasSubstantialPageText(text) {
  const normalized = String(text || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  const compact = normalized.replace(/\s/g, '');
  const indicCharacters = (compact.match(/[\u0900-\u0D7F]/g) || []).length;
  return compact.length >= 80 || words.length >= 12 || indicCharacters >= 24;
}

export function cloudTextToParagraphs(text, options = {}) {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!hasMeaningfulOcrText(normalized)) return [];
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const table = options.preferTable ? parseMarkdownTable(normalized) : null;
  const explicitRows = lines.filter((line) => line.includes('|') || line.includes('\t')).length;
  const alignedRows = lines.filter((line) => /\S\s{2,}\S/.test(line)).length;
  if (table && (explicitRows >= 2 || (table.rows.length >= 3 && alignedRows >= Math.ceil(lines.length * 0.6)))) {
    return [table];
  }
  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(hasMeaningfulOcrText)
    .map((block) => ({ text: block, source: 'cloud_ocr' }));
}

function boxUnion(boxes) {
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

export function overlayLinesToTable(lines = []) {
  const entries = lines.flatMap((line) => {
    const words = (line.Words || []).map((word) => ({
      text: String(word.WordText || '').trim(),
      bbox: {
        x0: Number(word.Left || 0),
        y0: Number(word.Top || 0),
        x1: Number(word.Left || 0) + Number(word.Width || 0),
        y1: Number(word.Top || 0) + Number(word.Height || 0),
      },
    })).filter((word) => word.text && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0);
    if (!words.length) return [];
    return [{ text: words.map((word) => word.text).join(' '), bbox: boxUnion(words.map((word) => word.bbox)) }];
  });
  if (entries.length < 4) return null;

  const buildColumns = (axis) => {
    const start = axis === 'x' ? 'x0' : 'y0';
    const end = axis === 'x' ? 'x1' : 'y1';
    const secondary = axis === 'x' ? 'y0' : 'x0';
    const sorted = [...entries].sort((a, b) => a.bbox[start] - b.bbox[start]);
    const groups = [];
    for (const entry of sorted) {
      const tolerance = 10;
      let group = groups.find((candidate) => entry.bbox[start] <= candidate.end + tolerance && entry.bbox[end] >= candidate.start - tolerance);
      if (!group) {
        group = { start: entry.bbox[start], end: entry.bbox[end], entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
      group.start = Math.min(group.start, entry.bbox[start]);
      group.end = Math.max(group.end, entry.bbox[end]);
    }
    const columns = groups.filter((group) => group.entries.length >= 2).sort((a, b) => a.start - b.start);
    const covered = columns.reduce((sum, column) => sum + column.entries.length, 0);
    return { axis, secondary, columns, covered };
  };
  const candidates = [buildColumns('x'), buildColumns('y')]
    .filter((candidate) => candidate.columns.length >= 2 && candidate.columns.length <= 8 && candidate.covered >= Math.ceil(entries.length * 0.65));
  if (!candidates.length) return null;
  const widths = entries.map((entry) => entry.bbox.x1 - entry.bbox.x0).sort((a, b) => a - b);
  const heights = entries.map((entry) => entry.bbox.y1 - entry.bbox.y0).sort((a, b) => a - b);
  const medianWidth = widths[Math.floor(widths.length / 2)] || 1;
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  const preferredAxis = medianHeight > medianWidth * 1.4 ? 'y' : 'x';
  candidates.sort((a, b) => (a.axis === preferredAxis ? -1 : 1) - (b.axis === preferredAxis ? -1 : 1) || b.covered - a.covered);
  const { axis, secondary, columns } = candidates[0];
  const row = columns.map((column) => column.entries
    .sort((a, b) => a.bbox[secondary] - b.bbox[secondary])
    .map((entry) => entry.text)
    .join('\n'));
  return {
    type: 'table',
    rows: [row],
    colCount: row.length,
    text: row.join('\t'),
    bbox: boxUnion(columns.flatMap((column) => column.entries.map((entry) => entry.bbox))),
    cells: row.map((text, col) => ({ row: 0, col, text })),
    lines: [],
    structureSource: 'ocr-space-overlay',
    suggestedRotation: axis === 'y' ? 90 : 0,
  };
}

const OCR_SPACE_DAILY_LIMIT = 500;

function usageKey() {
  return `t3_ocr_space_usage_${new Date().toISOString().slice(0, 10)}`;
}

export function getOcrSpaceUsage() {
  try { return Number(localStorage.getItem(usageKey()) || 0); } catch { return 0; }
}

function reserveOcrSpaceRequest() {
  const used = getOcrSpaceUsage();
  if (used >= OCR_SPACE_DAILY_LIMIT) {
    const error = new Error('Daily high-quality OCR limit reached; using local OCR for remaining pages.');
    error.code = 'OCR_DAILY_LIMIT';
    throw error;
  }
  try { localStorage.setItem(usageKey(), String(used + 1)); } catch { /* best effort */ }
}

export async function ocrSpaceImage(imageSource, options = {}) {
  const img = await loadImage(imageSource);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const bbox = options.bbox || { x0: 0, y0: 0, x1: iw, y1: ih };
  const padding = options.padding ?? 0;
  const tableMode = !!options.tableMode;
  const pad = padding || 0;
  const sx = Math.max(0, bbox.x0 - pad);
  const sy = Math.max(0, bbox.y0 - pad);
  const sw = Math.min(iw - sx, (bbox.x1 - bbox.x0) + pad * 2);
  const sh = Math.min(ih - sy, (bbox.y1 - bbox.y0) + pad * 2);
  if (sw < 4 || sh < 4) return { text: '', orientation: 0, table: null, paragraphs: [] };

  const MAX_DATA_URL_LENGTH = 900 * 1024;
  function renderRegion(w, h, quality = 0.88) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  let scale = Math.min(1, 2600 / Math.max(sw, sh));
  let b64 = renderRegion(sw * scale, sh * scale);
  while (b64.length > MAX_DATA_URL_LENGTH && scale > 0.18) {
    scale *= 0.75;
    b64 = renderRegion(sw * scale, sh * scale, 0.82);
  }

  const apiKey = CONFIG.OCR_SPACE_API_KEY;
  if (!apiKey) throw new Error('High-quality OCR API key is not configured.');
  reserveOcrSpaceRequest();

  const params = new URLSearchParams({
    apikey: apiKey,
    OCREngine: '3',
    base64Image: b64,
    isOverlayRequired: 'true',
    detectOrientation: 'true',
    isTable: String(tableMode),
    scale: 'true',
  });
  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) {
    const responseText = await res.text().catch(() => '');
    throw new Error(`High-quality OCR HTTP ${res.status}: ${responseText.slice(0, 160)}`);
  }
  const data = await res.json();
  if (data.OCRExitCode === 1 && data.ParsedResults?.length) {
    const parsed = data.ParsedResults[0];
    const text = String(parsed.ParsedText || '').trim();
    const textTable = tableMode ? parseMarkdownTable(text) : null;
    const overlayTable = tableMode ? overlayLinesToTable(parsed.TextOverlay?.Lines || []) : null;
    const table = textTable || overlayTable;
    return {
      text,
      orientation: Number(parsed.TextOrientation || table?.suggestedRotation || 0),
      table,
      paragraphs: table ? [table] : cloudTextToParagraphs(text, { preferTable: tableMode }),
    };
  }
  const errMsg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join('; ') : data.ErrorMessage || `OCR exit code ${data.OCRExitCode}`;
  throw new Error(errMsg);
}

export async function reOcrRegionDetailed(imageData, bbox, options = {}) {
  const padding = typeof options === 'number' ? options : options.padding;
  const tableMode = typeof options === 'object' && !!options.tableMode;
  return ocrSpaceImage(imageData, {
    bbox,
    tableMode,
    padding: padding !== undefined ? padding : Math.max(8, (bbox.x1 - bbox.x0) * 0.08),
  });
}

export async function reOcrRegion(imageData, bbox, padding) {
  const result = await reOcrRegionDetailed(imageData, bbox, { padding });
  return result.text;
}
