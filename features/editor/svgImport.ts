import {
  createIdentityTransform,
  type CircleObject,
  type EditorDocument,
  type EditorObject,
  type GroupObject,
  type PathAnchor,
  type PathObject,
  type RectangleObject,
  type StrokeLinecap,
  type StrokeLinejoin,
  type TextObject,
  type Transform,
  type VectorPath,
} from "./model";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const NUMBER_SOURCE = "[-+]?(?:\\d*\\.\\d+|\\d+\\.?)(?:[eE][-+]?\\d+)?";
const NUMBER_PATTERN = new RegExp("^" + NUMBER_SOURCE + "$");
const PATH_TOKEN_PATTERN = new RegExp("[A-Za-z]|" + NUMBER_SOURCE, "g");
const TRANSFORM_PATTERN = /([A-Za-z]+)\s*\(([^)]*)\)/g;
const EPSILON = 1e-8;

type Matrix = readonly [number, number, number, number, number, number];

type Paint = {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: StrokeLinecap;
  strokeLinejoin?: StrokeLinejoin;
};

type Context = {
  generatedId: number;
  ids: Set<string>;
};

export type SvgImportDiagnosticCode =
  | "invalid-svg"
  | "invalid-value"
  | "unsupported-attribute"
  | "unsupported-element"
  | "unsupported-path"
  | "unsupported-transform";

export class SvgImportError extends Error {
  constructor(
    readonly code: SvgImportDiagnosticCode,
    readonly location: string,
    message: string,
  ) {
    super(location + ": " + message);
    this.name = "SvgImportError";
  }
}

export type SvgImportOptions = {
  fallbackName?: string;
};

function fail(code: SvgImportDiagnosticCode, location: string, message: string): never {
  throw new SvgImportError(code, location, message);
}

function locationOf(element: Element) {
  const id = element.getAttribute("id")?.trim();
  return id ? "<" + element.localName + " id=\"" + id + "\">" : "<" + element.localName + ">";
}

function numberValue(value: string, location: string, name: string) {
  const trimmed = value.trim();
  if (!NUMBER_PATTERN.test(trimmed)) fail("invalid-value", location, name + " must be a finite unitless number");
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) fail("invalid-value", location, name + " must be finite");
  return parsed;
}

function lengthValue(value: string, location: string, name: string) {
  const trimmed = value.trim();
  const match = new RegExp("^(" + NUMBER_SOURCE + ")(px)?$").exec(trimmed);
  if (!match) fail("invalid-value", location, name + " supports only unitless or px lengths");
  return numberValue(match[1], location, name);
}

function optionalNumber(element: Element, name: string, fallback: number) {
  const value = element.getAttribute(name);
  return value === null ? fallback : numberValue(value, locationOf(element), name);
}

function requiredNumber(element: Element, name: string) {
  const value = element.getAttribute(name);
  if (value === null) fail("invalid-value", locationOf(element), "missing required " + name);
  return numberValue(value, locationOf(element), name);
}

function assertAttributes(element: Element, allowed: readonly string[]) {
  const names = new Set(allowed);
  for (const attribute of Array.from(element.attributes)) {
    if (!names.has(attribute.name)) {
      fail(
        "unsupported-attribute",
        locationOf(element),
        "attribute " + JSON.stringify(attribute.name) + " is outside the supported SVG subset",
      );
    }
  }
}

