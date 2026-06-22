import { Document, Paragraph, TextRun, Packer, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

function buildParagraphs(items, pageBreaks) {
  const children = [];
  for (let i = 0; i < items.length; i++) {
    const { text, isPageStart } = items[i];
    const runs = [];
    const lines = text.split('\n');
    for (let li = 0; li < lines.length; li++) {
      if (li > 0) {
        runs.push(new TextRun({ break: 1 }));
      }
      runs.push(new TextRun({ text: lines[li], size: 22, font: 'Calibri' }));
    }
    const opts = { spacing: { after: 200, line: 360 }, children: runs };
    if (isPageStart && i > 0) {
      opts.pageBreakBefore = true;
    }
    children.push(new Paragraph(opts));
  }
  return children;
}

export async function generateDocx(paragraphs, filename) {
  const items = [];
  let lastPage = null;
  for (const p of paragraphs) {
    const text = (p.translated !== undefined ? p.translated : p.text || '').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    items.push({ text, isPageStart: lastPage !== null && p.page !== lastPage });
    lastPage = p.page;
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: buildParagraphs(items),
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
  return blob;
}

export async function generateDocxFromHtml(htmlContent, filename) {
  const paraRegex = /<p[^>]*>(.*?)<\/p>/gs;
  const matches = [];
  let match;
  let page = 1;
  while ((match = paraRegex.exec(htmlContent)) !== null) {
    const pageAttr = match[0].match(/data-page="(\d+)"/);
    if (pageAttr) page = parseInt(pageAttr[1], 10);
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text) matches.push({ text, page });
  }

  if (matches.length === 0) {
    const text = htmlContent.replace(/<[^>]+>/g, '').trim();
    if (text) matches.push({ text, page: 1 });
  }

  return generateDocx(matches, filename);
}
