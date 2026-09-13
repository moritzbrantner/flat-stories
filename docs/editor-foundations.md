# Editor foundation composition

Flat Stories is a product editor that composes shared editor mechanics without delegating its domain model.

## Authority

`EditorDocument` is the only authoritative authored document. Its recursive scene hierarchy, SVG paint and geometry vocabulary, character rig, IK, poses, expressions, animation data, project schema, validation, and SVG interchange remain owned by Flat Stories.

`@moenarch/editor-core` owns domain-neutral operation execution and history. Flat Stories routes ordinary document changes through its operation runtime, uses merged interaction operations for pointer drags, and uses the shared hotkey and browser-file helpers. Project loads recreate the operation runtime so history from the previous authored document cannot cross the project boundary.

`@moritzbrantner/layer-editor` is an adapter dependency. `layerAdapter.ts` projects the recursive scene into generic layer rows and delegates generic sibling ordering. The projection is never serialized and never becomes a second document authority.

## Recursive hierarchy constraint

The current shared layer model does not represent arbitrarily nested groups losslessly. Flat Stories therefore exposes the projection as read-only for hierarchy-changing layer operations and preserves nesting metadata (`depth`, `parentId`, `hasChildren`) only for presentation. Selection is product-transient state and continues to support ordinary, Shift, Ctrl, and Meta multi-selection through the projected panel.

Do not flatten canonical groups, maintain a synchronized second layer document, or move SVG/character semantics into the shared editor packages merely to increase reuse. Extend the shared package only when the abstraction is useful to multiple consumers and can preserve Flat Stories semantics without loss.
