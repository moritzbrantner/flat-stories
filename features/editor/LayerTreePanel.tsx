"use client";

import { useMemo } from "react";
import {
  LayerEditorPanel,
  type LayerEditorSelection,
} from "@moritzbrantner/layer-editor/react";
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
          className="flat-stories-layer-label"
          type="button"
          style={{ paddingLeft: `${(layer.data?.depth ?? 0) * 14}px` }}
        >
          <span>{layer.kind}</span>
          {layer.label}
        </button>
      )}
      renderLayerMeta={() => null}
    />
  );
}
