# Rendering architecture

Flat Stories has one authored scene and multiple renderers. The serialized `EditorDocument` remains authoritative; neither SVG DOM nodes, Canvas commands, nor WASM buffers become a second document model.

## Backends

### SVG DOM reference and editing surface

`features/editor/rendering/SvgScene.tsx` is the semantic/reference renderer. The editor also keeps its SVG artboard for rest-pose direct manipulation, accessibility/debugging, interchange work, and regression comparison. SVG remains selectable as an explicit animation-preview reference path.

The important boundary is that SVG DOM is no longer the only runtime presentation of the authored scene. Editing overlays and pointer-heavy geometry authoring stay on SVG until an optimized backend can preserve those semantics rather than merely drawing the same pixels.

### Canvas 2D + Rust/WASM

`features/editor/rendering/CanvasScene.tsx` consumes renderer-neutral frames prepared by `renderFrame.ts`. The Rust crate, `renderer-wasm`, computes hierarchical world transforms, rig attachment transforms, and inherited opacity over a compact `Float32Array` ABI. TypeScript owns browser integration and Canvas drawing.

A TypeScript transform kernel implements the same ABI and serves as deterministic fallback when WASM cannot load and as the readable reference against which Rust output is checked. If Canvas 2D itself cannot render, the editor falls back to SVG rather than leaving animation preview unusable.

Canvas interaction consumes the same prepared render frame instead of reconstructing scene semantics. `hitTest.ts` inverse-transforms the pointer into each drawable's local space, walks draw order from front to back, handles rectangle/circle geometry deterministically, and delegates path/text containment to the Canvas backend. Selection highlighting is drawn by Canvas rather than requiring a hidden SVG duplicate.

`AnimationCanvasPreview.tsx` is the editor adapter. Animation clips use Canvas by default, retain node selection for property-key authoring, and layer only the lightweight rig visualization as transparent SVG. Rest-pose editing remains SVG. The top bar can switch animation preview back to the SVG reference renderer at any time.

### Prepared vector paths

Editor vector paths are immutable values under ordinary operations: changing geometry creates a new `VectorPath`, while transform-only animation and rig motion retain the existing path identity. `pathPreparation.ts` exploits that contract with a `WeakMap` cache keyed by `VectorPath` identity. Canvas therefore serializes a path to SVG syntax and creates its `Path2D` only when that immutable path object is first seen; subsequent animation frames perform an identity lookup instead of serializing the same anchors merely to compare a cache key.

This stays in TypeScript because identity lookup is cheaper and simpler than crossing a WASM boundary. Rust remains appropriate for the measured numeric transform workload; path tessellation or other genuinely computational vector kernels can move behind a reusable boundary later if profiling shows they dominate.

### Multi-frame composition

`renderComposition.ts` makes multi-frame presentation explicit without creating another document authority. It prepares ordered render layers that must share dimensions, validates each opacity, and requires exactly one hit-testable layer.

Onion skinning uses that composition path. Previous and next sampled documents are prepared as non-hit-testable underlays at the same `0.18` and `0.12` opacity used by the SVG reference path, followed by the current frame. Canvas is cleared once, all layers are drawn in deterministic order, and only the current frame participates in selection. The explicit SVG reference mode still renders the legacy DOM onion layers so the two paths remain directly comparable.

This composition intentionally preserves the existing onion layer order rather than changing the visual policy while changing the renderer. If onion presentation needs a different policy—such as character-only skins or overlay-vs-underlay behavior—that should be an explicit product/semantic change with its own evidence.

This still does not claim that the whole rasterizer lives in Rust. Path tessellation, deformation, batching, complex hit-testing kernels, and eventually a WebGPU/WebGL backend may move behind the same render-frame contract when representative measurements justify them.

## Correctness contract

The render frame preserves canonical scene order and hierarchical transform semantics. Rust/WASM results are compared numerically with the TypeScript reference before performance numbers are considered.

