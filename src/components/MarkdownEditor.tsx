import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { redo, undo, defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder as editorPlaceholder } from "@codemirror/view";

export type MarkdownEditorHandle = {
  focus: () => void;
};

type MarkdownEditorProps = {
  active: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
  onPasteImage?: (label: string) => void;
  placeholder: string;
  value: string;
};

type MarkdownEditorTestApi = MarkdownEditorHandle & {
  getValue: () => string;
  redo: () => boolean;
  setValue: (value: string) => void;
  undo: () => boolean;
};

type MarkdownEditorElement = HTMLDivElement & {
  __markdownEditor?: MarkdownEditorTestApi;
};

type MarkdownEditorContentElement = HTMLDivElement & {
  __markdownEditor?: MarkdownEditorTestApi;
};

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { active, ariaLabel, onChange, onPasteImage, placeholder, value },
  ref,
) {
  const hostRef = useRef<MarkdownEditorElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const activeCompartmentRef = useRef(new Compartment());
  const accessibilityCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const editableExtension = activeCompartmentRef.current.of(EditorView.editable.of(active));
    const accessibilityExtension = accessibilityCompartmentRef.current.of(
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        "data-placeholder": placeholder,
        role: "textbox",
        spellcheck: "false",
        tabindex: active ? "0" : "-1",
      }),
    );

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          EditorView.lineWrapping,
          history(),
          markdown(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          editorPlaceholder(placeholder),
          editableExtension,
          accessibilityExtension,
          EditorView.domEventHandlers({
            paste(event) {
              const items = Array.from(event.clipboardData?.items ?? []);
              const imageItem = items.find((item) => item.type.startsWith("image/"));
              if (!imageItem) {
                return false;
              }

              event.preventDefault();
              const file = imageItem.getAsFile();
              onPasteImage?.(file?.name || "Pasted image");
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return;
            }

            onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });

    viewRef.current = view;
    const testApi: MarkdownEditorTestApi = {
      focus: () => view.focus(),
      getValue: () => view.state.doc.toString(),
      redo: () => redo(view),
      setValue: (nextValue: string) => {
        const currentValue = view.state.doc.toString();
        view.dispatch({
          changes: { from: 0, insert: nextValue, to: currentValue.length },
          selection: { anchor: nextValue.length },
          annotations: Transaction.userEvent.of("input"),
        });
      },
      undo: () => undo(view),
    };
    host.__markdownEditor = testApi;
    (view.contentDOM as MarkdownEditorContentElement).__markdownEditor = testApi;

    return () => {
      if (host.__markdownEditor) {
        delete host.__markdownEditor;
      }
      const content = view.contentDOM as MarkdownEditorContentElement;
      if (content.__markdownEditor) {
        delete content.__markdownEditor;
      }
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    view.dispatch({
      effects: activeCompartmentRef.current.reconfigure(EditorView.editable.of(active)),
    });
    view.dispatch({
      effects: accessibilityCompartmentRef.current.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          "aria-multiline": "true",
          "data-placeholder": placeholder,
          role: "textbox",
          spellcheck: "false",
          tabindex: active ? "0" : "-1",
        }),
      ),
    });
  }, [active, ariaLabel, placeholder]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();
    if (currentValue === value) {
      return;
    }

    view.dispatch({
      changes: { from: 0, insert: value, to: currentValue.length },
      selection: { anchor: value.length },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

  return <div className="markdown-editor" data-testid="markdown-editor" ref={hostRef} />;
});
