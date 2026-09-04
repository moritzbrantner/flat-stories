import type { EditorDocument, EditorObject, Transform } from "./model";

export const PROJECT_FORMAT = "flat-stories";
export const PROJECT_VERSION = 1;

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

type UnknownRecord = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new ProjectFormatError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): UnknownRecord {
  return isRecord(value) ? value : fail(path, "expected object");
}

function array(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(path, "expected array");
}

function stringValue(value: unknown, path: string): string {
  return typeof value === "string" ? value : fail(path, "expected string");
}

function finiteNumber(value: unknown, path: string): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail(path, "expected finite number");
}

function booleanValue(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "expected boolean");
}

function assertOnlyKeys(value: UnknownRecord, allowed: readonly string[], path: string) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, "unknown field for project version 1");
  }
}

function optionalString(value: unknown, path: string) {
  if (value !== undefined) stringValue(value, path);
}

function optionalFiniteNumber(value: unknown, path: string) {
  if (value !== undefined) finiteNumber(value, path);
}

function assertPoint(value: unknown, path: string) {
  const point = record(value, path);
  assertOnlyKeys(point, ["x", "y"], path);
  finiteNumber(point.x, `${path}.x`);
  finiteNumber(point.y, `${path}.y`);
}

const transformKeys = ["x", "y", "rotation", "scaleX", "scaleY", "pivotX", "pivotY"] as const;

function assertTransform(value: unknown, path: string) {
  const transform = record(value, path);
  assertOnlyKeys(transform, transformKeys, path);
  for (const key of transformKeys) finiteNumber(transform[key], `${path}.${key}`);
}

function assertPartialTransform(value: unknown, path: string) {
  const transform = record(value, path);
  assertOnlyKeys(transform, transformKeys, path);
  for (const key of transformKeys) optionalFiniteNumber(transform[key], `${path}.${key}`);
}

function assertPath(value: unknown, path: string) {
  const vectorPath = record(value, path);
  assertOnlyKeys(vectorPath, ["closed", "anchors"], path);
  booleanValue(vectorPath.closed, `${path}.closed`);
  array(vectorPath.anchors, `${path}.anchors`).forEach((anchorValue, index) => {
    const anchorPath = `${path}.anchors[${index}]`;
    const anchor = record(anchorValue, anchorPath);
    assertOnlyKeys(anchor, ["id", "point", "inHandle", "outHandle"], anchorPath);
    stringValue(anchor.id, `${anchorPath}.id`);
    assertPoint(anchor.point, `${anchorPath}.point`);
    if (anchor.inHandle !== undefined) assertPoint(anchor.inHandle, `${anchorPath}.inHandle`);
    if (anchor.outHandle !== undefined) assertPoint(anchor.outHandle, `${anchorPath}.outHandle`);
  });
}

const commonNodeKeys = ["id", "name", "kind", "transform", "opacity", "visible", "locked", "boneId"] as const;
const paintKeys = ["fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin"] as const;

function assertCommonNode(node: UnknownRecord, path: string) {
  stringValue(node.id, `${path}.id`);
  stringValue(node.name, `${path}.name`);
  assertTransform(node.transform, `${path}.transform`);
  const opacity = finiteNumber(node.opacity, `${path}.opacity`);
  if (opacity < 0 || opacity > 1) fail(`${path}.opacity`, "expected value between 0 and 1");
  booleanValue(node.visible, `${path}.visible`);
  booleanValue(node.locked, `${path}.locked`);
  optionalString(node.boneId, `${path}.boneId`);
}

function assertPaint(node: UnknownRecord, path: string) {
  stringValue(node.fill, `${path}.fill`);
  optionalString(node.stroke, `${path}.stroke`);
  optionalFiniteNumber(node.strokeWidth, `${path}.strokeWidth`);
  if (node.strokeLinecap !== undefined && !["butt", "round", "square"].includes(stringValue(node.strokeLinecap, `${path}.strokeLinecap`))) {
    fail(`${path}.strokeLinecap`, "unsupported line cap");
  }
  if (node.strokeLinejoin !== undefined && !["miter", "round", "bevel"].includes(stringValue(node.strokeLinejoin, `${path}.strokeLinejoin`))) {
    fail(`${path}.strokeLinejoin`, "unsupported line join");
  }
}

