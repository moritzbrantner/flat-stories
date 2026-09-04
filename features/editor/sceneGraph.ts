import { createIdentityTransform, type EditorDocument, type EditorObject, type GroupObject, type Transform } from "./model";

export type FlatNode = {
  node: EditorObject;
  depth: number;
  parentId: string | null;
};

export type LayerDirection = "forward" | "backward" | "front" | "back";

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

export function findParentId(objects: readonly EditorObject[], id: string, parentId: string | null = null): string | null | undefined {
  for (const node of objects) {
    if (node.id === id) return parentId;
    if (node.kind === "group") {
      const nested = findParentId(node.children, id, node.id);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

export function siblingObjects(document: EditorDocument, ids: readonly string[]): EditorObject[] | null {
  if (ids.length === 0) return null;
  const parentId = findParentId(document.objects, ids[0]);
  if (parentId === undefined || ids.some((id) => findParentId(document.objects, id) !== parentId)) return null;
  if (parentId === null) return document.objects;
  const parent = findObject(document.objects, parentId);
  return parent?.kind === "group" ? parent.children : null;
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

function updateSiblingCollection(objects: readonly EditorObject[], parentId: string | null, update: (siblings: readonly EditorObject[]) => EditorObject[]): EditorObject[] {
  if (parentId === null) return update(objects);
  let changed = false;
  const next = objects.map((node) => {
    if (node.kind !== "group") return node;
    if (node.id === parentId) {
      const children = update(node.children);
      if (children !== node.children) changed = true;
      return children === node.children ? node : { ...node, children };
    }
    const children = updateSiblingCollection(node.children, parentId, update);
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

export function cloneObjectWithIds(object: EditorObject, createId: (kind: EditorObject["kind"]) => string): EditorObject {
  const clone = (node: EditorObject, topLevel: boolean): EditorObject => {
    const shared = { ...node, id: createId(node.kind), name: topLevel ? `${node.name} Copy` : node.name };
    if (node.kind !== "group") return shared as EditorObject;
    return { ...shared, kind: "group", children: node.children.map((child) => clone(child, false)) } as GroupObject;
  };
  return clone(object, true);
}

export function duplicateSiblingObjects(document: EditorDocument, ids: readonly string[], createId: (kind: EditorObject["kind"]) => string): { document: EditorDocument; duplicatedIds: string[] } {
  const selected = new Set(ids);
  if (selected.size === 0) return { document, duplicatedIds: [] };
  const siblings = siblingObjects(document, ids);
  if (!siblings) return { document, duplicatedIds: [] };
  const parentId = findParentId(document.objects, ids[0]);
  if (parentId === undefined) return { document, duplicatedIds: [] };
  const duplicatedIds: string[] = [];
  const objects = updateSiblingCollection(document.objects, parentId, (current) => {
    const next: EditorObject[] = [];
    for (const node of current) {
      next.push(node);
      if (!selected.has(node.id)) continue;
      const copy = cloneObjectWithIds(node, createId);
      duplicatedIds.push(copy.id);
      next.push(copy);
    }
    return next;
  });
  return duplicatedIds.length === 0 ? { document, duplicatedIds } : { document: { ...document, objects }, duplicatedIds };
}

export function reorderObject(document: EditorDocument, id: string, direction: LayerDirection): EditorDocument {
  const parentId = findParentId(document.objects, id);
  if (parentId === undefined) return document;
  const objects = updateSiblingCollection(document.objects, parentId, (siblings) => {
    const index = siblings.findIndex((node) => node.id === id);
    if (index < 0) return siblings as EditorObject[];
    let target = index;
    if (direction === "forward") target = Math.min(siblings.length - 1, index + 1);
    else if (direction === "backward") target = Math.max(0, index - 1);
    else if (direction === "front") target = siblings.length - 1;
    else target = 0;
    if (target === index) return siblings as EditorObject[];
    const next = [...siblings];
    const [node] = next.splice(index, 1);
    next.splice(target, 0, node);
    return next;
  });
  return objects === document.objects ? document : { ...document, objects };
}

export function resetObjectTransform(document: EditorDocument, id: string): EditorDocument {
  return patchObject(document, id, { transform: createIdentityTransform() } as Partial<EditorObject>);
}

export function objectTransformToSvg(transform: Transform): string {
  const { x, y, rotation, scaleX, scaleY, pivotX, pivotY } = transform;
  return `translate(${x} ${y}) translate(${pivotX} ${pivotY}) rotate(${rotation}) scale(${scaleX} ${scaleY}) translate(${-pivotX} ${-pivotY})`;
}
