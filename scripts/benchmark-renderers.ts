import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fixtureDocument } from "../features/editor/fixture";
import { createRendererBenchmarkDocument } from "../features/editor/rendering/benchmarkFixture";
import { encodeRenderScene } from "../features/editor/rendering/renderFrame";
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

function measure(kernel: TransformKernel, iterations: number) {
  for (let index = 0; index < 100; index += 1) kernel.prepare(encoded.input, encoded.nodes.length);
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) kernel.prepare(encoded.input, encoded.nodes.length);
  return performance.now() - start;
}

const iterations = 2_000;
const typescriptMs = measure(referenceTransformKernel, iterations);
const rustWasmMs = measure(wasmKernel, iterations);
const result = {
  workload: {
    copies: 64,
    nodesPerFrame: encoded.nodes.length,
    iterations,
  },
  semanticParity: {
    maxDelta,
  },
  transformPreparation: {
    typescriptMs: Number(typescriptMs.toFixed(3)),
    rustWasmMs: Number(rustWasmMs.toFixed(3)),
    rustWasmSpeedup: Number((typescriptMs / rustWasmMs).toFixed(3)),
  },
  note: "This is a stable kernel comparison, not a CI timing gate. Browser SVG-DOM versus Canvas/WASM rendering is measured in /renderer-lab.",
};

console.log(JSON.stringify(result, null, 2));
