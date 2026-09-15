export const RENDERER_ABI_VERSION = 1;
export const TRANSFORM_INPUT_STRIDE = 13;
export const TRANSFORM_OUTPUT_STRIDE = 7;

export type TransformKernel = {
  readonly name: "typescript" | "rust-wasm";
  prepare(input: Float32Array, nodeCount: number): Float32Array;
};

type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

type RendererWasmExports = {
  memory: WebAssembly.Memory;
  renderer_abi_version(): number;
  alloc_f32(length: number): number;
  dealloc_f32(pointer: number, capacity: number): void;
  prepare_world_transforms_ffi(inputPointer: number, nodeCount: number, outputPointer: number): number;
};

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function localMatrix(input: Float32Array, offset: number): Matrix {
  const radians = input[offset + 3] * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaleX = input[offset + 4];
  const scaleY = input[offset + 5];
  const pivotX = input[offset + 6];
  const pivotY = input[offset + 7];
  const a = cos * scaleX;
  const b = sin * scaleX;
  const c = -sin * scaleY;
  const d = cos * scaleY;
  return {
    a,
    b,
    c,
    d,
    e: input[offset + 1] + pivotX - a * pivotX - c * pivotY,
    f: input[offset + 2] + pivotY - b * pivotX - d * pivotY,
  };
}

function boneMatrix(input: Float32Array, offset: number): Matrix {
  const radians = input[offset + 11] * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: input[offset + 9],
    f: input[offset + 10],
  };
}

export const referenceTransformKernel: TransformKernel = {
  name: "typescript",
  prepare(input, nodeCount) {
    if (input.length !== nodeCount * TRANSFORM_INPUT_STRIDE) {
      throw new Error("Renderer transform input length does not match node count.");
    }
    const output = new Float32Array(nodeCount * TRANSFORM_OUTPUT_STRIDE);
    for (let index = 0; index < nodeCount; index += 1) {
      const inputOffset = index * TRANSFORM_INPUT_STRIDE;
      const outputOffset = index * TRANSFORM_OUTPUT_STRIDE;
      const parentValue = input[inputOffset];
      const parentIndex = parentValue === -1 ? -1 : parentValue;
      if (!Number.isInteger(parentIndex) || parentIndex >= index) {
        throw new Error(`Renderer transform parent ${parentValue} is invalid for node ${index}.`);
      }

      let local = localMatrix(input, inputOffset);
      if (input[inputOffset + 12] !== 0) local = multiply(boneMatrix(input, inputOffset), local);
      let opacity = input[inputOffset + 8];
      if (parentIndex >= 0) {
        const parentOffset = parentIndex * TRANSFORM_OUTPUT_STRIDE;
        local = multiply({
          a: output[parentOffset],
          b: output[parentOffset + 1],
          c: output[parentOffset + 2],
          d: output[parentOffset + 3],
          e: output[parentOffset + 4],
          f: output[parentOffset + 5],
        }, local);
        opacity *= output[parentOffset + 6];
      }

      output[outputOffset] = local.a;
      output[outputOffset + 1] = local.b;
      output[outputOffset + 2] = local.c;
      output[outputOffset + 3] = local.d;
      output[outputOffset + 4] = local.e;
      output[outputOffset + 5] = local.f;
      output[outputOffset + 6] = opacity;
    }
    return output;
  },
};

function rendererAssetBasePath(): string {
  if (typeof document === "undefined") return "/";
  const asset = Array.from(document.scripts).map((script) => script.src).find((src) => src.includes("/_next/"))
    ?? Array.from(document.querySelectorAll<HTMLLinkElement>("link[href]"))
      .map((link) => link.href)
      .find((href) => href.includes("/_next/"));
  if (!asset) return "/";
  const url = new URL(asset, window.location.href);
  const marker = "/_next/";
  const markerIndex = url.pathname.indexOf(marker);
  return markerIndex >= 0 ? url.pathname.slice(0, markerIndex + 1) : "/";
}

export function rendererWasmUrl(): string {
  if (typeof window === "undefined") return "/renderer/flat_stories_renderer.wasm";
  const basePath = rendererAssetBasePath();
  return new URL(`${basePath}renderer/flat_stories_renderer.wasm`, window.location.origin).toString();
}

export async function instantiateWasmTransformKernel(bytes: BufferSource): Promise<TransformKernel> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const exports = instance.exports as unknown as RendererWasmExports;
  if (!(exports.memory instanceof WebAssembly.Memory)
    || typeof exports.renderer_abi_version !== "function"
    || typeof exports.alloc_f32 !== "function"
    || typeof exports.dealloc_f32 !== "function"
    || typeof exports.prepare_world_transforms_ffi !== "function") {
    throw new Error("Flat Stories renderer WASM exports do not match the expected ABI.");
  }
  if (exports.renderer_abi_version() !== RENDERER_ABI_VERSION) {
    throw new Error(`Flat Stories renderer ABI mismatch: expected ${RENDERER_ABI_VERSION}.`);
  }

  return {
    name: "rust-wasm",
    prepare(input, nodeCount) {
      if (input.length !== nodeCount * TRANSFORM_INPUT_STRIDE) {
        throw new Error("Renderer transform input length does not match node count.");
      }
      if (nodeCount === 0) return new Float32Array();
      const outputLength = nodeCount * TRANSFORM_OUTPUT_STRIDE;
      const inputPointer = exports.alloc_f32(input.length);
      const outputPointer = exports.alloc_f32(outputLength);
      try {
        let memory = new Float32Array(exports.memory.buffer);
        memory.set(input, inputPointer / Float32Array.BYTES_PER_ELEMENT);
        const status = exports.prepare_world_transforms_ffi(inputPointer, nodeCount, outputPointer);
        if (status !== 0) throw new Error(`Flat Stories renderer WASM failed with status ${status}.`);
        memory = new Float32Array(exports.memory.buffer);
        const start = outputPointer / Float32Array.BYTES_PER_ELEMENT;
        return memory.slice(start, start + outputLength);
      } finally {
        exports.dealloc_f32(outputPointer, outputLength);
        exports.dealloc_f32(inputPointer, input.length);
      }
    },
  };
}

let browserKernelPromise: Promise<TransformKernel> | null = null;

export function loadBrowserWasmTransformKernel(): Promise<TransformKernel> {
  if (typeof window === "undefined") return Promise.reject(new Error("Renderer WASM is only loaded in a browser."));
  if (!browserKernelPromise) {
    browserKernelPromise = (async () => {
      const response = await fetch(rendererWasmUrl());
      if (!response.ok) throw new Error(`Renderer WASM request failed with ${response.status}.`);
      return instantiateWasmTransformKernel(await response.arrayBuffer());
    })().catch((error) => {
      browserKernelPromise = null;
      throw error;
    });
  }
  return browserKernelPromise;
}
