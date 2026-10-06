#!/usr/bin/env bash
# Phase 4A.2 safety audit: a Graphify graph of the frame-output code (canvas-html src/, the
# vendored anyrender_skia and anyrender trait, napi-rs 3.14.1 Buffer/finalizer code, skia-safe
# 0.153.3 surface wrapping), then reach.py: which unsafe sites the entry points may reach.
# Needs graphify 0.9.77 (pip install graphifyy==0.9.77) and a cargo registry with the crates.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; ch="$here/../../.."; work="${1:-$(mktemp -d)}"
reg=$(ls -d ~/.cargo/registry/src/*/ | head -1)
mkdir -p "$work"/src/{canvas-html,anyrender_skia,anyrender,napi/bindgen_runtime/js_values,skia-safe/core}
cp "$ch"/src/*.rs "$work/src/canvas-html/"
cp "$ch"/vendor/anyrender_skia/src/{lib.rs,image_renderer.rs,gpu_image_renderer.rs,gpu_common.rs,graphite_image_renderer.rs,scene.rs} "$work/src/anyrender_skia/"
cp "$ch/vendor/anyrender/src/lib.rs" "$work/src/anyrender/"
cp "$reg/napi-3.14.1/src/bindgen_runtime/js_values/buffer.rs" "$work/src/napi/bindgen_runtime/js_values/"
cp "$reg/napi-3.14.1/src/bindgen_runtime/mod.rs" "$work/src/napi/bindgen_runtime/"
cp "$reg/napi-3.14.1/src/env.rs" "$work/src/napi/"
cp "$reg/skia-safe-0.153.3/src/core/surface.rs" "$work/src/skia-safe/core/"
graphify extract "$work/src" --code-only --no-cluster --out "$work/out"
python3 "$here/reach.py" "$work/out/graphify-out/graph.json" "$work/src" --json "$here/reach.json" > "$here/reach.txt"
cp "$work/out/graphify-out/graph.json" "$here/graph.json"
echo "graph: $here/graph.json; reachability: $here/reach.txt"
