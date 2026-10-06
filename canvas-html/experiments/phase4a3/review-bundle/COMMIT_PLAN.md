# Commit plan (as executed)

The canonical history and how each commit was produced and verified are described in
`docs/GIT-HISTORY.md`; the machine-readable plan is `experiments/phase4a3/history/plan.json`.

## cb1ad7c build: import the v0.5.0 engine

```
HTML, CSS and JavaScript rendered to pixels in Node without a browser: Blitz (Stylo CSS, Taffy
layout, Parley text) for style and layout, Skia (CPU raster) for painting, Boa for page scripts,
exposed as a napi-rs addon with a frozen, host-controlled clock.

This is the v0.5.0 snapshot that the research phases started from, laid out with the engine at
the repository root and the provisional internal names (html-renderer, dom-host). Blitz is
cloned into third_party/blitz and patched by scripts/setup-blitz.sh (patches 0001-0012);
anyrender_skia and Stylo are vendored with their patches in upstream-patches/.

 vendor/stylo/values/specified/length.rs            | 2024 ++++++++
 vendor/stylo/values/specified/list.rs              |  190 +
 vendor/stylo/values/specified/mod.rs               |  531 ++
 vendor/stylo/values/specified/motion.rs            |  316 ++
 vendor/stylo/values/specified/number.rs            |  603 +++
 vendor/stylo/values/specified/outline.rs           |   69 +
 vendor/stylo/values/specified/page.rs              |   94 +
 vendor/stylo/values/specified/param.rs             |  121 +
 vendor/stylo/values/specified/percentage.rs        |  364 ++
 vendor/stylo/values/specified/position.rs          | 2247 +++++++++
 vendor/stylo/values/specified/ratio.rs             |   29 +
 vendor/stylo/values/specified/rect.rs              |   28 +
 vendor/stylo/values/specified/resolution.rs        |  237 +
 vendor/stylo/values/specified/source_size_list.rs  |  135 +
 vendor/stylo/values/specified/svg.rs               |  427 ++
 vendor/stylo/values/specified/svg_path.rs          | 1115 +++++
 vendor/stylo/values/specified/table.rs             |   38 +
 vendor/stylo/values/specified/text.rs              | 1561 ++++++
 vendor/stylo/values/specified/time.rs              |  313 ++
 vendor/stylo/values/specified/transform.rs         |  599 +++
 vendor/stylo/values/specified/tree_counting.rs     |   32 +
 vendor/stylo/values/specified/ui.rs                |  344 ++
 vendor/stylo/values/specified/url.rs               |   12 +
 vendor/stylo/values/tagged_numeric.rs              |  253 +
 412 files changed, 165091 insertions(+)
```

## 1dbc75e docs(experiments): phase 2 runtime research and the phase 3 handoff

```
Evidence for choosing the JS runtime: the proof of concept, the Deno/V8 feasibility probes
(deno-core smoke test, Deno + N-API coexistence, Deno-canvas bridge), baselines and the phase 2
report, plus the handoff documents that defined phase 3. Experiments are not part of the build.

 experiments/phase2/evidence/worker-startup.stderr  |     0
 experiments/phase2/evidence/workers.json           |  1756 ++
 experiments/phase2/evidence/workers.stderr         |     0
 experiments/phase2/evidence/workers.stdout         |     1 +
 experiments/phase2/host/Cargo.toml                 |     8 +
 experiments/phase2/host/src/lib.rs                 |    12 +
 experiments/phase2/tests/benchmark.mjs             |    22 +
 experiments/phase2/tests/common.mjs                |    18 +
 experiments/phase2/tests/memory-footprint.mjs      |     5 +
 experiments/phase2/tests/memory-probe.mjs          |    11 +
 experiments/phase2/tests/model-a-probe.mjs         |     2 +
 experiments/phase2/tests/probe-model-a-single.mjs  |     6 +
 experiments/phase2/tests/probe-model-a.mjs         |     3 +
 experiments/phase2/tests/process.mjs               |     7 +
 experiments/phase2/tests/run.mjs                   |    10 +
 experiments/phase2/tests/startup-worker.mjs        |     5 +
 experiments/phase2/tests/suite.mjs                 |    43 +
 experiments/phase2/tests/worker-startup.mjs        |     3 +
 experiments/phase2/tests/worker.mjs                |     7 +
 experiments/phase2/tests/workers.mjs               |    12 +
 experiments/run.sh                                 |    19 +
 experiments/runtime-poc/Cargo.toml                 |    10 +
 experiments/runtime-poc/src/clock.js               |    45 +
 experiments/runtime-poc/src/lib.rs                 |   129 +
 179 files changed, 35621 insertions(+)
```

