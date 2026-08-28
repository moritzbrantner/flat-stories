export type Point = { x: number; y: number };

type ObjectBase = {
  id: string;
  name: string;
  fill: string;
};

export type RectangleObject = ObjectBase & {
  kind: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CircleObject = ObjectBase & {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
};

export type PathObject = ObjectBase & {
  kind: "path";
  d: string;
};

export type TextObject = ObjectBase & {
  kind: "text";
  x: number;
  y: number;
  value: string;
  fontSize: number;
};

export type EditorObject = RectangleObject | CircleObject | PathObject | TextObject;

export type EditorDocument = {
  id: string;
  name: string;
  width: number;
  height: number;
  objects: EditorObject[];
};
