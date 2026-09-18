# Flat Stories

A browser-based flat-design vector character editor. The product goal is to make original 2D characters, reusable rigs, poses, and short animations with a focused Figma-like desktop workflow while keeping SVG as a first-class interchange and reference format.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
```

Renderer work also has a dedicated deterministic benchmark:

```sh
bun run bench:renderer
```

For coordinated work with sibling editor foundations, use source mode instead of waiting for package publication:

```sh
bun run dev:source
bun run verify:source
bun run source:status
```

Source mode expects sibling `editor-core/` and `layer-editor/` checkouts by default and can be overridden with `EDITOR_CORE_SOURCE` and `LAYER_EDITOR_SOURCE`. The committed semver dependencies remain the registry/release fallback; `bun run verify:registry` restores and verifies that path.

## Product direction

Flat Stories is deliberately not a generic graphics framework. It specializes a small vector scene graph for character illustration and animation:

- hierarchical vector scene nodes with stable IDs and local transforms;
- direct manipulation, grouping, layers, visibility, locking, and styling;
- explicit character bones with rest/current pose and joint limits;
- deterministic two-bone IK constraints for arms and legs;
- typed animation clips and numeric keyframes;
- SVG DOM as the semantic/reference renderer and SVG as an interchange target;
- optimized runtime rendering through renderer-neutral frames, initially Canvas 2D backed by a Rust/WASM transform kernel.

The bundled `Nova character study` fixture dogfoods the model with nested artwork, a complete limb skeleton, two hand IK targets, and a looping wave/head-sway clip. `/renderer-lab` renders that same character side-by-side through SVG DOM and Canvas/WASM and provides a representative browser benchmark.

## Architecture boundary

`EditorDocument` is the only authoritative scene. React owns browser input, transient product interaction state, panels, selection UI, timeline UI, and editor overlays. SVG DOM nodes, Canvas commands, and WASM buffers are adapters over that document rather than parallel models.

The editor keeps its SVG DOM surface as a reliable direct-manipulation/reference backend while optimized playback/render workloads use `features/editor/rendering/renderFrame.ts`. The initial optimized path flattens the canonical visible scene into a compact transform stream, evaluates world transforms and rig attachments through a Rust/WASM kernel, and draws the resulting frame with Canvas 2D. A TypeScript implementation of the same transform ABI is the deterministic fallback and correctness reference for the Rust kernel.

This is intentionally a staged renderer architecture rather than a claim that all graphics now run in Rust. Path tessellation, deformation, hit-testing, batching, and a WebGL/WebGPU backend should move behind the same frame contract only when representative profiling shows they matter. See `docs/renderer.md`.

Flat Stories owns vector/character vocabulary and the one canonical nested scene graph: scene nodes, paint, character, rig, IK constraints, poses, animation clips, project validation/versioning, rendering semantics, and SVG interchange. Generic document-operation history, undo/redo, merged interaction transactions, hotkey helpers, and browser file mechanics come from `@moenarch/editor-core` rather than being reimplemented locally.

`@moritzbrantner/layer-editor` is consumed through `features/editor/layerAdapter.ts`. The adapter projects the canonical recursive Flat Stories scene into generic layer rows and delegates generic sibling-order mechanics, but it does not create a second persisted layer document. The current shared layer model cannot faithfully represent arbitrarily nested Flat Stories groups, so the projection remains non-authoritative and hierarchy-changing operations stay on the canonical scene graph until the shared boundary can represent them without loss.

## Renderer evidence

Renderer correctness and performance are intentionally separate concerns.

`bun run bench:renderer` builds the Rust/WASM kernel, encodes a deterministic replicated-character workload, checks the Rust output against the TypeScript reference within a small numerical tolerance, and only then records timings. CI stores the benchmark output as an artifact; ordinary correctness does not fail because of noisy shared-runner wall-clock performance.

The `/renderer-lab` page compares the SVG DOM reference with Canvas using the same sampled animation. Its browser benchmark updates 36 character copies across 60 deterministic pre-sampled frames and reports the observed ratio. The numbers are evidence for future renderer decisions rather than a hard threshold.

## Implementation horizon

Keep implementation in small independently verifiable slices. The current horizon is:

1. **Complete — pose/expression authoring UI:** capture and apply named poses from the rest pose; capture expressions from selected character layers.
2. **Complete — pose-to-keyframe controls:** key a saved pose into the selected animation at the current timeline time and remove keys at that time.
3. **Complete — keyframe inspector:** inspect an existing track/keyframe and deterministically edit its time, value, easing, or delete it.
4. **Complete — individual property keying:** key one selected node property or rig-bone rotation at the current timeline time without requiring a whole saved pose; reuse existing logical tracks when present.
5. **Complete — playback controls:** deterministic play/pause progression, restart, and authored clip-loop behavior without changing animation data.
6. **Complete — editable preview loop ranges:** enable a transient playback-only start/end range without changing duration, loop metadata, tracks, or keyframes.
7. **Complete — onion skinning:** sample previous/next animation times and render those documents as translucent, pointer-disabled SVG context through the same scene semantics.
8. **Complete — deterministic static SVG export:** serialize the current canonical/sampled visual document to standalone SVG with stable ordering, supported paint/transforms/rig attachments, and no editor overlays or metadata.
9. **Complete — project persistence foundation:** versioned deterministic `.flatstories.json` serialization/parsing with strict v1 model validation plus reusable browser Save/Load controls.
10. **Complete — editor load integration:** validated project loads replace live authored Editor state while clearing selection, animation-preview, onion-skin, and in-progress pointer transients without rewriting imported authored data.
11. **Complete — renderer foundation slice:** SVG DOM reference renderer, renderer-neutral scene frame, TypeScript fallback transform kernel, Rust/WASM transform kernel, Canvas 2D backend, browser comparison lab, and recorded benchmark evidence.
12. **Complete — static SVG import:** parse groups, rectangles, circles, single-subpath M/L/C/Z paths, bold text, supported paint/visibility, and decomposable transforms into the canonical scene graph; unsupported SVG features fail with explicit diagnostics instead of being silently discarded.
13. **Now — animated SVG export:** encode the supported numeric animation subset into self-contained SVG animation.
14. **After measured need — renderer acceleration:** move the strongest measured path/tessellation/deformation/batching bottleneck into Rust and evaluate a GPU backend without changing authored scene semantics.

Do not pull later-horizon concerns into an earlier slice unless a concrete blocker proves the boundary wrong.

## Project file boundary

Project persistence uses a small versioned envelope (`format: "flat-stories"`, `version: 1`) around the canonical editor document. Version-one loading validates the complete currently supported scene, rig, pose/expression, and animation vocabulary and rejects unknown v1 fields instead of silently accepting data with unclear semantics. Serialization canonicalizes object-key ordering while preserving semantic array ordering such as layers, children, bones, tracks, and keyframes.

A successful load replaces only authored document state. Selection, sampled animation preview, onion-skin state, and in-progress pointer interaction are cleared so no transient state from the previous project can leak into the imported project; viewport, snapping, and rig-visibility workspace preferences remain local editor preferences.

## Roadmap

1. **Character-ready scene graph** — hierarchical nodes, transforms, grouping, multi-selection, direct manipulation, character fixture. **Complete.**
2. **Vector drawing** — editor-native Bézier anchors/handles, exact curve bounds, on-canvas node editing, grid snapping, resize/rotate handles and keyboard precision controls are underway; alignment/distribution, layer reorder, duplication and mature path operations remain.
3. **Skeleton and rigging** — bone editing, attachment workflow, pivots, joint limits, FK and two-bone IK. The data model and solver are present; authoring UX comes next.
4. **Poses and expressions** — named reusable character poses and facial-expression states. The deterministic model and first authoring controls are present.
5. **Animation timeline** — editable tracks/keyframes, easing curves, playback, onion skinning, copy/paste and loop regions. The typed clip model, scrub preview, deterministic pose-keying operations, pose-keyframing controls, direct existing-keyframe inspector, individual property keying, deterministic playback, transient preview loop ranges, and neighboring-frame onion skins are present.
6. **Character animation workflows** — reusable blink/idle/wave/walk/talk clips, pose keyframes, mirroring and character instances.
7. **SVG persistence/interchange** — deterministic project JSON, supported SVG import/export, then self-contained animated SVG export for supported tracks. Static SVG export, project save/load, and the fail-closed supported SVG importer are complete; animated SVG export is next.
8. **Runtime rendering** — keep SVG DOM as reference/editing fallback; evolve the Canvas/Rust-WASM backend from transform preparation toward measured path/deformation/GPU workloads while preserving one scene authority.
9. **Dogfood a complete original mascot** — build and animate a production-scale character entirely in Flat Stories and turn friction into focused follow-ups.
10. **Advanced deformation only when justified** — path morphing, two-dimensional deformation, mesh skinning, motion paths, richer IK and secondary motion.

## SVG import boundary

Static SVG import is an adapter into the canonical Flat Stories document, not a retained XML/CSS model. The supported editable subset covers nested groups, rectangles, circles, single-subpath absolute `M`/`L`/`C`/`Z` paths, bold text, direct fill/stroke styling, opacity/visibility, and transforms that can be represented as translate/rotate/scale. Flat Stories' own static SVG drawable wrappers are recognized so round-tripping does not add an artificial group around every shape.

Features that cannot be represented without changing semantics—such as gradients or other paint servers, clipping/masking, CSS-driven styling, unsupported path commands, skew, viewport scaling, and arbitrary text layout—fail with a location-specific diagnostic. Import never silently drops such features or creates a second SVG document authority.

## Editing versus preview

The rest pose is the authored editing state. Selecting an animation clip switches the canvas into a read-only sampled preview so direct geometry edits cannot accidentally bake sampled animation values back into the source document. Timeline authoring can still write explicit animation data while previewing; playback, preview ranges, and onion skins only affect transient editor presentation. Static SVG export serializes the current visual document only, excluding editor overlays. Project save/load serializes authored document state, not transient preview state, and successful loads return the editor to an unselected rest-pose view.

## Current verification focus

Pure scene-graph, vector-path, geometry, snapping, animation, animation-authoring, playback/range, onion-skin timing, SVG export/import, project serialization/validation, pose/expression, rig math, shared-layer projection, and renderer-frame behavior are deterministic and covered independently from React. Rust renderer tests cover transform composition and fail-closed parent ordering. Browser-focused tests cover hierarchical layers, object creation/editing, direct vector-path authoring, transform handles, shared undo/redo, pose/expression authoring, pose keyframing, direct keyframe editing, individual property keying, playback controls, preview loop ranges, pointer-disabled onion skins, SVG import/export and project persistence controls, live project/import transient resets, animation-preview isolation, rig controls, and timeline entry points.
