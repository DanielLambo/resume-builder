"use client";

import { stex } from "@codemirror/legacy-modes/mode/stex";
import { StreamLanguage } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";

import type { SourceSelection } from "@/components/editor/source-selection";

const latexLanguage = StreamLanguage.define(stex);

const studioEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13.5px",
    backgroundColor: "#fffcf7",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: "1.55",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "12px 0 24px",
    caretColor: "#1f1b16",
  },
  ".cm-gutters": {
    backgroundColor: "#f4f0e8",
    borderRight: "1px solid #e4ddd0",
    color: "#8a8478",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#ebe4d8",
    color: "#1f1b16",
  },
  ".cm-activeLine": {
    backgroundColor: "#f3eee4",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#e8d5c4",
  },
});

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
  return (
    <div className="min-h-0 flex-1 overflow-hidden border-t border-studio-border bg-[#fffcf7]">
      <CodeMirror
        value={value}
        height="100%"
        theme={githubLight}
        editable={!disabled}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          indentOnInput: true,
          searchKeymap: true,
        }}
        extensions={[latexLanguage, studioEditorTheme, EditorView.lineWrapping]}
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
  );
}
