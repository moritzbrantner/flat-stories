"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadEditorJson, readEditorJsonFile } from "@moenarch/editor-core/browser";
import type { EditorDocument } from "./model";
import { parseProject, serializeProject } from "./projectPersistence";
import { importDocumentFromSvg } from "./svgImport";

type ProjectControlsProps = {
  document: EditorDocument;
  onLoad: (document: EditorDocument) => void;
  onSave?: () => void;
};

function projectFilename(name: string) {
  const stem = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "flat-story";
  return `${stem}.flatstories.json`;
}

export function ProjectControls({ document, onLoad, onSave }: ProjectControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const loadInput = useRef<HTMLInputElement | null>(null);
  const svgInput = useRef<HTMLInputElement | null>(null);

  function saveProject() {
    const envelope = JSON.parse(serializeProject(document)) as unknown;
    downloadEditorJson(envelope, {
      filename: projectFilename(document.name),
      pretty: 2,
    });
    onSave?.();
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = await readEditorJsonFile(file);
      const nextDocument = parseProject(JSON.stringify(parsed));
      onLoad(nextDocument);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load project.");
    }
  }

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const source = await file.text();
      const fallbackName = file.name.replace(/\.svg$/i, "");
      onLoad(importDocumentFromSvg(source, { fallbackName }));
      setError(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import SVG.");
    }
  }

  return <div className="project-controls">
    <button type="button" onClick={saveProject}>Save project</button>
    <button type="button" onClick={() => loadInput.current?.click()}>Load project</button>
    <input ref={loadInput} aria-label="Load project file" type="file" hidden accept=".flatstories.json,application/json" onChange={loadProject} />
    <button type="button" onClick={() => svgInput.current?.click()}>Import SVG</button>
    <input ref={svgInput} aria-label="Import SVG file" type="file" hidden accept=".svg,image/svg+xml" onChange={importSvg} />
    {error ? <output role="alert">{error}</output> : null}
  </div>;
}
