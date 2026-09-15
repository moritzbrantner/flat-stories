import type { EditorDocument } from "../model";
import { buildRenderFrame, type RenderFrame } from "./renderFrame";
import { referenceTransformKernel, type TransformKernel } from "./transformKernel";

export type RenderCompositionLayerKind = "onion-previous" | "onion-next" | "current";

export type RenderCompositionLayerInput = {
  kind: RenderCompositionLayerKind;
  document: EditorDocument;
  opacity: number;
  hitTestable: boolean;
};

export type RenderCompositionLayer = Omit<RenderCompositionLayerInput, "document"> & {
  frame: RenderFrame;
};

export type RenderComposition = {
  width: number;
  height: number;
  layers: RenderCompositionLayer[];
  hitTestFrame: RenderFrame;
};

export function buildRenderComposition(
  layers: readonly RenderCompositionLayerInput[],
  kernel: TransformKernel = referenceTransformKernel,
): RenderComposition {
  if (layers.length === 0) throw new Error("Render composition requires at least one layer.");
  const width = layers[0].document.width;
  const height = layers[0].document.height;
  const hitTestableCount = layers.filter((layer) => layer.hitTestable).length;
  if (hitTestableCount !== 1) throw new Error("Render composition requires exactly one hit-testable layer.");

  const prepared = layers.map((layer) => {
    if (layer.document.width !== width || layer.document.height !== height) {
      throw new Error("Render composition layers must share the same dimensions.");
    }
    if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
      throw new Error("Render composition layer opacity must be between 0 and 1.");
    }
    return {
      kind: layer.kind,
      opacity: layer.opacity,
      hitTestable: layer.hitTestable,
      frame: buildRenderFrame(layer.document, kernel),
    };
  });
  const hitTestLayer = prepared.find((layer) => layer.hitTestable)!;
  return { width, height, layers: prepared, hitTestFrame: hitTestLayer.frame };
}
