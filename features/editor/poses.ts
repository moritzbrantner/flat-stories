import type {
  CharacterExpression,
  CharacterPose,
  EditorDocument,
  ExpressionNodeState,
  Transform,
} from "./model";
import { findObject, flattenObjects, patchObject, patchObjectTransform } from "./sceneGraph";

function copyTransform(transform: Transform): Transform {
  return { ...transform };
}

export function captureCharacterPose(document: EditorDocument, id: string, name: string): CharacterPose {
  return {
    id,
    name,
    boneRotations: Object.fromEntries((document.rig?.bones ?? []).map((bone) => [bone.id, bone.rotation])),
    nodeTransforms: Object.fromEntries(flattenObjects(document.objects).map(({ node }) => [node.id, copyTransform(node.transform)])),
  };
}

export function applyCharacterPose(document: EditorDocument, pose: CharacterPose): EditorDocument {
  let next = document;

  if (next.rig) {
    let rigChanged = false;
    const bones = next.rig.bones.map((bone) => {
      const rotation = pose.boneRotations[bone.id];
      if (rotation === undefined || rotation === bone.rotation) return bone;
      rigChanged = true;
      return { ...bone, rotation };
    });
    if (rigChanged) next = { ...next, rig: { ...next.rig, bones } };
  }

  for (const [nodeId, transform] of Object.entries(pose.nodeTransforms)) {
    if (!findObject(next.objects, nodeId)) continue;
    next = patchObjectTransform(next, nodeId, transform);
  }

  return next;
}

export function captureExpression(
  document: EditorDocument,
  id: string,
  name: string,
  nodeIds: readonly string[],
): CharacterExpression {
  const nodes: Record<string, ExpressionNodeState> = {};
  for (const nodeId of nodeIds) {
    const node = findObject(document.objects, nodeId);
    if (!node) continue;
    nodes[node.id] = {
      visible: node.visible,
      opacity: node.opacity,
      transform: copyTransform(node.transform),
    };
  }
  return { id, name, nodes };
}

export function applyExpression(document: EditorDocument, expression: CharacterExpression): EditorDocument {
  let next = document;
  for (const [nodeId, state] of Object.entries(expression.nodes)) {
    if (!findObject(next.objects, nodeId)) continue;
    if (state.transform) next = patchObjectTransform(next, nodeId, state.transform);
    const { transform: _transform, ...nodePatch } = state;
    if (Object.keys(nodePatch).length > 0) next = patchObject(next, nodeId, nodePatch);
  }
  return next;
}

export function upsertPose(document: EditorDocument, pose: CharacterPose): EditorDocument {
  const poses = document.poses ?? [];
  const existing = poses.findIndex((candidate) => candidate.id === pose.id);
  return {
    ...document,
    poses: existing < 0
      ? [...poses, pose]
      : poses.map((candidate, index) => index === existing ? pose : candidate),
  };
}

export function upsertExpression(document: EditorDocument, expression: CharacterExpression): EditorDocument {
  const expressions = document.expressions ?? [];
  const existing = expressions.findIndex((candidate) => candidate.id === expression.id);
  return {
    ...document,
    expressions: existing < 0
      ? [...expressions, expression]
      : expressions.map((candidate, index) => index === existing ? expression : candidate),
  };
}
