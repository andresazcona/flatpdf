import { PDFDocument } from 'pdf-lib';

/**
 * Start an image-only output PDF. Nothing from the source (info dict, XMP, outlines, annotations,
 * forms, JavaScript, attachments) is copied: the only metadata is what is set here.
 * pdf-lib cannot encrypt, so no permission flags are written; they are advisory anyway and
 * the image-only content is the actual control.
 */
export async function createOutput({ recipient, issuedAt, docHash }) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer('flatpdf');
  doc.setCreator('flatpdf');
  doc.setCreationDate(new Date(issuedAt));
  doc.setModificationDate(new Date(issuedAt));
  doc.setKeywords(['flatpdf', `source-sha256:${docHash}`]);
  if (recipient) doc.setSubject(`Issued to ${recipient}`);
  return doc;
}

/** Append one page whose only content is a full-bleed JPEG. */
export async function addImagePage(doc, jpeg, width, height) {
  const image = await doc.embedJpg(jpeg);
  doc.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
}