function paintValue(value: string, element: Element, name: "fill" | "stroke") {
  const normalized = value.trim();
  if (!normalized) fail("invalid-value", locationOf(element), name + " cannot be empty");
  if (/^(url|var)\(/i.test(normalized)) {
    fail("unsupported-attribute", locationOf(element), name + " paint servers and CSS variables are not supported");
  }
  return normalized;
}

function strokeLinecap(value: string, element: Element): StrokeLinecap {
  if (value === "butt" || value === "round" || value === "square") return value;
  fail("invalid-value", locationOf(element), "unsupported stroke-linecap " + JSON.stringify(value));
}

function strokeLinejoin(value: string, element: Element): StrokeLinejoin {
  if (value === "miter" || value === "round" || value === "bevel") return value;
  fail("invalid-value", locationOf(element), "unsupported stroke-linejoin " + JSON.stringify(value));
}

function paintFor(element: Element, inherited: Paint): Paint {
  const fill = element.getAttribute("fill");
  const stroke = element.getAttribute("stroke");
  const width = element.getAttribute("stroke-width");
  const cap = element.getAttribute("stroke-linecap");
  const join = element.getAttribute("stroke-linejoin");
  const strokeWidth = width === null ? inherited.strokeWidth : lengthValue(width, locationOf(element), "stroke-width");
  if (strokeWidth !== undefined && strokeWidth < 0) fail("invalid-value", locationOf(element), "stroke-width cannot be negative");
  return {
    fill: fill === null ? inherited.fill : paintValue(fill, element, "fill"),
    stroke: stroke === null ? inherited.stroke : paintValue(stroke, element, "stroke"),
    strokeWidth,
    strokeLinecap: cap === null ? inherited.strokeLinecap : strokeLinecap(cap, element),
    strokeLinejoin: join === null ? inherited.strokeLinejoin : strokeLinejoin(join, element),
  };
}

function opacityFor(element: Element) {
  const opacity = optionalNumber(element, "opacity", 1);
  if (opacity < 0 || opacity > 1) fail("invalid-value", locationOf(element), "opacity must be between 0 and 1");
  return opacity;
}

function visibleFor(element: Element) {
  const display = element.getAttribute("display");
  if (display !== null && display !== "inline" && display !== "none") {
    fail("invalid-value", locationOf(element), "unsupported display value " + JSON.stringify(display));
  }
  const visibility = element.getAttribute("visibility");
  if (visibility !== null && visibility !== "visible" && visibility !== "hidden") {
    fail("invalid-value", locationOf(element), "unsupported visibility value " + JSON.stringify(visibility));
  }
  return display !== "none" && visibility !== "hidden";
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

function scale(x: number, y: number): Matrix {
  return [x, 0, 0, y, 0, 0];
}

function rotate(degrees: number): Matrix {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [cosine, sine, -sine, cosine, 0, 0];
}

function transformNumbers(raw: string, element: Element, name: string) {
  if (!raw.trim()) return [];
  return raw
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => numberValue(value, locationOf(element), name + " transform argument"));
}

function transformMatrix(name: string, values: number[], element: Element): Matrix {
  if (name === "translate" && (values.length === 1 || values.length === 2)) {
    return translate(values[0], values[1] ?? 0);
  }
  if (name === "scale" && (values.length === 1 || values.length === 2)) {
    return scale(values[0], values[1] ?? values[0]);
  }
  if (name === "rotate" && values.length === 1) return rotate(values[0]);
  if (name === "rotate" && values.length === 3) {
    return multiply(multiply(translate(values[1], values[2]), rotate(values[0])), translate(-values[1], -values[2]));
  }
  if (name === "matrix" && values.length === 6) return values as unknown as Matrix;
  if (!["translate", "scale", "rotate", "matrix"].includes(name)) {
    fail("unsupported-transform", locationOf(element), "transform " + JSON.stringify(name) + " is not supported");
  }
  fail("invalid-value", locationOf(element), "invalid " + name + " transform arguments");
}

function near(left: number, right: number) {
  return Math.abs(left - right) <= EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function decompose(matrix: Matrix, element: Element): Transform {
  const [a, b, c, d, e, f] = matrix;
  const scaleX = Math.hypot(a, b);
  if (scaleX < EPSILON) fail("unsupported-transform", locationOf(element), "zero-scale transforms are not supported");
  const scaleY = (a * d - b * c) / scaleX;
  const rotation = Math.atan2(b, a) * 180 / Math.PI;
  const radians = rotation * Math.PI / 180;
  if (!near(c, -Math.sin(radians) * scaleY) || !near(d, Math.cos(radians) * scaleY)) {
    fail("unsupported-transform", locationOf(element), "skewed transforms cannot be represented by Flat Stories");
  }
  return { x: e, y: f, rotation, scaleX, scaleY, pivotX: 0, pivotY: 0 };
}

function transformFor(element: Element) {
  const source = element.getAttribute("transform");
  if (!source) return createIdentityTransform();

  let result: Matrix = [1, 0, 0, 1, 0, 0];
  let lastIndex = 0;
  TRANSFORM_PATTERN.lastIndex = 0;
  for (let match = TRANSFORM_PATTERN.exec(source); match; match = TRANSFORM_PATTERN.exec(source)) {
    if (source.slice(lastIndex, match.index).replace(/[,\s]+/g, "")) {
      fail("invalid-value", locationOf(element), "invalid transform list");
    }
    result = multiply(result, transformMatrix(match[1], transformNumbers(match[2], element, match[1]), element));
    lastIndex = TRANSFORM_PATTERN.lastIndex;
  }
  if (lastIndex === 0 || source.slice(lastIndex).replace(/[,\s]+/g, "")) {
    fail("invalid-value", locationOf(element), "invalid transform list");
  }
  return decompose(result, element);
}

function allocateId(element: Element, kind: string, context: Context) {
  const requested = element.getAttribute("id")?.trim();
  const id = requested || kind + "-" + ++context.generatedId;
  if (context.ids.has(id)) fail("invalid-value", locationOf(element), "duplicate SVG id " + JSON.stringify(id));
  context.ids.add(id);
  return id;
}

function nodeBase(element: Element, kind: string, context: Context) {
  const id = allocateId(element, kind, context);
  return {
    id,
    name: id,
    transform: transformFor(element),
    opacity: opacityFor(element),
    visible: visibleFor(element),
    locked: false,
  };
}

function tokenizePath(source: string, element: Element) {
  const tokens = source.match(PATH_TOKEN_PATTERN) ?? [];
  const remainder = source.replace(PATH_TOKEN_PATTERN, "").replace(/[\s,]+/g, "");
  if (remainder) fail("invalid-value", locationOf(element), "invalid path data near " + JSON.stringify(remainder));
  return tokens;
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return near(left.x, right.x) && near(left.y, right.y);
}

function parsePath(source: string, element: Element, objectId: string): VectorPath {
  const tokens = tokenizePath(source, element);
  const anchors: PathAnchor[] = [];
  let index = 0;
  let command: string | null = null;
  let closed = false;
  let anchorIndex = 0;
  let lastSegment: string | null = null;

  function readNumber() {
    const token = tokens[index];
    if (token === undefined || /^[A-Za-z]$/.test(token)) {
      fail("invalid-value", locationOf(element), "path command " + (command ?? "?") + " is missing numeric arguments");
    }
    index += 1;
    return numberValue(token, locationOf(element), "path coordinate");
  }

  function addAnchor(point: { x: number; y: number }, inHandle?: { x: number; y: number }) {
    anchorIndex += 1;
    anchors.push({ id: objectId + "-anchor-" + anchorIndex, point, inHandle });
  }

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      if (command !== command.toUpperCase()) {
        fail("unsupported-path", locationOf(element), "relative path command " + JSON.stringify(command) + " is not supported");
      }
      if (!["M", "L", "C", "Z"].includes(command)) {
        fail("unsupported-path", locationOf(element), "path command " + JSON.stringify(command) + " is not supported; use M, L, C, and Z");
      }
      if (command === "Z") {
        closed = true;
        if (anchors.length > 1 && samePoint(anchors[0].point, anchors.at(-1)!.point) && lastSegment === "C") {
          const duplicate = anchors.pop()!;
          anchors[0] = { ...anchors[0], inHandle: duplicate.inHandle };
        }
        command = null;
        lastSegment = "Z";
        continue;
      }
    }

    if (command === null) fail("invalid-value", locationOf(element), "path data must start with a command");
    if (command === "M") {
      if (anchors.length > 0) fail("unsupported-path", locationOf(element), "multiple path subpaths are not supported");
      addAnchor({ x: readNumber(), y: readNumber() });
      command = "L";
      lastSegment = "M";
      continue;
    }
    if (anchors.length === 0) fail("invalid-value", locationOf(element), "path command " + command + " requires an initial M command");
    if (command === "L") {
      addAnchor({ x: readNumber(), y: readNumber() });
      lastSegment = "L";
      continue;
    }
    if (command === "C") {
      const firstControl = { x: readNumber(), y: readNumber() };
      const secondControl = { x: readNumber(), y: readNumber() };
      const point = { x: readNumber(), y: readNumber() };
      const previous = anchors.at(-1)!;
      anchors[anchors.length - 1] = { ...previous, outHandle: firstControl };
      addAnchor(point, secondControl);
      lastSegment = "C";
    }
  }

  if (anchors.length === 0) fail("invalid-value", locationOf(element), "path must contain at least one anchor");
  return { closed, anchors };
}

