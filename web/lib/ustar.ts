/**
 * Minimal ustar writer for a single in-memory file (no Node tar binary needed).
 * Used to POST resumes to latexonline’s `/data` endpoint.
 */

const BLOCK = 512;

function octalField(value: number, length: number): string {
  const body = Math.max(0, Math.floor(value)).toString(8);
  return body.padStart(length - 1, "0") + "\0";
}

function checksumHeader(header: Buffer): void {
  // Checksum field is spaces while summing (POSIX).
  header.write("        ", 148, "utf8");
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) {
    sum += header[i] ?? 0;
  }
  const field = `${sum.toString(8).padStart(6, "0")}\0 `;
  header.write(field, 148, "utf8");
}

/** Build an uncompressed ustar archive containing one regular file. */
export function createSingleFileTar(filename: string, content: string | Buffer): Buffer {
  const safeName = filename.replace(/^\/+/, "").slice(0, 100) || "main.tex";
  const data = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const header = Buffer.alloc(BLOCK, 0);

  header.write(safeName, 0, "utf8");
  header.write(octalField(0o644, 8), 100, "utf8"); // mode
  header.write(octalField(0, 8), 108, "utf8"); // uid
  header.write(octalField(0, 8), 116, "utf8"); // gid
  header.write(octalField(data.length, 12), 124, "utf8"); // size
  header.write(octalField(Math.floor(Date.now() / 1000), 12), 136, "utf8"); // mtime
  header[156] = 0x30; // typeflag: regular file
  header.write("ustar\0", 257, "utf8");
  header.write("00", 263, "utf8");
  checksumHeader(header);

  const padLen = (BLOCK - (data.length % BLOCK)) % BLOCK;
  const padding = padLen > 0 ? Buffer.alloc(padLen, 0) : Buffer.alloc(0);
  const end = Buffer.alloc(BLOCK * 2, 0);
  return Buffer.concat([header, data, padding, end]);
}
