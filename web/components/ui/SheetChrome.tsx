"use client";

import type { ReactNode } from "react";

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

/**
 * Apple-style sheet: dim scrim + material panel.
 * Mobile rises from the bottom; desktop centers. Enter/exit share the path.
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
  if (!open) return null;

  return (
    <div
      className="sheet-scrim fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={() => {
        if (dismissible) onClose();
      }}
    >
      <div
        className={[
          "sheet-panel material-sheet max-h-[92dvh] w-full overflow-auto rounded-t-2xl p-4 sm:rounded-2xl sm:p-5",
          SIZE_CLASS[size],
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