function assertNode(value: unknown, path: string, ids: Set<string>) {
  const node = record(value, path);
  const kind = stringValue(node.kind, `${path}.kind`);
  assertCommonNode(node, path);
  const id = stringValue(node.id, `${path}.id`);
  if (ids.has(id)) fail(`${path}.id`, `duplicate scene node id ${JSON.stringify(id)}`);
  ids.add(id);

  switch (kind) {
    case "rectangle":
      assertOnlyKeys(node, [...commonNodeKeys, ...paintKeys, "x", "y", "width", "height", "cornerRadius"], path);
      assertPaint(node, path);
      finiteNumber(node.x, `${path}.x`);
      finiteNumber(node.y, `${path}.y`);
      finiteNumber(node.width, `${path}.width`);
      finiteNumber(node.height, `${path}.height`);
      finiteNumber(node.cornerRadius, `${path}.cornerRadius`);
      return;
    case "circle":
      assertOnlyKeys(node, [...commonNodeKeys, ...paintKeys, "cx", "cy", "radius"], path);
      assertPaint(node, path);
      finiteNumber(node.cx, `${path}.cx`);
      finiteNumber(node.cy, `${path}.cy`);
      finiteNumber(node.radius, `${path}.radius`);
      return;
    case "path":
      assertOnlyKeys(node, [...commonNodeKeys, ...paintKeys, "path"], path);
      assertPaint(node, path);
      assertPath(node.path, `${path}.path`);
      return;
    case "text":
      assertOnlyKeys(node, [...commonNodeKeys, ...paintKeys, "x", "y", "value", "fontSize"], path);
      assertPaint(node, path);
      finiteNumber(node.x, `${path}.x`);
      finiteNumber(node.y, `${path}.y`);
      stringValue(node.value, `${path}.value`);
      finiteNumber(node.fontSize, `${path}.fontSize`);
      return;
    case "group":
      assertOnlyKeys(node, [...commonNodeKeys, "children"], path);
      array(node.children, `${path}.children`).forEach((child, index) => assertNode(child, `${path}.children[${index}]`, ids));
      return;
    default:
      fail(`${path}.kind`, `unsupported node kind ${JSON.stringify(kind)}`);
  }
}

function assertRig(value: unknown, path: string) {
  const rig = record(value, path);
  assertOnlyKeys(rig, ["bones", "constraints"], path);
  const boneIds = new Set<string>();
  array(rig.bones, `${path}.bones`).forEach((boneValue, index) => {
    const bonePath = `${path}.bones[${index}]`;
    const bone = record(boneValue, bonePath);
    assertOnlyKeys(bone, ["id", "name", "parentId", "x", "y", "length", "restRotation", "rotation", "minRotation", "maxRotation"], bonePath);
    const id = stringValue(bone.id, `${bonePath}.id`);
    if (boneIds.has(id)) fail(`${bonePath}.id`, `duplicate bone id ${JSON.stringify(id)}`);
    boneIds.add(id);
    stringValue(bone.name, `${bonePath}.name`);
    if (bone.parentId !== null) stringValue(bone.parentId, `${bonePath}.parentId`);
    finiteNumber(bone.x, `${bonePath}.x`);
    finiteNumber(bone.y, `${bonePath}.y`);
    finiteNumber(bone.length, `${bonePath}.length`);
    finiteNumber(bone.restRotation, `${bonePath}.restRotation`);
    finiteNumber(bone.rotation, `${bonePath}.rotation`);
    optionalFiniteNumber(bone.minRotation, `${bonePath}.minRotation`);
    optionalFiniteNumber(bone.maxRotation, `${bonePath}.maxRotation`);
  });
  array(rig.constraints, `${path}.constraints`).forEach((constraintValue, index) => {
    const constraintPath = `${path}.constraints[${index}]`;
    const constraint = record(constraintValue, constraintPath);
    assertOnlyKeys(constraint, ["id", "kind", "name", "rootBoneId", "midBoneId", "target", "bendDirection", "weight", "enabled"], constraintPath);
    stringValue(constraint.id, `${constraintPath}.id`);
    if (constraint.kind !== "two-bone") fail(`${constraintPath}.kind`, "expected two-bone constraint");
    stringValue(constraint.name, `${constraintPath}.name`);
    stringValue(constraint.rootBoneId, `${constraintPath}.rootBoneId`);
    stringValue(constraint.midBoneId, `${constraintPath}.midBoneId`);
    assertPoint(constraint.target, `${constraintPath}.target`);
    if (constraint.bendDirection !== 1 && constraint.bendDirection !== -1) fail(`${constraintPath}.bendDirection`, "expected 1 or -1");
    const weight = finiteNumber(constraint.weight, `${constraintPath}.weight`);
    if (weight < 0 || weight > 1) fail(`${constraintPath}.weight`, "expected value between 0 and 1");
    booleanValue(constraint.enabled, `${constraintPath}.enabled`);
  });
}

