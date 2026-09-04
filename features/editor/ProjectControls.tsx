"use client";

import { useState, type ChangeEvent } from "react";
import type { EditorDocument } from "./model";
import { parseProject, serializeProject } from "./projectPersistence";

type ProjectControlsProps = {
  document: EditorDocument;
  onLoad: (document: EditorDocument) => void;
};

function projectFilename(name: string) {
  const stem = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "flat-story";
  return `${stem}.flatstories.json`;
}

export function ProjectControls({ document, onLoad }: ProjectControlsProps) {
  const [error, setError] = useState<string | null>(null);

  function saveProject() {
    const source = serializeProject(document);
    const blob = new Blob([source], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = projectFilename(document.name);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const nextDocument = parseProject(await file.text());
      onLoad(nextDocument);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load project.");
    }
  }

  return <div className="project-controls">
    <button type="button" onClick={saveProject}>Save project</button>
    <label>Load project<input aria-label="Load project file" type="file" accept=".flatstories.json,application/json" onChange={loadProject} /></label>
    {error ? <output role="alert">{error}</output> : null}
  </div>;
}
