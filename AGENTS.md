# AGENTS.md

Flat Stories is a product-first SVG character editor.

- Keep browser interaction, React state, timeline UI, and SVG DOM rendering in TypeScript/React.
- Flat Stories owns the one canonical nested scene graph plus paint, character, rig, IK, pose, animation, project-schema/validation, and SVG-interchange semantics.
- Reuse `@moenarch/editor-core` for domain-neutral document operations, history/undo/redo, merged interaction transactions, hotkey helpers, and browser file mechanics. Do not recreate generic editor runtime or persistence plumbing locally.
- Reuse `@moritzbrantner/layer-editor` through `features/editor/layerAdapter.ts` for generic layer presentation and mechanics only. Its projected document is non-authoritative: never persist it, never let it replace the recursive Flat Stories scene graph, and never flatten away nested group semantics to fit the shared model.
- Keep hierarchy-changing semantics in Flat Stories until a shared editor boundary can represent the recursive scene losslessly; small explicit adapters are preferred over parallel canonical models.
- Keep `features/editor/engine.ts` as the narrow computational seam. Introduce Rust/WASM only for measured geometry/path/deformation workloads, never for DOM or pointer handling.
- Prefer deterministic pure functions for scene-graph, rig, animation, adapter, and export behavior and cover them with focused tests.
- Dogfood changes through an original character workflow rather than adding speculative generic graphics abstractions.
- Run `bun run check` before completion.
