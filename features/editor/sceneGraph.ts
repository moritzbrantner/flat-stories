import { createIdentityTransform, type EditorDocument, type EditorObject, type GroupObject, type Transform } from "./model";

export type FlatNode = {
  node: EditorObject;
  depth: number;
  parentId: string | null;
};

export function flattenObjects(objects: readonly EditorObject[], depth = 0, parentId: string | null = null): FlatNode[] {
  const flattened: FlatNode[] = [];
  for (const node of objects) {
    flattened.push({ node, depth, parentId });
    if (node.kind === "group") flattened.push(...flattenObjects(node.children, depth + 1, node.id));
  }
  return flattened;
}

export function findObject(objects: readonly EditorObject[], id: string): EditorObject | null {
  for (const node of objects) {
    if (node.id === id) return node;
    if (node.kind === "group") {
      const child = findObject(node.children, id);
      if (child) return child;
    }
  }
  return null;
}

export function updateObject(objects: readonly EditorObject[], id: string, update: (node: EditorObject) => EditorObject): EditorObject[] {
  let changed = false;
  const next = objects.map((node) => {
    if (node.id === id) {
      changed = true;
      return update(node);
    }
    if (node.kind !== "group") return node;
    const children = updateObject(node.children, id, update);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? next : (objects as EditorObject[]);
}

export function patchObject(document: EditorDocument, id: string, patch: Partial<EditorObject>): EditorDocument {
  const objects = updateObject(document.objects, id, (node) => ({ ...node, ...patch }) as EditorObject);
  return objects === document.objects ? document : { ...document, objects };
}

export function patchObjectTransform(document: EditorDocument, id: string, patch: Partial<Transform>): EditorDocument {
  const objects = updateObject(document.objects, id, (node) => ({ ...node, transform: { ...node.transform, ...patch } }));
  return objects === document.objects ? document : { ...document, objects };
}

export function groupRootObjects(document: EditorDocument, ids: readonly string[], groupId: string): EditorDocument {
  const selected = new Set(ids);
  if (selected.size < 2) return document;
  if (document.objects.some((node) => selected.has(node.id) && node.locked)) return document;

  const children = document.objects.filter((node) => selected.has(node.id));
  if (children.length !== selected.size) return document;

  const firstIndex = document.objects.findIndex((node) => selected.has(node.id));
  const group: GroupObject = {
    id: groupId,
    kind: "group",
    name: "Group",
    transform: createIdentityTransform(),
    opacity: 1,
    visible: true,
    locked: false,
    children,
  };
  const remaining = document.objects.filter((node) => !selected.has(node.id));
  remaining.splice(firstIndex, 0, group);
  return { ...document, objects: remaining };
}

export function ungroupRootObject(document: EditorDocument, groupId: string): EditorDocument {
  const index = document.objects.findIndex((node) => node.id === groupId);
  if (index < 0) return document;
  const group = document.objects[index];
  if (group.kind !== "group" || group.locked) return document;
  const next = [...document.objects];
  next.splice(index, 1, ...group.children);
  return { ...document, objects: next };
}

export function resetObjectTransform(document: EditorDocument, id: string): EditorDocument {
  return patchObject(document, id, { transform: createIdentityTransform() } as Partial<EditorObject>);
}

export function objectTransformToSvg(transform: Transform): string {
  const { x, y, rotation, scaleX, scaleY, pivotX, pivotY } = transform;
  return `translate(${x} ${y}) translate(${pivotX} ${pivotY}) rotate(${rotation}) scale(${scaleX} ${scaleY}) translate(${-pivotX} ${-pivotY})`;
}
