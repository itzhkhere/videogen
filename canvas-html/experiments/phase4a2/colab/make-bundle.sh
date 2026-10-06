#!/bin/bash
# Packs what the Colab VM needs for the Phase 4A.2 hardware pass (paths relative to canvas-html/):
# the 4A.2 production and GPU addons, the 4A.1 baselines, the 4A.2 and 4A scripts, tests, scenes.
set -e
cd "$(dirname "$0")/../../.."
out=${1:-experiments/phase4a2/colab/bundle.tgz}
tar -czf "$out" canvas-html.linux-x64-gnu.node index.js package.json \
  experiments/phase4a2/*.mjs experiments/phase4a2/colab/vm-*.sh \
  experiments/phase4a2/build/gpu.node experiments/phase4a2/build/phase4a1-cpu.node experiments/phase4a1/build/gpu.node \
  experiments/phase4a/lib experiments/phase4a/correctness.mjs \
  test/render-into.mjs test/render-into-workers.mjs test/assets test/scenes node_modules/pngjs
ls -l "$out"
