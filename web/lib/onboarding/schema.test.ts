import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OnboardingDataSchema,
  OnboardingFieldsSchema,
} from "./schema";

describe("OnboardingFieldsSchema", () => {
  it("supports pick and partial used by the wizard", () => {
    assert.equal(
      OnboardingFieldsSchema.pick({ fullName: true }).safeParse({
        fullName: "Al",
      }).success,
      true,
    );
    assert.equal(
      OnboardingFieldsSchema.pick({ fullName: true }).safeParse({
        fullName: "A",
      }).success,
      false,
    );
    assert.equal(
      OnboardingFieldsSchema.partial().safeParse({ fullName: "Alex" }).success,
      true,
    );
  });
});

describe("OnboardingDataSchema", () => {
  it("requires other-referral text", () => {
    const result = OnboardingDataSchema.safeParse({
      fullName: "Alex Rivera",
      avatarColor: "#C44B3B",
      referralSource: "other",
      referralOtherText: "",
      jobTypes: [],
      targetFields: [],
    });
    assert.equal(result.success, false);
  });
});
