import { createIdentityTransform, type EditorDocument, type EditorObject, type PathAnchor, type VectorPath } from "./model";

const transform = () => createIdentityTransform();
const base = (id: string, name: string, boneId?: string) => ({
  id,
  name,
  transform: transform(),
  opacity: 1,
  visible: true,
  locked: false,
  ...(boneId ? { boneId } : {}),
});

const vectorPath = (id: string, closed: boolean, anchors: Omit<PathAnchor, "id">[]): VectorPath => ({
  closed,
  anchors: anchors.map((anchor, index) => ({ ...anchor, id: `${id}-a${index + 1}` })),
});

const limb = (id: string, name: string, boneId: string, length: number, fill: string): EditorObject => ({
  ...base(id, name, boneId),
  kind: "rectangle",
  x: 0,
  y: -11,
  width: length,
  height: 22,
  cornerRadius: 11,
  fill,
});

export const fixtureDocument: EditorDocument = {
  id: "fixture-character",
  name: "Nova character study",
  width: 900,
  height: 600,
  objects: [
    {
      ...base("background", "Warm background"),
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 900,
      height: 600,
      cornerRadius: 0,
      fill: "#f7efe4",
      locked: true,
    },
    {
      ...base("ground", "Ground"),
      kind: "path",
      path: vectorPath("ground", true, [
        { point: { x: 0, y: 515 }, outHandle: { x: 180, y: 490 } },
        { point: { x: 450, y: 515 }, inHandle: { x: 280, y: 500 }, outHandle: { x: 650, y: 530 } },
        { point: { x: 900, y: 500 }, inHandle: { x: 720, y: 480 } },
        { point: { x: 900, y: 600 } },
        { point: { x: 0, y: 600 } },
      ]),
      fill: "#dbe7d2",
    },
    {
      ...base("nova", "Nova"),
      kind: "group",
      children: [
        {
          ...base("torso", "Torso", "spine"),
          kind: "path",
          path: vectorPath("torso", true, [
            { point: { x: -8, y: -48 }, outHandle: { x: 30, y: -68 } },
            { point: { x: 108, y: -42 }, inHandle: { x: 72, y: -66 } },
            { point: { x: 112, y: 42 }, outHandle: { x: 70, y: 66 } },
            { point: { x: -8, y: 46 }, inHandle: { x: 30, y: 68 } },
          ]),
          fill: "#5b7cfa",
        },
        limb("upper-arm-left-art", "Upper arm L", "upper-arm-left", 84, "#5b7cfa"),
        limb("forearm-left-art", "Forearm L", "forearm-left", 72, "#f3a67a"),
        { ...base("hand-left", "Hand L", "forearm-left"), kind: "circle", cx: 74, cy: 0, radius: 16, fill: "#f3a67a" },
        limb("upper-arm-right-art", "Upper arm R", "upper-arm-right", 84, "#5b7cfa"),
        limb("forearm-right-art", "Forearm R", "forearm-right", 72, "#f3a67a"),
        { ...base("hand-right", "Hand R", "forearm-right"), kind: "circle", cx: 74, cy: 0, radius: 16, fill: "#f3a67a" },
        limb("thigh-left-art", "Thigh L", "thigh-left", 100, "#334155"),
        limb("shin-left-art", "Shin L", "shin-left", 92, "#334155"),
        limb("thigh-right-art", "Thigh R", "thigh-right", 100, "#334155"),
        limb("shin-right-art", "Shin R", "shin-right", 92, "#334155"),
        {
          ...base("head-art", "Head", "head"),
          transform: { ...transform(), x: 34, rotation: 90 },
          kind: "group",
          children: [
            { ...base("face", "Face"), kind: "circle", cx: 0, cy: 0, radius: 54, fill: "#f3a67a" },
            {
              ...base("hair", "Hair"),
              kind: "path",
              path: vectorPath("hair", true, [
                { point: { x: -46, y: -12 }, outHandle: { x: -42, y: -52 } },
                { point: { x: 8, y: -54 }, inHandle: { x: -20, y: -66 }, outHandle: { x: 34, y: -52 } },
                { point: { x: 50, y: -10 }, inHandle: { x: 48, y: -40 } },
                { point: { x: 18, y: -30 } },
                { point: { x: -12, y: -20 } },
              ]),
              fill: "#283241",
            },
            { ...base("eye-left", "Eye L"), kind: "circle", cx: -18, cy: -2, radius: 5, fill: "#283241" },
            { ...base("eye-right", "Eye R"), kind: "circle", cx: 18, cy: -2, radius: 5, fill: "#283241" },
            {
              ...base("smile", "Smile"),
              kind: "path",
              path: vectorPath("smile", false, [
                { point: { x: -18, y: 20 }, outHandle: { x: -8, y: 30 } },
                { point: { x: 0, y: 30 }, inHandle: { x: -6, y: 30 }, outHandle: { x: 6, y: 30 } },
                { point: { x: 18, y: 20 }, inHandle: { x: 8, y: 30 } },
              ]),
              fill: "none",
              stroke: "#8b4b42",
              strokeWidth: 4,
            },
          ],
        },
      ],
    },
    { ...base("caption", "Caption"), kind: "text", x: 44, y: 66, value: "NOVA / CHARACTER RIG", fontSize: 28, fill: "#283241" },
  ],
  rig: {
    bones: [
      { id: "spine", name: "Spine", parentId: null, x: 450, y: 410, length: 120, restRotation: -90, rotation: -90, minRotation: -115, maxRotation: -65 },
      { id: "neck", name: "Neck", parentId: "spine", x: 120, y: 0, length: 28, restRotation: 0, rotation: 0, minRotation: -25, maxRotation: 25 },
      { id: "head", name: "Head", parentId: "neck", x: 28, y: 0, length: 40, restRotation: 0, rotation: 0, minRotation: -35, maxRotation: 35 },
      { id: "upper-arm-left", name: "Upper arm L", parentId: "spine", x: 108, y: -32, length: 84, restRotation: -65, rotation: -65, minRotation: -145, maxRotation: 45 },
      { id: "forearm-left", name: "Forearm L", parentId: "upper-arm-left", x: 84, y: 0, length: 72, restRotation: 15, rotation: 15, minRotation: -155, maxRotation: 155 },
      { id: "upper-arm-right", name: "Upper arm R", parentId: "spine", x: 108, y: 32, length: 84, restRotation: 65, rotation: 65, minRotation: -45, maxRotation: 145 },
      { id: "forearm-right", name: "Forearm R", parentId: "upper-arm-right", x: 84, y: 0, length: 72, restRotation: -15, rotation: -15, minRotation: -155, maxRotation: 155 },
      { id: "thigh-left", name: "Thigh L", parentId: "spine", x: 0, y: -24, length: 100, restRotation: 190, rotation: 190, minRotation: 145, maxRotation: 220 },
      { id: "shin-left", name: "Shin L", parentId: "thigh-left", x: 100, y: 0, length: 92, restRotation: -15, rotation: -15, minRotation: -130, maxRotation: 20 },
      { id: "thigh-right", name: "Thigh R", parentId: "spine", x: 0, y: 24, length: 100, restRotation: 170, rotation: 170, minRotation: 140, maxRotation: 215 },
      { id: "shin-right", name: "Shin R", parentId: "thigh-right", x: 100, y: 0, length: 92, restRotation: 15, rotation: 15, minRotation: -20, maxRotation: 130 },
    ],
    constraints: [
      { id: "ik-hand-left", kind: "two-bone", name: "Left hand IK", rootBoneId: "upper-arm-left", midBoneId: "forearm-left", target: { x: 285, y: 255 }, bendDirection: -1, weight: 1, enabled: true },
      { id: "ik-hand-right", kind: "two-bone", name: "Right hand IK", rootBoneId: "upper-arm-right", midBoneId: "forearm-right", target: { x: 615, y: 255 }, bendDirection: 1, weight: 1, enabled: true },
    ],
  },
  animations: [
    {
      id: "hello",
      name: "Hello",
      duration: 2,
      loop: true,
      tracks: [
        { id: "head-sway", target: { kind: "bone", id: "head" }, property: "rotation", keyframes: [
          { time: 0, value: 0, easing: "ease-in-out" }, { time: 0.5, value: -8, easing: "ease-in-out" }, { time: 1, value: 0, easing: "ease-in-out" }, { time: 1.5, value: 8, easing: "ease-in-out" }, { time: 2, value: 0 },
        ] },
        { id: "arm-wave", target: { kind: "bone", id: "upper-arm-right" }, property: "rotation", keyframes: [
          { time: 0, value: 65, easing: "ease-in-out" }, { time: 0.55, value: 30, easing: "ease-in-out" }, { time: 1.45, value: 30, easing: "ease-in-out" }, { time: 2, value: 65 },
        ] },
        { id: "forearm-wave", target: { kind: "bone", id: "forearm-right" }, property: "rotation", keyframes: [
          { time: 0, value: -15, easing: "ease-in-out" }, { time: 0.55, value: -78, easing: "ease-in-out" }, { time: 0.9, value: -45, easing: "ease-in-out" }, { time: 1.25, value: -78, easing: "ease-in-out" }, { time: 2, value: -15 },
        ] },
      ],
    },
  ],
};
