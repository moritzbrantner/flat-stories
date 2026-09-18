import { describe, expect, it } from "vitest";
import { createIdentityTransform, type EditorDocument } from "./model";
import { exportDocumentToSvg } from "./svgExport";
import { importDocumentFromSvg, SvgImportError } from "./svgImport";

describe("static SVG import", () => {
  it("imports the supported editable subset deterministically", () => {
    const source = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">',
      "<title>Imported character</title>",
      '<g id="body" transform="translate(12 18) rotate(15) scale(1.25 0.8)" opacity="0.75">',
      '<rect x="10" y="20" width="100" height="80" rx="12" fill="#f4b942" stroke="#20252f" stroke-width="3" stroke-linecap="round" stroke-linejoin="bevel"/>',
      "</g>",
      '<g id="details" transform="translate(3 4)">',
      '<g id="eye" transform="translate(2 1)" opacity="0.9"><circle cx="50" cy="55" r="8" fill="#20252f"/></g>',
      '<path id="smile" d="M30 90 C45 105 75 105 90 90" fill="none" stroke="#20252f" stroke-width="4" stroke-linecap="round"/>',
      "</g>",
      '<text id="caption" x="20" y="170" font-size="22" font-weight="700" fill="#20252f">HELLO &amp; WAVE</text>',
      "</svg>",
    ].join("");

    const first = importDocumentFromSvg(source);
    const second = importDocumentFromSvg(source);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      id: "imported-svg",
      name: "Imported character",
      width: 320,
      height: 200,
      animations: [],
    });
    expect(first.objects).toHaveLength(3);
    expect(first.objects[0]).toMatchObject({
      id: "body",
      kind: "rectangle",
      opacity: 0.75,
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      cornerRadius: 12,
      fill: "#f4b942",
      stroke: "#20252f",
      strokeWidth: 3,
      strokeLinecap: "round",
      strokeLinejoin: "bevel",
    });
    expect(first.objects[0].transform.rotation).toBeCloseTo(15);
    expect(first.objects[0].transform.scaleX).toBeCloseTo(1.25);
    expect(first.objects[0].transform.scaleY).toBeCloseTo(0.8);

    const details = first.objects[1];
    expect(details.kind).toBe("group");
    if (details.kind !== "group") throw new Error("Expected group");
    expect(details.children.map((child) => [child.id, child.kind])).toEqual([
      ["eye", "circle"],
      ["smile", "path"],
    ]);
    const smile = details.children[1];
    if (smile.kind !== "path") throw new Error("Expected path");
    expect(smile.path.anchors).toHaveLength(2);
    expect(smile.path.anchors[0].outHandle).toEqual({ x: 45, y: 105 });
    expect(smile.path.anchors[1].inHandle).toEqual({ x: 75, y: 105 });

    expect(first.objects[2]).toMatchObject({
      id: "caption",
      kind: "text",
      value: "HELLO & WAVE",
      fontSize: 22,
    });
  });

  it("accepts Flat Stories static SVG output without turning each drawable wrapper into an extra group", () => {
    const document: EditorDocument = {
      id: "source",
      name: "Round trip",
      width: 160,
      height: 120,
      animations: [],
      objects: [
        {
          id: "panel",
          name: "Panel",
          kind: "rectangle",
          transform: { ...createIdentityTransform(), x: 5, y: 7, rotation: 20, scaleX: 1.1, scaleY: 0.9 },
          opacity: 0.8,
          visible: true,
          locked: false,
          x: 10,
          y: 12,
          width: 80,
          height: 50,
          cornerRadius: 6,
          fill: "#abcdef",
          stroke: "#123456",
          strokeWidth: 2,
        },
        {
          id: "curve",
          name: "Curve",
          kind: "path",
          transform: createIdentityTransform(),
          opacity: 1,
          visible: true,
          locked: false,
          fill: "none",
          stroke: "#111111",
          strokeWidth: 3,
          path: {
            closed: true,
            anchors: [
              { id: "a", point: { x: 20, y: 20 }, inHandle: { x: 10, y: 25 }, outHandle: { x: 30, y: 10 } },
              { id: "b", point: { x: 70, y: 30 }, inHandle: { x: 55, y: 15 } },
            ],
          },
        },
      ],
    };

    const imported = importDocumentFromSvg(exportDocumentToSvg(document));

    expect(imported.name).toBe(document.name);
    expect(imported.objects.map((object) => [object.id, object.kind])).toEqual([
      ["panel", "rectangle"],
      ["curve", "path"],
    ]);
    expect(imported.objects[0].transform).toMatchObject({ x: 5, y: 7, rotation: 20, scaleX: 1.1, scaleY: 0.9 });
    const curve = imported.objects[1];
    if (curve.kind !== "path") throw new Error("Expected imported path");
    expect(curve.path.closed).toBe(true);
    expect(curve.path.anchors).toHaveLength(2);
    expect(curve.path.anchors[0].inHandle).toEqual({ x: 10, y: 25 });
    expect(curve.path.anchors[0].outHandle).toEqual({ x: 30, y: 10 });
  });

  it("uses a deterministic fallback name and generated ids", () => {
    const imported = importDocumentFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="10" height="12" fill="black"/><circle r="3" fill="red"/></svg>',
      { fallbackName: "asset.svg" },
    );

    expect(imported.name).toBe("asset.svg");
    expect(imported.objects.map((object) => object.id)).toEqual(["rectangle-1", "circle-2"]);
  });

  it("fails closed on unsupported elements, paint servers, and path commands", () => {
    const unsupported = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><ellipse cx="5" cy="5" rx="2" ry="3"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="url(#gradient)"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 0 Q10 10 20 0" fill="none"/></svg>',
    ];

    for (const source of unsupported) {
      expect(() => importDocumentFromSvg(source)).toThrow(SvgImportError);
    }
    try {
      importDocumentFromSvg(unsupported[2]);
      throw new Error("Expected import to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SvgImportError);
      expect((error as SvgImportError).code).toBe("unsupported-path");
      expect((error as Error).message).toMatch(/path command/);
    }
  });

  it("rejects viewport scaling and skew rather than silently changing the artwork", () => {
    expect(() => importDocumentFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 100 100"></svg>',
    )).toThrow(/viewport scaling/);

    expect(() => importDocumentFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g transform="matrix(1 0.2 0 1 0 0)"></g></svg>',
    )).toThrow(/skewed transforms/);
  });
});