const BASE_ATTRIBUTES = ["id", "transform", "opacity", "display", "visibility"] as const;
const PAINT_ATTRIBUTES = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"] as const;

function rectangleObject(element: Element, inherited: Paint, context: Context): RectangleObject {
  assertAttributes(element, [...BASE_ATTRIBUTES, ...PAINT_ATTRIBUTES, "x", "y", "width", "height", "rx", "ry"]);
  const base = nodeBase(element, "rectangle", context);
  const width = requiredNumber(element, "width");
  const height = requiredNumber(element, "height");
  const rx = optionalNumber(element, "rx", 0);
  const ry = element.hasAttribute("ry") ? requiredNumber(element, "ry") : rx;
  if (width < 0 || height < 0 || rx < 0 || ry < 0) {
    fail("invalid-value", locationOf(element), "rectangle dimensions cannot be negative");
  }
  if (!near(rx, ry)) fail("unsupported-attribute", locationOf(element), "different rx/ry corner radii are not supported");
  return {
    ...base,
    ...paintFor(element, inherited),
    kind: "rectangle",
    x: optionalNumber(element, "x", 0),
    y: optionalNumber(element, "y", 0),
    width,
    height,
    cornerRadius: rx,
  };
}

function circleObject(element: Element, inherited: Paint, context: Context): CircleObject {
  assertAttributes(element, [...BASE_ATTRIBUTES, ...PAINT_ATTRIBUTES, "cx", "cy", "r"]);
  const radius = requiredNumber(element, "r");
  if (radius < 0) fail("invalid-value", locationOf(element), "circle radius cannot be negative");
  return {
    ...nodeBase(element, "circle", context),
    ...paintFor(element, inherited),
    kind: "circle",
    cx: optionalNumber(element, "cx", 0),
    cy: optionalNumber(element, "cy", 0),
    radius,
  };
}