## d6ec43b refactor(dom): introduce the shared engine-neutral DOM host

```
The DOM subset that page scripts see (selectors, text, attributes, classList, inline and
computed style, geometry, event listeners, timer ordering and the clock contract) moves into the
dom-host crate, so that more than one JS engine can drive the same document with identical
results. The Boa runtime in Blitz (patch 0013) now delegates to it; the engine's public API is
unchanged.

 Cargo.lock                                         |   12 +
 Cargo.toml                                         |    8 +
 README.md                                          |    3 +-
 dom-host/Cargo.toml                                |   17 +
 dom-host/src/clock.rs                              |   53 +
 dom-host/src/document.rs                           |  492 +++++
 dom-host/src/errors.rs                             |   74 +
 dom-host/src/events.rs                             |  165 ++
 dom-host/src/handles.rs                            |   40 +
 dom-host/src/lib.rs                                |   38 +
 dom-host/src/runtime.rs                            |   47 +
 dom-host/src/style.rs                              |  134 ++
 dom-host/src/timers.rs                             |  161 ++
 dom-host/tests/document.rs                         |  157 ++
 index.d.ts                                         |   13 +
 src/lib.rs                                         |   54 +
 upstream-patches/UPSTREAM.md                       |    1 +
 ...ey-script-use-dom-host-for-the-shared-DOM.patch | 2225 ++++++++++++++++++++
 18 files changed, 3693 insertions(+), 1 deletion(-)
```

## 2780cb2 feat(experiments): experimental Deno/V8 runtime adapter and shared contract suite

```
A Deno/V8 adapter built on the shared DOM host, and the contract suite that runs the same cases
on Boa and V8 and requires identical results (30 cases), deterministic scene replay, GSAP and
Motion probes, lifecycle, memory and benchmark harnesses, and the phase 3 report. Experimental:
not part of the production build.

 experiments/phase3/evidence/workers.stdout         |    1 +
 experiments/phase3/graphify/code-manifest.json     |  200 ++
 experiments/phase3/graphify/crate-graph.json       |  285 +++
 .../phase3/graphify/deps/reach-new-document.json   |  155 ++
 experiments/phase3/graphify/deps/reach.py          |   63 +
 .../phase3/graphify/deps/stage-and-extract.sh      |   14 +
 .../graphify/diagnose-multigraph-directed.txt      |    8 +
 .../phase3/graphify/graphify-env-freeze.txt        |   30 +
 experiments/phase3/graphify/layers.json            |  130 ++
 experiments/phase3/graphify/layers.py              |   71 +
 experiments/phase3/retention-probe/Cargo.toml      |   20 +
 experiments/phase3/retention-probe/src/main.rs     |  169 ++
 experiments/phase3/tests/ab-boa.mjs                |   15 +
 experiments/phase3/tests/benchmark.mjs             |   54 +
 experiments/phase3/tests/common.mjs                |   19 +
 experiments/phase3/tests/memory-footprint.mjs      |    5 +
 experiments/phase3/tests/memory-probe.mjs          |   11 +
 experiments/phase3/tests/process.mjs               |    7 +
 experiments/phase3/tests/run.mjs                   |   12 +
 experiments/phase3/tests/startup-worker.mjs        |    5 +
 experiments/phase3/tests/suite.mjs                 |   29 +
 experiments/phase3/tests/worker-startup.mjs        |    3 +
 experiments/phase3/tests/worker.mjs                |    7 +
 experiments/phase3/tests/workers.mjs               |   12 +
 143 files changed, 15208 insertions(+)
```

## 8be1f2c feat(gpu): experimental headless GPU backends (Ganesh GL/Vulkan, Graphite)

