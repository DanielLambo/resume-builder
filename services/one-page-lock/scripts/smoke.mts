import { PDFDocument } from "pdf-lib";

import {
  configAtTightness,
  injectLaTeXConfig,
} from "../src/injectLaTeXConfig.js";
import { getPDFPageCount } from "../src/getPDFPageCount.js";
import { fitToSinglePage } from "../src/fitToSinglePage.js";
import {
  DEFAULT_LAYOUT_CONFIG,
  MAX_TIGHT_LAYOUT_CONFIG,
} from "../src/schema.js";

const SAMPLE = String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage{parskip}
\begin{document}
Hello world.
\begin{itemize}
\item One
\item Two
\end{itemize}
\end{document}
`;

async function fakePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage();
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function main(): Promise<void> {
  const injected = injectLaTeXConfig(SAMPLE, DEFAULT_LAYOUT_CONFIG);
  if (!injected.includes("top=0.5in")) {
    throw new Error("geometry inject failed");
  }
  if (!injected.includes("\\linespread{1}")) {
    throw new Error("linespread inject failed");
  }
  if (!injected.includes("itemsep=1pt")) {
    throw new Error("setlist inject failed");
  }

  const mid = configAtTightness(0.5, DEFAULT_LAYOUT_CONFIG, MAX_TIGHT_LAYOUT_CONFIG);
  if (mid.lineSpacing >= DEFAULT_LAYOUT_CONFIG.lineSpacing) {
    throw new Error("tightness lerp failed");
  }

  const two = await fakePdf(2);
  if ((await getPDFPageCount(two)) !== 2) {
    throw new Error("page count failed");
  }

  let calls = 0;
  const result = await fitToSinglePage(SAMPLE, {
    timeoutMs: 5_000,
    compile: async () => {
      calls += 1;
      // First call (defaults) → 2 pages; later → 1 page
      return fakePdf(calls === 1 ? 2 : 1);
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  if (!(result.compiledPdf instanceof Buffer)) {
    throw new Error("missing pdf");
  }
  if ((await getPDFPageCount(result.compiledPdf)) !== 1) {
    throw new Error("fit did not return 1-page pdf");
  }

  console.log("one-page-lock smoke ok", {
    calls,
    finalConfig: result.finalConfig,
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
