import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { metadataNeedsOnboarding } from "./needs-onboarding";

describe("metadataNeedsOnboarding", () => {
  it("skips completed profiles", () => {
    assert.equal(
      metadataNeedsOnboarding({
        user_metadata: { onboarding_completed: true, onboarding_required: true },
      }),
      false,
    );
  });

  it("only requires the wizard after signup flagged the account", () => {
    assert.equal(
      metadataNeedsOnboarding({
        user_metadata: { onboarding_required: true },
      }),
      true,
    );
  });

  it("does not trap returning logins without the signup flag", () => {
    assert.equal(metadataNeedsOnboarding({ user_metadata: {} }), false);
    assert.equal(
      metadataNeedsOnboarding({
        user_metadata: { onboarding_completed: false },
      }),
      false,
    );
    assert.equal(metadataNeedsOnboarding(null), false);
  });
});
