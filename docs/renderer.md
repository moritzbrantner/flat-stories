# Rendering architecture

Flat Stories has one authored scene and multiple renderers. The serialized `EditorDocument` remains authoritative; neither SVG DOM nodes, Canvas commands, nor WASM buffers become a second document model.

## Backends

### SVG DOM reference and editing surface

`features/editor/rendering/SvgScene.tsx` is the semantic/reference renderer. The editor also keeps its SVG artboard for rest-pose direct manipulation, accessibility/debugging, interchange work, and regression comparison. SVG remains selectable as an explicit animation-preview reference path.

The important boundary is that SVG DOM is no longer the only runtime presentation of the authored scene. Editing overlays and pointer-heavy geometry authoring stay on SVG until an optimized backend can preserve those semantics rather than merely drawing the same pixels.

### Canvas 2D + Rust/WASM

`features/editor/rendering/CanvasScene.tsx` consumes a renderer-neutral frame prepared by `renderFrame.ts`. The Rust crate, `renderer-wasm`, computes hierarchical world transforms, rig attachment transforms, and inherited opacity over a compact `Float32Array` ABI. TypeScript owns browser integration and Canvas drawing.

A TypeScript transform kernel implements the same ABI and serves as deterministic fallback when WASM cannot load and as the readable reference against which Rust output is checked. If Canvas 2D itself cannot render, the editor falls back to SVG rather than leaving animation preview unusable.

Canvas interaction consumes the same prepared render frame instead of reconstructing scene semantics. `hitTest.ts` inverse-transforms the pointer into each drawable's local space, walks draw order from front to back, handles rectangle/circle geometry deterministically, and delegates path/text containment to the Canvas backend. Selection highlighting is drawn by Canvas rather than requiring a hidden SVG duplicate.

`AnimationCanvasPreview.tsx` is the editor adapter. Animation clips use Canvas by default, retain node selection for property-key authoring, and layer only the lightweight rig visualization as transparent SVG. Rest-pose editing remains SVG. The top bar can switch animation preview back to the SVG reference renderer at any time.

Onion skinning deliberately uses the SVG reference path for now. That preserves the existing compositing semantics while the optimized renderer grows a first-class multi-frame/layer composition contract; it avoids quietly changing onion-skin behavior merely to increase Canvas coverage.

This still does not claim that the whole rasterizer lives in Rust. Path tessellation, deformation, batching, complex hit-testing kernels, and eventually a WebGPU/WebGL backend may move behind the same render-frame contract when representative measurements justify them.

## Correctness contract

The render frame preserves canonical scene order and hierarchical transform semantics. Rust/WASM results are compared numerically with the TypeScript reference before performance numbers are considered.

Hit testing uses that exact frame and reverse paint order, so a pointer resolves to the topmost drawable under the same transform hierarchy used for rendering. Affine inversion and primitive containment are covered independently from React; path and text containment intentionally stay browser adapters because Canvas already owns their rasterization semantics.

SVG remains the higher-level semantic reference. Canvas text rasterization and SVG text rasterization are browser backends rather than a pixel-identical contract. Likewise, the current Canvas backend multiplies inherited opacity per drawable; fully isolated SVG group-opacity compositing is a later compatibility item if translucent overlapping groups become a real authored workload.

## Performance evidence

There are two deliberately separate measurements:

- `bun run bench:renderer` compares the TypeScript and Rust/WASM transform kernels on the same deterministic replicated-character workload. It checks numerical parity first and prints timing evidence without enforcing a speed threshold.
- `/renderer-lab` renders the same animated Nova scene through SVG DOM and Canvas, and can run a browser benchmark over 36 character copies and 60 pre-sampled frames. The SVG side forces a geometry flush so the comparison includes DOM/render work rather than only React scheduling.

The CI benchmark workflow stores the kernel measurement as an artifact. Ordinary correctness CI does not fail because a shared runner happened to be slower or faster on one run.

## Ownership

Flat Stories owns character/vector render semantics and the adapter from its scene graph to render frames. Generic geometry kernels may move to `rust-packages` once they are reusable independently of Flat Stories. `viz-engine` remains a data/frame computation engine for visualization consumers and is not made authoritative for character graphics.

The next optimized-renderer slice is multi-frame composition for onion skins. It should reuse the same frame contract and make opacity/layer order explicit before the editor stops falling back to SVG for that mode.
