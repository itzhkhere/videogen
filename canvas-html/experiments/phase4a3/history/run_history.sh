#!/usr/bin/env bash
# Builds the canonical history step by step (build_history.py) and verifies every commit that
# changes code: Blitz set up from the commit's own patch series, release build, the commit's own
# `npm test`, and for GPU-relevant commits an experimental-gpu-vulkan build with a Ganesh GL and
# Vulkan smoke render (Mesa). Usage: run_history.sh FIRST LAST   (step indexes in plan.json)
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
REPO=${REPO:-/home/user/harender}
STATE=${STATE:-$here/state.json}
LOG=${LOG:-$here/verify.log}
export PATH=/opt/node24/bin:$HOME/.cargo/bin:$PATH
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-/home/user/harender-target}
GPU_TARGET=${GPU_TARGET:-/home/user/harender-target-gpu}
NODE_MODULES=${NODE_MODULES:-/home/user/videogen/canvas-html/node_modules}
CODE_RX='^(Cargo\.toml|Cargo\.lock|build\.rs|index\.js|package\.json|src/|dom-host/|vendor/|upstream-patches/|scripts/|test/)'
GPU_RX='^(Cargo\.toml|src/|vendor/anyrender_skia/|upstream-patches/blitz/)'

gpu_smoke='
const { HtmlRenderer } = require(process.argv[1]);
for (const b of ["gpu-gl", "gpu-vulkan"]) {
  const r = new HtmlRenderer({ width: 320, height: 180, systemFonts: false, experimentalBackend: b });
  r.load("<body style=\"background:#0b1220\"><h1 style=\"color:#f97316\">gpu</h1><div style=\"width:80px;height:40px;background:rgba(0,128,255,.6)\"></div>");
  const f = r.render(); if (f.length !== r.pixelWidth * r.pixelHeight * 4) throw new Error(b + " wrong size");
  const c = new HtmlRenderer({ width: 320, height: 180, systemFonts: false }); c.load("<body style=\"background:#0b1220\"><h1 style=\"color:#f97316\">gpu</h1><div style=\"width:80px;height:40px;background:rgba(0,128,255,.6)\"></div>");
  const cpu = c.render(); let d = 0; for (let i = 0; i < f.length; i++) if (Math.abs(f[i] - cpu[i]) > 64) d++;
  console.log(b, r._backendInfo().backend, "pixels differing from CPU by >64:", d); if (d > f.length * 0.02) throw new Error(b + " differs from CPU");
  r.close(); c.close();
}'

for i in $(seq "$1" "$2"); do
  out=$(python3 "$here/build_history.py" "$here/plan.json" "$i" "$STATE")
  sha=${out%% *}
  echo "== step $i: $out" | tee -a "$LOG"
  changed=$(git -C "$REPO" diff --name-only HEAD~1 HEAD 2>/dev/null || git -C "$REPO" ls-files)
  if ! grep -qE "$CODE_RX" <<<"$changed"; then echo "   docs/experiments only: code unchanged, build and tests as the previous commit" | tee -a "$LOG"; continue; fi
  ( cd "$REPO"
    BLITZ_REPO=/home/user/videogen/blitz scripts/setup-blitz.sh 2>&1 | tail -1
    rm -f html-renderer.linux-x64-gnu.node "$CARGO_TARGET_DIR/release/libhtml_renderer.so"
    if ! cargo build --release > "$here/cargo-step.log" 2>&1; then grep -E '^error' -A12 "$here/cargo-step.log" | head -40; echo "BUILD FAILED"; exit 1; fi
    echo "release build ok"
    cp "$CARGO_TARGET_DIR/release/libhtml_renderer.so" html-renderer.linux-x64-gnu.node
    ln -sfn "$NODE_MODULES" node_modules
    timeout 3000 npm test --silent 2>&1 | grep -E 'passed|Error|assert|failed' | head -20
    test "${PIPESTATUS[0]}" -eq 0 || { echo "TESTS FAILED"; exit 1; }
    echo "npm test ok"
    if grep -qE "$GPU_RX" <<<"$changed" && grep -q 'experimental-gpu-vulkan' Cargo.toml; then
      rm -f "$GPU_TARGET/release/libhtml_renderer.so"
      if ! CARGO_TARGET_DIR=$GPU_TARGET cargo build --release --features experimental-gpu-vulkan > "$here/cargo-step.log" 2>&1; then grep -E '^error' -A12 "$here/cargo-step.log" | head -40; echo "GPU BUILD FAILED"; exit 1; fi
      echo "gpu build ok"
      cp "$GPU_TARGET/release/libhtml_renderer.so" "$GPU_TARGET/gpu.node"   # Node loads native addons by the .node extension
      node -e "$gpu_smoke" "$GPU_TARGET/gpu.node" || { echo "GPU SMOKE FAILED"; exit 1; }
    fi
  ) > "$here/step.log" 2>&1
  rc=$?
  sed 's/^/   /' "$here/step.log" | tee -a "$LOG"
  if [ $rc -ne 0 ]; then echo "   STEP $i FAILED ($sha)" | tee -a "$LOG"; exit 1; fi
  echo "   step $i verified ($sha)" | tee -a "$LOG"
done
