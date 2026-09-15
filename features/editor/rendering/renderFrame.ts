import type { BoneWorldPose } from "../rig";
import { getBoneWorldPose } from "../rig";
import type { DrawableObject, EditorDocument, EditorObject } from "../model";
import {
  referenceTransformKernel,
  TRANSFORM_INPUT_STRIDE,
  TRANSFORM_OUTPUT_STRIDE,
  type TransformKernel,
} from "./transformKernel";

export type RenderMatrix = readonly [number, number, number, number, number, number];

export type RenderItem = {
  id: string;
  object: DrawableObject;
  matrix: RenderMatrix;
  opacity: number;
};

export type RenderFrame = {
  width: number;
  height: number;
  items: RenderItem[];
};

export type EncodedRenderScene = {
  nodes: EditorObject[];
  input: Float32Array;
};

type FlatRenderNode = {
  object: EditorObject;
  parentIndex: number;
};

function flattenVisibleNodes(objects: readonly EditorObject[], parentIndex = -1, result: FlatRenderNode[] = []): FlatRenderNode[] {
  for (const object of objects) {
    if (!object.visible) continue;
    const index = result.length;
    result.push({ object, parentIndex });
    if (object.kind === "group") flattenVisibleNodes(object.children, index, result);
  }
  return result;
}

export function encodeRenderScene(document: EditorDocument): EncodedRenderScene {
  const flat = flattenVisibleNodes(document.objects);
  const nodes = flat.map(({ object }) => object);
  const input = new Float32Array(flat.length * TRANSFORM_INPUT_STRIDE);
  const poseCache = new Map<string, BoneWorldPose | null>();

  function bonePose(boneId: string): BoneWorldPose | null {
    if (!document.rig) return null;
    const cached = poseCache.get(boneId);
    if (cached !== undefined || poseCache.has(boneId)) return cached ?? null;
    const pose = getBoneWorldPose(document.rig, boneId);
    poseCache.set(boneId, pose);
    return pose;
  }

  flat.forEach(({ object, parentIndex }, index) => {
    const offset = index * TRANSFORM_INPUT_STRIDE;
    const transform = object.transform;
    const pose = object.boneId ? bonePose(object.boneId) : null;
    input[offset] = parentIndex;
    input[offset + 1] = transform.x;
    input[offset + 2] = transform.y;
    input[offset + 3] = transform.rotation;
    input[offset + 4] = transform.scaleX;
    input[offset + 5] = transform.scaleY;
    input[offset + 6] = transform.pivotX;
    input[offset + 7] = transform.pivotY;
    input[offset + 8] = object.opacity;
    input[offset + 9] = pose?.origin.x ?? 0;
    input[offset + 10] = pose?.origin.y ?? 0;
    input[offset + 11] = pose?.rotation ?? 0;
    input[offset + 12] = pose ? 1 : 0;
  });

  return { nodes, input };
}

export function buildRenderFrame(document: EditorDocument, kernel: TransformKernel = referenceTransformKernel): RenderFrame {
  const encoded = encodeRenderScene(document);
  const transforms = kernel.prepare(encoded.input, encoded.nodes.length);
  if (transforms.length !== encoded.nodes.length * TRANSFORM_OUTPUT_STRIDE) {
    throw new Error("Renderer transform output length does not match the encoded scene.");
  }

  const items: RenderItem[] = [];
  encoded.nodes.forEach((object, index) => {
    if (object.kind === "group") return;
    const offset = index * TRANSFORM_OUTPUT_STRIDE;
    items.push({
      id: object.id,
      object,
      matrix: [
        transforms[offset],
        transforms[offset + 1],
        transforms[offset + 2],
        transforms[offset + 3],
        transforms[offset + 4],
        transforms[offset + 5],
      ],
      opacity: transforms[offset + 6],
    });
  });

  return { width: document.width, height: document.height, items };
}
