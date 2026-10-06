#!/bin/bash
# Packs what the Colab VM needs (paths relative to canvas-html/): production addon (new),
# Phase 4A addons (old), GPU addon (new), the 4A.1 and 4A harnesses, scenes, assets, pngjs.
set -e
cd "$(dirname "$0")/../../.."
out=${1:-experiments/phase4a1/colab/bundle.tgz}
tar -czf "$out" canvas-html.linux-x64-gnu.node \
  experiments/phase4a1/*.mjs experiments/phase4a1/lib experiments/phase4a1/probes experiments/phase4a1/colab/vm-*.sh \
  experiments/phase4a1/build/gpu.node experiments/phase4a1/build/phase4a-cpu.node experiments/phase4a1/build/phase4a-gpu.node \
  experiments/phase4a/lib experiments/phase4a/correctness.mjs test/assets test/scenes node_modules/pngjs
ls -l "$out"
