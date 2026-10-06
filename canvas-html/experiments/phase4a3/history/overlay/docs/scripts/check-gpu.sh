#!/usr/bin/env bash
# Experimental GPU backends: builds with experimental-gpu-vulkan (Ganesh GL and Vulkan) into a
# separate target directory and runs the frame API and hardening tests on each backend. Needs a
# GL (EGL) and Vulkan driver; Mesa (llvmpipe/lavapipe) is enough. Not part of the default build.
#   scripts/check-gpu.sh [gpu-gl] [gpu-vulkan]
set -euo pipefail
cd "$(dirname "$0")/.."
target=${GPU_TARGET_DIR:-target-gpu}
backends=("$@"); [ ${#backends[@]} -gt 0 ] || backends=(gpu-gl gpu-vulkan)

[ -d third_party/blitz ] || scripts/setup-blitz.sh
CARGO_TARGET_DIR=$target cargo clippy --release --features experimental-gpu-vulkan -- -D warnings
CARGO_TARGET_DIR=$target cargo build --release --features experimental-gpu-vulkan
node=$(pwd)/$target/release/libhtml_renderer.so

for b in "${backends[@]}"; do
  printf '\n== %s\n' "$b"
  HTML_RENDERER_NODE=$node HTML_RENDERER_BACKEND=$b node --expose-gc test/render-into.mjs
  HTML_RENDERER_NODE=$node HTML_RENDERER_BACKEND=$b node test/hardening.mjs
done
printf '\nGPU checks passed\n'
