import { PDFDocument, StandardFonts } from 'pdf-lib';

/** A small PDF with real, extractable text on every page. */
export async function samplePdf(pages = 3) {
  const doc = await PDFDocument.create();
  doc.setTitle('Confidential sample');
  doc.setAuthor('Original Author');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Quarterly report - page ${n}`, { x: 72, y: 700, size: 24, font });
    page.drawText('This sentence is selectable text in the original document.', { x: 72, y: 660, size: 12, font });
  }
  return Buffer.from(await doc.save());
}
