import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PDFJS_ROOT = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));

// In Node, pdfjs reads these with fs.readFile(dir + name); it insists on a trailing "/".
const asset = (dir) => `${path.join(PDFJS_ROOT, dir).replaceAll(path.sep, "/")}/`;
const OPTIONS = {
  standardFontDataUrl: asset('standard_fonts'),
  cMapUrl: asset('cmaps'),
  wasmUrl: asset('wasm'),
  isEvalSupported: false,
  verbosity: 0,
};

// Cap the per-page raster so a poster-sized page cannot exhaust Lambda memory.
const MAX_PIXELS = 40e6;

export class PermanentError extends Error {
  permanent = true;
}

/** Parse a PDF. Throws PermanentError for anything a retry will not fix (corrupt, password-protected). */
export async function openPdf(bytes) {
  try {
    // getDocument detaches the buffer it is given, so hand it a copy.
    return await getDocument({ ...OPTIONS, data: new Uint8Array(bytes) }).promise;
  } catch (err) {
    throw new PermanentError(`unreadable PDF (${err.name})`);
  }
}

/** Yield each page as a white-backed canvas at `dpi`, plus its size in PDF points. */
export async function* rasterize(doc, dpi) {
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const size = page.getViewport({ scale: 1 });
    const scale = Math.min(dpi / 72, Math.sqrt(MAX_PIXELS / (size.width * size.height)));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    page.cleanup();
    yield { canvas, width: size.width, height: size.height };
  }
}
