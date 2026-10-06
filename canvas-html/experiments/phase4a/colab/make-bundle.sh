#!/bin/bash
# Packs what the Colab VM needs (paths relative to canvas-html/): the GPU-feature addon, the
# Phase 4A harness, test scenes/assets and pngjs. Output: $1 (default bundle.tgz).
set -e
cd "$(dirname "$0")/../../.."
out=${1:-experiments/phase4a/colab/bundle.tgz}
tar -czf "$out" --exclude='experiments/phase4a/results' --exclude='experiments/phase4a/assets' --exclude='experiments/phase4a/colab/bundle.tgz' \
  experiments/phase4a/*.mjs experiments/phase4a/lib experiments/phase4a/colab experiments/phase4a/build/canvas-html-gpu.node experiments/phase4a/build/canvas-html-graphite.node \
  test/assets test/scenes node_modules/pngjs
ls -l "$out"
