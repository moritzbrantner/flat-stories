import type { EditorObject } from "./model";

export type CreatableObjectKind = EditorObject["kind"];

export function createObject(kind: CreatableObjectKind, id: string): EditorObject {
  const common = { id, name: `${kind[0].toUpperCase()}${kind.slice(1)}`, fill: "#2563eb" };
  switch (kind) {
    case "rectangle": return { ...common, kind, x: 250, y: 190, width: 160, height: 100 };
    case "circle": return { ...common, kind, cx: 400, cy: 260, radius: 70 };
    case "path": return { ...common, kind, d: "M280 330 L400 180 L520 330 Z" };
    case "text": return { ...common, kind, x: 300, y: 260, value: "New text", fontSize: 36 };
  }
}
