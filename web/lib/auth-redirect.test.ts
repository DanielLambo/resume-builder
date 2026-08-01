import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "./auth-redirect";

describe("safeNextPath", () => {
  it("allows known app paths", () => {
    assert.equal(safeNextPath("/dashboard"), "/dashboard");
    assert.equal(safeNextPath("/editor/abc"), "/editor/abc");
    assert.equal(safeNextPath("/onboarding"), "/onboarding");
    assert.equal(safeNextPath("/"), "/");
  });

  it("rejects open redirects", () => {
    assert.equal(safeNextPath("https://evil.example"), "/dashboard");
    assert.equal(safeNextPath("//evil.example"), "/dashboard");
    assert.equal(safeNextPath("/\\evil"), "/dashboard");
    assert.equal(safeNextPath("/login"), "/dashboard");
    assert.equal(safeNextPath(null), "/dashboard");
  });

  it("honors signup fallback", () => {
    assert.equal(safeNextPath(null, "/onboarding"), "/onboarding");
    assert.equal(safeNextPath("//x", "/onboarding"), "/onboarding");
  });
});
