#!/usr/bin/env bash
# Builds experiments/phase4a2/review-bundle/ (exact source copies, diffs, patches, tests, logs)
# and phase4a2-review-bundle.zip. The hand-written documents (README, MANIFEST, UNSAFE_AUDIT,
# API_CONTRACT) live in review-bundle/ and are kept; everything else is regenerated.
# Baseline for the diffs: the end of Phase 4A.1 (e185c33).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; ch="$(cd "$here/../.." && pwd)"; repo="$(git -C "$ch" rev-parse --show-toplevel)"
B="$here/review-bundle"; BASE=${BASE:-e185c33}
rm -rf "$B/source" "$B/patches" "$B/tests" "$B/logs" "$B/graphify" "$B/PATCH.diff" "$B/PATCH-experiments.diff" "$B/PHASE4A2_RESULTS.md"
mkdir -p "$B"/{source,patches/anyrender_skia,tests,logs,graphify}

copy() { mkdir -p "$(dirname "$2/$1")"; cp "$ch/$1" "$2/$1"; }
# Production sources (changed in 4A.2, or needed to read them)
for f in src/lib.rs src/target.rs src/frames.rs Cargo.toml Cargo.lock build.rs index.js index.d.ts package.json README.md \
         vendor/anyrender_skia/src/image_renderer.rs vendor/anyrender_skia/src/gpu_image_renderer.rs vendor/anyrender_skia/src/lib.rs \
         vendor/anyrender_skia/src/gpu_common.rs vendor/anyrender_skia/src/scene.rs vendor/anyrender_skia/Cargo.toml \
         vendor/anyrender/src/lib.rs upstream-patches/UPSTREAM.md experiments/phase4a1/OUTPUT_PIPELINE.md; do copy "$f" "$B/source"; done
# Third-party code the audit cites (unchanged, exact copies from the cargo registry)
reg=$(ls -d ~/.cargo/registry/src/*/ | head -1)
mkdir -p "$B/source/third-party/napi-3.14.1/src/bindgen_runtime/js_values" "$B/source/third-party/skia-safe-0.153.3/src/core"
cp "$reg/napi-3.14.1/src/bindgen_runtime/js_values/buffer.rs" "$B/source/third-party/napi-3.14.1/src/bindgen_runtime/js_values/"
cp "$reg/napi-3.14.1/src/bindgen_runtime/mod.rs" "$B/source/third-party/napi-3.14.1/src/bindgen_runtime/"
cp "$reg/skia-safe-0.153.3/src/core/surface.rs" "$B/source/third-party/skia-safe-0.153.3/src/core/"
# Upstream patches on the frame/output path
for p in 0003 0005 0006 0007; do cp "$ch"/upstream-patches/anyrender_skia/$p-*.patch "$B/patches/anyrender_skia/"; done
# Tests and probes
for f in test/render-into.mjs test/render-into-workers.mjs test/render-into-examples.mjs test/types/render-into.test-d.ts test/types/tsconfig.json \
         test/smoke.mjs test/workers.mjs \
         experiments/phase4a2/output-regression.mjs experiments/phase4a2/pixel-format.mjs experiments/phase4a2/oom.mjs \
         experiments/phase4a2/sanity-bench.mjs experiments/phase4a2/catch-unwind-bench.mjs experiments/phase4a2/mmap-experiment.mjs \
         experiments/phase4a1/probes/postmessage.mjs experiments/phase4a1/probes/pipeline-failures.mjs; do copy "$f" "$B/tests"; done
# Graphify audit
cp "$here"/graphify/{stage-and-extract.sh,reach.py,reach.txt,graph.json} "$B/graphify/"
# Logs and small results
cp -r "$here"/evidence/. "$B/logs/"
[ -f "$ch/PHASE4A2_RESULTS.md" ] && cp "$ch/PHASE4A2_RESULTS.md" "$B/"
# Diffs against the Phase 4A.1 baseline (committed state; run after committing)
( cd "$repo" && git diff "$BASE" HEAD -- .gitignore canvas-html/src canvas-html/vendor canvas-html/index.d.ts canvas-html/index.js \
    canvas-html/package.json canvas-html/README.md canvas-html/Cargo.toml canvas-html/Cargo.lock canvas-html/test canvas-html/upstream-patches ) > "$B/PATCH.diff"
( cd "$repo" && git diff "$BASE" HEAD -- canvas-html/experiments/phase4a2 ':!canvas-html/experiments/phase4a2/review-bundle' \
    ':!canvas-html/experiments/phase4a2/graphify/graph.json' ':!canvas-html/experiments/phase4a2/graphify/reach.json' \
    ':!canvas-html/experiments/phase4a2/graphify/reach.txt' ':!canvas-html/experiments/phase4a2/evidence' ) > "$B/PATCH-experiments.diff"
( cd "$repo" && echo "base $BASE ($(git log -1 --format='%h %s' "$BASE"))"; echo "head $(git log -1 --format='%h %s' HEAD)"; echo; git diff --stat "$BASE" HEAD -- canvas-html/src canvas-html/vendor canvas-html/index.d.ts canvas-html/package.json canvas-html/README.md canvas-html/test canvas-html/upstream-patches ) > "$B/PATCH.stat"
# Unsafe inventory of the bundled first-party sources, for cross-checking UNSAFE_AUDIT.md
( cd "$B/source" && grep -n 'unsafe' src/*.rs vendor/anyrender_skia/src/image_renderer.rs vendor/anyrender_skia/src/gpu_image_renderer.rs ) > "$B/logs/unsafe-grep.txt" || true
python3 "$here/manifest.py" "$B" "$ch" "$BASE"
rm -f "$here/phase4a2-review-bundle.zip"
( cd "$here" && zip -qr phase4a2-review-bundle.zip review-bundle )
du -sh "$B" "$here/phase4a2-review-bundle.zip"
