import type { CharacterRig, DrawableObject, EditorDocument, EditorObject, Transform } from "./model";
import { getBoneWorldPose } from "./rig";
import { pathToSvg } from "./vectorPath";

function formatNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error(`Cannot export non-finite SVG number: ${value}`);
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function transformToSvg(transform: Transform) {
  const { x, y, rotation, scaleX, scaleY, pivotX, pivotY } = transform;
  return [
    `translate(${formatNumber(x)} ${formatNumber(y)})`,
    `translate(${formatNumber(pivotX)} ${formatNumber(pivotY)})`,
    `rotate(${formatNumber(rotation)})`,
    `scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})`,
    `translate(${formatNumber(-pivotX)} ${formatNumber(-pivotY)})`,
  ].join(" ");
}

function boneTransformToSvg(rig: CharacterRig | undefined, boneId: string | undefined) {
  if (!rig || !boneId) return null;
  const pose = getBoneWorldPose(rig, boneId);
  return pose
    ? `translate(${formatNumber(pose.origin.x)} ${formatNumber(pose.origin.y)}) rotate(${formatNumber(pose.rotation)})`
    : null;
}

function paintAttributes(object: DrawableObject) {
  const attributes = [`fill=\"${escapeXml(object.fill)}\"`];
  if (object.stroke !== undefined) attributes.push(`stroke=\"${escapeXml(object.stroke)}\"`);
  if (object.strokeWidth !== undefined) attributes.push(`stroke-width=\"${formatNumber(object.strokeWidth)}\"`);
  if (object.strokeLinecap !== undefined) attributes.push(`stroke-linecap=\"${object.strokeLinecap}\"`);
  if (object.strokeLinejoin !== undefined) attributes.push(`stroke-linejoin=\"${object.strokeLinejoin}\"`);
  return attributes.join(" ");
}

function renderDrawable(object: DrawableObject) {
  const paint = paintAttributes(object);
  switch (object.kind) {
    case "rectangle":
      return `<rect x="${formatNumber(object.x)}" y="${formatNumber(object.y)}" width="${formatNumber(object.width)}" height="${formatNumber(object.height)}" rx="${formatNumber(object.cornerRadius)}" ${paint}/>`;
    case "circle":
      return `<circle cx="${formatNumber(object.cx)}" cy="${formatNumber(object.cy)}" r="${formatNumber(object.radius)}" ${paint}/>`;
    case "path":
      return `<path d="${escapeXml(pathToSvg(object.path))}" ${paint}/>`;
    case "text":
      return `<text x="${formatNumber(object.x)}" y="${formatNumber(object.y)}" font-size="${formatNumber(object.fontSize)}" font-weight="700" ${paint}>${escapeXml(object.value)}</text>`;
  }
}

function renderObject(object: EditorObject, rig: CharacterRig | undefined): string {
  if (!object.visible) return "";
  const body = object.kind === "group"
    ? object.children.map((child) => renderObject(child, rig)).join("")
    : renderDrawable(object);
  const node = `<g id="${escapeXml(object.id)}" transform="${transformToSvg(object.transform)}" opacity="${formatNumber(object.opacity)}">${body}</g>`;
  const boneTransform = boneTransformToSvg(rig, object.boneId);
  return boneTransform ? `<g transform="${boneTransform}">${node}</g>` : node;
}

export function exportDocumentToSvg(document: EditorDocument): string {
  const width = formatNumber(document.width);
  const height = formatNumber(document.height);
  const content = document.objects.map((object) => renderObject(object, document.rig)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(document.name)}</title>${content}</svg>`;
}
