"use client";

import type { EditorDocument } from "./model";
import { exportDocumentToSvg } from "./svgExport";

function exportFilename(name: string) {
  const stem = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "flat-story";
  return `${stem}.svg`;
}

export function SvgExportButton({ document: editorDocument }: { document: EditorDocument }) {
  function exportSvg() {
    const svg = exportDocumentToSvg(editorDocument);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = exportFilename(editorDocument.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <button type="button" onClick={exportSvg}>Export SVG</button>;
}
