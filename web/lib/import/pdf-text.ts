import { IMPORT_PDF_MIN_CHARS } from "@/lib/import/constants";

export type PdfTextResult =
  | { ok: true; text: string; pages: number }
  | { ok: false; error: string };

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = normalizeExtractedText(extracted.text);
    const pages = extracted.totalPages;

    if (text.replace(/\s+/g, "").length < IMPORT_PDF_MIN_CHARS) {
      return {
        ok: false,
        error:
          "This PDF looks scanned or image-only. Export a text PDF, or upload the original .tex file.",
      };
    }

    return { ok: true, text, pages };
  } catch {
    return {
      ok: false,
      error: "Could not read that PDF. Try another export, or upload a .tex file.",
    };
  }
}
