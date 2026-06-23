import { ocrImage } from './ocr.js';
import { cloudTextToParagraphs, hasSubstantialPageText, ocrSpaceImage } from './spellcheck.js';

export async function smartOcrImage(imageFile, onProgress = () => {}, options = {}) {
  try {
    onProgress({ phase: 'cloud-ocr', percent: 0 });
    const cloud = await ocrSpaceImage(imageFile, { tableMode: options.tableMode !== false });
    onProgress({ phase: 'cloud-ocr', percent: 100 });
    if (!hasSubstantialPageText(cloud.text)) {
      return { ...cloud, paragraphs: [], ignored: true, provider: 'ocr-space' };
    }
    const paragraphs = cloud.paragraphs?.length
      ? cloud.paragraphs
      : cloudTextToParagraphs(cloud.text, { preferTable: options.tableMode !== false });
    return {
      ...cloud,
      paragraphs: paragraphs.map((paragraph) => ({ ...paragraph, rotation: cloud.orientation || 0 })),
      ignored: false,
      provider: 'ocr-space',
    };
  } catch (cloudError) {
    console.warn('High-quality OCR unavailable; falling back to local OCR:', cloudError.message);
    const local = await ocrImage(imageFile, (percent) => onProgress({ phase: 'local-ocr', percent }), options.localOptions || {});
    return {
      ...local,
      orientation: 0,
      ignored: !hasSubstantialPageText(local.text),
      provider: 'local-fallback',
      cloudError: cloudError.message,
    };
  }
}

export async function rescanDetectedPdfTables(page, paragraphs, renderedPage, scale, onProgress = () => {}) {
  const tables = paragraphs.filter((paragraph) => paragraph.type === 'table' && paragraph.bbox);
  if (!tables.length || !renderedPage) return paragraphs;
  const replacements = new Map();
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    onProgress({ phase: 'cloud-table', current: index + 1, total: tables.length });
    try {
      const bbox = {
        x0: table.bbox.x0 * scale,
        y0: table.bbox.y0 * scale,
        x1: table.bbox.x1 * scale,
        y1: table.bbox.y1 * scale,
      };
      const result = await ocrSpaceImage(renderedPage, { bbox, tableMode: true, padding: 12 * scale });
      const replacement = result.table || result.paragraphs?.find((entry) => entry.type === 'table');
      if (replacement?.rows?.length >= 2 && replacement.colCount >= 2) {
        replacements.set(table, {
          ...table,
          ...replacement,
          bbox: table.bbox,
          source: 'pdf_text',
          ocrProvider: 'ocr-space-table',
        });
      }
    } catch (error) {
      console.warn('Cloud table OCR failed; retaining PDF table structure:', error.message);
    }
  }
  return paragraphs.map((paragraph) => replacements.get(paragraph) || paragraph);
}