```
An offscreen Skia GPU backend next to the CPU raster renderer, chosen per renderer with the
private experimentalBackend option: Ganesh on OpenGL (EGL device, surfaceless context) or
Vulkan, and Graphite on Vulkan. Off by default; the default build stays CPU only (features
experimental-gpu, experimental-gpu-vulkan, experimental-graphite). anyrender_skia patch 0003.

 Cargo.toml                                         |  15 +-
 index.d.ts                                         |  36 +
 src/lib.rs                                         | 311 ++++++-
 upstream-patches/UPSTREAM.md                       |   1 +
 ...U-image-renderers-Ganesh-EGL-GL-Vulkan-an.patch | 900 +++++++++++++++++++++
 vendor/anyrender_skia/Cargo.toml                   |  13 +-
 vendor/anyrender_skia/src/gpu_common.rs            | 146 ++++
 vendor/anyrender_skia/src/gpu_image_renderer.rs    | 369 +++++++++
 .../anyrender_skia/src/graphite_image_renderer.rs  | 160 ++++
 vendor/anyrender_skia/src/image_renderer.rs        |   4 +
 vendor/anyrender_skia/src/lib.rs                   |  27 +-
 vendor/anyrender_skia/src/scene.rs                 |  19 +-
 vendor/anyrender_skia/src/window_renderer.rs       |   2 +
 13 files changed, 1987 insertions(+), 16 deletions(-)
```

## 9bf9e44 fix(gpu): deterministic Ganesh output across document reloads

```
Ganesh caches path geometry (triangulations reused within a tolerance), so a document's pixels
depended on what the context had drawn before. A Ganesh renderer now frees its purgeable GPU
resources on load(). Also: Ganesh context options from an environment variable, for experiments
only (anyrender_skia patch 0004).

 src/lib.rs                                         |  6 ++
 ...t-options-from-HTML_RENDERER_GANESH_OPTIO.patch | 64 ++++++++++++++++++++++
 vendor/anyrender_skia/src/gpu_image_renderer.rs    | 21 ++++++-
 3 files changed, 89 insertions(+), 2 deletions(-)
```

## a84fd2d docs(experiments): phase 4A GPU backend research and results

```
Correctness, determinism, performance, memory and worker harnesses for the GPU backends, Mesa
and Tesla T4 results (JSON and logs; images stay in the research archive), the Skia source graph
notes, and the phase 4A report. README: GPU backend status.

 .../results/mesa-llvmpipe-graphite/logs/multi.log  |    12 +
 .../mesa-llvmpipe-graphite/logs/workers.log        |    10 +
 .../results/mesa-llvmpipe-graphite/memory.json     |   408 +
 .../results/mesa-llvmpipe-graphite/multi.json      |   379 +
 .../mesa-llvmpipe-graphite/run-summary.json        |    62 +
 .../results/mesa-llvmpipe-graphite/workers.json    |   235 +
 .../phase4a/results/mesa-llvmpipe/animated.json    |  3386 ++++
 .../phase4a/results/mesa-llvmpipe/bench.json       |  8669 ++++++++++
 .../phase4a/results/mesa-llvmpipe/contexts.json    |   644 +
 .../phase4a/results/mesa-llvmpipe/correctness.json |   728 +
 .../phase4a/results/mesa-llvmpipe/determinism.json |   473 +
 .../phase4a/results/mesa-llvmpipe/environment.json |    38 +
 .../phase4a/results/mesa-llvmpipe/failures.json    |   253 +
 .../phase4a/results/mesa-llvmpipe/fonts.json       |   240 +
 .../results/mesa-llvmpipe/logs/failures.log        |    13 +
 .../phase4a/results/mesa-llvmpipe/memory.json      |   676 +
 .../phase4a/results/mesa-llvmpipe/multi.json       |   699 +
 .../phase4a/results/mesa-llvmpipe/run-summary.json |     8 +
 .../phase4a/results/mesa-llvmpipe/workers.json     |   349 +
 experiments/phase4a/results/summary-t4-fix.md      |    69 +
 experiments/phase4a/results/summary-t4.md          |   395 +
 experiments/phase4a/run-all.mjs                    |    36 +
 experiments/phase4a/summarize.mjs                  |   182 +
 experiments/phase4a/workers.mjs                    |    78 +
 142 files changed, 89703 insertions(+)
```

## 3a8a34f perf(output): hand render() frames to Node without a copy

