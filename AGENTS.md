# AGENTS.md

Flat Stories is a product-first flat-design vector character editor and animation tool.

- Flat Stories owns the one canonical nested scene graph plus paint, character, rig, IK, pose, animation, project-schema/validation, and SVG-interchange semantics. SVG elements are not the domain model.
- Keep browser interaction, React state, timeline UI, pointer handling, and editor overlays in TypeScript/React.
- Keep the SVG DOM renderer as the semantic/reference renderer and editing fallback. New runtime renderers must consume the same canonical scene and be checked against that reference rather than introducing a second scene model.
- The primary optimized runtime path is allowed to use Rust/WASM. Keep the browser adapter thin: encode a deterministic render frame, run computation-heavy transform/path/deformation work in Rust when it pays off, then hand the result to Canvas/WebGL/WebGPU backends.
- The initial optimized backend is Canvas 2D with a Rust/WASM transform kernel. Do not claim GPU, tessellation, deformation, or pixel-identical SVG parity until those workloads exist and are measured.
- Reuse `@moenarch/editor-core` for domain-neutral document operations, history/undo/redo, merged interaction transactions, hotkey helpers, and browser file mechanics. Do not recreate generic editor runtime or persistence plumbing locally.
- Reuse `@moritzbrantner/layer-editor` through `features/editor/layerAdapter.ts` for generic layer presentation and mechanics only. Its projected document is non-authoritative: never persist it, never let it replace the recursive Flat Stories scene graph, and never flatten away nested group semantics to fit the shared model.
- For coordinated editor-family changes, use `bun run verify:source` so Flat Stories validates current sibling `editor-core` and `layer-editor` source before publication. Keep semver package dependencies only as the release/registry fallback; never add compatibility aliases for obsolete package names.
- Keep hierarchy-changing semantics in Flat Stories until a shared editor boundary can represent the recursive scene losslessly; small explicit adapters are preferred over parallel canonical models.
- Prefer deterministic pure functions for scene-graph, rig, animation, render-frame, adapter, and export behavior and cover them with focused tests.
- Performance work must keep correctness evidence separate from timing evidence. Compare the same deterministic workload, verify semantic parity first, record benchmark results, and avoid brittle wall-clock pass/fail thresholds in ordinary CI.
- Dogfood renderer work through the original Nova character and the `/renderer-lab` comparison before broadening abstractions. Move genuinely reusable geometry kernels to shared Rust foundations only after the domain boundary is proven.
- Run `bun run check` before completion; use `bun run verify:source` when shared editor foundations are part of the change. Run `bun run bench:renderer` when changing the optimized render path.
