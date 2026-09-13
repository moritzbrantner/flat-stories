"use client";

import { useCallback, useState } from "react";
import {
  markEditorRuntimeSaved,
  resetEditorRuntime,
  setEditorRuntimeSelection,
} from "@moenarch/editor-core/runtime";
import {
  applyEditorInteractionOperation,
  applyEditorOperation,
  createEditorOperationRuntime,
  redoEditorOperationRuntime,
  replaceEditorOperationRuntimeCoreState,
  undoEditorOperationRuntime,
} from "@moenarch/editor-core/operations";
import type { EditorDocument } from "./model";

export type FlatStoriesSelection = string[];

type DocumentUpdate =
  | EditorDocument
  | ((document: EditorDocument) => EditorDocument);

type CommitOptions = {
  id: string;
  label?: string;
  mergeKey?: string;
  selectionAfter?: FlatStoriesSelection;
  interaction?: boolean;
  recordHistory?: boolean;
};

export function useFlatStoriesEditorRuntime(
  initialDocument: EditorDocument,
  initialSelection: FlatStoriesSelection,
) {
  const [editor, setEditor] = useState(() =>
    createEditorOperationRuntime<EditorDocument, FlatStoriesSelection>({
      initialDocument,
      initialSelection,
      operationHistoryLimit: 100,
    }),
  );

  const commit = useCallback((update: DocumentUpdate, options: CommitOptions) => {
    setEditor((current) => {
      const operation = {
        id: options.id,
        label: options.label,
        mergeKey: options.mergeKey,
        selectionAfter: options.selectionAfter,
        apply: typeof update === "function"
          ? update
          : () => update,
      };

      return options.interaction
        ? applyEditorInteractionOperation(current, operation)
        : applyEditorOperation(current, operation, {
            recordHistory: options.recordHistory,
          });
    });
  }, []);

  const setSelection = useCallback((
    update: FlatStoriesSelection | ((current: FlatStoriesSelection) => FlatStoriesSelection),
  ) => {
    setEditor((current) => {
      const previous = current.runtime.selection ?? [];
      const selection = typeof update === "function" ? update(previous) : update;
      const runtime = setEditorRuntimeSelection(current.runtime, [...selection]);
      return replaceEditorOperationRuntimeCoreState(current, runtime);
    });
  }, []);

  const resetDocument = useCallback((document: EditorDocument) => {
    setEditor((current) => {
      const runtime = resetEditorRuntime(current.runtime, document, {
        selection: [],
        markSaved: true,
      });
      return replaceEditorOperationRuntimeCoreState(current, runtime, {
        clearIssues: true,
        clearOperationHistory: true,
      });
    });
  }, []);

  const markSaved = useCallback(() => {
    setEditor((current) =>
      replaceEditorOperationRuntimeCoreState(
        current,
        markEditorRuntimeSaved(current.runtime),
      ),
    );
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
        { merge: false, recordHistory: false },
      ),
    );
  }, []);

  return {
    canRedo: editor.canRedo,
    canUndo: editor.canUndo,
    commit,
    document: editor.runtime.document,
    endInteraction,
    markSaved,
    redo,
    resetDocument,
    selectedIds: editor.runtime.selection ?? [],
    setSelection,
    status: editor.runtime.status,
    undo,
  };
}
