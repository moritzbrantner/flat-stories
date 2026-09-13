"use client";

import { useCallback, useState } from "react";
import {
  applyEditorInteractionOperation,
  applyEditorOperation,
  createEditorOperationRuntime,
  redoEditorOperationRuntime,
  undoEditorOperationRuntime,
} from "@moenarch/editor-core/operations";
import type { EditorDocument } from "./model";

type DocumentUpdate =
  | EditorDocument
  | ((document: EditorDocument) => EditorDocument);

type CommitOptions = {
  id: string;
  label?: string;
  mergeKey?: string;
  interaction?: boolean;
};

function createRuntime(document: EditorDocument) {
  return createEditorOperationRuntime<EditorDocument>({
    initialDocument: document,
    operationHistoryLimit: 100,
  });
}

export function useFlatStoriesEditorRuntime(initialDocument: EditorDocument) {
  const [editor, setEditor] = useState(() => createRuntime(initialDocument));

  const commit = useCallback((update: DocumentUpdate, options: CommitOptions) => {
    setEditor((current) => {
      const operation = {
        id: options.id,
        label: options.label,
        mergeKey: options.mergeKey,
        apply: typeof update === "function"
          ? update
          : () => update,
      };

      return options.interaction
        ? applyEditorInteractionOperation(current, operation)
        : applyEditorOperation(current, operation);
    });
  }, []);

  const resetDocument = useCallback((document: EditorDocument) => {
    setEditor(createRuntime(document));
  }, []);

  const undo = useCallback(() => setEditor(undoEditorOperationRuntime), []);
  const redo = useCallback(() => setEditor(redoEditorOperationRuntime), []);

  const endInteraction = useCallback(() => {
    setEditor((current) =>
      applyEditorOperation(
        current,
        {
          id: "interaction-boundary",
          apply: (document) => document,
        },
        { merge: false },
      ),
    );
  }, []);

  return {
    canRedo: editor.canRedo,
    canUndo: editor.canUndo,
    commit,
    document: editor.runtime.document,
    endInteraction,
    redo,
    resetDocument,
    undo,
  };
}
