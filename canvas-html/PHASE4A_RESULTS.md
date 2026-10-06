# canvas-html Phase 4A — GPU-backed Skia

Prepared 2026-10-06. `PHASE3_RESULTS.md` was read completely before any code changed.
Development and functional validation: Linux x64 container without a GPU (4 vCPU, 15 GiB),
Mesa 25.2.8 llvmpipe (EGL/GL) and lavapipe (Vulkan). Measurements: Google Colab VM, **NVIDIA
Tesla T4** (15 GiB, driver 580.82.07, Vulkan 1.4.312), Intel Xeon @ 2.00 GHz × 8 vCPU, 51 GiB,
Ubuntu 24.04.4, Node 24.19.0. Rust 1.97.0, rust-skia (skia-safe/skia-bindings) 0.153.3 = Skia
milestone **m153**, Blitz `0db8c74` + patches, anyrender_skia 0.12.0 + patches 0001–0003.
CPU and GPU were measured on the same VM in the same runs. Raw data, images and logs:
`experiments/phase4a/` (index in its `README.md`).

## Decision

**GO** — adopt a GPU-backed Skia path (Skia **Ganesh**) as an **experimental** renderer backend.

The GPU path renders the existing HTML/CSS/SVG paint commands through a GPU `SkSurface` with no
change above the Skia surface layer; every scene is visually equivalent to CPU; paint-heavy
frames are 3–22× faster at 1080p/4K; readback is measured and is not the bottleneck; device
ownership is stable and deterministic; memory is bounded. All ten success criteria hold
(checklist at the end).

The scope is an *experimental, opt-in* backend. CPU Skia stays the default and the fallback; the
default build is unchanged (bit-identical pixels, same Skia binary, no new link-time dependency).
Two things decide how far it goes next, and neither is a GPU-paint problem: the output path
(Node Buffer copy and PNG encoding cost more than readback) and deployment (GPU drivers in the
target environment).

## Executive summary

> Does GPU-backed Skia materially improve canvas-html rendering for realistic workloads?

**Yes for paint-heavy frames; no for trivial ones; and end-to-end gains are capped by the
output path, not by the GPU.**

