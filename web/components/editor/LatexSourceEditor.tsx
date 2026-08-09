"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { redo, selectAll, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { ViewUpdate } from "@codemirror/view";
import { Redo2, Search, TextSelect, Undo2 } from "lucide-react";

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
/** High-contrast selection — previous #5c3a38 was nearly invisible on IDE_BG. */
const SELECTION_BG = "#2f6fed";
const SELECTION_BG_BLUR = "#1e4a9a";

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
      /* Allow click-drag text selection; pan still works for scrollbars/wheel. */
      touchAction: "auto",
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
    /*
     * CRITICAL: drawSelection paints .cm-selectionLayer *behind* .cm-content
     * (z-index -1). Opaque backgrounds on .cm-content / .cm-line / .cm-activeLine
     * completely hide the highlight. Keep those transparent; put the editor
     * fill on .cm-scroller / root instead.
     */
    ".cm-content": {
      padding: "8px 0 28px",
      caretColor: IDE_INK,
      minHeight: "100%",
      backgroundColor: "transparent !important",
      color: IDE_INK,
      userSelect: "text",
      WebkitUserSelect: "text",
    },
    ".cm-line": {
      backgroundColor: "transparent !important",
      userSelect: "text",
      WebkitUserSelect: "text",
    },
    ".cm-gutters": {
      backgroundColor: `${IDE_GUTTER} !important`,
      borderRight: "1px solid #5c534e",
      color: "#8a827a",
      userSelect: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: IDE_LINE,
      color: IDE_INK,
    },
    /* Soft so selection still shows through on the active line */
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.045)",
    },
    /* Match CodeMirror’s own selector specificity */
    ".cm-selectionBackground": {
      backgroundColor: `${SELECTION_BG_BLUR} !important`,
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: `${SELECTION_BG} !important`,
    },
    ".cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: `${SELECTION_BG_BLUR} !important`,
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#E54B4B",
    },
  },
  { dark: true },
);

/** Stable — new object each render would reconfigure CodeMirror and break shortcuts. */
const EDITOR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  highlightSpecialChars: true,
  drawSelection: true,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: true,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: true,
  rectangularSelection: true,
  crosshairCursor: false,
  highlightSelectionMatches: true,
  defaultKeymap: true,
  historyKeymap: true,
  searchKeymap: true,
  history: true,
  foldKeymap: true,
  completionKeymap: true,
  lintKeymap: true,
} as const;

/**
 * Beat CodeMirror's macOS emacs binding (Ctrl-a = line start) and guarantee
 * select-all for both Ctrl and Cmd before any other keymap runs.
 */
const selectAllDomHandler = Prec.highest(
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.altKey || event.isComposing) return false;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key !== "a" && key !== "A") return false;
      if (!event.ctrlKey && !event.metaKey) return false;
      event.preventDefault();
      event.stopPropagation();
      selectAll(view);
      return true;
    },
  }),
);

/** Prefer extending the caret selection over drag-moving selected text. */
const preferSelectOverDrag = EditorView.dragMovesSelection.of(() => false);

type LatexSourceEditorProps = {
  value: string;
  disabled?: boolean;
  /** When set, scroll/select that 1-based line (e.g. compile error). */
  jumpToLine?: number | null;
  onJumped?: () => void;
  onChange: (value: string) => void;
  onSelectionChange: (selection: SourceSelection | null) => void;
};

export function LatexSourceEditor({
  value,
  disabled = false,
  jumpToLine = null,
  onJumped,
  onChange,
  onSelectionChange,
}: LatexSourceEditorProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onChangeRef.current = onChange;
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    if (jumpToLine == null) return;
    const view = cmRef.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    const safeLine = Math.max(1, Math.min(jumpToLine, doc.lines));
    const line = doc.line(safeLine);
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    onJumped?.();
  }, [jumpToLine, onJumped]);

  const handleChange = useCallback((next: string) => {
    onChangeRef.current(next);
  }, []);

  /** Keep selection tracking out of the `onUpdate` prop (avoids reconfigure thrash). */
  const selectionListener = useMemo(
    () =>
      EditorView.updateListener.of((viewUpdate: ViewUpdate) => {
        if (!viewUpdate.selectionSet && !viewUpdate.docChanged) return;
        const range = viewUpdate.state.selection.main;
        if (range.empty) {
          onSelectionChangeRef.current(null);
          return;
        }
        onSelectionChangeRef.current({
          start: range.from,
          end: range.to,
          text: viewUpdate.state.sliceDoc(range.from, range.to),
        });
      }),
    [],
  );

  const extensions = useMemo(
    () => [
      latexLanguage,
      syntaxHighlighting(latexHighlightStyle),
      EditorView.lineWrapping,
      preferSelectOverDrag,
      selectAllDomHandler,
      selectionListener,
    ],
    [selectionListener],
  );

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
        <ToolbarIcon
          label="Select all"
          disabled={disabled}
          onClick={() => withView((view) => {
            selectAll(view);
            view.focus();
          })}
        >
          <TextSelect className="h-3.5 w-3.5" strokeWidth={1.75} />
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
          className="absolute inset-0 h-full min-h-0 bg-ide-bg [&_.cm-editor]:h-full [&_.cm-editor]:max-h-full [&_.cm-editor]:bg-ide-bg [&_.cm-scroller]:bg-ide-bg [&_.cm-scroller]:overscroll-contain [&_.cm-content]:!bg-transparent"
          editable={!disabled}
          basicSetup={EDITOR_BASIC_SETUP}
          extensions={extensions}
          onChange={handleChange}
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