function assertPoses(value: unknown, path: string) {
  const ids = new Set<string>();
  array(value, path).forEach((poseValue, index) => {
    const posePath = `${path}[${index}]`;
    const pose = record(poseValue, posePath);
    assertOnlyKeys(pose, ["id", "name", "boneRotations", "nodeTransforms"], posePath);
    const id = stringValue(pose.id, `${posePath}.id`);
    if (ids.has(id)) fail(`${posePath}.id`, `duplicate pose id ${JSON.stringify(id)}`);
    ids.add(id);
    stringValue(pose.name, `${posePath}.name`);
    const rotations = record(pose.boneRotations, `${posePath}.boneRotations`);
    for (const [boneId, rotation] of Object.entries(rotations)) finiteNumber(rotation, `${posePath}.boneRotations.${boneId}`);
    const transforms = record(pose.nodeTransforms, `${posePath}.nodeTransforms`);
    for (const [nodeId, transform] of Object.entries(transforms)) assertTransform(transform, `${posePath}.nodeTransforms.${nodeId}`);
  });
}

function assertExpressions(value: unknown, path: string) {
  const ids = new Set<string>();
  array(value, path).forEach((expressionValue, index) => {
    const expressionPath = `${path}[${index}]`;
    const expression = record(expressionValue, expressionPath);
    assertOnlyKeys(expression, ["id", "name", "nodes"], expressionPath);
    const id = stringValue(expression.id, `${expressionPath}.id`);
    if (ids.has(id)) fail(`${expressionPath}.id`, `duplicate expression id ${JSON.stringify(id)}`);
    ids.add(id);
    stringValue(expression.name, `${expressionPath}.name`);
    const nodes = record(expression.nodes, `${expressionPath}.nodes`);
    for (const [nodeId, stateValue] of Object.entries(nodes)) {
      const statePath = `${expressionPath}.nodes.${nodeId}`;
      const state = record(stateValue, statePath);
      assertOnlyKeys(state, ["visible", "opacity", "transform"], statePath);
      if (state.visible !== undefined) booleanValue(state.visible, `${statePath}.visible`);
      if (state.opacity !== undefined) {
        const opacity = finiteNumber(state.opacity, `${statePath}.opacity`);
        if (opacity < 0 || opacity > 1) fail(`${statePath}.opacity`, "expected value between 0 and 1");
      }
      if (state.transform !== undefined) assertPartialTransform(state.transform, `${statePath}.transform`);
    }
  });
}

const easingValues = ["linear", "ease-in", "ease-out", "ease-in-out"];
const nodeAnimationProperties = ["transform.x", "transform.y", "transform.rotation", "transform.scaleX", "transform.scaleY", "opacity"];