function pathObject(element: Element, inherited: Paint, context: Context): PathObject {
  assertAttributes(element, [...BASE_ATTRIBUTES, ...PAINT_ATTRIBUTES, "d"]);
  const base = nodeBase(element, "path", context);
  const source = element.getAttribute("d");
  if (source === null) fail("invalid-value", locationOf(element), "path is missing required d data");
  return {
    ...base,
    ...paintFor(element, inherited),
    kind: "path",
    path: parsePath(source, element, base.id),
  };
}

function textObject(element: Element, inherited: Paint, context: Context): TextObject {
  assertAttributes(element, [...BASE_ATTRIBUTES, ...PAINT_ATTRIBUTES, "x", "y", "font-size", "font-weight"]);
  if (element.children.length > 0) {
    fail("unsupported-element", locationOf(element), "nested text/tspan elements are not supported");
  }
  const weight = element.getAttribute("font-weight");
  if (weight !== "700" && weight !== "bold") {
    fail("unsupported-attribute", locationOf(element), "text import currently supports only font-weight 700/bold");
  }
  const fontSizeSource = element.getAttribute("font-size");
  if (fontSizeSource === null) fail("invalid-value", locationOf(element), "text requires font-size");
  const fontSize = lengthValue(fontSizeSource, locationOf(element), "font-size");
  if (fontSize <= 0) fail("invalid-value", locationOf(element), "font-size must be positive");
  return {
    ...nodeBase(element, "text", context),
    ...paintFor(element, inherited),
    kind: "text",
    x: optionalNumber(element, "x", 0),
    y: optionalNumber(element, "y", 0),
    value: element.textContent ?? "",
    fontSize,
  };
}

function childElements(element: Element) {
  const result: Element[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      result.push(child as Element);
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      fail("unsupported-element", locationOf(element), "non-whitespace text is only supported inside <text>");
    }
  }
  return result;
}

