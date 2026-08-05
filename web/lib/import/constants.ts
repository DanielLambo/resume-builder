export const IMPORT_TEX_MAX_BYTES = 400_000;
export const IMPORT_PDF_MAX_BYTES = 4 * 1024 * 1024;
export const IMPORT_PDF_MIN_CHARS = 180;
export const IMPORT_SOURCE_TEXT_MAX = 8_000;
export const PENDING_IMPORT_DB = "resumate-import";
export const PENDING_IMPORT_STORE = "pending";
export const PENDING_IMPORT_KEY = "file";

export const IMPORT_ACCEPT = ".tex,.latex,.ltx,.pdf" as const;

export type ImportKind = "tex" | "pdf";
