import {
  IMPORT_PDF_MAX_BYTES,
  IMPORT_TEX_MAX_BYTES,
  type ImportKind,
} from "@/lib/import/constants";

const TEX_EXT = /\.(tex|latex|ltx)$/i;
const PDF_EXT = /\.pdf$/i;

export function detectImportKind(filename: string, mime?: string): ImportKind | null {
  const name = filename.trim();
  if (TEX_EXT.test(name)) return "tex";
  if (PDF_EXT.test(name)) return "pdf";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/x-tex" || mime === "text/x-tex") return "tex";
  return null;
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^resume$/i.test(cleaned)) return "Imported resume";
  return cleaned.slice(0, 120);
}

export function assertImportSize(kind: ImportKind, byteLength: number): string | null {
  if (kind === "tex" && byteLength > IMPORT_TEX_MAX_BYTES) {
    return `LaTeX files must be under ${Math.floor(IMPORT_TEX_MAX_BYTES / 1000)} KB.`;
  }
  if (kind === "pdf" && byteLength > IMPORT_PDF_MAX_BYTES) {
    return "PDFs must be under 4 MB.";
  }
  if (byteLength < 20) {
    return "That file looks empty.";
  }
  return null;
}
