# Flat Stories

A small flat-design SVG editor built as a statically exported Next.js application.

```sh
bun install
bun run dev
bun run check
```

## A0 product boundary

React owns the document state, browser input, panels, selection, and SVG rendering. `features/editor/engine.ts` is the single computational seam: the UI calls an `EditorEngine` contract without knowing whether its implementation is TypeScript or, later, Rust/WASM.

A0 deliberately supplies only a browser implementation that clones the input fixture. Rust/WASM belongs in A1 only after concrete workloads—such as geometry operations or path processing—justify it. The document model remains plain serializable data so a future adapter can cross the WASM boundary without moving rendering or browser interaction into Rust.

Not included: boolean operations, path-node editing, filters, gradients, animation, collaboration, persistence, or a generic graphics framework.
