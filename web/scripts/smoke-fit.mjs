import { fitResumeToSinglePage } from "../lib/fit-resume";
import { DEFAULT_RESUME_LATEX } from "../lib/resume-template";

const r = await fitResumeToSinglePage(DEFAULT_RESUME_LATEX);
console.log(
  JSON.stringify({
    pages: r.pageCount,
    locked: r.lockedToOnePage,
    bytes: r.compiledPdf.length,
    ms: r.elapsedMs,
    margins: r.finalConfig,
  }),
);
