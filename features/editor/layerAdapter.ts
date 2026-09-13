import {
  moveLayerEditorLayer,
  type LayerEditorDocument,
  type LayerEditorLayer,
} from "@moritzbrantner/layer-editor/core";
import type { EditorDocument, EditorObject } from "./model";
import { flattenObjects } from "./sceneGraph";

export type FlatStoriesLayerData = {
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
};

export type FlatStoriesLayerDocument = LayerEditorDocument<FlatStoriesLayerData>;

function projectObject(
  object: EditorObject,
  depth: number,
  parentId: string | null,
): LayerEditorLayer<FlatStoriesLayerData> {
  return {
    id: object.id,
    label: object.name,
    kind: object.kind,
    visible: object.visible,
    locked: object.locked,
    opacity: object.opacity,
    data: {
      depth,
      parentId,
      hasChildren: object.kind === "group" && object.children.length > 0,
    },
  };
}

export function projectFlatStoriesLayers(document: EditorDocument): FlatStoriesLayerDocument {
  return {
    layers: flattenObjects(document.objects).map(({ node, depth, parentId }) =>
      projectObject(node, depth, parentId),
    ),
  };
}

export function reorderFlatStoriesSiblings(
  siblings: readonly EditorObject[],
  id: string,
  targetIndex: number,
): EditorObject[] {
  const projected: FlatStoriesLayerDocument = {
    layers: siblings.map((object) => projectObject(object, 0, null)),
  };
  const reordered = moveLayerEditorLayer(projected, id, targetIndex);
  if (reordered === projected) return siblings as EditorObject[];

  const objectsById = new Map(siblings.map((object) => [object.id, object]));
  return reordered.layers.map((layer) => {
    const object = objectsById.get(layer.id);
    if (!object) throw new Error(`Layer projection lost scene object ${layer.id}.`);
    return object;
  });
}