```
render() used to paint into a renderer-owned scratch frame and clone it into the Buffer. The
frame Vec is now handed to Node as the Buffer's memory (napi external buffer, freed by its
finalizer); allocation is fallible, so running out of memory is a JS error, not an abort.
Experimental, for measurement: _renderInto (paint into a caller's Buffer), a bounded frame pool,
and a switch back to the clone path.

 Cargo.lock                                         |   1 +
 Cargo.toml                                         |   2 +
 src/frames.rs                                      | 121 ++++++++
 src/lib.rs                                         | 322 ++++++++++++++++-----
 ...t-options-from-HTML_RENDERER_GANESH_OPTIO.patch |  64 ----
 vendor/anyrender_skia/src/gpu_image_renderer.rs    |   8 +-
 .../anyrender_skia/src/graphite_image_renderer.rs  |   8 +-
 7 files changed, 391 insertions(+), 135 deletions(-)
```

## f0de9cb feat(gpu): experimental pipelined GPU readback; types for the output experiments

```
Prototype readback pipelines for the Ganesh backend (a ring of surfaces read back later, and GL
pixel-pack buffers with fences) and _renderFramesExperimental, which renders a sequence natively.
Measured and not adopted (phase 4A.1); private. anyrender_skia patch 0005, typings for the
experimental output APIs.

 index.d.ts                                         |  69 +++-
 src/lib.rs                                         | 233 ++++++++++++
 upstream-patches/UPSTREAM.md                       |   2 +
 ...t-options-from-HTML_RENDERER_GANESH_OPTIO.patch |  64 ++++
 ...U-renderers-render-into-a-caller-s-buffer.patch | 390 +++++++++++++++++++++
 vendor/anyrender_skia/src/gpu_image_renderer.rs    | 267 +++++++++++++-
 vendor/anyrender_skia/src/lib.rs                   |   2 +-
 7 files changed, 1024 insertions(+), 3 deletions(-)
```

## 593182c docs(experiments): phase 4A.1 output-path research

```
The map of the old output path, transport, animation, memory, worker and lifetime harnesses, the
pipelined-readback measurements, T4 and L4 results, and the phase 4A.1 report.

 .../phase4a1/results/colab-l4/run-summary.json     |   32 +
 experiments/phase4a1/results/colab-l4/summary.md   |  196 +
 .../phase4a1/results/colab-l4/transport.json       | 7447 ++++++++++++++++++++
 experiments/phase4a1/results/colab-l4/workers.json |  240 +
 .../phase4a1/results/colab-t4/animated.json        | 2211 ++++++
 .../phase4a1/results/colab-t4/correctness-4a.json  | 1117 +++
 .../phase4a1/results/colab-t4/correctness-4a.log   |   30 +
 .../phase4a1/results/colab-t4/environment.json     |   34 +
 .../phase4a1/results/colab-t4/lifetimes.json       |  475 ++
 .../phase4a1/results/colab-t4/logs/animated.log    |  105 +
 .../phase4a1/results/colab-t4/logs/lifetimes.log   |   19 +
 .../phase4a1/results/colab-t4/logs/memory.log      |   60 +
 .../phase4a1/results/colab-t4/logs/pipeline.log    |   84 +
 .../phase4a1/results/colab-t4/logs/transport.log   |  360 +
 .../phase4a1/results/colab-t4/logs/workers.log     |   27 +
 experiments/phase4a1/results/colab-t4/memory.json  | 3592 ++++++++++
 .../phase4a1/results/colab-t4/pipeline.json        | 1734 +++++
 .../phase4a1/results/colab-t4/run-summary.json     |   38 +
 experiments/phase4a1/results/colab-t4/summary.md   |  585 ++
 experiments/phase4a1/results/colab-t4/workers.json |  357 +
 experiments/phase4a1/run-all.mjs                   |   37 +
 experiments/phase4a1/summarize.mjs                 |   74 +
 experiments/phase4a1/transport.mjs                 |   86 +
 experiments/phase4a1/workers.mjs                   |   85 +
 62 files changed, 23017 insertions(+)
```

## 2d47861 feat(api): add renderInto() and frameByteLength

