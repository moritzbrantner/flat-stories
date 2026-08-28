import type { EditorDocument } from "./model";

/** Computational seam for A1. Browser events, React state, and SVG rendering stay outside it. */
export type EditorEngine = {
  prepareDocument(document: EditorDocument): EditorDocument;
};

export const browserEditorEngine: EditorEngine = {
  prepareDocument: (document) => structuredClone(document),
};
