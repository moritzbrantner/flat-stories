# AGENTS.md

Flat Stories is a product-first SVG character editor.

- Keep browser interaction, React state, timeline UI, and SVG DOM rendering in TypeScript/React.
- Flat Stories owns scene-node, paint, character, rig, IK, pose, animation, and SVG-interchange semantics.
- Reuse domain-neutral editor mechanics from `editor-core` when its stable consumer boundary is available; do not recreate generic history/persistence frameworks here.
- Keep `features/editor/engine.ts` as the narrow computational seam. Introduce Rust/WASM only for measured geometry/path/deformation workloads, never for DOM or pointer handling.
- Prefer deterministic pure functions for scene-graph, rig, animation, and export behavior and cover them with focused tests.
- Dogfood changes through an original character workflow rather than adding speculative generic graphics abstractions.
- Run `bun run check` before completion.