```
renderInto(target) draws the frame into memory the caller owns and reuses: a Buffer, Uint8Array
or Uint8ClampedArray of exactly frameByteLength (pixelWidth x pixelHeight x 4) bytes. Same frame
step and same bytes as render(), with no allocation and no copy in the engine.

- Synchronous; the renderer keeps no reference to the target and never writes it after return.
- The typed-array kind is read with N-API directly; other typed arrays, DataView, ArrayBuffer and
  views over a SharedArrayBuffer are rejected (an exclusive &mut [u8] over shared memory would be
  a data race), as are detached views and wrong lengths; a rejected call runs nothing.
- Workers: render into a transferable ArrayBuffer and postMessage(ab, [ab]) (zero-copy); render()
  Buffers are external memory and cannot be transferred.
- The frame pool, huge-page frames and the clone switch are removed; clone stays as a private
  diagnostic. Known panic paths in the output code become errors (anyrender_skia patch 0006:
  try_render), with a catch_unwind backstop on render() and renderInto().

 index.d.ts                                         |  58 +++---
 src/frames.rs                                      |  88 +--------
 src/lib.rs                                         | 197 +++++++++------------
 src/target.rs                                      | 119 +++++++++++++
 upstream-patches/UPSTREAM.md                       |   1 +
 ...enderer-try_render-an-error-instead-of-a-.patch |  59 ++++++
 vendor/anyrender_skia/src/image_renderer.rs        |  18 +-
 7 files changed, 320 insertions(+), 220 deletions(-)
```

## de0ce23 test(frame-api): renderInto contract, workers and documented examples

```
test/render-into.mjs: accepted and rejected targets with their error classes and codes, no side
effects on rejection, same bytes as render(), ownership and lifetimes, close and size limits.
test/render-into-workers.mjs: 1, 2 and 4 workers with transferable ArrayBuffers (recycled) and
in-process buffers; use-after-transfer rejected. test/render-into-examples.mjs: the README
examples, including the asynchronous-consumer ring. Type-level tests in test/types.

 package.json                     |   2 +-
 test/render-into-examples.mjs    |  67 ++++++++++++++
 test/render-into-workers.mjs     |  99 +++++++++++++++++++++
 test/render-into.mjs             | 186 +++++++++++++++++++++++++++++++++++++++
 test/types/render-into.test-d.ts |  55 ++++++++++++
 test/types/tsconfig.json         |   4 +
 6 files changed, 412 insertions(+), 1 deletion(-)
```

## 7b85faf docs(frame-api): document render(), renderInto() and the pixel format

```
When to use each API, a sequence into one buffer, a ring for asynchronous consumers, the worker
transfer pattern, accepted and rejected targets, the SharedArrayBuffer policy, the pixel format
and the Electron/V8 sandbox note.

 README.md | 65 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 1 file changed, 65 insertions(+)
```

## 8c480ee docs(gpu): SAFETY comments on the pipelined GL readback

```
Comments only: the invariants of the raw GL blocks in the experimental pixel-pack-buffer
readback (anyrender_skia patch 0007).

 upstream-patches/UPSTREAM.md                       |  1 +
 ...L-readback-SAFETY-comments-on-the-raw-GL-.patch | 73 ++++++++++++++++++++++
 vendor/anyrender_skia/src/gpu_image_renderer.rs    | 16 +++++
 3 files changed, 90 insertions(+)
```

## 47d7ade docs(experiments): phase 4A.2 frame API research

```
Output regression, pixel format, out-of-memory, catch_unwind and allocator (mmap, rejected)
experiments, the Graphify-based unsafe reachability audit, L4 results and the phase 4A.2 report.

 .../phase4a2/evidence/l4/sanity-bench-l4.json      |  434 ++++
 experiments/phase4a2/evidence/l4/tests.log         |   20 +
 experiments/phase4a2/evidence/mmap-experiment.json |  148 ++
 experiments/phase4a2/evidence/oom.txt              |    2 +
 .../phase4a2/evidence/output-regression-cpu.json   |   49 +
 .../evidence/output-regression-gpu-gl-mesa.json    |   49 +
 .../output-regression-gpu-vulkan-mesa.json         |   49 +
 .../phase4a2/evidence/pixel-format-cpu.json        |  170 ++
 .../phase4a2/evidence/pixel-format-mesa.json       |  338 +++
 .../phase4a2/evidence/png-premultiplied.txt        |   10 +
 experiments/phase4a2/evidence/regression-after.txt |   51 +
 .../phase4a2/evidence/sanity-bench-local.json      |  146 ++
 experiments/phase4a2/evidence/typecheck.txt        |    2 +
 experiments/phase4a2/graphify/reach.json           | 2345 ++++++++++++++++++++
 experiments/phase4a2/graphify/reach.py             |  126 ++
 experiments/phase4a2/graphify/reach.txt            |  873 ++++++++
 experiments/phase4a2/graphify/stage-and-extract.sh |   20 +
 experiments/phase4a2/make-review-bundle.sh         |   49 +
 experiments/phase4a2/manifest.py                   |  115 +
 experiments/phase4a2/mmap-experiment.mjs           |   57 +
 experiments/phase4a2/oom.mjs                       |   38 +
 experiments/phase4a2/output-regression.mjs         |   57 +
 experiments/phase4a2/pixel-format.mjs              |   39 +
 experiments/phase4a2/sanity-bench.mjs              |   51 +
 37 files changed, 6934 insertions(+)
```

