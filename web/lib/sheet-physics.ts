/** Apple fluid-interface math for mobile sheets. */

export const DISMISS_VELOCITY = 600;
export const POSITION_HISTORY_MS = 100;

export type PositionSample = {
  y: number;
  time: number;
};

/** Progressive resistance past a bound. Hard stops read as frozen. */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot));
}

/** Exponential projection of where a flick is heading (WWDC 2018). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

export function velocityFromHistory(
  history: readonly PositionSample[],
): number {
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last || first === last) return 0;
  const elapsed = Math.max(last.time - first.time, 1);
  return ((last.y - first.y) / elapsed) * 1000;
}

export function shouldDismissSheet(input: {
  translateY: number;
  velocity: number;
  panelHeight: number;
}): boolean {
  const positionThreshold = Math.min(input.panelHeight * 0.35, 240);
  const projected = input.translateY + project(input.velocity);
  return input.velocity > DISMISS_VELOCITY || projected > positionThreshold;
}
