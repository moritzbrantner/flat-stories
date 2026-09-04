export type Point = { x: number; y: number };

export type Transform = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  pivotX: number;
  pivotY: number;
};

export function createIdentityTransform(): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
}

export type PathAnchor = {
  id: string;
  point: Point;
  inHandle?: Point;
  outHandle?: Point;
};

export type VectorPath = {
  closed: boolean;
  anchors: PathAnchor[];
};

type NodeBase = {
  id: string;
  name: string;
  transform: Transform;
  opacity: number;
  visible: boolean;
  locked: boolean;
  boneId?: string;
};

type PaintStyle = {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};

export type RectangleObject = NodeBase & PaintStyle & {
  kind: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
};

export type CircleObject = NodeBase & PaintStyle & {
  kind: "circle";
  cx: number;
  cy: number;
  radius: number;
};

export type PathObject = NodeBase & PaintStyle & {
  kind: "path";
  path: VectorPath;
};

export type TextObject = NodeBase & PaintStyle & {
  kind: "text";
  x: number;
  y: number;
  value: string;
  fontSize: number;
};

export type GroupObject = NodeBase & {
  kind: "group";
  children: EditorObject[];
};

export type EditorObject = RectangleObject | CircleObject | PathObject | TextObject | GroupObject;
export type DrawableObject = Exclude<EditorObject, GroupObject>;

export type Bone = {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  length: number;
  restRotation: number;
  rotation: number;
  minRotation?: number;
  maxRotation?: number;
};

export type TwoBoneIkConstraint = {
  id: string;
  kind: "two-bone";
  name: string;
  rootBoneId: string;
  midBoneId: string;
  target: Point;
  bendDirection: 1 | -1;
  weight: number;
  enabled: boolean;
};

export type CharacterRig = {
  bones: Bone[];
  constraints: TwoBoneIkConstraint[];
};

export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export type NumberKeyframe = {
  time: number;
  value: number;
  easing?: Easing;
};

export type NodeAnimationProperty =
  | "transform.x"
  | "transform.y"
  | "transform.rotation"
  | "transform.scaleX"
  | "transform.scaleY"
  | "opacity";

export type NodeAnimationTrack = {
  id: string;
  target: { kind: "node"; id: string };
  property: NodeAnimationProperty;
  keyframes: NumberKeyframe[];
};

export type BoneAnimationTrack = {
  id: string;
  target: { kind: "bone"; id: string };
  property: "rotation";
  keyframes: NumberKeyframe[];
};

export type AnimationTrack = NodeAnimationTrack | BoneAnimationTrack;

export type AnimationClip = {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  tracks: AnimationTrack[];
};

export type EditorDocument = {
  id: string;
  name: string;
  width: number;
  height: number;
  objects: EditorObject[];
  rig?: CharacterRig;
  animations: AnimationClip[];
};