## b53479a fix(render): malformed input is a JS error, never a panic

```
- background: parsed as bytes after checking that every character is an ASCII hex digit; any
  non-ASCII, multi-byte, NUL or overlong input used to be sliced by byte index and could panic.
- advanceClock: the frozen clock is limited to 8.64e15 ms (the range of a JS Date); larger finite
  values are rejected before any Duration/Instant arithmetic, which is now checked.
- Page timers: setTimeout/setInterval delays above i32::MAX wrap like a WebIDL long instead of
  overflowing Duration (setTimeout(f, 1e25) aborted the process; Blitz patch 0014).
- Every N-API method that runs engine code is guarded: a panic (a bug) becomes a generic Error,
  the renderer is closed, and no panic text reaches JS.
test/hardening.mjs covers the inputs above.

 package.json                                       |   2 +-
 src/lib.rs                                         | 119 +++++++++++++++++++--
 test/hardening.mjs                                 |  58 ++++++++++
 ...t-timer-delays-above-i32-MAX-wrap-like-a-.patch |  44 ++++++++
 4 files changed, 212 insertions(+), 11 deletions(-)
```

## 8300701 fix(png): encode transparent output with straight alpha

```
Frames are premultiplied RGBA; PNG stores straight alpha. render({ format: 'png' }) wrote the
premultiplied bytes as they were, so translucent pixels over a non-opaque background came out too
dark (50% red: [128,0,0,128] instead of [255,0,0,128]). The PNG path now unpremultiplies
(A = 0 → 0; otherwise round(c x 255 / a)); raw render()/renderInto() bytes are unchanged and
opaque frames encode exactly as before. Tests compare decoded PNG pixels with the expected
straight-alpha values.

 src/lib.rs         | 23 ++++++++++++++++++++++-
 test/hardening.mjs | 40 ++++++++++++++++++++++++++++++++++++++--
 2 files changed, 60 insertions(+), 3 deletions(-)
```

## e39c901 style: rustfmt configuration, cargo fmt, clippy clean

```
rustfmt.toml (140 columns, small heuristics off) and the formatting it implies for src/ and
dom-host/; clippy fixes (collapsible ifs, let-chains) and a documented allow of
large_enum_variant on the two enums that hold one backend each. No behaviour change; the build
has no clippy warnings.

 dom-host/src/document.rs   |  24 ++-----
 dom-host/src/events.rs     |   5 +-
 dom-host/src/timers.rs     |   6 +-
 dom-host/tests/document.rs |   2 +-
 rustfmt.toml               |   2 +
 src/lib.rs                 | 165 ++++++++++++++++++++++++++-------------------
 src/target.rs              |   5 +-
 7 files changed, 112 insertions(+), 97 deletions(-)
```

## e184ea2 docs: project status, contracts, trust model, third-party notices, local checks

