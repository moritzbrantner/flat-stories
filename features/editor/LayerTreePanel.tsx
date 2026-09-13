"use client";

import { useMemo, type MouseEvent } from "react";
import { type LayerEditorSelection } from "@moritzbrantner/layer-editor/core";
import { LayerEditorPanel } from "@moritzbrantner/layer-editor/react";
import type { EditorDocument } from "./model";
import {
  projectFlatStoriesLayers,
  type FlatStoriesLayerData,
} from "./layerAdapter";

type LayerTreePanelProps = {
  document: EditorDocument;
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
};

export function LayerTreePanel({
  document,
  selectedIds,
  onSelectionChange,
}: LayerTreePanelProps) {
  const layers = useMemo(() => projectFlatStoriesLayers(document), [document]);
  const selection = useMemo<LayerEditorSelection>(() => ({
    layerIds: [...selectedIds],
    primaryLayerId: selectedIds.at(-1) ?? null,
  }), [selectedIds]);

  function selectLayer(event: MouseEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!additive) {
      onSelectionChange([id]);
      return;
    }

    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <LayerEditorPanel<FlatStoriesLayerData>
      className="flat-stories-layer-panel"
      document={layers}
      selection={selection}
      readOnly={true}
      features={{
        groupMenus: false,
        historyControls: false,
        keyboardCommands: true,
        layerMenus: false,
        search: false,
        toolbar: false,
      }}
      onSelectionChange={(nextSelection) => onSelectionChange(nextSelection.layerIds)}
      renderLayerLabel={(layer) => (
        <button
          aria-label={`${layer.kind} ${layer.label}`}
          aria-pressed={selectedIds.includes(layer.id)}
          className="flat-stories-layer-label"
          type="button"
          style={{ paddingLeft: `${(layer.data?.depth ?? 0) * 14}px` }}
          onClick={(event) => selectLayer(event, layer.id)}
        >
          <span>{layer.kind}</span>
          {layer.label}
        </button>
      )}
      renderLayerMeta={() => null}
    />
  );
}
