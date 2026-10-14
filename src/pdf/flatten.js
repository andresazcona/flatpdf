import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { addImagePage, createOutput } from './rebuild.js';
import { openPdf, PermanentError, rasterize } from './rasterize.js';
import { stamp } from './watermark.js';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * PDF bytes in, one image-only PDF per recipient out. Each page is rasterized once and
 * stamped per recipient, so N recipients cost one render plus N encodes per page.
 * With watermark=false a single unstamped copy is produced.
 */
export async function flatten(bytes, { recipients = [], watermark = true, dpi = 150, quality = 80, maxPages = 50, now = new Date() }) {
  if (watermark && recipients.length === 0) throw new PermanentError('watermark needs at least one recipient');
  const docHash = sha256(bytes);
  const issuedAt = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const copies = watermark ? recipients : [null];

  const pdf = await openPdf(bytes);
  try {
    if (pdf.numPages > maxPages) throw new PermanentError(`too many pages (${pdf.numPages} > ${maxPages})`);
    const outputs = await Promise.all(copies.map((recipient) => createOutput({ recipient, issuedAt, docHash })));

    for await (const { canvas, width, height } of rasterize(pdf, dpi)) {
      for (const [i, recipient] of copies.entries()) {
        let page = canvas;
        if (recipient) {
          page = createCanvas(canvas.width, canvas.height);
          page.getContext('2d').drawImage(canvas, 0, 0);
          stamp(page, { recipient, issuedAt, docHash });
        }
        await addImagePage(outputs[i], await page.encode('jpeg', quality), width, height);
      }
    }

    return await Promise.all(
      outputs.map(async (doc, i) => {
        const out = Buffer.from(await doc.save());
        return { recipient: copies[i], bytes: out, sha256: sha256(out), pages: pdf.numPages };
      }),
    );
  } finally {
    await pdf.loadingTask.destroy();
  }
}