function assertAnimations(value: unknown, path: string) {
  const clipIds = new Set<string>();
  array(value, path).forEach((clipValue, clipIndex) => {
    const clipPath = `${path}[${clipIndex}]`;
    const clip = record(clipValue, clipPath);
    assertOnlyKeys(clip, ["id", "name", "duration", "loop", "tracks"], clipPath);
    const clipId = stringValue(clip.id, `${clipPath}.id`);
    if (clipIds.has(clipId)) fail(`${clipPath}.id`, `duplicate animation clip id ${JSON.stringify(clipId)}`);
    clipIds.add(clipId);
    stringValue(clip.name, `${clipPath}.name`);
    const duration = finiteNumber(clip.duration, `${clipPath}.duration`);
    if (duration < 0) fail(`${clipPath}.duration`, "expected non-negative duration");
    booleanValue(clip.loop, `${clipPath}.loop`);
    const trackIds = new Set<string>();
    array(clip.tracks, `${clipPath}.tracks`).forEach((trackValue, trackIndex) => {
      const trackPath = `${clipPath}.tracks[${trackIndex}]`;
      const track = record(trackValue, trackPath);
      assertOnlyKeys(track, ["id", "target", "property", "keyframes"], trackPath);
      const trackId = stringValue(track.id, `${trackPath}.id`);
      if (trackIds.has(trackId)) fail(`${trackPath}.id`, `duplicate animation track id ${JSON.stringify(trackId)}`);
      trackIds.add(trackId);
      const target = record(track.target, `${trackPath}.target`);
      assertOnlyKeys(target, ["kind", "id"], `${trackPath}.target`);
      const targetKind = stringValue(target.kind, `${trackPath}.target.kind`);
      stringValue(target.id, `${trackPath}.target.id`);
      const property = stringValue(track.property, `${trackPath}.property`);
      if (targetKind === "node") {
        if (!nodeAnimationProperties.includes(property)) fail(`${trackPath}.property`, "unsupported node animation property");
      } else if (targetKind === "bone") {
        if (property !== "rotation") fail(`${trackPath}.property`, "bone tracks only support rotation");
      } else {
        fail(`${trackPath}.target.kind`, "expected node or bone");
      }
      array(track.keyframes, `${trackPath}.keyframes`).forEach((keyframeValue, keyframeIndex) => {
        const keyframePath = `${trackPath}.keyframes[${keyframeIndex}]`;
        const keyframe = record(keyframeValue, keyframePath);
        assertOnlyKeys(keyframe, ["time", "value", "easing"], keyframePath);
        const time = finiteNumber(keyframe.time, `${keyframePath}.time`);
        if (time < 0 || time > duration) fail(`${keyframePath}.time`, `expected value between 0 and clip duration ${duration}`);
        finiteNumber(keyframe.value, `${keyframePath}.value`);
        if (keyframe.easing !== undefined && !easingValues.includes(stringValue(keyframe.easing, `${keyframePath}.easing`))) {
          fail(`${keyframePath}.easing`, "unsupported easing");
        }
      });
    });
  });
}

function assertDocument(value: unknown): asserts value is EditorDocument {
  const document = record(value, "project.document");
  assertOnlyKeys(document, ["id", "name", "width", "height", "objects", "rig", "poses", "expressions", "animations"], "project.document");
  stringValue(document.id, "project.document.id");
  stringValue(document.name, "project.document.name");
  const width = finiteNumber(document.width, "project.document.width");
  const height = finiteNumber(document.height, "project.document.height");
  if (width <= 0) fail("project.document.width", "expected positive width");
  if (height <= 0) fail("project.document.height", "expected positive height");
  const nodeIds = new Set<string>();
  array(document.objects, "project.document.objects").forEach((node, index) => assertNode(node, `project.document.objects[${index}]`, nodeIds));
  if (document.rig !== undefined) assertRig(document.rig, "project.document.rig");
  if (document.poses !== undefined) assertPoses(document.poses, "project.document.poses");
  if (document.expressions !== undefined) assertExpressions(document.expressions, "project.document.expressions");
  assertAnimations(document.animations, "project.document.animations");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  const canonical: UnknownRecord = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) canonical[key] = canonicalize(child);
  }
  return canonical;
}

export function serializeProject(document: EditorDocument): string {
  assertDocument(document);
  const envelope = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    document: canonicalize(document),
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function parseProject(source: string): EditorDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown JSON error";
    throw new ProjectFormatError(`Invalid project JSON: ${message}`);
  }

  const envelope = record(parsed, "project");
  assertOnlyKeys(envelope, ["format", "version", "document"], "project");
  if (envelope.format !== PROJECT_FORMAT) fail("project.format", `expected ${JSON.stringify(PROJECT_FORMAT)}`);
  if (envelope.version !== PROJECT_VERSION) fail("project.version", `unsupported project version ${JSON.stringify(envelope.version)}`);
  assertDocument(envelope.document);
  return envelope.document;
}