function groupObject(element: Element, inherited: Paint, context: Context): EditorObject {
  assertAttributes(element, [...BASE_ATTRIBUTES, ...PAINT_ATTRIBUTES]);
  const children = childElements(element);
  const wrapperChild = children.length === 1 && ["rect", "circle", "path", "text"].includes(children[0].localName)
    ? children[0]
    : null;
  const hasGroupPaint = PAINT_ATTRIBUTES.some((name) => element.hasAttribute(name));
  const childHasNodeState = wrapperChild
    ? ["id", "transform", "opacity", "display", "visibility"].some((name) => wrapperChild.hasAttribute(name))
    : false;

  if (wrapperChild && !hasGroupPaint && !childHasNodeState) {
    const base = nodeBase(element, wrapperChild.localName, context);
    const drawable = importElement(wrapperChild, inherited, context);
    context.ids.delete(drawable.id);
    if (drawable.kind === "group") {
      fail("invalid-svg", locationOf(element), "internal SVG wrapper classification failed");
    }
    return {
      ...drawable,
      ...base,
      id: base.id,
      name: base.name,
      transform: base.transform,
      opacity: base.opacity,
      visible: base.visible,
      locked: base.locked,
    };
  }

  const paint = paintFor(element, inherited);
  return {
    ...nodeBase(element, "group", context),
    kind: "group",
    children: children.map((child) => importElement(child, paint, context)),
  };
}

function importElement(element: Element, inherited: Paint, context: Context): EditorObject {
  if (element.namespaceURI && element.namespaceURI !== SVG_NAMESPACE) {
    fail("unsupported-element", locationOf(element), "namespace " + JSON.stringify(element.namespaceURI) + " is not supported");
  }
  if (element.localName === "g") return groupObject(element, inherited, context);
  if (element.localName === "rect") return rectangleObject(element, inherited, context);
  if (element.localName === "circle") return circleObject(element, inherited, context);
  if (element.localName === "path") return pathObject(element, inherited, context);
  if (element.localName === "text") return textObject(element, inherited, context);
  fail("unsupported-element", locationOf(element), "element <" + element.localName + "> is outside the supported SVG subset");
}

function parseViewBox(root: Element) {
  const source = root.getAttribute("viewBox");
  if (source === null) return null;
  const values = source
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((value) => numberValue(value, "<svg>", "viewBox"));
  if (values.length !== 4) fail("invalid-value", "<svg>", "viewBox must contain four numbers");
  const [minX, minY, width, height] = values;
  if (!near(minX, 0) || !near(minY, 0)) {
    fail("unsupported-attribute", "<svg>", "viewBox currently requires a 0 0 origin");
  }
  if (width <= 0 || height <= 0) fail("invalid-value", "<svg>", "viewBox width and height must be positive");
  return { width, height };
}

function dimensions(root: Element) {
  const viewBox = parseViewBox(root);
  const widthSource = root.getAttribute("width");
  const heightSource = root.getAttribute("height");
  const width = widthSource === null ? viewBox?.width : lengthValue(widthSource, "<svg>", "width");
  const height = heightSource === null ? viewBox?.height : lengthValue(heightSource, "<svg>", "height");
  if (width === undefined || height === undefined) {
    fail("invalid-value", "<svg>", "width/height or a viewBox are required");
  }
  if (width <= 0 || height <= 0) fail("invalid-value", "<svg>", "width and height must be positive");
  if (viewBox && (!near(width, viewBox.width) || !near(height, viewBox.height))) {
    fail("unsupported-attribute", "<svg>", "viewport scaling is not supported; width/height must match viewBox dimensions");
  }
  return { width, height };
}

export function importDocumentFromSvg(source: string, options: SvgImportOptions = {}): EditorDocument {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    fail("invalid-svg", "<svg>", "input is not well-formed SVG XML");
  }

  const root = parsed.documentElement;
  if (root.localName !== "svg" || (root.namespaceURI && root.namespaceURI !== SVG_NAMESPACE)) {
    fail("invalid-svg", "document", "root element must be an SVG <svg> element");
  }
  assertAttributes(root, ["xmlns", "id", "width", "height", "viewBox", "version"]);

  const { width, height } = dimensions(root);
  const children = childElements(root);
  const titles = children.filter((element) => element.localName === "title");
  if (titles.length > 1) fail("invalid-value", "<svg>", "only one <title> is supported");
  for (const title of titles) assertAttributes(title, []);

  const title = titles[0]?.textContent?.trim();
  const context: Context = { generatedId: 0, ids: new Set() };
  const objects = children
    .filter((element) => element.localName !== "title")
    .map((element) => importElement(element, { fill: "black" }, context));

  return {
    id: root.getAttribute("id")?.trim() || "imported-svg",
    name: title || options.fallbackName?.trim() || "Imported SVG",
    width,
    height,
    objects,
    animations: [],
  };
}
