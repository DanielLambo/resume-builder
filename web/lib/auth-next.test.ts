import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSetupDestination,
  onboardingPathWithNext,
  safeNextPath,
  trySafeNextPath,
} from "./auth-next";

describe("safeNextPath", () => {
  it("allows in-app destinations", () => {
    assert.equal(safeNextPath("/dashboard"), "/dashboard");
    assert.equal(safeNextPath("/import?autostart=1"), "/import?autostart=1");
    assert.equal(safeNextPath("/editor/abc"), "/editor/abc");
    assert.equal(safeNextPath("/dashboard?tour=1"), "/dashboard?tour=1");
  });

  it("rejects open redirects", () => {
    assert.equal(safeNextPath("https://evil.test"), "/dashboard");
    assert.equal(safeNextPath("//evil.test"), "/dashboard");
    assert.equal(safeNextPath("/login"), "/dashboard");
    assert.equal(safeNextPath(null), "/dashboard");
  });
});

describe("trySafeNextPath", () => {
  it("returns null for missing or unsafe values", () => {
    assert.equal(trySafeNextPath(null), null);
    assert.equal(trySafeNextPath("/login"), null);
    assert.equal(trySafeNextPath("/import?autostart=1"), "/import?autostart=1");
  });
});

describe("isSetupDestination", () => {
  it("detects onboarding", () => {
    assert.equal(isSetupDestination("/onboarding"), true);
    assert.equal(isSetupDestination("/dashboard"), false);
  });
});

describe("onboardingPathWithNext", () => {
  it("keeps deep links on the wizard URL", () => {
    assert.equal(
      onboardingPathWithNext("/import?autostart=1"),
      "/onboarding?next=%2Fimport%3Fautostart%3D1",
    );
    assert.equal(onboardingPathWithNext("/dashboard"), "/onboarding");
    assert.equal(onboardingPathWithNext("/onboarding"), "/onboarding");
  });
});
