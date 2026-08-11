import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSingleFileTar } from "./ustar";

describe("createSingleFileTar", () => {
  it("builds a ustar with the file contents", () => {
    const body = "\\documentclass{article}\\begin{document}Hi\\end{document}\n";
    const tar = createSingleFileTar("main.tex", body);
    assert.ok(tar.length >= 512 * 3);
    assert.equal(tar.subarray(0, 8).toString("utf8"), "main.tex");
    const dataStart = 512;
    assert.equal(
      tar.subarray(dataStart, dataStart + body.length).toString("utf8"),
      body,
    );
  });
});
