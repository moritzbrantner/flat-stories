import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PathObject } from "../features/editor/model";
import { fixtureDocument } from "../features/editor/fixture";
import { createRendererBenchmarkDocument } from "../features/editor/rendering/benchmarkFixture";
import { createPreparedPathCache } from "../features/editor/rendering/pathPreparation";
import { encodeRenderScene } from "../features/editor/rendering/renderFrame";
import { flattenObjects } from "../features/editor/sceneGraph";
import { pathToSvg } from "../features/editor/vectorPath";
import { instantiateWasmTransformKernel, referenceTransformKernel, type TransformKernel } from "../features/editor/rendering/transformKernel";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmBytes = await readFile(resolve(root, "public/renderer/flat_stories_renderer.wasm"));
const wasmKernel = await instantiateWasmTransformKernel(new Uint8Array(wasmBytes).buffer);
const document = createRendererBenchmarkDocument(fixtureDocument, 64);
const encoded = encodeRenderScene(document);

const reference = referenceTransformKernel.prepare(encoded.input, encoded.nodes.length);
const wasm = wasmKernel.prepare(encoded.input, encoded.nodes.length);
let maxDelta = 0;
for (let index = 0; index < reference.length; index += 1) {
  maxDelta = Math.max(maxDelta, Math.abs(reference[index] - wasm[index]));
}
if (maxDelta > 0.001) throw new Error(`Rust/WASM renderer diverged from the TypeScript reference by ${maxDelta}.`);

function measureKernel(kernel: TransformKernel, iterations: number) {
  for (let index = 0; index < 100; index += 1) kernel.prepare(encoded.input, encoded.nodes.length);
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) kernel.prepare(encoded.input, encoded.nodes.length);
  return performance.now() - start;
}

const pathObjects = flattenObjects(document.objects)
  .map(({ node }) => node)
  .filter((node): node is PathObject => node.kind === "path");

function measureLegacyPathLookup(iterations: number) {
  const cache = new Map<string, { source: string; prepared: number }>();
  for (const object of pathObjects) {
    const source = pathToSvg(object.path);
    cache.set(object.id, { source, prepared: source.length });
  }

  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const object of pathObjects) {
      const source = pathToSvg(object.path);
      const cached = cache.get(object.id);
      const prepared = cached?.source === source ? cached.prepared : source.length;
      if (cached?.source !== source) cache.set(object.id, { source, prepared });
      checksum += prepared;
    }
  }
  return { milliseconds: performance.now() - start, checksum };
}

function measureIdentityPathLookup(iterations: number) {
  const cache = createPreparedPathCache((source) => source.length);
  for (const object of pathObjects) cache.get(object.path);

  let checksum = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const object of pathObjects) checksum += cache.get(object.path);
  }
  return { milliseconds: performance.now() - start, checksum };
}

const iterations = 2_000;
const typescriptMs = measureKernel(referenceTransformKernel, iterations);
const rustWasmMs = measureKernel(wasmKernel, iterations);
const legacyPath = measureLegacyPathLookup(iterations);
const identityPath = measureIdentityPathLookup(iterations);
if (legacyPath.checksum !== identityPath.checksum) throw new Error("Path preparation cache changed prepared path semantics.");

const result = {
  workload: {
    copies: 64,
    nodesPerFrame: encoded.nodes.length,
    pathsPerFrame: pathObjects.length,
    iterations,
  },
  semanticParity: {
    maxDelta,
    pathPreparationChecksum: identityPath.checksum,
  },
  transformPreparation: {
    typescriptMs: Number(typescriptMs.toFixed(3)),
    rustWasmMs: Number(rustWasmMs.toFixed(3)),
    rustWasmSpeedup: Number((typescriptMs / rustWasmMs).toFixed(3)),
  },
  steadyStatePathPreparation: {
    legacySerializeEveryLookupMs: Number(legacyPath.milliseconds.toFixed(3)),
    identityCacheMs: Number(identityPath.milliseconds.toFixed(3)),
    identityCacheSpeedup: Number((legacyPath.milliseconds / identityPath.milliseconds).toFixed(3)),
  },
  note: "Stable CPU evidence only; no wall-clock value is a CI correctness gate. Browser SVG-DOM versus Canvas/WASM rendering is measured in /renderer-lab.",
};

console.log(JSON.stringify(result, null, 2));
