#!/usr/bin/env bash
# Everything a change must pass before it is committed (there is no hosted CI yet):
# formatting, clippy, Rust unit tests, a release build, the npm test suite, the worker tests and
# the TypeScript type tests. Run from anywhere; set CARGO_TARGET_DIR to build elsewhere.
#   scripts/check.sh            all checks
#   SKIP_TYPES=1 scripts/check.sh   without the TypeScript checks (they download tsc and @types/node)
set -euo pipefail
cd "$(dirname "$0")/.."
target=${CARGO_TARGET_DIR:-target}
step() { printf '\n== %s\n' "$*"; }

[ -d third_party/blitz ] || scripts/setup-blitz.sh

step "cargo fmt --check"
cargo fmt --check

step "cargo clippy (default features)"
cargo clippy --release --all-targets -- -D warnings

step "cargo test (dom-host)"
cargo test --release -p dom-host   # the addon crate links against Node (N-API), so it has no test binary

step "release build"
cargo build --release
cp "$target/release/libhtml_renderer.so" html-renderer.linux-x64-gnu.node

step "npm test"
npm test --silent

step "workers"
node test/workers.mjs 2
node test/render-into-workers.mjs

if [ -z "${SKIP_TYPES:-}" ]; then
  step "TypeScript (strict) type tests"
  tools=$(mktemp -d)
  npm install --silent --no-save --no-package-lock --prefix "$tools" typescript@5.9 @types/node@24
  "$tools/node_modules/.bin/tsc" -p test/types --typeRoots "$tools/node_modules/@types"
  rm -rf "$tools"
fi

printf '\nall checks passed\n'
