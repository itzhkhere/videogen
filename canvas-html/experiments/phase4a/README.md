# Phase 4A — GPU-backed Skia experiment

Results and decision: [`PHASE4A_RESULTS.md`](../../PHASE4A_RESULTS.md). Paint-path note:
[`ARCHITECTURE.md`](ARCHITECTURE.md).

| Path | What |
|---|---|
| `lib/` | Addon loader (`CANVAS_HTML_NODE`), scenes A–G and animated scenes, statistics, pixel diff and severity |
| `correctness.mjs` | CPU vs GPU pixels for every scene at 720p/1080p/4K, diff images, attribution by ablation |
| `bench.mjs` | Static scenes: cold start, then RGBA / no-readback / PNG / paint-prep timing breakdowns |
| `animated.mjs` | CSS, GSAP and effects sequences, 120 and 300 frames at 1080p |
| `contexts.mjs` | Reuse vs new renderer (and new device) per frame |
| `multi.mjs` | 1/2/4/8 renderers on one thread, own device vs shared device (one process each) |
| `workers.mjs` | 1/2/4/8 worker threads; terminate() while rendering |
| `determinism.mjs` | 5 fresh instances, 3 processes, long-lived renderer, animation replay |
| `memory.mjs` | RSS, GPU memory (nvidia-smi), Skia GPU cache: baseline → 1/4/8 renderers → closed; growth |
| `fonts.mjs` | Phase 3 font-retention follow-up under GPU; Skia font cache purge |
| `failures.mjs` | Init failure, unsupported backend, surface failure, device loss, use after close, teardown, OOM |
| `cpu-unchanged.mjs` | CPU path before vs after: same pixels through the production `render()` |
| `run-all.mjs` | All of the above; writes `results/<tag>/` |
| `summarize.mjs` | Markdown tables from result sets |
| `colab/` | Bundle and scripts used to run on a Colab T4 VM over the Colab CLI |
| `results/colab-t4*`, `evidence/` | Raw data, images, logs of the reported runs |

## Build

```sh
# Ganesh (GL + Vulkan); CPU stays available and is the default backend
cargo build --release --features experimental-gpu-vulkan
cp target/release/libcanvas_html.so experiments/phase4a/build/canvas-html-gpu.node
# Graphite (Vulkan); a different Skia binary without Ganesh/GL
cargo build --release --no-default-features --features experimental-graphite
cp target/release/libcanvas_html.so experiments/phase4a/build/canvas-html-graphite.node
```

## Run

```sh
PHASE4A_TAG=mine node run-all.mjs                       # cpu, gpu-gl, gpu-vulkan
CANVAS_HTML_NODE=build/canvas-html-graphite.node PHASE4A_BACKENDS=cpu,gpu-graphite PHASE4A_TAG=mine-graphite node run-all.mjs
node summarize.mjs mine mine-graphite
```

`PHASE4A_REQUIRE_HW=1` aborts on a software GPU. Without a GPU, Mesa llvmpipe (EGL/GL) and
lavapipe (Vulkan) run everything (that is how the harness was validated); their timings are not
GPU timings. Knobs for quick runs: `PHASE4A_RES`, `PHASE4A_SCENES`, `PHASE4A_FRAMES` (scale),
`PHASE4A_ANIM_FRAMES`, `PHASE4A_CTX_FRAMES`, `PHASE4A_MULTI_ROUNDS`, `PHASE4A_WORKER_FRAMES`,
`PHASE4A_OOM=1` (out-of-memory probe), `CANVAS_HTML_GPU_DEVICE` (device index).
