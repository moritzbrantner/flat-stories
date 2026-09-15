# Editor foundation composition

Flat Stories is a product editor that composes shared editor mechanics without delegating its domain model.

## Authority

`EditorDocument` is the only authoritative authored document. Its recursive scene hierarchy, vector paint and geometry vocabulary, character rig, IK, poses, expressions, animation data, project schema, validation, and SVG interchange remain owned by Flat Stories.

`@moenarch/editor-core` owns domain-neutral operation execution and history. Flat Stories routes ordinary document changes through its operation runtime, uses merged interaction operations for pointer drags, and uses the shared hotkey and browser-file helpers. Project loads recreate the operation runtime so history from the previous authored document cannot cross the project boundary.

`@moritzbrantner/layer-editor` is an adapter dependency. `layerAdapter.ts` projects the recursive scene into generic layer rows and delegates generic sibling ordering. The projection is never serialized and never becomes a second document authority.

## Rendering boundary

SVG is an interchange format and the browser reference renderer, not the canonical scene representation. Optimized renderers consume `EditorDocument` through `features/editor/rendering/renderFrame.ts`; they must not keep a synchronized second scene graph.

The first optimized path uses a Rust/WASM transform kernel plus Canvas 2D. React and TypeScript continue to own browser interaction, editor state, and overlays. Future path tessellation, deformation, batching, or GPU rendering can move behind the render-frame boundary when representative benchmarks show the need. See `docs/renderer.md`.

## Source-first editor family

Coordinated development uses sibling source checkouts rather than waiting for npm publication. `bun run source:prepare` builds `editor-core`, recursively prepares and builds `layer-editor` against that same editor-core checkout, and materializes both packages under their real package identities in Flat Stories' `node_modules`. `bun run source:smoke` proves those source packages are the active imports, and `bun run verify:source` runs the normal Flat Stories gate against them.

The expected sibling layout is `editor-core/`, `layer-editor/`, and `flat-stories/`. `EDITOR_CORE_SOURCE` and `LAYER_EDITOR_SOURCE` can override those locations. Source revisions are recorded only under `node_modules/.editor-source-deps`; `package.json` and `bun.lock` keep semver dependencies as the registry/release fallback. Use `bun run source:restore` or `bun run verify:registry` to return to published packages.

Do not encode sibling paths or source revisions in runtime APIs, application state, or persisted project data. Source mode is development/validation infrastructure only.

## Recursive hierarchy constraint

The current shared layer model does not represent arbitrarily nested groups losslessly. Flat Stories therefore exposes the projection as read-only for hierarchy-changing layer operations and preserves nesting metadata (`depth`, `parentId`, `hasChildren`) only for presentation. Selection is product-transient state and continues to support ordinary, Shift, Ctrl, and Meta multi-selection through the projected panel.

Do not flatten canonical groups, maintain a synchronized second layer document, or move character/render semantics into the shared editor packages merely to increase reuse. Extend the shared package only when the abstraction is useful to multiple consumers and can preserve Flat Stories semantics without loss.
