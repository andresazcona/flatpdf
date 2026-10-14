import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { PDFJS_ROOT } from './rasterize.js';

// Lambda images ship no system fonts, so use the Liberation Sans bundled with pdfjs-dist (SIL OFL).
const FONT = 'flatpdf-sans';
GlobalFonts.registerFromPath(path.join(PDFJS_ROOT, 'standard_fonts', 'LiberationSans-Bold.ttf'), FONT);

/**
 * Burn the recipient into the page pixels: a tiled diagonal stamp (hard to crop out)
 * and a footer line with recipient, UTC issue time and source-document hash prefix.
 */
export function stamp(canvas, { recipient, issuedAt, docHash }) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');

  const size = Math.round(Math.min(w, h) / 16);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.atan2(h, w));
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = 'rgba(190, 30, 45, 0.16)';
  ctx.textBaseline = 'middle';
  const step = ctx.measureText(recipient).width + size * 2;
  const reach = Math.hypot(w, h) / 2;
  for (let row = 0, y = -reach; y < reach; row++, y += size * 4) {
    for (let x = -reach - (row % 2) * (step / 2); x < reach; x += step) ctx.fillText(recipient, x, y);
  }
  ctx.restore();

  const small = Math.max(9, Math.round(h / 120));
  const line = `Issued to ${recipient} | ${issuedAt} | sha256:${docHash.slice(0, 12)}`;
  ctx.save();
  ctx.font = `${small}px ${FONT}`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = Math.max(2, small / 4);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillStyle = 'rgba(60, 60, 60, 0.9)';
  ctx.strokeText(line, small, h - small / 2);
  ctx.fillText(line, small, h - small / 2);
  ctx.restore();
}
