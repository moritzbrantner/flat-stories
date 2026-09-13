import { readFileSync, writeFileSync } from "node:fs";

const path = "features/editor/Editor.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after) {
  if (!source.includes(before)) {
    throw new Error(`Expected migration input not found:\n${before.slice(0, 160)}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
  'import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";',
  'import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";\nimport { isEditorEditableTarget, matchesEditorHotkey } from "@moenarch/editor-core/hotkeys";',
);
replaceOnce(
  'import { CharacterPresetPanel } from "./CharacterPresetPanel";',
  'import { CharacterPresetPanel } from "./CharacterPresetPanel";\nimport { useFlatStoriesEditorRuntime } from "./editorRuntime";\nimport { LayerTreePanel } from "./LayerTreePanel";',
);
replaceOnce('  flattenObjects,\n', '');
replaceOnce(
  'type EditorProps = { initialDocument: EditorDocument };\n',
  'type EditorProps = { initialDocument: EditorDocument };\ntype DocumentUpdate = EditorDocument | ((document: EditorDocument) => EditorDocument);\n',
);
replaceOnce(
  '  const prepared = useMemo(() => browserEditorEngine.prepareDocument(initialDocument), [initialDocument]);\n  const [document, setDocument] = useState(prepared);\n  const [selectedIds, setSelectedIds] = useState<string[]>(() => prepared.objects.at(-1)?.id ? [prepared.objects.at(-1)!.id] : []);\n',
  '  const prepared = useMemo(() => browserEditorEngine.prepareDocument(initialDocument), [initialDocument]);\n  const initialSelection = useMemo(() => prepared.objects.at(-1)?.id ? [prepared.objects.at(-1)!.id] : [], [prepared]);\n  const {\n    canRedo,\n    canUndo,\n    commit,\n    document,\n    endInteraction,\n    redo,\n    resetDocument,\n    undo,\n  } = useFlatStoriesEditorRuntime(prepared);\n  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);\n',
);
replaceOnce(
  '  const idCounter = useRef(0);\n\n  const flatObjects = useMemo(() => flattenObjects(document.objects), [document.objects]);\n',
  '  const idCounter = useRef(0);\n\n  function setDocument(update: DocumentUpdate) {\n    commit(update, { id: "edit-document", label: "Edit document" });\n  }\n\n',
);
replaceOnce(
  '  const canArrange = editingEnabled && canArrangeSelection(document, selectedIds);\n\n  function loadProject(nextDocument: EditorDocument) {',
  '  const canArrange = editingEnabled && canArrangeSelection(document, selectedIds);\n\n  useEffect(() => {\n    function onKeyDown(event: KeyboardEvent) {\n      if (isEditorEditableTarget(event.target)) return;\n      if (matchesEditorHotkey(event, "Mod+Shift+z")) {\n        event.preventDefault();\n        redo();\n        setSelectedIds([]);\n      } else if (matchesEditorHotkey(event, "Mod+z")) {\n        event.preventDefault();\n        undo();\n        setSelectedIds([]);\n      }\n    }\n    window.addEventListener("keydown", onKeyDown);\n    return () => window.removeEventListener("keydown", onKeyDown);\n  }, [redo, undo]);\n\n  function loadProject(nextDocument: EditorDocument) {',
);
replaceOnce(
  '    setDocument(browserEditorEngine.prepareDocument(nextDocument));\n    setSelectedIds([]);\n',
  '    resetDocument(browserEditorEngine.prepareDocument(nextDocument));\n    setSelectedIds([]);\n',
);
replaceOnce(
  '    setDocument((current) => ({ ...current, objects: [...current.objects, object] }));\n    setSelectedIds([object.id]);',
  '    commit((current) => ({ ...current, objects: [...current.objects, object] }), {\n      id: "add-object",\n      label: `Add ${kind}`,\n    });\n    setSelectedIds([object.id]);',
);
replaceOnce(
  '    setDocument((current) => groupRootObjects(current, selectedIds, id));\n    setSelectedIds([id]);',
  '    commit((current) => groupRootObjects(current, selectedIds, id), {\n      id: "group-objects",\n      label: "Group objects",\n    });\n    setSelectedIds([id]);',
);
replaceOnce(
  '    setDocument((current) => ungroupRootObject(current, selectedId));\n    setSelectedIds(childIds);',
  '    commit((current) => ungroupRootObject(current, selectedId), {\n      id: "ungroup-objects",\n      label: "Ungroup objects",\n    });\n    setSelectedIds(childIds);',
);
replaceOnce(
  '    setDocument(result.document);\n    setSelectedIds(result.duplicatedIds);',
  '    commit(result.document, {\n      id: "duplicate-objects",\n      label: "Duplicate objects",\n    });\n    setSelectedIds(result.duplicatedIds);',
);
replaceOnce(
  '    setDocument((current) => patchObjectTransform(current, drag.id, {\n      x: snapToGrid ? snapValue(x, GRID_STEP) : x,\n      y: snapToGrid ? snapValue(y, GRID_STEP) : y,\n    }));',
  '    commit((current) => patchObjectTransform(current, drag.id, {\n      x: snapToGrid ? snapValue(x, GRID_STEP) : x,\n      y: snapToGrid ? snapValue(y, GRID_STEP) : y,\n    }), {\n      id: "move-object",\n      label: "Move object",\n      mergeKey: `move:${drag.id}`,\n      interaction: true,\n    });',
);
replaceOnce(
  '    objectDrag.current = null;\n  }\n\n  return <main className="editor-shell">',
  '    objectDrag.current = null;\n    endInteraction();\n  }\n\n  return <main className="editor-shell">',
);
replaceOnce(
  '        <button type="button" aria-pressed={showRig} onClick={() => setShowRig((current) => !current)}>Rig</button>\n        <ProjectControls document={document} onLoad={loadProject} />',
  '        <button type="button" aria-pressed={showRig} onClick={() => setShowRig((current) => !current)}>Rig</button>\n        <button type="button" disabled={!canUndo} onClick={() => { undo(); setSelectedIds([]); }}>Undo</button>\n        <button type="button" disabled={!canRedo} onClick={() => { redo(); setSelectedIds([]); }}>Redo</button>\n        <ProjectControls document={document} onLoad={loadProject} />',
);
replaceOnce(
  '        <ol className="layers">{flatObjects.map(({ node, depth }) => <li key={node.id}>\n          <button type="button" aria-pressed={selectedIds.includes(node.id)} style={{ paddingLeft: 8 + depth * 14 }}\n            onClick={(event) => selectNode(node.id, event.shiftKey || event.metaKey || event.ctrlKey)}>\n            <span>{node.kind}</span>{node.name}\n          </button>\n        </li>)}</ol>',
  '        <LayerTreePanel document={document} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />',
);

writeFileSync(path, source);

const testPath = "features/editor/Editor.integration.test.tsx";
let tests = readFileSync(testPath, "utf8");
tests = tests.replace(
  'expect(screen.getAllByRole("listitem")).toHaveLength(flattenObjects(fixtureDocument.objects).length + 5);',
  'expect(screen.getAllByRole("treeitem")).toHaveLength(flattenObjects(fixtureDocument.objects).length + 5);',
);
const marker = '  it("edits the selected layer name", async () => {';
if (!tests.includes('restores shared runtime edits through undo and redo')) {
  tests = tests.replace(marker, `  it("restores shared runtime edits through undo and redo", async () => {\n    const user = userEvent.setup();\n    render(<Editor initialDocument={fixtureDocument} />);\n    const toolbar = within(screen.getByRole("complementary", { name: "Drawing tools" }));\n\n    await user.click(toolbar.getByRole("button", { name: "Rectangle" }));\n    expect(screen.getByRole("button", { name: /^rectangle Rectangle$/i })).toBeInTheDocument();\n\n    await user.click(screen.getByRole("button", { name: "Undo" }));\n    expect(screen.queryByRole("button", { name: /^rectangle Rectangle$/i })).not.toBeInTheDocument();\n\n    await user.click(screen.getByRole("button", { name: "Redo" }));\n    expect(screen.getByRole("button", { name: /^rectangle Rectangle$/i })).toBeInTheDocument();\n  });\n\n${marker}`);
}
writeFileSync(testPath, tests);
