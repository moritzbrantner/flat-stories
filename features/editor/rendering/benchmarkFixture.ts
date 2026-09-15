import { createIdentityTransform, type EditorDocument, type EditorObject, type GroupObject } from "../model";

function prefixObjectIds(object: EditorObject, prefix: string): EditorObject {
  const clone = structuredClone(object) as EditorObject;

  function visit(node: EditorObject) {
    node.id = `${prefix}-${node.id}`;
    if (node.kind === "path") {
      node.path.anchors.forEach((anchor) => { anchor.id = `${prefix}-${anchor.id}`; });
    }
    if (node.kind === "group") node.children.forEach(visit);
  }

  visit(clone);
  return clone;
}

export function createRendererBenchmarkDocument(source: EditorDocument, copies = 36): EditorDocument {
  const subject = source.objects.find((object) => object.kind === "group") ?? source.objects.at(-1);
  if (!subject) throw new Error("Renderer benchmark requires at least one source object.");
  const columns = Math.ceil(Math.sqrt(copies));
  const rows = Math.ceil(copies / columns);
  const cellWidth = 180;
  const cellHeight = 160;
  const objects: GroupObject[] = Array.from({ length: copies }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: `benchmark-copy-${index + 1}`,
      name: `Benchmark character ${index + 1}`,
      kind: "group",
      transform: {
        ...createIdentityTransform(),
        x: column * cellWidth,
        y: row * cellHeight,
        scaleX: 0.25,
        scaleY: 0.25,
      },
      opacity: 1,
      visible: true,
      locked: true,
      children: [prefixObjectIds(subject, `copy-${index + 1}`)],
    };
  });

  return {
    ...structuredClone(source),
    id: `${source.id}-renderer-benchmark`,
    name: `${source.name} renderer benchmark`,
    width: columns * cellWidth,
    height: rows * cellHeight,
    objects,
  };
}
