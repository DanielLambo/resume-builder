import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sanitizeLatex } from "./sanitize.js";
import type { CompileLatexFn } from "./schema.js";

function resolvePdflatex(): string {
  return process.env.RESUMATE_PDFLATEX?.trim() || "pdflatex";
}

async function runPdflatex(
  bin: string,
  cwd: string,
  jobname: string,
): Promise<{ code: number; log: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        `-jobname=${jobname}`,
        `${jobname}.tex`,
      ],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `/Library/TeX/texbin:${process.env.PATH ?? ""}`,
        },
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, log: `${stdout}\n${stderr}` });
    });
  });
}

/**
 * Default ephemeral pdflatex compiler. Prefer injecting a mock in tests.
 */
export const compileLatexWithPdflatex: CompileLatexFn = async (tex: string) => {
  const sanitized = sanitizeLatex(tex);
  if (!sanitized.ok) {
    throw new Error(sanitized.error);
  }

  const dir = await mkdtemp(join(tmpdir(), "resumate-fit-"));
  const jobname = "resume";
  const texPath = join(dir, `${jobname}.tex`);

  try {
    await writeFile(texPath, sanitized.content, "utf8");
    const bin = resolvePdflatex();
    // Two passes help refs/TOC; resumes rarely need more.
    let lastLog = "";
    for (let pass = 0; pass < 2; pass += 1) {
      const result = await runPdflatex(bin, dir, jobname);
      lastLog = result.log;
      if (result.code !== 0) {
        const snippet = lastLog.split("\n").slice(-40).join("\n");
        throw new Error(`pdflatex failed (exit ${result.code}):\n${snippet}`);
      }
    }
    return await readFile(join(dir, `${jobname}.pdf`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
