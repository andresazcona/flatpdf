import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BODY = [
  'This sentence is selectable text in the original document.',
  'Revenue grew 18% quarter over quarter, driven by the enterprise segment.',
  'Headcount remained flat while support costs fell by 6%.',
  'The board will review the acquisition shortlist on the 14th.',
  'Distribution of this report outside the named recipients is prohibited.',
];

/** A small PDF with real, extractable text on every page. Used by tests and the README demo. */
export async function samplePdf(pages = 3) {
  const doc = await PDFDocument.create();
  doc.setTitle('Confidential sample');
  doc.setAuthor('Original Author');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 730, width: 612, height: 62, color: rgb(0.11, 0.2, 0.36) });
    page.drawText('Confidential', { x: 72, y: 752, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText(`Quarterly report - page ${n}`, { x: 72, y: 690, size: 24, font: bold });
    BODY.forEach((line, i) => page.drawText(line, { x: 72, y: 650 - i * 26, size: 12, font }));
    page.drawRectangle({ x: 72, y: 380, width: 468, height: 150, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
    page.drawText('Net revenue   $4.2M', { x: 92, y: 490, size: 14, font });
    page.drawText('Operating margin   23%', { x: 92, y: 460, size: 14, font });
    page.drawText('Cash on hand   $11.9M', { x: 92, y: 430, size: 14, font });
  }
  return Buffer.from(await doc.save());
}
