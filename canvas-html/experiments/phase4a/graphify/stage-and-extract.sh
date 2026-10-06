#!/usr/bin/env bash
# Directed Graphify graph of Skia's GPU sources (m153, the revision rust-skia 0.153.3 builds),
# the skia-safe/skia-bindings GPU layer and canvas-html's anyrender_skia. Needs graphify 0.9.77.
# Query it with q.py (find / out / in / path).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; ch="$here/../../.."; work="${1:-$(mktemp -d)}"
git clone -q --depth 1 --filter=blob:none --sparse -b chrome/m153 https://skia.googlesource.com/skia "$work/skia-m153"
git -C "$work/skia-m153" sparse-checkout set --no-cone include/gpu/ src/gpu/ganesh/ src/gpu/graphite/ src/text/gpu/ src/gpu/vk/
mkdir -p "$work/src/skia" "$work/src/skia-safe" "$work/src/skia-bindings" "$work/src/anyrender_skia"
cp -r "$work/skia-m153/include" "$work/skia-m153/src" "$work/src/skia/"
reg=$(ls -d ~/.cargo/registry/src/*/ | head -1)
cp -r "$reg/skia-safe-0.153.3/src/gpu" "$work/src/skia-safe/"
cp "$reg"/skia-bindings-0.153.3/src/{graphite,gl,vulkan,gpu}.cpp "$work/src/skia-bindings/" 2>/dev/null || true
cp -r "$ch/vendor/anyrender_skia/src" "$work/src/anyrender_skia/"
graphify extract "$work/src" --code-only --no-cluster --out "$work/out"
echo "graph: $work/out/graphify-out/graph.json"
