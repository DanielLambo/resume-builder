"use client";

import { useRef, type ReactNode } from "react";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { StreamLanguage } from "@codemirror/language";
import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { githubDark } from "@uiw/codemirror-theme-github";
import { Redo2, Search, Undo2 } from "lucide-react";

import type { SourceSelection } from "@/components/editor/source-selection";

const latexLanguage = StreamLanguage.define(stex);

const ideEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      backgroundColor: "#1a1d23",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily:
        'var(--font-geist-mono), "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "8px 0 20px",
      caretColor: "#e6e8ec",
    },
    ".cm-gutters": {
      backgroundColor: "#16181c",
      borderRight: "1px solid #2e333c",
      color: "#5c6370",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#22262e",
      color: "#e6e8ec",
    },
    ".cm-activeLine": {
      backgroundColor: "#22262e",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#264f78",
    },
    ".cm-cursor": {
      borderLeftColor: "#e6e8ec",
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ide-bg">
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
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          ref={cmRef}
          value={value}
          height="100%"
          theme={githubDark}
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
          extensions={[latexLanguage, ideEditorTheme, EditorView.lineWrapping]}
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
