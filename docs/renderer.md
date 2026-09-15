# Rendering architecture

Flat Stories has one authored scene and multiple renderers. The serialized `EditorDocument` remains authoritative; neither SVG DOM nodes, Canvas commands, nor WASM buffers become a second document model.

## Backends

### SVG DOM reference

`features/editor/rendering/SvgScene.tsx` is the semantic/reference renderer. It is deliberately straightforward and keeps the browser-native SVG representation available for editing, accessibility/debugging, interchange work, and regression comparison.

The editor's direct-manipulation canvas can continue using SVG while the optimized runtime path matures. This avoids coupling pointer/overlay mechanics to the performance experiment.

### Canvas 2D + Rust/WASM

`features/editor/rendering/CanvasScene.tsx` consumes a renderer-neutral frame prepared by `renderFrame.ts`. The initial Rust crate, `renderer-wasm`, computes hierarchical world transforms, rig attachment transforms, and inherited opacity over a compact `Float32Array` ABI. TypeScript owns browser integration and Canvas drawing.

A TypeScript transform kernel implements the same ABI and serves two purposes: deterministic fallback when WASM cannot load and a readable reference against which Rust output can be checked.

This first slice intentionally does not claim that the whole rasterizer lives in Rust. It establishes the boundary needed to move expensive path tessellation, deformation, hit-testing, batching, and eventually a WebGPU/WebGL backend behind the same render-frame contract when measurements justify them.

## Correctness contract

The render frame preserves canonical scene order and hierarchical transform semantics. Rust/WASM results are compared numerically with the TypeScript reference before performance numbers are considered.

SVG remains the higher-level semantic reference. Canvas text rasterization and SVG text rasterization are browser backends rather than a pixel-identical contract. Likewise, the current Canvas backend multiplies inherited opacity per drawable; fully isolated SVG group-opacity compositing is a later compatibility item if translucent overlapping groups become a real authored workload.

## Performance evidence

There are two deliberately separate measurements:

- `bun run bench:renderer` compares the TypeScript and Rust/WASM transform kernels on the same deterministic replicated-character workload. It checks numerical parity first and prints timing evidence without enforcing a speed threshold.
- `/renderer-lab` renders the same animated Nova scene through SVG DOM and Canvas, and can run a browser benchmark over 36 character copies and 60 pre-sampled frames. The SVG side forces a geometry flush so the comparison includes DOM/render work rather than only React scheduling.

The CI benchmark workflow stores the kernel measurement as an artifact. Ordinary correctness CI does not fail because a shared runner happened to be slower or faster on one run.

## Ownership

Flat Stories owns character/vector render semantics and the adapter from its scene graph to render frames. Generic geometry kernels may move to `rust-packages` once they are reusable independently of Flat Stories. `viz-engine` remains a data/frame computation engine for visualization consumers and is not made authoritative for character graphics.
