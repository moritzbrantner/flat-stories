# Flat Stories

A browser-based flat-design SVG character editor. The product goal is to make original 2D characters, reusable rigs, poses, and short SVG animations with a focused Figma-like desktop workflow.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
```

## Product direction

Flat Stories is deliberately not a generic graphics framework. It specializes a small SVG scene graph for character illustration and animation:

- hierarchical vector scene nodes with stable IDs and local transforms;
- direct manipulation, grouping, layers, visibility, locking, and styling;
- explicit character bones with rest/current pose and joint limits;
- deterministic two-bone IK constraints for arms and legs;
- typed animation clips and numeric keyframes;
- SVG as the primary rendering and eventual animated interchange target.

The bundled `Nova character study` fixture dogfoods the model with nested artwork, a complete limb skeleton, two hand IK targets, and a looping wave/head-sway clip.

## Architecture boundary

React owns browser input, transient interaction state, panels, selection UI, timeline UI, and SVG DOM rendering. `features/editor/engine.ts` remains the small computational seam for workloads that may later justify Rust/WASM. The serialized document model stays plain data.

Flat Stories owns SVG/character vocabulary: scene nodes, paint, character, rig, IK constraints, poses, animation clips, and SVG interchange. Generic editor mechanics such as reusable command/history/persistence infrastructure belong in `editor-core`; they should be adopted through its stable package/source boundary rather than copied into this repository.

Rust/WASM is still workload-driven. Do not move the React state tree, DOM rendering, or pointer handling into Rust. Geometry kernels such as path booleans, path normalization, hit-testing, or deformation may move behind `EditorEngine` once profiling shows a concrete reason.

## Roadmap

1. **Character-ready scene graph** — hierarchical nodes, transforms, grouping, multi-selection, direct manipulation, character fixture. **Complete.**
2. **Vector drawing** — editor-native Bézier anchors/handles, exact curve bounds, on-canvas node editing, grid snapping, resize/rotate handles and keyboard precision controls are underway; alignment/distribution, layer reorder, duplication and mature path operations remain.
3. **Skeleton and rigging** — bone editing, attachment workflow, pivots, joint limits, FK and two-bone IK. The data model and solver are present; authoring UX comes next.
4. **Poses and expressions** — named reusable character poses and facial-expression states.
5. **Animation timeline** — editable tracks/keyframes, easing curves, playback, onion skinning, copy/paste and loop regions. The typed clip model and scrub preview are present.
6. **Character animation workflows** — reusable blink/idle/wave/walk/talk clips, pose keyframes, mirroring and character instances.
7. **SVG persistence/interchange** — deterministic project JSON, supported SVG import/export, then self-contained animated SVG export for supported tracks.
8. **Dogfood a complete original mascot** — build and animate a production-scale character entirely in Flat Stories and turn friction into focused follow-ups.
9. **Advanced deformation only when justified** — path morphing, two-dimensional deformation, mesh skinning, motion paths, richer IK and secondary motion.

## Editing versus preview

The rest pose is the authored editing state. Selecting an animation clip switches the canvas into a read-only sampled preview so direct geometry edits cannot accidentally bake sampled animation values back into the source document. Return to `Rest pose` before changing artwork, transforms, paths, or rig constraints.

## Current verification focus

Pure scene-graph, vector-path, geometry, snapping, animation, and rig math are deterministic and covered independently from React. Browser integration tests cover hierarchical layers, object creation/editing, direct vector-path authoring, transform handles, animation-preview isolation, rig controls, and timeline entry points.
