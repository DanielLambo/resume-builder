"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  POSITION_HISTORY_MS,
  rubberband,
  shouldDismissSheet,
  velocityFromHistory,
  type PositionSample,
} from "@/lib/sheet-physics";

type SheetChromeProps = {
  open: boolean;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** sm ≈ quota, md ≈ tailor, lg ≈ templates */
  size?: "sm" | "md" | "lg";
  testId?: string;
  /** When false, backdrop click does not close (busy flows). */
  dismissible?: boolean;
};

const SIZE_CLASS: Record<NonNullable<SheetChromeProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

const MOBILE_QUERY = "(max-width: 639px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type DragState = {
  pointerId: number;
  startY: number;
  startTranslate: number;
  history: PositionSample[];
};

function presentationTranslateY(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  const values = transform
    .slice(transform.indexOf("(") + 1, transform.lastIndexOf(")"))
    .split(",")
    .map(Number);
  if (transform.startsWith("matrix3d")) return values[13] ?? 0;
  return values[5] ?? 0;
}

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Apple-style sheet: dim scrim + material panel.
 * Mobile tracks a drag 1:1, projects release momentum, and hands velocity to
 * an interruptible spring. Desktop remains a stable centered dialog.
 */
export function SheetChrome({
  open,
  titleId,
  onClose,
  children,
  size = "md",
  testId,
  dismissible = true,
}: SheetChromeProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const translateRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  const stopSpring = useCallback(() => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const paint = useCallback((translateY: number) => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;

    translateRef.current = translateY;
    panel.style.transform = `translate3d(0, ${translateY}px, 0)`;
    const fadeDistance = Math.max(panel.offsetHeight * 0.8, 1);
    const progress = Math.min(1, Math.max(0, translateY / fadeDistance));
    scrim.style.backgroundColor = `rgba(26, 26, 26, ${0.34 * (1 - progress)})`;
  }, []);

  const restAtClosed = useCallback(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    translateRef.current = 0;
    if (panel) {
      panel.style.removeProperty("transform");
      panel.style.removeProperty("animation");
      panel.dataset.dragging = "false";
    }
    scrim?.style.removeProperty("background-color");
  }, []);

  const springTo = useCallback((
    target: number,
    initialVelocity: number,
    onSettled?: () => void,
  ) => {
    stopSpring();
    if (prefersReducedMotion()) {
      paint(target);
      onSettled?.();
      return;
    }

    let position = translateRef.current;
    let velocity = initialVelocity;
    let previousTime = performance.now();
    // Return is critically damped; a momentum dismissal gets slight overshoot.
    const stiffness = target === 0 ? 280 : 210;
    const damping = target === 0 ? 36 : 26;

    const tick = (time: number) => {
      const deltaSeconds = Math.min((time - previousTime) / 1000, 1 / 20);
      previousTime = time;
      const substeps = Math.max(1, Math.ceil(deltaSeconds / (1 / 120)));
      const step = deltaSeconds / substeps;
      for (let index = 0; index < substeps; index += 1) {
        const acceleration = stiffness * (target - position) - damping * velocity;
        velocity += acceleration * step;
        position += velocity * step;
      }
      if (!Number.isFinite(position) || !Number.isFinite(velocity)) {
        paint(target);
        animationFrameRef.current = null;
        onSettled?.();
        return;
      }
      paint(position);

      if (Math.abs(target - position) < 0.6 && Math.abs(velocity) < 12) {
        paint(target);
        animationFrameRef.current = null;
        onSettled?.();
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [paint, stopSpring]);

  const dismiss = useCallback((velocity = 0) => {
    if (!dismissible) return;
    const panel = panelRef.current;
    if (!panel || !isMobileViewport() || prefersReducedMotion()) {
      onClose();
      return;
    }
    springTo(panel.offsetHeight + 32, Math.max(velocity, 0), onClose);
  }, [dismissible, onClose, springTo]);

  useEffect(() => {
    if (!open) return;
    stopSpring();
    restAtClosed();
    dragRef.current = null;
  }, [open, restAtClosed, stopSpring]);

  useEffect(() => () => stopSpring(), [stopSpring]);

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dismissible || !isMobileViewport() || event.button !== 0) return;

    const panel = panelRef.current;
    if (!panel) return;
    stopSpring();
    panel.style.animation = "none";
    panel.dataset.dragging = "true";
    const currentTranslate = presentationTranslateY(panel);
    paint(Number.isFinite(currentTranslate) ? currentTranslate : translateRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTranslate: translateRef.current,
      history: [{ y: event.clientY, time: now }],
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rawTranslate = drag.startTranslate + event.clientY - drag.startY;
    const panelHeight = panelRef.current?.offsetHeight ?? window.innerHeight;
    paint(rawTranslate < 0 ? rubberband(rawTranslate, panelHeight) : rawTranslate);

    const now = performance.now();
    drag.history.push({ y: event.clientY, time: now });
    drag.history = drag.history.filter(
      (sample) => now - sample.time <= POSITION_HISTORY_MS,
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (panelRef.current) panelRef.current.dataset.dragging = "false";

    const now = performance.now();
    drag.history.push({ y: event.clientY, time: now });
    drag.history = drag.history.filter(
      (sample) => now - sample.time <= POSITION_HISTORY_MS,
    );
    const velocity = velocityFromHistory(drag.history);
    const panelHeight = panelRef.current?.offsetHeight ?? window.innerHeight;

    if (shouldDismissSheet({ translateY: translateRef.current, velocity, panelHeight })) {
      dismiss(velocity);
      return;
    }
    springTo(0, velocity, restAtClosed);
  }

  function cancelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (panelRef.current) panelRef.current.dataset.dragging = "false";
    springTo(0, 0, restAtClosed);
  }

  if (!open) return null;

  return (
    <div
      ref={scrimRef}
      className="sheet-scrim fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={() => {
        dismiss();
      }}
    >
      <div
        ref={panelRef}
        className={[
          "sheet-panel material-sheet max-h-[92dvh] w-full overflow-auto rounded-t-2xl p-4 sm:rounded-2xl sm:p-5",
          SIZE_CLASS[size],
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="sheet-drag-handle -mx-2 -mt-4 mb-1 flex h-11 w-[calc(100%+1rem)] touch-none items-center justify-center sm:hidden"
          aria-label="Drag down to close"
          disabled={!dismissible}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelDrag}
        >
          <span
            className="h-1.5 w-10 rounded-full bg-studio-ink/20"
            aria-hidden="true"
          />
        </button>
        {children}
      </div>
    </div>
  );
}
