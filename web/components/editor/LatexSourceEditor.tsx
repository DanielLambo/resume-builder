"use client";

import { useRef, type ReactNode } from "react";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Redo2, Search, Undo2 } from "lucide-react";

import type { SourceSelection } from "@/components/editor/source-selection";

const latexLanguage = StreamLanguage.define(stex);

/**
 * VS Code / JetBrains–style LaTeX tokens on warm charcoal.
 * stex emits: tagName (\\cmd), keyword ($, &, math), atom (env names),
 * bracket, comment, number, string, variableName.special.
 */
const latexHighlightStyle = HighlightStyle.define([
  { tag: t.tagName, color: "#79B8FF", fontWeight: "600" },
  { tag: t.keyword, color: "#F97583" },
  { tag: t.atom, color: "#B392F0" },
  { tag: t.bool, color: "#B392F0" },
  { tag: t.number, color: "#79C0FF" },
  { tag: t.string, color: "#9ECBFF" },
  { tag: t.comment, color: "#8B949E", fontStyle: "italic" },
  { tag: t.bracket, color: "#E3B341" },
  { tag: t.brace, color: "#E3B341" },
  { tag: t.paren, color: "#E3B341" },
  { tag: t.squareBracket, color: "#E3B341" },
  { tag: t.punctuation, color: "#C9D1D9" },
  { tag: t.operator, color: "#F97583" },
  { tag: t.special(t.variableName), color: "#FFA657" },
  { tag: t.variableName, color: "#FFA657" },
  { tag: t.standard(t.variableName), color: "#7EE787" },
  { tag: t.definition(t.variableName), color: "#7EE787" },
  { tag: t.meta, color: "#D2A8FF" },
  { tag: t.processingInstruction, color: "#79B8FF" },
  { tag: t.invalid, color: "#FF7B72", textDecoration: "underline wavy" },
]);

const IDE_BG = "#252220";
const IDE_GUTTER = "#1f1c1b";
const IDE_LINE = "#2e2928";
const IDE_INK = "#E6EDF3";

const ideEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      maxHeight: "100%",
      fontSize: "13px",
      backgroundColor: `${IDE_BG} !important`,
      color: IDE_INK,
      colorScheme: "dark",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily:
        'var(--font-geist-mono), "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: "1.55",
      backgroundColor: `${IDE_BG} !important`,
      overflowX: "auto",
      overflowY: "scroll",
      overscrollBehavior: "contain",
      touchAction: "pan-x pan-y",
      scrollbarGutter: "stable",
      scrollbarWidth: "auto",
      scrollbarColor: `#8a827a ${IDE_GUTTER}`,
    },
    ".cm-scroller::-webkit-scrollbar": {
      width: "11px",
      height: "11px",
    },
    ".cm-scroller::-webkit-scrollbar-track": {
      background: IDE_GUTTER,
    },
    ".cm-scroller::-webkit-scrollbar-thumb": {
      backgroundColor: "#8a827a",
      borderRadius: "6px",
      border: `2px solid ${IDE_GUTTER}`,
    },
    ".cm-scroller::-webkit-scrollbar-thumb:hover": {
      backgroundColor: "#a39a90",
    },
    ".cm-content": {
      padding: "8px 0 28px",
      caretColor: IDE_INK,
      minHeight: "100%",
      backgroundColor: `${IDE_BG} !important`,
      color: IDE_INK,
    },
    ".cm-line": {
      backgroundColor: "transparent",
    },
    ".cm-gutters": {
      backgroundColor: `${IDE_GUTTER} !important`,
      borderRight: "1px solid #5c534e",
      color: "#8a827a",
    },
    ".cm-activeLineGutter": {
      backgroundColor: IDE_LINE,
      color: IDE_INK,
    },
    ".cm-activeLine": {
      backgroundColor: `${IDE_LINE} !important`,
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#5c3a38 !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#E54B4B",
    },
  },
  { dark: true },
);

type LatexSourceEditorProps = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSelectionChange: (selection: SourceSelection | null) => void;
};

export function LatexSourceEditor({
  value,
  disabled = false,
  onChange,
  onSelectionChange,
}: LatexSourceEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  function withView(run: (view: EditorView) => void) {
    const view = cmRef.current?.view;
    if (!view || disabled) return;
    run(view);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-ide-bg">
      <div
        className="flex h-8 shrink-0 items-center gap-0.5 border-b border-ide-border bg-ide-panel px-1.5"
        data-testid="source-ide-toolbar"
      >
        <ToolbarIcon
          label="Undo"
          disabled={disabled}
          onClick={() => withView((view) => {
            undo(view);
          })}
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </ToolbarIcon>
        <ToolbarIcon
          label="Redo"
          disabled={disabled}
          onClick={() => withView((view) => {
            redo(view);
          })}
        >
          <Redo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </ToolbarIcon>
        <span className="mx-1 h-3.5 w-px bg-ide-border" aria-hidden />
        <ToolbarIcon
          label="Search"
          disabled={disabled}
          onClick={() => withView((view) => {
            openSearchPanel(view);
          })}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        </ToolbarIcon>
      </div>
      {/* Absolute fill so CodeMirror gets a real height and .cm-scroller can scroll */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          ref={cmRef}
          value={value}
          height="100%"
          // Force dark; without this, @uiw/react-codemirror defaults to a white light theme.
          theme={ideEditorTheme}
          className="absolute inset-0 h-full min-h-0 bg-ide-bg [&_.cm-editor]:h-full [&_.cm-editor]:max-h-full [&_.cm-editor]:bg-ide-bg [&_.cm-scroller]:bg-ide-bg [&_.cm-scroller]:overscroll-contain [&_.cm-content]:bg-ide-bg"
          editable={!disabled}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: true,
            indentOnInput: true,
            searchKeymap: true,
            history: true,
          }}
          extensions={[
            latexLanguage,
            syntaxHighlighting(latexHighlightStyle),
            EditorView.lineWrapping,
          ]}
          onChange={(next) => {
            onChange(next);
          }}
          onUpdate={(viewUpdate) => {
            if (!viewUpdate.selectionSet && !viewUpdate.docChanged) return;
            const range = viewUpdate.state.selection.main;
            if (range.empty) {
              onSelectionChange(null);
              return;
            }
            onSelectionChange({
              start: range.from,
              end: range.to,
              text: viewUpdate.state.sliceDoc(range.from, range.to),
            });
          }}
        />
      </div>
    </div>
  );
}

function ToolbarIcon({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center rounded-sm text-ide-muted transition hover:bg-ide-hover hover:text-ide-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
