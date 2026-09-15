#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_dir="${CARGO_TARGET_DIR:-$root/.renderer-target}"

cargo build \
  --locked \
  --manifest-path "$root/renderer-wasm/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release \
  --target-dir "$target_dir"

mkdir -p "$root/public/renderer"
cp \
  "$target_dir/wasm32-unknown-unknown/release/flat_stories_renderer_wasm.wasm" \
  "$root/public/renderer/flat_stories_renderer.wasm"
