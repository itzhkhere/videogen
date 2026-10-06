#!/bin/bash
# Packs the Phase 4A.3 L4 subset: the canonical engine tree (tests, the phase 4A scene library and
# correctness harness), this phase's scripts, a baseline GPU addon (4A.1 or 4A.2) and the 4A.3 GPU addon
# built from the canonical tree with --features experimental-gpu-vulkan.
#   make-bundle.sh <canonical repo> <baseline gpu.node: 4A.1 or 4A.2> <4a3 gpu.node> [out.tgz]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$1 old=$2 new=$3 out=${4:-$here/bundle.tgz}
stage=$(mktemp -d)
cd "$repo"
tar -cf - index.js package.json test experiments/phase4a/lib experiments/phase4a/correctness.mjs \
  node_modules/pngjs/package.json node_modules/pngjs/lib | tar -xf - -C "$stage"
mkdir -p "$stage/experiments/phase4a3/build" "$stage/experiments/phase4a3/colab"
cp "$here"/../*.mjs "$stage/experiments/phase4a3/"
cp "$here"/vm-*.sh "$stage/experiments/phase4a3/colab/"
cp "$old" "$stage/experiments/phase4a3/build/gpu-baseline.node"
cp "$new" "$stage/experiments/phase4a3/build/gpu-4a3.node"
tar -czf "$out" -C "$stage" . && rm -rf "$stage"
ls -l "$out"