```
- README: what the engine is, provisional names, build and checks, repository layout.
- docs/: FEATURE_STATUS (supported, experimental, research only), API_CONTRACT and
  PIXEL-FORMAT (frame output, straight-alpha PNG, AlphaType), PANIC-SAFETY (every public
  method, the guard policy), UNSAFE_AUDIT, SECURITY (trust model: trusted content only, local
  file access, no script timeout), GITHUB_MIGRATION, an inactive CI draft in docs/ci.
- upstream-patches/README.md replaces UPSTREAM.md: base, reason, dependent test and removal
  condition for every patch.
- THIRD_PARTY_NOTICES.md: what a built addon contains and under which licences.
- PROJECT_IDENTITY.md: current names, which are public, and how to rename.
- scripts/check.sh (fmt, clippy, tests, workers, types) and scripts/check-gpu.sh replace hosted
  CI.

 PROJECT_IDENTITY.md          |  39 +++++
 README.md                    |  59 ++++---
 THIRD_PARTY_NOTICES.md       | 397 +++++++++++++++++++++++++++++++++++++++++++
 docs/API_CONTRACT.md         | 164 ++++++++++++++++++
 docs/FEATURE_STATUS.md       |  29 ++++
 docs/GITHUB_MIGRATION.md     |  32 ++++
 docs/PANIC-SAFETY.md         |  67 ++++++++
 docs/PIXEL-FORMAT.md         |  66 +++++++
 docs/SECURITY.md             |  31 ++++
 docs/UNSAFE_AUDIT.md         | 124 ++++++++++++++
 docs/ci/README.md            |   7 +
 docs/ci/check.yml            |  29 ++++
 scripts/check-gpu.sh         |  22 +++
 scripts/check.sh             |  42 +++++
 upstream-patches/README.md   |  59 +++++++
 upstream-patches/UPSTREAM.md |  64 -------
 16 files changed, 1144 insertions(+), 87 deletions(-)
```

## 4065915 chore(release): 0.6.0-rc.1

```
Release candidate for the frame API (renderInto, frameByteLength) and the 4A.3 hardening.
CHANGELOG.md has the release notes. Not published; the package stays private.

 CHANGELOG.md      | 71 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 Cargo.lock        |  2 +-
 Cargo.toml        |  2 +-
 package-lock.json |  4 ++--
 package.json      |  2 +-
 5 files changed, 76 insertions(+), 5 deletions(-)
```

## 9c7e738 docs(experiments): phase 4A.3 hardening and repository normalization

```
The AlphaType experiment (Opaque and Premul give identical bytes on CPU, Ganesh GL and
Vulkan), regression and L4 evidence, the tooling that rebuilt this history from the research
repository (build_history.py, plan.json, overlays) with its verification log, docs/GIT-HISTORY.md
and the phase 4A.3 report. PROJECT_IDENTITY: the version is now 0.6.0-rc.1.

 .../history/overlay/docs/THIRD_PARTY_NOTICES.md    |  397 +++++++
 .../history/overlay/docs/docs/API_CONTRACT.md      |  164 +++
 .../history/overlay/docs/docs/FEATURE_STATUS.md    |   29 +
 .../history/overlay/docs/docs/GITHUB_MIGRATION.md  |   32 +
 .../history/overlay/docs/docs/PANIC-SAFETY.md      |   67 ++
 .../history/overlay/docs/docs/PIXEL-FORMAT.md      |   66 ++
 .../phase4a3/history/overlay/docs/docs/SECURITY.md |   31 +
 .../history/overlay/docs/docs/UNSAFE_AUDIT.md      |  124 +++
 .../history/overlay/docs/docs/ci/README.md         |    7 +
 .../history/overlay/docs/docs/ci/check.yml         |   29 +
 .../history/overlay/docs/scripts/check-gpu.sh      |   22 +
 .../phase4a3/history/overlay/docs/scripts/check.sh |   42 +
 .../overlay/docs/upstream-patches/README.md        |   59 ++
 .../history/overlay/final/PROJECT_IDENTITY.md      |   39 +
 .../history/overlay/final/docs/GIT-HISTORY.md      |   78 ++
 .../phase4a3/history/overlay/release/CHANGELOG.md  |   71 ++
 experiments/phase4a3/history/plan.json             |  355 +++++++
 experiments/phase4a3/history/run_history.sh        |   59 ++
 .../phase4a3/history/state.json.excluded.json      |  236 +++++
 experiments/phase4a3/history/state_from_commit.py  |   19 +
 experiments/phase4a3/history/verify.log            |  221 ++++
 experiments/phase4a3/make-review-bundle.sh         |   58 +
 experiments/phase4a3/output-regression.mjs         |   57 +
 experiments/phase4a3/timing.mjs                    |   48 +
 54 files changed, 5779 insertions(+), 2 deletions(-)
```

