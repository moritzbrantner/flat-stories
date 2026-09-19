import { fixtureDocument } from "../features/editor/fixture";
import type { DrawableObject } from "../features/editor/model";
import { pathToSvg } from "../features/editor/vectorPath";
import { createRendererBenchmarkDocument } from "../features/editor/rendering/benchmarkFixture";
import { buildRenderFrame, type RenderMatrix } from "../features/editor/rendering/renderFrame";

const benchmarkDocument = createRendererBenchmarkDocument(fixtureDocument, 1);
const frame = buildRenderFrame(benchmarkDocument);

const snapshot = {
  schema: "flat-stories-2d-lab-render-frame/v1" as const,
  provenance: {
    generatedBy: "scripts/export-2d-lab-nova-fixture.ts",
    sourceFixture: "features/editor/fixture.ts#fixtureDocument",
    sourceRepository: "moritzbrantner/flat-stories",
    sourceWorkload: "createRendererBenchmarkDocument(fixtureDocument, 1)",
  },
  width: frame.width,
  height: frame.height,
  background: "#ffffff",
  items: frame.items.map((item) => ({
    id: item.id,
    matrix: finiteMatrix(item.matrix, item.id),
    opacity: finiteOpacity(item.opacity, item.id),
    shape: renderShape(item.object),
    paint: renderPaint(item.object),
  })),
};

if (snapshot.items.length === 0) {
  throw new Error("Nova 2d-lab snapshot must contain drawable items");
}

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);

function renderShape(object: DrawableObject) {
  switch (object.kind) {
    case "rectangle":
      return {
        kind: "rectangle" as const,
        x: finite(object.x, object.id, "x"),
        y: finite(object.y, object.id, "y"),
        width: positive(object.width, object.id, "width"),
        height: positive(object.height, object.id, "height"),
        cornerRadius: nonNegative(object.cornerRadius, object.id, "cornerRadius"),
      };
    case "circle":
      return {
        kind: "circle" as const,
        cx: finite(object.cx, object.id, "cx"),
        cy: finite(object.cy, object.id, "cy"),
        radius: positive(object.radius, object.id, "radius"),
      };
    case "path": {
      const path = pathToSvg(object.path);
      if (!path) throw new Error(`Nova path ${object.id} is empty`);
      return {
        kind: "svg-path" as const,
        path,
      };
    }
    case "text":
      throw new Error(
        `Nova benchmark unexpectedly contains text item ${object.id}; keep text semantics product-owned until the lab has an explicit text contract`,
      );
  }
}

function renderPaint(object: DrawableObject) {
  return {
    fill: object.fill,
    ...(object.stroke ? { stroke: object.stroke } : {}),
    ...(object.strokeWidth !== undefined
      ? { strokeWidth: positive(object.strokeWidth, object.id, "strokeWidth") }
      : {}),
    ...(object.strokeLinecap ? { strokeLinecap: object.strokeLinecap } : {}),
    ...(object.strokeLinejoin ? { strokeLinejoin: object.strokeLinejoin } : {}),
  };
}

function finiteMatrix(matrix: RenderMatrix, id: string): RenderMatrix {
  if (matrix.some((value) => !Number.isFinite(value))) {
    throw new Error(`Nova render item ${id} has a non-finite matrix`);
  }
  return matrix;
}

function finiteOpacity(value: number, id: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Nova render item ${id} has invalid opacity ${value}`);
  }
  return value;
}

function finite(value: number, id: string, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Nova render item ${id} has non-finite ${field}`);
  }
  return value;
}

function positive(value: number, id: string, field: string) {
  finite(value, id, field);
  if (value <= 0) throw new Error(`Nova render item ${id} has non-positive ${field}`);
  return value;
}

function nonNegative(value: number, id: string, field: string) {
  finite(value, id, field);
  if (value < 0) throw new Error(`Nova render item ${id} has negative ${field}`);
  return value;
}