Hit testing uses the designated current frame and reverse paint order, so onion frames can never steal selection. Affine inversion and primitive containment are covered independently from React; path and text containment intentionally stay browser adapters because Canvas already owns their rasterization semantics. Composition tests separately cover layer order, opacity, dimensions, and hit-test ownership.

Prepared path caching is semantic-preserving because an edited path receives a new identity and therefore a new preparation; equal-but-distinct path values do not alias in the cache. Focused tests cover both reuse and invalidation-by-identity.

SVG remains the higher-level semantic reference. Canvas text rasterization and SVG text rasterization are browser backends rather than a pixel-identical contract. Likewise, the current Canvas backend multiplies inherited opacity per drawable; fully isolated SVG group-opacity compositing is a later compatibility item if translucent overlapping groups become a real authored workload.

## Performance evidence

There are two deliberately separate measurement surfaces:

- `bun run bench:renderer` compares the TypeScript and Rust/WASM transform kernels on the same deterministic replicated-character workload. The same artifact also compares the old serialize-every-lookup path-cache strategy with immutable identity lookup on the same production-shaped scene. Both comparisons verify semantic parity/checksums first and print timing evidence without enforcing a speed threshold.
- `/renderer-lab` uses 36 character copies and 60 pre-sampled animation frames to measure the actual browser boundary. It reports four independent loops over the same frames: SVG DOM update plus geometry flush, complete Canvas rendering, renderer-frame preparation alone, and Canvas API drawing from already-prepared frames. This makes the larger remaining Canvas stage visible before another backend or batching strategy is chosen.

The browser stage numbers are deliberately not added together: each stage is measured in a separate loop to reduce instrumentation coupling, while the complete Canvas pass remains the end-to-end comparison. A `?benchmark=1` mode waits for the browser WASM backend, runs the same lab workload automatically, and exposes the exact result as machine-readable JSON in the rendered document.

`bun run bench:renderer:browser` serves the built static export locally, launches an available Chrome/Chromium in headless mode, requires the `rust-wasm` backend and the fixed 36-copy/60-frame workload, validates all numeric outputs, and writes JSON plus the captured DOM. The `Browser Renderer Benchmark` workflow uploads those files as evidence. It can fail when the benchmark contract or browser integration is broken, but it never compares a timing value with a pass/fail threshold.

The CPU renderer benchmark remains a separate artifact. Ordinary correctness CI does not fail because a shared runner happened to be slower or faster on one run.

## 2d-lab fixture boundary

`bun run fixture:2d-lab` exports the existing one-copy Nova renderer benchmark **after** Flat Stories has resolved hierarchy, rig attachment transforms and inherited opacity into its product-owned render frame. The artifact contains only backend-ready rectangle/circle/SVG-path geometry, affine matrices and paint. It contains no `EditorDocument`, rig, animation, selection or editor state.

The exporter fails closed if the benchmark begins to contain text or invalid render values rather than silently changing semantics. The generated snapshot is intended to be checked into `2d-lab` with source-revision provenance; Flat Stories remains the semantic/reference authority.

## Ownership

Flat Stories owns character/vector render semantics, the canonical `EditorDocument`, and the adapter from that scene graph to render frames. Generic geometry kernels may move to a shared Rust foundation only after they are reusable independently of Flat Stories. `2d-lab` is a Rust/WASM 2D rendering decision lab: Flat Stories may consume its benchmark findings, backend experiments, or small proven techniques, but must not import the lab's `BenchmarkWorkload` or display-list model as its runtime scene/render contract.

The next renderer optimization should follow the stage evidence. If frame preparation still dominates, improve that boundary or move a measured kernel to Rust. If Canvas API drawing dominates, first reduce state/draw churn or compile stable draw metadata. When the browser evidence shows Canvas 2D itself is the limiting backend, evaluate a general vector backend such as Vello behind a Flat Stories-owned adapter before building custom generic vector facilities. A custom GPU path remains appropriate only where Flat Stories-specific workload structure produces measured leverage.
