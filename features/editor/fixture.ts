import type { EditorDocument } from "./model";

export const fixtureDocument: EditorDocument = {
  id: "fixture-poster",
  name: "Sunrise story",
  width: 800,
  height: 520,
  objects: [
    { id: "background", kind: "rectangle", name: "Sky", x: 0, y: 0, width: 800, height: 520, fill: "#f4e8d5" },
    { id: "sun", kind: "circle", name: "Sun", cx: 610, cy: 140, radius: 72, fill: "#ffb703" },
    { id: "hill", kind: "path", name: "Hill", d: "M0 420 Q220 260 430 390 T800 330 V520 H0 Z", fill: "#52796f" },
    { id: "title", kind: "text", name: "Title", x: 64, y: 104, value: "MAKE A STORY", fontSize: 42, fill: "#1f2937" },
  ],
};
