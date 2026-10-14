// Renders docs/before-after.png: page 1 of the sample input next to page 1 of the flatpdf output.
// Run: npm run demo:images
import fs from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import { flatten } from '../src/pdf/flatten.js';
import { openPdf, rasterize } from '../src/pdf/rasterize.js';
import { FONT } from '../src/pdf/watermark.js';
import { samplePdf } from './sample-pdf.js';

const DPI = 110;
const firstPage = async (bytes) => {
  const doc = await openPdf(bytes);
  const { value } = await rasterize(doc, DPI).next();
  await doc.destroy();
  return value.canvas;
};

const input = await samplePdf(1);
const [copy] = await flatten(input, { recipients: ['jane.doe@example.com'], now: new Date('2026-03-04T10:15:00Z') });
const [before, after] = await Promise.all([firstPage(input), firstPage(copy.bytes)]);

const pad = 40;
const head = 70;
const out = createCanvas(before.width * 2 + pad * 3, before.height + head + pad);
const ctx = out.getContext('2d');
ctx.fillStyle = '#eef1f5';
ctx.fillRect(0, 0, out.width, out.height);
ctx.fillStyle = '#1b2733';
ctx.font = `24px ${FONT}`;
ctx.textAlign = 'center';
[
  ['Input: selectable text', before, pad],
  ['Output: image only, stamped per recipient', after, before.width + pad * 2],
].forEach(([label, page, x]) => {
  ctx.fillText(label, x + page.width / 2, 44);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12;
  ctx.drawImage(page, x, head);
  ctx.shadowBlur = 0;
});
await fs.mkdir('docs', { recursive: true });
await fs.writeFile('docs/before-after.png', await out.encode('png'));
console.log('wrote docs/before-after.png');
