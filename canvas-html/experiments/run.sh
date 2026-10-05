#!/usr/bin/env bash
# Normal Linux host with Rust/Cargo and a C/C++ toolchain.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results
# Keep release profile comparable to the main crate; no symbol tricks.
{ time cargo build --release --locked -p deno-core-smoke -p deno-napi-coexist; } > results/build.log 2>&1
chmod +x target/release/deno-core-smoke
timeout 60 target/release/deno-core-smoke > results/standalone.log 2>&1
cp target/release/libdeno_napi_coexist.so deno-napi-coexist/addon.node
# Test shutdown/hang from an external process timeout.
timeout 180 node deno-napi-coexist/test.mjs > results/coexistence.log 2>&1
node baseline.mjs > results/baseline.json
node compatibility.mjs > results/compatibility.json
{ time cargo build --release --locked -p deno-canvas-bridge; } > results/bridge-build.log 2>&1
chmod +x target/release/deno-canvas-bridge
timeout 90 target/release/deno-canvas-bridge results/bridge > results/bridge.log 2>&1
node compare-bench.mjs > results/compare-bench.json
node baseline-clock-limit.mjs > results/baseline-date-origin.json
