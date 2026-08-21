import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  project,
  rubberband,
  shouldDismissSheet,
  velocityFromHistory,
} from "./sheet-physics";

describe("sheet physics", () => {
  it("rubberbands less than the raw overshoot", () => {
    const raw = -80;
    const resisted = rubberband(raw, 400);
    assert.ok(resisted > raw);
    assert.ok(resisted < 0);
  });

  it("projects a flick farther than the release point", () => {
    assert.ok(project(800) > 300);
    assert.equal(project(0), 0);
  });

  it("derives px/s from a short pointer history", () => {
    const velocity = velocityFromHistory([
      { y: 100, time: 0 },
      { y: 160, time: 50 },
    ]);
    assert.equal(velocity, 1200);
  });

  it("dismisses on a downward flick, not a slow drag", () => {
    assert.equal(
      shouldDismissSheet({ translateY: 40, velocity: 900, panelHeight: 500 }),
      true,
    );
    assert.equal(
      shouldDismissSheet({ translateY: 20, velocity: 40, panelHeight: 500 }),
      false,
    );
  });
});
