import { PDFDocument } from "pdf-lib";

/**
 * Inspect a compiled PDF buffer and return the exact page count.
 */
export async function getPDFPageCount(pdf: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdf, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return doc.getPageCount();
}