- **Paint-heavy static frames** (median ms per frame, RGBA output, T4 vs the same VM's CPU):

  | scene | 1080p CPU | 1080p Ganesh Vulkan | × | 4K CPU | 4K Ganesh GL | × |
  |---|---|---|---|---|---|---|
  | C images | 253.0 | 11.4 | 22.2 | 957.1 | 42.6 | 22.5 |
  | D gradients | 205.1 | 23.8 | 8.6 | 661.8 | 83.8 | 7.9 |
  | E shadows/blur/filters | 167.8 | 27.3 | 6.2 | 370.0 | 68.4 | 5.4 |
  | F SVG paths | 328.2 | 91.5 | 3.6 | 1088.1 | 340.9 | 3.2 |
  | B large typography | 210.5 | 27.9 | 7.5 | 569.8 | 152.7 | 3.7 |
  | G1000 transforms | 153.2 | 60.8 | 2.5 | 326.3 | 100.6 | 3.2 |
  | A simple typography | 5.8 | 6.1 | 0.95 | 29.1 | 26.9 | 1.08 |

- **Animated sequences** (1080p, 30 fps, median frame incl. seek): effects scene 35.2 → 11.5 ms
  (3.1×), CSS motion 22.9 → 11.7 ms (2.0×), GSAP scene 8.3 → 8.4 ms (no gain: the scene is
  cheap to paint and its frame is JS + output).
- **Readback is not the dominant cost.** GPU→CPU copy at 1080p is 1.7–2.1 ms (Ganesh), at 4K
  6.5–9 ms (Ganesh, up to 23 ms on Vulkan for heavy scenes) and ~18.5 ms (Graphite). The RGBA
  **Node Buffer copy** that both backends pay is larger (4.2 ms at 1080p, 20 ms at 4K), and
  **PNG encoding** dwarfs both (30–700 ms at 1080p). With PNG output the effects sequence goes
  from 141 to 120 ms per frame (1.2×); with raw RGBA (e.g. piping to an encoder) 3.1×.
- **Whole-machine throughput** narrows the gap for moderate scenes: on 8 vCPU, CPU workers reach
  71.6 fps on the effects scene (8 workers) and Ganesh GL 81.6 fps (4 workers; 8 GPU workers
  regress). Per renderer the GPU is 1.6× faster on that scene; heavier frames widen it.
- **Ganesh, not Graphite**, carries forward. Graphite works (after a fix) and is the fastest on
  paths and gradients, but it is 3.5× slower than Ganesh on text, uses ~2× the GPU memory per
  renderer, is not bit-stable frame to frame, exposes no cache statistics or device-loss
  simulation through rust-skia, and needs a different Skia binary without Ganesh/GL.

## Implemented architecture

```text
HtmlRenderer (src/lib.rs) ─ DOM, Stylo, Taffy, Parley, Boa/Deno: unchanged
        │ resolve()
        ▼
blitz_paint::paint_scene ─ unchanged
        │ AnyRender PaintScene calls
        ▼
SkiaScenePainter (vendor/anyrender_skia/src/scene.rs) ─ unchanged, except Graphite image upload
        │ SkCanvas calls
        ▼
   Painter (src/lib.rs, chosen per renderer by experimentalBackend)
   ├── Cpu       SkiaImageRenderer        raster SkSurface over the output Vec      (default)
   ├── Gpu       SkiaGpuImageRenderer     Ganesh render target: GL (EGL device) or Vulkan
   └── Graphite  SkiaGraphiteImageRenderer Graphite render target via a Recorder (Vulkan)
        │ GPU: flush/snap + submit → wait → read_pixels into the same Vec (optional)
        ▼
Buffer::from(Vec) / PNG encoder ─ unchanged
```

- `vendor/anyrender_skia/src/gpu_image_renderer.rs` (Ganesh), `graphite_image_renderer.rs`
  (Graphite), `gpu_common.rs` (error type, timings, headless Vulkan device). Upstream patch:
  `upstream-patches/anyrender_skia/0003-…`.
- **Headless**: GL uses an EGL device (`EGL_EXT_platform_device`) and a surfaceless context; no
  X11, Wayland or window. Vulkan uses no surface extensions.
- **Ownership**: a `GpuDevice` owns the API objects (EGL context or Vulkan instance/device) and
  Skia's context; it is `Rc` (single thread). `experimentalGpuShare: "renderer"` (default) gives
  each renderer its own device; `"thread"` shares one per thread. Drop order: surface → Skia
  context → API objects (a crash found on lavapipe before any GPU session: the surface holds a
  reference to Skia's context).
- **API** (private, experimental): `experimentalBackend: "cpu" | "gpu-gl" | "gpu-vulkan" |
  "gpu-graphite"`, `experimentalGpuShare`, `_renderTimed({format, readback, measurePaintPrep})`
  (reports the backend that drew the frame and every step), `_backendInfo()`,
  `_gpuFreeResources()`, `_gpuAbandonForTesting()`, `_purgeSkiaFontCache()`. A backend that
  cannot start throws; nothing falls back silently. `close()` releases the GPU surface.
- **Builds**: default (CPU only, unchanged) · `--features experimental-gpu` (Ganesh GL) ·
  `--features experimental-gpu-vulkan` (Ganesh GL + Vulkan) · `--no-default-features --features
  experimental-graphite` (Graphite Vulkan). In every GPU build the CPU backend is available and
  bit-identical to production.
- **Not touched**: DOM, Stylo, layout, Blitz paint, `canvas-dom-host`, Boa/Deno, the clock.
  Two adapter-level changes, both found by the correctness and determinism suites: Graphite image
  upload in the scene painter, and Ganesh freeing purgeable GPU resources on `load()`.

The paint-path note written before the change: `experiments/phase4a/ARCHITECTURE.md`. Skia
internals read for this phase (directed Graphify graph of Skia m153's GPU sources):
`experiments/phase4a/graphify/SKIA-NOTES.md`.

## Backends tested

| | Ganesh GL | Ganesh Vulkan | Graphite Vulkan |
|---|---|---|---|
| Skia | m153 (rust-skia 0.153.3) | m153 | m153 |
| Skia binary | `ganesh-gl-jpegd-jpege-pdf(-vulkan)` | `ganesh-gl-jpegd-jpege-pdf-vulkan` | `graphite-jpegd-jpege-pdf-vulkan` |
| T4 device | EGL device "NVIDIA Tesla T4"; GL 3.3 core, NVIDIA 580.82.07 | Tesla T4 (discrete), Vulkan 1.4.312 | same |
| Mesa (validation) | llvmpipe, GL 4.5 | lavapipe | lavapipe |
| Headless init | yes | yes | yes |
| Correct output | yes | yes | yes, after image-upload fix |
| Status | carried forward | carried forward | evaluated, not carried |

Not available in the pinned build: Metal and Direct3D (not Linux), Dawn (rust-skia builds no Dawn
backend and has no bindings for it), Graphite on GL (Graphite has no GL backend), a binary with
both Ganesh and Graphite (probed: 404). Ganesh and Graphite are therefore separate native builds.

## Correctness

Fixed fonts (bundled Inter), local images, seeded random scenes, frozen clock, fixed viewport and
background. Each scene rendered on CPU and each GPU backend; delta of a pixel = largest channel
difference. Severity: *exact*; *near-exact* (≤3 levels); *minor* (≤0.1 % of pixels differ by >32);
*edge-aa* (more, but ≥90 % of those pixels are on edges of the CPU image); *moderate*; *major*.
Cause by ablation: remove one class of operation (text, filters, shadows, images, gradients,
opacity) on both backends and measure how much of the difference disappears.

T4, CPU vs GPU, `severity / % pixels differing / max delta / % pixels with delta > 32`:

| scene | 1080p Ganesh GL | 1080p Ganesh Vulkan | 1080p Graphite | 4K Ganesh GL | cause (720p ablation) |
|---|---|---|---|---|---|
| A simple typography | minor / 0.47 / 64 / 0.004 | minor / 0.47 / 64 / 0.004 | minor / 0.47 / 64 / 0.004 | minor / 0.34 / 230 / 0.046 | text rasterization (96 %) |
| B large typography | edge-aa / 72.3 / 169 / 0.77 | edge-aa / 72.5 / 169 / 0.76 | edge-aa / 71.9 / 168 / 0.76 | edge-aa / 70.9 / 216 / 1.02 | text rasterization (100 %) |
| C images | minor / 83.7 / 54 / 0.001 | minor / 84.4 / 55 / 0.001 | minor / 84.1 / 65 / 0.008 | minor / 83.7 / 42 / 0.000 | image sampling (100 %) |
| D gradients | minor / 87.2 / 68 / 0.002 | minor / 88.0 / 68 / 0.002 | minor / 88.0 / 76 / 0.018 | minor / 87.2 / 41 / 0.000 | gradient interpolation (100 %) |
| E shadows/blur/filters | minor / 84.6 / 82 / 0.007 | minor / 85.5 / 82 / 0.007 | minor / 84.2 / 78 / 0.011 | minor / 70.8 / 38 / 0.000 | shadow/blur precision (41 %; rest text/opacity) |
| F SVG paths | edge-aa / 49.1 / 128 / 0.96 | edge-aa / 49.1 / 128 / 0.96 | edge-aa / 49.4 / 139 / 1.51 | edge-aa / 45.6 / 104 / 0.12 | geometry antialiasing |
| G100 | minor / 12.5 / 70 / 0.014 | minor / 12.6 / 71 / 0.014 | minor / 12.1 / 76 / 0.029 | minor / 12.3 / 76 / 0.007 | layer/opacity blending (70 %) |
| G500 | minor / 44.8 / 90 / 0.038 | minor / 44.8 / 91 / 0.038 | minor / 44.7 / 76 / 0.091 | minor / 44.1 / 85 / 0.020 | layer/opacity blending (70 %) |
| G1000 | minor / 66.4 / 81 / 0.050 | minor / 66.4 / 81 / 0.051 | edge-aa / 66.1 / 76 / 0.112 | minor / 65.6 / 91 / 0.025 | layer/opacity blending (70 %) |

720p and the other combinations: `experiments/phase4a/results/summary-t4.md`.

- **No major semantic mismatch.** Every difference is antialiasing coverage, sampling or
  blending precision. Large shares of "differing" pixels (gradients, images, translucent
  fills) are 1–3-level rounding.
- **Large deltas are edges.** B (glyphs above ~254 device px are drawn as GPU paths, not from the
  glyph atlas) and F (paths) differ on outlines; in A at 4K, 475 pixels reach 229 levels at sharp
  corners and overlapping contours of the 168-px heading (Inter has overlapping contours). Zoomed
  side-by-side crops: `experiments/phase4a/evidence/crops/` (`crop.mjs`).
- **Ganesh GL and Ganesh Vulkan** produce nearly the same pixels (same Skia code): between them
  the max delta is 1–3 levels (19 on E's blurs), far below either vs CPU. Graphite has slightly
  more edge differences.
- **Graphite dropped every raster image** at first ("Couldn't convert SkImage to a
  Graphite-backed representation"; scene C was *major*). Skia's default `ImageProvider` returns
  null by design and rust-skia does not bind `RecorderOptions::fImageProvider`; the scene painter
  now uploads each image once with `texture_from_image`, cached in the existing image-shader cache
  (the pattern Skia's header recommends). After the fix C is *minor*.
- Images: CPU and GPU outputs for every scene at 720p, diff images for every non-exact pair at
  720p and for edge-aa pairs at 1080p/4K: `experiments/phase4a/results/colab-t4*/images/`.

## Performance

Method: per (scene, resolution, backend) a fresh renderer; cold numbers (constructor including
GPU device, load, first frame); 5 warm-up frames; then N frames (720p 20, 1080p 15, 4K 10) per mode;
medians reported, CV recorded (typically 0.01–0.07). Modes: RGBA (the production `render()`
path), no-readback, PNG, and paint-prep (Blitz command generation alone into AnyRender's null
painter). Resolutions are 1280×720 CSS at devicePixelRatio 1 / 1.5 / 3, so layout and paint
commands are identical and only pixel work grows. Every frame names its backend; a mismatch aborts.
CPU timings repeated in the Graphite run agree with the first run (`summary-t4.md`).

### Totals (median ms per frame; no-readback in brackets; speed-up vs CPU)

| scene | 720p CPU | 720p Ganesh GL | 720p Ganesh Vulkan | 720p Graphite |
|---|---|---|---|---|
| A | 2.6 [0.9] | 3.1 [0.2] ×0.85 | 2.9 [0.3] ×0.89 | 3.1 [0.3] ×0.84 |
| B | 127.9 [125.2] | 28.1 [24.3] ×4.6 | 26.3 [23.0] ×4.9 | 79.7 [75.6] ×1.6 |
| C | 116.6 [115.8] | 6.8 [3.9] ×17.2 | 6.1 [3.5] ×19.0 | 7.1 [4.3] ×16.4 |
| D | 83.0 [79.7] | 15.9 [12.1] ×5.2 | 12.8 [10.2] ×6.5 | 9.6 [6.9] ×8.7 |
| E | 98.5 [97.7] | 22.3 [19.9] ×4.4 | 18.0 [14.9] ×5.5 | 33.2 [28.5] ×3.0 |
| F | 173.0 [170.6] | 42.7 [38.4] ×4.1 | 35.8 [33.2] ×4.8 | 14.1 [10.8] ×12.3 |
| G100 | 12.0 [11.2] | 8.9 [6.1] ×1.3 | 7.6 [4.9] ×1.6 | 6.8 [4.1] ×1.8 |
| G500 | 53.7 [52.5] | 35.2 [31.6] ×1.5 | 27.8 [25.2] ×1.9 | 27.5 [24.6] ×2.0 |
| G1000 | 100.0 [98.1] | 76.2 [75.3] ×1.3 | 61.6 [58.3] ×1.6 | 49.7 [46.9] ×2.0 |

| scene | 1080p CPU | 1080p Ganesh GL | 1080p Ganesh Vulkan | 1080p Graphite |
|---|---|---|---|---|
| A | 5.8 [1.9] | 7.1 [0.3] ×0.82 | 6.1 [0.4] ×0.95 | 6.3 [0.4] ×0.92 |
| B | 210.5 [206.6] | 30.2 [23.5] ×7.0 | 27.9 [21.5] ×7.5 | 99.3 [92.2] ×2.1 |
| C | 253.0 [249.7] | 12.1 [5.6] ×20.9 | 11.4 [5.1] ×22.2 | 12.4 [5.4] ×20.5 |
| D | 205.1 [204.8] | 27.5 [21.1] ×7.5 | 23.8 [18.2] ×8.6 | 15.2 [9.3] ×13.5 |
| E | 167.8 [166.4] | 32.4 [25.7] ×5.2 | 27.3 [20.9] ×6.2 | 35.5 [28.1] ×4.7 |
| F | 328.2 [324.1] | 88.2 [82.2] ×3.7 | 91.5 [78.6] ×3.6 | 30.1 [21.4] ×10.9 |
| G100 | 20.4 [16.0] | 12.7 [6.9] ×1.6 | 11.4 [5.2] ×1.8 | 10.9 [4.9] ×1.9 |
| G500 | 77.4 [73.9] | 42.2 [33.6] ×1.8 | 33.5 [26.6] ×2.3 | 32.6 [26.1] ×2.4 |
| G1000 | 153.2 [145.7] | 76.9 [70.1] ×2.0 | 60.8 [52.8] ×2.5 | 58.4 [50.8] ×2.6 |

| scene | 4K CPU | 4K Ganesh GL | 4K Ganesh Vulkan | 4K Graphite |
|---|---|---|---|---|
| A | 29.1 [8.4] | 26.9 [0.3] ×1.08 | 29.0 [0.4] ×1.01 | 41.1 [0.9] ×0.71 |
| B | 569.8 [551.1] | 152.7 [124.9] ×3.7 | 153.3 [142.7] ×3.7 | 164.7 [121.8] ×3.5 |
| C | 957.1 [934.9] | 42.6 [14.5] ×22.5 | 42.4 [12.3] ×22.6 | 52.3 [11.8] ×18.3 |
| D | 661.8 [648.8] | 83.8 [55.2] ×7.9 | 104.6 [57.1] ×6.3 | 69.8 [26.6] ×9.5 |
| E | 370.0 [356.4] | 68.4 [42.0] ×5.4 | 86.6 [33.6] ×4.3 | 71.6 [27.9] ×5.2 |
| F | 1088.1 [1068.0] | 340.9 [323.8] ×3.2 | 544.0 [497.0] ×2.0 | 109.8 [68.0] ×9.9 |
| G100 | 60.5 [39.7] | 36.0 [7.4] ×1.7 | 36.9 [6.6] ×1.6 | 34.5 [6.1] ×1.8 |
| G500 | 174.4 [156.4] | 65.8 [35.7] ×2.7 | 60.7 [29.1] ×2.9 | 67.4 [24.0] ×2.6 |
| G1000 | 326.3 [306.7] | 100.6 [71.8] ×3.2 | 91.4 [58.8] ×3.6 | 107.0 [59.1] ×3.1 |

### Breakdown (median ms; 1080p; selected scenes; all scenes and resolutions in `summary-t4.md`)

`resolve` = style + layout; `prep` = Blitz paint-command generation alone; `paint` = command
generation + Skia work on the canvas (CPU: rasterization; GPU: recording); `submit` = flush/snap +
submit; `wait` = GPU completion; `readback` = GPU→CPU; `buffer` = Node Buffer from the Vec;
`png` = PNG encoding only (separate frames).

| scene | backend | resolve | prep | paint | submit | wait | readback | buffer | total | png | first frame | create |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C | cpu | 0.14 | 0.33 | 248.4 | – | – | – | 4.39 | 253.0 | 691 | 253 | 4.9 |
| C | ganesh-gl | 0.07 | 0.27 | 3.6 | 1.6 | 0.5 | 1.9 | 4.39 | 12.1 | 689 | 41 | 64 |
| C | ganesh-vulkan | 0.09 | 0.26 | 3.0 | 0.8 | 1.4 | 1.8 | 4.12 | 11.4 | 700 | 55 | 210 |
| C | graphite | 0.10 | 0.27 | 1.4 | 0.9 | 3.4 | 2.0 | 4.33 | 12.4 | 603 | 51 | 276 |
| E | cpu | 0.08 | 0.41 | 163.5 | – | – | – | 4.19 | 167.9 | 463 | 180 | 4.8 |
| E | ganesh-gl | 0.07 | 0.36 | 17.5 | 8.0 | 0.4 | 1.9 | 4.48 | 32.4 | 493 | 97 | 70 |
| E | ganesh-vulkan | 0.07 | 0.42 | 13.6 | 3.9 | 3.5 | 1.8 | 4.26 | 27.3 | 499 | 144 | 225 |
| E | graphite | 0.07 | 0.39 | 9.1 | 5.9 | 13.3 | 1.9 | 4.38 | 35.5 | 477 | 136 | 260 |
| F | cpu | 0.03 | 0.31 | 323.8 | – | – | – | 4.26 | 328.2 | 173 | 334 | 5.2 |
| F | ganesh-gl | 0.03 | 0.35 | 60.8 | 18.3 | 3.1 | 1.9 | 4.49 | 88.3 | 117 | 139 | 69 |
| F | ganesh-vulkan | 0.03 | 0.30 | 51.7 | 16.8 | 13.7 | 5.5 | 4.13 | 91.5 | 108 | 174 | 205 |
| F | graphite | 0.03 | 0.16 | 4.8 | 4.7 | 13.4 | 2.1 | 4.48 | 30.1 | 96 | 56 | 259 |
| G1000 | cpu | 1.23 | 4.49 | 147.7 | – | – | – | 4.43 | 153.2 | 280 | 156 | 5.3 |
| G1000 | ganesh-gl | 1.16 | 4.41 | 15.6 | 54.0 | 0.1 | 1.9 | 4.54 | 76.9 | 269 | 132 | 69 |
| G1000 | ganesh-vulkan | 1.07 | 4.12 | 15.7 | 36.8 | 0.9 | 2.1 | 4.12 | 60.8 | 261 | 125 | 191 |
| G1000 | graphite | 0.94 | 4.15 | 16.7 | 13.6 | 20.0 | 2.2 | 4.38 | 58.4 | 251 | 165 | 275 |

Observations:

- Style/layout and Blitz command generation are small (≤1.3 ms and ≤4.5 ms even for 1000 layers)
  and identical across backends: the GPU removes rasterization, as intended.
- On Ganesh the remaining cost is **CPU-side Skia work**: recording and the flush (`submit`) that
  turns ops into API calls — path tessellation for F, 1000 layers for G1000 (54 ms GL, 37 ms
  Vulkan). The GPU itself is rarely the limit (`wait` small).
- Graphite records much faster (F: 4.8 vs 52–61 ms), has the cheapest flush for paths, and shifts
  time to `wait`; it is the best on F and D, the worst on B (text: 99 vs 28–30 ms at 1080p).
- **First frame** includes shader/pipeline compilation: E 97 ms (GL), 144 ms (Vulkan),
  136 ms (Graphite) vs 33/27/36 ms warm. Device creation: GL ~65 ms, Vulkan ~200 ms, Graphite
  ~260 ms (first renderer in the process; see Resource reuse for later ones).

## Animated workload

1080p (dpr 1.5), 30 fps, page contract `seek(ms)`; frame = seek (JS + animation update) +
render. Three scenes from `test/scenes`: CSS motion, GSAP timeline, CSS effects (image, gradients,
shadow, SVG).

| scene | frames | backend | avg | median | p95 | total s | fps | no-readback median | PNG encode median |
|---|---|---|---|---|---|---|---|---|---|
| effects | 120 | cpu | 35.3 | 35.2 | 39.6 | 6.75 | 17.8 | 29.4 | 110.4 |
| effects | 120 | ganesh-gl | 13.3 | 12.9 | 17.3 | 4.13 | 29.1 | 7.0 | 108.3 |
| effects | 120 | ganesh-vulkan | 12.8 | 11.5 | 17.9 | 4.02 | 29.8 | 6.3 | 110.7 |
| effects | 120 | graphite | 13.4 | 11.9 | 19.8 | 4.09 | 29.3 | 5.3 | 108.3 |
| effects | 300 | cpu | 34.7 | 34.1 | 38.6 | 16.69 | 18.0 | | |
| effects | 300 | ganesh-gl | 14.5 | 14.9 | 19.1 | 10.61 | 28.3 | | |
| effects | 300 | ganesh-vulkan | 14.4 | 14.9 | 19.1 | 10.59 | 28.3 | | |
| effects | 300 | graphite | 16.8 | 18.1 | 22.5 | 11.38 | 26.4 | | |
| css | 120 | cpu | 22.4 | 22.9 | 27.1 | 5.18 | 23.2 | 17.8 | 67.4 |
| css | 120 | ganesh-gl | 12.2 | 11.7 | 15.5 | 3.99 | 30.1 | 5.7 | 68.7 |
| css | 120 | ganesh-vulkan | 12.6 | 12.0 | 16.7 | 4.07 | 29.5 | 5.9 | 67.5 |
| css | 300 | cpu | 24.6 | 24.9 | 28.7 | 13.64 | 22.0 | | |
| css | 300 | ganesh-gl | 13.6 | 13.6 | 17.0 | 10.35 | 29.0 | | |
| gsap | 120 | cpu | 8.8 | 8.3 | 12.8 | 3.60 | 33.3 | 3.4 | 32.2 |
| gsap | 120 | ganesh-gl | 9.2 | 8.7 | 13.2 | 3.63 | 33.0 | 1.7 | 32.4 |
| gsap | 300 | cpu | 7.9 | 7.3 | 10.6 | 8.57 | 35.0 | | |
| gsap | 300 | ganesh-gl | 9.3 | 9.3 | 11.8 | 9.04 | 33.2 | | |

All rows (Graphite CSS/GSAP included): `summary-t4.md`. Sampled frames (first, middle, last)
are *minor* vs CPU for every backend. "total s" includes the sequence's first frames on a warm
renderer; fps is frames / total.

- GPU frames are 2–3× faster where paint matters (effects, CSS) and equal where it does not
  (GSAP: paint is ~2 ms; the frame is JS, readback and the Buffer copy).
- With PNG per frame, encoding (32–110 ms) dominates every backend: effects 141 → 120 ms total
  (1.2×). The GPU benefit needs a raw-RGBA output path (an encoder reading pixels directly).
- p95 is within 1.7× of the median for every backend (Ganesh ≤1.4×); no stalls over 300 frames.

## Readback analysis

> Is GPU→CPU readback the dominant bottleneck?

**No.** Measured per frame (median, T4):

| | 720p | 1080p | 4K |
|---|---|---|---|
| Ganesh GL readback | 0.8–1.0 ms | 1.9 ms | 6.5–7.4 ms |
| Ganesh Vulkan readback | 0.8–0.9 ms | 1.7–2.1 ms (5.5 F) | 8.7–23 ms |
| Graphite readback | 0.85–1.1 ms | 1.7–2.2 ms | 18–19.4 ms |
| Node Buffer copy (all backends) | 1.7–2.1 ms | 4.0–4.5 ms | 19–21 ms (one outlier 6.8) |
| PNG encode (all backends) | 14–330 ms | 28–700 ms | 104–2700 ms |
| GPU paint+submit+wait, heavy scenes | 3–70 ms | 5–75 ms | 14–520 ms |

- 4K GL reads 33 MB in ~7 ms (≈4.8 GB/s). Vulkan's synchronous path copies to a transfer buffer
  and then submits and waits a second time (Skia `GrVkGpu::onReadPixels`), which is why it varies
  with the frame's in-flight work. Graphite has no synchronous readback: rust-skia drives
  Skia's async readback with a blocking submit.
- For **trivial scenes** readback + Buffer copy *is* the whole GPU frame (A at 4K: 6.5 + 19.8 of
  26.9 ms) and the GPU is no faster than CPU. For everything else, paint dominates and the GPU wins.
- The larger fixed cost is canvas-html's own **`Buffer::from(self.buffer.clone())`** (a copy
  that both backends pay; 20 ms at 4K). Reading back directly into the Node Buffer (or handing
  the Vec over without copying) removes it — a CPU-path improvement too.
- Both Skia engines have real **async readback** (transfer buffers). Pipelining readback of frame
  N with paint of frame N+1 would hide most of the remaining readback; it needs a frame of latency
  in the API (not built).

## Resource reuse

1080p, median ms per frame (`contexts.mjs`):

| scene | backend | reuse renderer | new renderer per frame (own device) | new renderer, shared device |
|---|---|---|---|---|
| A | cpu | 6.4 | 16.0 | – |
| A | ganesh-gl | 6.7 | 25.4 (create 6.6) | 16.3 |
| A | ganesh-vulkan | 6.5 | 214.7 (create 146, close 43) | 15.8 |
| A | graphite | 6.9 | 257.3 (create 178, close 52) | 16.7 |
| E | cpu | 168.6 | 182.4 | – |
| E | ganesh-gl | 32.9 | 117.9 (render 97: shader warm-up) | 45.0 |
| E | ganesh-vulkan | 27.3 | 415.1 (create 199, close 69) | 37.6 |
| E | graphite | 35.7 | 393.0 (create 190, close 68) | 71.3 |

- **Device/context**: reuse. A Vulkan or Graphite device costs ~150–200 ms to create and
  40–70 ms to close; GL ~7 ms (after the first EGL display). A new device also recompiles shaders
  (E's first frame 97–141 ms vs 27–36 ms warm).
- **Surface**: cheap to create on a reused device (4–5 ms); per-renderer surfaces are fine.
- **Textures, glyph atlases, pipelines** live in the device's context: shared by renderers that
  share a device, and reused across frames (Skia's 256 MiB GPU resource budget per context).
- **Scene cache** (paints, fonts, image shaders and — on Graphite — uploaded image textures) is
  per renderer and reused across frames, as on CPU.

### Multi-renderer strategy (one thread, scene E 1080p, round-robin; `multi.mjs`)

| backend | device | renderers | create all ms | fps | GPU MiB (process) | Skia GPU cache MiB | close all ms |
|---|---|---|---|---|---|---|---|
| cpu | – | 1 / 8 | 9 / 67 | 5.9 / 5.7 | – | – | 1 / 8 |
| ganesh-gl | own | 1 / 8 | 131 / 168 | 32.2 / 29.3 | n/a | 144 / 1149 | 13 / 108 |
| ganesh-gl | shared | 1 / 8 | 109 / 158 | 31.8 / 31.3 | n/a | 144 / 199 | 13 / 26 |
| ganesh-vulkan | own | 1 / 8 | 236 / 968 | 37.3 / 35.0 | 161 / 1254 | 169 / 1348 | 86 / 612 |
| ganesh-vulkan | shared | 1 / 8 | 253 / 295 | 37.0 / 35.0 | 161 / 231 | 169 / 224 | 88 / 104 |
| graphite | own | 1 / 8 | 273 / 943 | 26.0 / 26.6 | 174 / 1359 | n/a | 72 / 438 |
| graphite | shared | 1 / 8 | 247 / 300 | 25.3 / 24.9 | 174 / 710 | n/a | 87 / 161 |

All configurations (1/2/4/8) in `summary-t4.md`; every process exited 0. On one thread there is
no contention to speak of (throughput is flat from 1 to 8 renderers). A shared device costs a
fraction of the GPU memory (Vulkan: 231 vs 1254 MiB for 8) and of the create/close time. GL
memory is not reported by `nvidia-smi --query-compute-apps` (graphics contexts are not listed).

**Recommended**: one device per thread (`"thread"`) when memory matters, one per renderer when
bit-exact output across documents matters (see Determinism) — or a shared device with
`_gpuFreeResources()`/`load()` between documents.

### Worker strategy (`workers.mjs`; effects scene, 1080p, 120 frames split into blocks)

| backend | 1 worker | 2 | 4 | 8 | device create median (1 → 8 workers) |
|---|---|---|---|---|---|
| cpu | 17.7 fps | 33.8 | 60.3 | 71.6 | – |
| ganesh-gl | 27.6 | 51.9 | **81.6** | 68.9 | 169 → 322 ms |
| ganesh-vulkan | 26.7 | 45.5 | 61.9 | 56.9 | 282 → 774 ms |
| graphite | 26.6 | 43.7 | 63.3 | 55.5 | 298 → 791 ms |

- **Can workers share a GPU device?** No. Skia's GPU contexts are single-threaded (not `Send`;
  Graphite's `Context`/`Recorder` likewise), and a GL context is current on one thread. Each
  worker owns its device; the driver shares the GPU underneath.
- **Driver/context creation** gets slower with concurrency (Vulkan 282 → 774 ms at 8 workers):
  create workers once and keep them.
- **Scaling** peaks at 4 GPU workers on this 8-vCPU VM; at 8, CPU-side Skia work and driver
  contention regress. GL scales best.
- **Shutdown**: every frame identical to the 1-worker run on every backend; `worker.terminate()`
  of two workers mid-render returns cleanly (exit code 1) and the process keeps rendering
  correctly; all processes exit 0.

## Memory

T4, scene C (images) at 1080p, each backend in its own process (`memory.mjs`): RSS MiB / GPU MiB
used by the process (`nvidia-smi`, Vulkan/Graphite only) / Skia GPU resource cache MiB.

| backend | device | baseline | GPU initialized | 1 renderer | 4 renderers | 8 renderers | after close |
|---|---|---|---|---|---|---|---|
| cpu | – | 62 | 64 | 118 | 245 | 411 | 411 |
| ganesh-gl | own | 62 | 157 | 245 / – / 97 | 424 / – / 389 | 654 / – / 777 | 646 |
| ganesh-gl | shared | 62 | 157 | 245 / – / 97 | 394 / – / 146 | 593 / – / 212 | 593 |
| ganesh-vulkan | own | 62 | 200 / 6 | 299 / 116 / 121 | 547 / 442 / 482 | 870 / 880 / 964 | 495 |
| ganesh-vulkan | shared | 62 | 200 / 6 | 299 / 116 / 121 | 424 / 177 / 170 | 582 / 259 / 235 | 459 |
| graphite | own | 62 | 201 / 17 | 286 / 255 | 498 / 1003 | 767 / 2003 | 493 |
| graphite | shared | 62 | 201 / 17 | 286 / 255 | 431 / 494 | 620 / 813 | 463 |

- **Per renderer** (own device): Ganesh Vulkan ~110 MiB of GPU memory (surface 8 MiB, the rest
  textures, atlases and pipelines in Skia's cache); Graphite ~250 MiB. The **driver** adds
  95–140 MiB of host RSS once per process.
- **Growth**: 300 animated frames on one renderer and 30 create/render/close cycles: flat on every
  backend (e.g. Vulkan 615→615 MiB, 520→519 MiB). No unbounded growth.
- **After close** RSS does not return to baseline (CPU too: 411 MiB): allocator and driver retention
  plus the Phase 3 findings below — bounded, not repeated per cycle.
- **Phase 3 findings preserved, not confused with GPU allocations**: Stylo's per-thread
  `BLOOM_KEY` + `SHARING_CACHE_KEY` (34.2 KiB per traversal thread) and Skia's glyph/typeface cache
  pinning font copies are CPU-side and identical on every backend; the GPU columns above are the
  device, surfaces and Skia's GPU cache.

## Determinism

1080p, same machine, same backend (`determinism.mjs`; final T4 run with the reload fix:
`results/colab-t4-fix/`):

| backend | 5 fresh instances (A–F, G1000) | 3 fresh processes | long-lived, same document ×20 | long-lived, reloaded ×15 | animation replay |
|---|---|---|---|---|---|
| cpu | identical | identical | identical | identical | identical |
| ganesh-gl | identical | identical | identical | identical | identical |
| ganesh-vulkan | identical | identical | identical | identical | identical |
| graphite | identical | identical | **20 distinct hashes for B** (max 2 levels, 0.06 %) | near-exact (max 2) | identical |

- **Found and fixed**: on the first T4 run (and on Mesa) a long-lived Ganesh renderer that
  reloaded documents drifted slightly on scene B (max 2 levels on the T4, 17 on llvmpipe). Cause,
  traced in the Skia sources and confirmed by experiment: glyphs above the atlas limit (~254 device
  px) are drawn as GPU paths, and the context caches path geometry (triangulations reused within a
  tolerance), so a document's pixels depended on what the context drew before. Atlas glyphs were
  never affected; disabling the atlas/tessellation/MSAA/SDF path renderers did not help;
  `freeGpuResources()` did. A Ganesh renderer now frees its purgeable GPU resources on `load()`:
  reloads are bit-exact on the T4 (`colab-t4-fix`).
- **Shared devices**: renderers sharing a device share those caches, so the same tiny drift can
  appear between documents of different renderers. Bit-exact output: one device per renderer, or
  free resources between documents.
- **Graphite** is not bit-stable frame to frame on text-heavy scenes (≤2 levels). rust-skia binds no
  Graphite `freeGpuResources`; not investigated further since Graphite is not carried forward.
- **GSAP replay**: on every backend, and on the unchanged production build through `render()`,
  the first play of `test/scenes/gsap.html` differs from later replays for its first second
  (GSAP seek semantics after a backwards seek). Replays are identical. Not GPU-related.
- **Cross-GPU** determinism is not claimed: GPU pixels differ from CPU (minor/edge-aa) and will
  differ between GPU vendors and drivers. llvmpipe and the T4 agree closely but not exactly.

## Font/typeface retention follow-up

Scene B (Inter via `@font-face`), 40 iterations, own process per backend (`fonts.mjs`):

| backend | 40 × new renderer (RSS every 10) | 1 renderer, 40 loads | Skia font cache |
|---|---|---|---|
| cpu | 64→91→91→91→92 | 64→104→106→106→106 | 1.4 MiB |
| ganesh-gl | 64→295→311→311→312 | 64→261→264→264→264 | 1.4 MiB |
| ganesh-vulkan | 64→173→173→173→173 | 64→295→298→298→298 | 1.4 MiB |
| graphite | 64→182→182→183→183 | 64→284→287→287→287 | 1.4 MiB |

- **GPU mode does not worsen font retention**: after warm-up RSS is flat on every backend; the
  GPU offset is the driver and device. Glyph atlases live in the GPU context and are freed with it.
- Purging Skia's font cache (`_purgeSkiaFontCache`) releases little (≤5 MiB); the Phase 3 issue
  (each renderer/document creating its own typefaces from the same bytes) remains a CPU-side
  cleanup: a shared, content-addressed typeface cache. **Recommended as a separate task**, not
  entangled with the GPU work; no fix was prototyped.

## Fallback and failure behavior

Each probe in its own process (`failures.mjs`); every process exited 0 and could render
afterwards.

| case | Ganesh GL | Ganesh Vulkan | Graphite |
|---|---|---|---|
| GPU unavailable / driver init fails (`CANVAS_HTML_GPU_DEVICE=99`) | throws "GPU initialization failed (ganesh-gl): EGL device 99 does not exist"; CPU renderer works | same (Vulkan) | same |
| unsupported backend (`gpu-metal`), bad share option | throws, names the problem | | |
| surface creation failure (70000×16) | throws "GPU surface … could not be created"; next GPU renderer works | same | same |
| device lost (Skia `abandon`) | render and no-readback render throw "GPU context is lost"; a renderer sharing the device throws too; `close()` works; a new renderer gets a new device and identical pixels | same | not simulable (no abandon in Graphite) |
| use after close | "renderer is closed"; close is idempotent | same | same |
| no `close()`: GC finalizers, process exit with live renderers | clean | clean | clean |
| out of memory (8192² surfaces on one device) | 64 created, no failure (driver pages) | clean error at #59 "GPU out of memory"; recovers | surface creation fails at #59; recovers |
| readback failure | reported as "GPU readback failed" (not provokable separately; covered by device loss) | | |

**Policy for production**: GPU is opt-in per renderer; a GPU failure throws a clear error naming
the backend; the caller decides whether to create a CPU renderer instead. No silent fallback
(benchmarks require that; production may add an explicit `fallback: "cpu"` option later). GL OOM
is not detectable (the driver pages to system memory); Vulkan reports it.

## Build/distribution

| build | binary | Skia binary (prebuilt, downloaded) |
|---|---|---|
| production (before) | 40,574,984 B | `ganesh-gl-jpegd-jpege-pdf` |
| production (after; default features) | 40,676,104 B | same |
| `experimental-gpu` (Ganesh GL) | 43,369,120 B (+6.6 %) | same |
| `experimental-gpu-vulkan` | 44,089,512 B (+8.4 %) | `ganesh-gl-jpegd-jpege-pdf-vulkan` |
| `experimental-graphite` | 42,390,552 B (+4.2 %) | `graphite-jpegd-jpege-pdf-vulkan` |

- **No new crates** (`Cargo.lock` unchanged: ash, glutin, gl were already dependencies of
  anyrender_skia's window renderer) and **no new link-time libraries** (`ldd` unchanged). `libEGL.so.1`
  (glvnd) and `libvulkan.so.1` are loaded at runtime, only when a GPU backend is requested; a GPU
  build loads and renders on CPU on machines without them.
- The Skia **binary** is the one cost: GL comes free with production's binary; Vulkan needs the
  `-vulkan` prebuilt; Graphite needs a different binary without Ganesh/GL. rust-skia publishes
  these; a from-source Skia build was not needed.
- **Runtime requirements** (NVIDIA): the driver's EGL library plus a glvnd vendor file
  (`10_nvidia.json`) for GL; the Vulkan loader plus the NVIDIA ICD manifest for Vulkan. The Colab
  image had the driver libraries but **neither manifest** (`colab/vm-setup.sh` writes them). In
  containers this means the graphics driver capability (e.g. `NVIDIA_DRIVER_CAPABILITIES`
  including `graphics`), not just compute. Device selection: `CANVAS_HTML_GPU_DEVICE`; hardware
  devices are preferred over software ones and the choice is reported.
- **CI**: Mesa llvmpipe/lavapipe run the whole suite without a GPU (that is how this phase was
  validated before any GPU time); performance needs a GPU runner. glibc ≥ 2.35 for the prebuilt
  addon (as before).
- **Clean build**: unchanged for production; GPU builds download one more Skia archive.

## Existing-test preservation

Run before and after with Node 24.19.0 (`experiments/phase4a/evidence/prod-tests-*.txt`):
smoke (core rendering), smoke-js (JavaScript), smoke-waapi, smoke-fonts, workers (CSS motion, GSAP,
Motion library): all pass, unchanged assertions. Phase 3 suites after: contract 30/30 on both
engines with identical results, GSAP and Motion probes as in Phase 3, lifecycle matrix (cycles,
long, simultaneous, workers, exit modes) all exit 0 (`evidence/phase3-suites-after/`).
**CPU path unchanged**: 39 frames (scenes A–G at 720p/1080p and every `test/scenes` page at 0, 500
and 1500 ms) rendered through the production `render()` with the pre-Phase-4A addon and with the
new default, Ganesh and Graphite builds: bit-identical (`evidence/cpu-unchanged*.json`).

## Remaining blockers

| # | blocker | severity | effort | architectural risk |
|---|---|---|---|---|
| 1 | Output path: Node Buffer copy (20 ms at 4K) and PNG encoding dominate end-to-end time; GPU gains need raw RGBA into an encoder, ideally zero-copy and pipelined | high | low (copy) – medium (pipelined async readback) | low |
| 2 | Deployment: GPU drivers, glvnd/ICD manifests and container capabilities in the target environment; no hardware GPU in current CI | high | medium | low |
| 3 | Cold start: device ~65–260 ms, shader compilation ~70–100 ms on first frames; needs long-lived workers (and possibly Skia's persistent shader cache) | medium | low–medium | low |
| 4 | Worker scaling beyond 4 GPU workers regresses (CPU-side Skia work + driver contention on 8 vCPU) | medium | medium | low |
| 5 | Shared devices allow tiny cross-document drift (path glyphs); bit-exact needs own devices or purges | low | low | low |
| 6 | GL out-of-memory is invisible (driver pages); prefer Vulkan where OOM must be reported | low | low | low |
| 7 | Graphite: separate Skia binary, ImageProvider unbound in rust-skia, frame-to-frame drift, no cache statistics or abandon, slow text | low now (not carried) | high | medium |
| 8 | Font/typeface retention (Phase 3), unrelated to GPU | low | medium | low |

## Recommendation

> Should canvas-html keep a GPU-backed Skia renderer path?

**Yes**, as an experimental, opt-in backend. It reuses the entire pipeline, is visually
equivalent, and is 3–22× faster on paint-heavy frames and 2–3× on realistic animated sequences per
renderer.

> Should CPU Skia remain the default/fallback?

**Yes.** CPU is deterministic across machines, needs no drivers, scales across CPU workers
(71.6 fps on 8 vCPU vs 81.6 for the best GPU configuration on the effects scene) and wins on
trivial scenes. GPU failures throw; the caller chooses CPU.

> Which Skia GPU architecture should be carried into the next experiment: Ganesh, Graphite, or
> neither?

**Ganesh** — on Vulkan as the primary path (fastest at 720p/1080p, reports OOM, the API a future
WebGPU stack would share), with GL via EGL kept as the cheap-to-create alternative (fast device
creation, best worker scaling and 4K readback on NVIDIA). Graphite stays a watched option: it is
markedly better on paths and gradients and may become the right engine once rust-skia ships a
Ganesh+Graphite binary, binds `ImageProvider`, and exposes Graphite's cache controls.

> Is the project ready for a separate Phase 4B evaluating a user-facing WebGPU architecture?

**Yes**, with two prerequisites carried from this phase: a raw-RGBA/zero-copy output path (so
GPU work is not hidden behind a Buffer copy and PNG), and the deployment story (drivers and
manifests in the target environment). The renderer ownership model (device per worker, shared
per thread when memory matters, reuse across frames) is established and measured.

> Did the experiment reveal whether Dawn or wgpu deserves priority in Phase 4B, or is more
> evidence needed?

**More evidence is needed.** What this phase established: (1) rust-skia ships no Dawn backend,
so sharing a device between Skia and a Dawn-based WebGPU would require building Skia (Graphite on
Dawn) from source; (2) canvas-html now creates its own Vulkan instance/device and hands it to
Skia (Ganesh and Graphite), which is exactly the hook needed to share a `VkDevice` with wgpu
(wgpu-hal can wrap an existing Vulkan device) — so **wgpu + Skia Ganesh/Graphite on one Vulkan
device** is the lower-friction path to test first; (3) Graphite-on-Dawn remains the "one GPU API
for both" option, at the cost of a custom Skia build. Phase 4B should test texture sharing in both
directions before choosing.

## Phase 4A acceptance checklist

| criterion | status |
|---|---|
| 1. Existing paint semantics work on a GPU-backed Skia surface | yes (Ganesh unchanged; Graphite needed image upload) |
| 2. No JS/DOM/layout architectural changes | yes |
| 3. Production CPU tests green | yes; CPU pixels bit-identical |
| 4. GPU output visually equivalent to CPU | yes: minor/edge-aa only, cause attributed per scene |
| 5. GPU paint materially faster on realistic paint-heavy workloads | yes: 3–22× (1080p/4K), 2–3× animated |
| 6. Readback cost measured and understood | yes: not dominant; Buffer copy and PNG are larger |
| 7. Ownership stable across repeated renders | yes: deterministic incl. reloads (after fix) |
| 8. Multi-renderer and worker behavior understood | yes: device per worker; shared per thread; peak at 4 workers |
| 9. No serious unbounded resource growth | yes: flat over 300 frames and 30 cycles |
| 10. Build/distribution implications documented | yes |

Scope guardrails held: no WebGPU API, wgpu, Dawn, Three.js, GSS, CAD, video encoder, compositor
redesign, DOM/layout/scripting changes, Boa removal or Deno default switch.

## Reproduce

```sh
cd canvas-html
cargo build --release --features experimental-gpu-vulkan
cp target/release/libcanvas_html.so experiments/phase4a/build/canvas-html-gpu.node
cargo build --release --no-default-features --features experimental-graphite
cp target/release/libcanvas_html.so experiments/phase4a/build/canvas-html-graphite.node
cd experiments/phase4a
PHASE4A_TAG=mine PHASE4A_REQUIRE_HW=1 node run-all.mjs
CANVAS_HTML_NODE=build/canvas-html-graphite.node PHASE4A_BACKENDS=cpu,gpu-graphite PHASE4A_TAG=mine-graphite node run-all.mjs
node summarize.mjs mine mine-graphite
```

The T4 runs used `experiments/phase4a/colab/` (bundle, VM setup, blocking runner) over the Colab
CLI. Total GPU time: ~1.4 compute units.
