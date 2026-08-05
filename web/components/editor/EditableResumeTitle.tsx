"use client";

import {
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";

type EditableResumeTitleProps = {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
};

/**
 * Double-click / double-tap the resume name to rename it inline.
 */
export function EditableResumeTitle({
  value,
  disabled = false,
  onCommit,
}: EditableResumeTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  function beginEdit() {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function commit() {
    const next = draft.trim().slice(0, 120) || "Untitled Resume";
    setEditing(false);
    if (next !== value) onCommit(next);
  }

  function onTouchEnd(event: ReactTouchEvent<HTMLButtonElement>) {
    if (disabled) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      event.preventDefault();
      beginEdit();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-testid="resume-title-input"
        aria-label="Resume name"
        maxLength={120}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="min-w-0 max-w-[12rem] truncate rounded-sm border border-ide-border bg-ide-raised px-1 py-0.5 text-[0.75rem] font-medium tracking-tight text-ide-ink outline-none ring-1 ring-ide-accent/50 sm:max-w-[16rem]"
      />
    );
  }

  return (
    <button
      type="button"
      data-testid="resume-title"
      disabled={disabled}
      title="Double-click to rename"
      aria-label={`Resume name: ${value}. Double-click to rename.`}
      onDoubleClick={(e) => {
        e.preventDefault();
        beginEdit();
      }}
      onTouchEnd={onTouchEnd}
      className="min-w-0 truncate text-left text-[0.75rem] font-medium tracking-tight text-ide-ink transition hover:text-white disabled:opacity-60"
    >
      {value}
    </button>
  );
}
