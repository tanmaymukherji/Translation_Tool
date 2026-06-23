import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudTextToParagraphs, hasMeaningfulOcrText, hasSubstantialPageText, overlayLinesToTable, parseMarkdownTable } from '../src/spellcheck.js';

test('parses markdown table output from table OCR', () => {
  const table = parseMarkdownTable('| Name | Count |\n| --- | --- |\n| A | 12 |\n| B | 9 |');
  assert.deepEqual(table.rows, [['Name', 'Count'], ['A', '12'], ['B', '9']]);
  assert.equal(table.colCount, 2);
});

test('parses tab and multi-space aligned OCR rows', () => {
  const table = parseMarkdownTable('Village\tWomen\tMen\nChoknar  18  12\nTotal  18  12');
  assert.deepEqual(table.rows, [
    ['Village', 'Women', 'Men'],
    ['Choknar', '18', '12'],
    ['Total', '18', '12'],
  ]);
});

test('does not turn ordinary prose into a table', () => {
  assert.equal(parseMarkdownTable('One ordinary line\nAnother ordinary line'), null);
});

test('ignores empty and incidental photo text', () => {
  assert.equal(hasMeaningfulOcrText(''), false);
  assert.equal(hasMeaningfulOcrText('IMG 2'), false);
  assert.equal(cloudTextToParagraphs('IMG 2', { preferTable: true }).length, 0);
});

test('automatic import ignores map labels but keeps written pages', () => {
  assert.equal(hasSubstantialPageText('19.40473 82.036332 Choknar Image 2026 Airbus Google Earth'), false);
  assert.equal(hasSubstantialPageText('ग्राम सभा में जल संरक्षण और वन अधिकार पर समुदाय के सदस्यों ने विस्तार से चर्चा की'), true);
});

test('keeps meaningful handwriting or board text as a paragraph', () => {
  const paragraphs = cloudTextToParagraphs('ग्राम सभा की बैठक\nजल संरक्षण पर चर्चा', { preferTable: true });
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].type, undefined);
});

test('turns aligned cloud OCR rows into one table block', () => {
  const paragraphs = cloudTextToParagraphs('नाम  महिला  पुरुष\nचोकनार  18  12\nकुल  18  12', { preferTable: true });
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].type, 'table');
  assert.deepEqual(paragraphs[0].rows[1], ['चोकनार', '18', '12']);
});

test('reconstructs spatially separated handwriting columns from OCR overlay', () => {
  const line = (text, left, top, width = 90) => ({ Words: [{ WordText: text, Left: left, Top: top, Width: width, Height: 18 }] });
  const table = overlayLinesToTable([
    line('पहला', 20, 20), line('दूसरा', 20, 60), line('तीसरा', 20, 100),
    line('जल', 240, 20), line('वन', 240, 60), line('भूमि', 240, 100),
    line('कार्य', 460, 20), line('योजना', 460, 60), line('पूर्ण', 460, 100),
  ]);
  assert.equal(table.type, 'table');
  assert.equal(table.colCount, 3);
  assert.equal(table.rows.length, 1);
  assert.match(table.rows[0][1], /जल\nवन\nभूमि/);
});

test('recognizes sideways table columns and recommends page rotation', () => {
  const line = (text, left, top) => ({ Words: [{ WordText: text, Left: left, Top: top, Width: 90, Height: 18 }] });
  const table = overlayLinesToTable([
    line('क', 20, 20), line('ख', 40, 20), line('ग', 60, 20),
    line('जल', 20, 140), line('वन', 40, 140), line('भूमि', 60, 140),
    line('एक', 20, 260), line('दो', 40, 260), line('तीन', 60, 260),
  ]);
  assert.equal(table.colCount, 3);
  assert.equal(table.suggestedRotation, 90);
});
