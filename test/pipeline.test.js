import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { flatten } from '../src/pdf/flatten.js';
import { openPdf, rasterize } from '../src/pdf/rasterize.js';
import { samplePdf } from '../scripts/sample-pdf.js';

const textOf = async (bytes) => {
  const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  let text = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    text += content.items.map((i) => i.str).join('');
  }
  await doc.destroy();
  return text;
};

/** Count reddish pixels on page 1: the watermark is red, the sample page is black on white. */
async function redPixels(bytes) {
  const doc = await openPdf(bytes);
  const { value } = await rasterize(doc, 72).next();
  const { data } = value.canvas.getContext('2d').getImageData(0, 0, value.canvas.width, value.canvas.height);
  await doc.destroy();
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] - data[i + 1] > 15) n++;
  return n;
}

test('flatten: same page count, no extractable text, original metadata gone', async () => {
  const input = await samplePdf(3);
  assert.match(await textOf(input), /selectable text/, 'sample input must have real text');

  const [copy] = await flatten(input, { recipients: ['alice@example.com'] });
  assert.equal(copy.pages, 3);
  assert.equal(await textOf(copy.bytes), '');

  const out = await PDFDocument.load(copy.bytes, { updateMetadata: false });
  assert.equal(out.getPageCount(), 3);
  assert.notEqual(out.getAuthor(), 'Original Author');
  assert.notEqual(out.getTitle(), 'Confidential sample');
});

test('flatten: watermark is burned into the pixels, and watermark=false leaves the page clean', async () => {
  const input = await samplePdf(1);
  const [marked] = await flatten(input, { recipients: ['alice@example.com'] });
  const [clean] = await flatten(input, { watermark: false });
  assert.ok((await redPixels(marked.bytes)) > 500, 'watermarked copy has red stamp pixels');
  assert.equal(await redPixels(clean.bytes), 0);
  assert.equal(clean.recipient, null);
});

test('flatten: one distinct copy per recipient', async () => {
  const copies = await flatten(await samplePdf(1), { recipients: ['a@example.com', 'b@example.com'] });
  assert.deepEqual(copies.map((c) => c.recipient), ['a@example.com', 'b@example.com']);
  assert.notEqual(copies[0].sha256, copies[1].sha256);
});

test('flatten: rejects unreadable input and over-long documents as permanent errors', async () => {
  await assert.rejects(flatten(Buffer.from('%PDF-1.4 garbage'), { recipients: ['a'] }), { permanent: true });
  await assert.rejects(flatten(await samplePdf(3), { recipients: ['a'], maxPages: 2 }), { permanent: true });
});
