# canvas-html Phase 4A.1 — raw-frame output pipeline

Canonical numbers: Colab **Tesla T4** (driver 580.82.07, Xeon 2.0 GHz × 8, Node 24.19.0), the
same VM type as Phase 4A, so the tables compare directly. Validation: Colab **L4** (smaller GPU
matrix, same driver). Development and the ownership, memory and failure probes: a 4-vCPU
container with Mesa (llvmpipe / lavapipe). Skia m153 (skia-safe 0.153.3), napi-rs 3.14.1.

Data: `experiments/phase4a1/results/{colab-t4,colab-l4}/` (JSON, logs, `summary.md`), evidence in
`experiments/phase4a1/evidence/`, harness in `experiments/phase4a1/`, the old path mapped in
`experiments/phase4a1/OUTPUT_PIPELINE.md`.

## Decision

**CONDITIONAL GO** for the improved raw-frame transport.

- **GO — reduced-copy `render()` (Design A, now the internal path).** The full-frame clone is
  gone. The frame Vec is handed to Node as the Buffer's memory. `render()` keeps its synchronous
  signature and return type. On the T4 it is as fast as the old path or faster: −12 to −20 % at
  4K on GPU, −25 % at 4K on CPU (scene A), and +8–11 % fps in animated GPU sequences.
- **GO as an experimental API — render into a caller-owned buffer (Design C,
  `_renderInto(buf)`).** This is the real win: no allocation and no copy in canvas-html, and no
  dependence on V8 finalization. On the T4, 4K raw output is 3–4× faster on GPU and CPU.
  Animated sequences run 1.2–2.3× faster, with a flat memory profile. It is also the only path
  that moves frames between threads without a copy.
- **NOT WORTH ADOPTING YET — async / pipelined readback.** Both prototypes work and keep frame
  order. The best case is GL pixel-pack buffers (PBOs) with fences at depth 2: +18–19 % fps at 4K
  on the T4 and +8 % on the L4. Every other configuration gains 2–12 %. Each step
  of depth adds about 10–13 ms of latency at 4K, the GL path bypasses Skia with raw GL calls, and
  rust-skia does not bind Skia's native async readback. Rejected for now, with the data below.
- **Design B (pool): rejected.** It only reuses frames when the event loop gives finalizers a
  turn (0 % reuse in tight loops, 15–63 % with turns), and then the system allocator already
  reuses that memory.

Why conditional, not strong: async pipelining is not adopted (the brief's own CONDITIONAL
criterion). Also, the biggest gain needs a new API (`renderInto`), which is still experimental
here.

## Old output path

```text
render()  frame JS → resolve → paint(true)
  CPU:  Skia raster INTO self.buffer          (renderer-owned scratch Vec, reused every frame)
  GPU:  paint → submit → wait → read_pixels INTO self.buffer
  Buffer::from(self.buffer.clone())           ← COPY: full frame, into a freshly allocated Vec
  napi_create_external_buffer(adopts the clone; drop_buffer frees it when V8 collects the Buffer)
```

The cost of that clone on the T4 (`copy` column; fresh pages + memcpy): 1.7–2.0 ms at 720p,
3.8–4.4 ms at 1080p, 19.3–20.9 ms at 4K, the same on all three backends.

## New output path

```text
                Design A: render()                                  Design C: _renderInto(buf)
  frame = scratch Vec (if the size fits) or alloc_frame()      JS owns buf (Buffer, Uint8Array,
          (fallible alloc_zeroed: OOM → JS Error)              ArrayBuffer/SharedArrayBuffer view)
        ↓                                                           ↓
  Skia raster / GPU read_pixels INTO frame                     length checked (== w·h·4)
        ↓                                                           ↓
  BufferSlice::from_data(env, frame)                           Skia raster / GPU read_pixels
    = napi_create_external_buffer, Vec adopted, no copy          straight INTO buf's bytes
        ↓                                                           ↓
  Node Buffer (external memory)                                returns timings; buf is the frame
        ↓
  V8 collects it → napi-rs finalizer drop_buffer → Rust frees the Vec
  (on the JS thread that created it; touches no renderer state)
```

Who frees what:

| allocation | owner | freed by |
|---|---|---|
| frame returned by `render()` | the Node Buffer (napi external memory) | napi-rs finalizer → Rust `Vec` drop, when V8 collects the Buffer |
| `_renderInto` target | the caller (JS) | V8, like any Buffer/ArrayBuffer |
| PNG bytes (`format: 'png'`) | the Node Buffer | napi-rs finalizer (unchanged; raw pixels are encoded from the scratch frame, not cloned) |
| scratch frame | renderer | reused for PNG; handed off on the next RGBA render; dropped by `close()` |
| pool frames (Design B, experimental) | `Arc<FramePool>`, shared by the renderer and every pooled Buffer's finalizer | finalizer returns the frame to the pool or frees it; the pool outlives `close()` until the last Buffer is gone |
| GPU surfaces, pipeline ring, PBOs | renderer (GPU device) | `_pipelineStop()` / `close()` (waits for the GPU first) |

With `CANVAS_HTML_OUTPUT=clone`, `render()` uses the old clone path (Phase 4A behaviour, kept for
comparison). Runtimes without external buffers (Electron with the V8 memory sandbox, some wasm
targets) make napi-rs fall back to `napi_create_buffer_copy`. That is one copy there, with the
same result and safety. Not optimized in this phase.

## Copy count

Full-frame CPU copies made by canvas-html per RGBA frame:

| path | CPU | Ganesh GL | Ganesh Vulkan |
|---|---|---|---|
| old `render()` | 1 (clone) | 1 (clone) | 1 (clone) |
| new `render()` (Design A) | **0** | **0** | **0** |
| `_renderInto(buf)` (Design C) | **0** | **0** | **0** |
| Electron / no external buffers | +1 (napi-rs fallback) | +1 | +1 |

The GPU→CPU transfer itself is unchanged: `glReadPixels` into the target (GL). On Vulkan, the
GPU writes into a transfer buffer and Skia copies it into the target. Removing that last copy
needs Skia's async readback (unbound in rust-skia 0.153.3).

**The copy was not the main cost.** Writing a frame into memory that was just allocated costs
about as much as the copy did: page faults and zeroing. At 4K the GPU readback takes 21.6 ms into
a fresh frame against 7.2 ms into a reused one (T4 GL). So Design A moves most of the clone's
cost into the readback or raster. Design C removes it, because the caller reuses warm memory.

## Performance (T4, scene A = output-dominated; median ms per frame)

`render`/`readback` = Skia raster (CPU) or GPU readback; `copy` = clone (old) / `alloc` (new);
`total` = wall time around the JS call. Old = Phase 4A addon (`build/phase4a-*.node`).

| backend | res | old render() | new render() | `_renderInto` | old: raster/readback + copy | new: raster/readback (fresh memory) | into: raster/readback (warm) |
|---|---|---|---|---|---|---|---|
| CPU | 720p | 2.79 | 2.39 | **0.87** | 0.91 + 1.83 | 2.33 | 0.84 |
| CPU | 1080p | 5.98 | 5.27 | **1.86** | 1.88 + 4.04 | 5.20 | 1.83 |
| CPU | 4K | 31.96 | 23.95 | **9.63** | 11.57 + 19.81 | 23.18 | 9.54 |
| Ganesh GL | 720p | 3.26 | 2.88 | **1.26** | 0.89 + 2.01 | 2.50 | 0.94 |
| Ganesh GL | 1080p | 7.28 | 5.86 | **2.19** | 1.86 + 4.35 | 5.78 | 1.84 |
| Ganesh GL | 4K | 26.56 | 23.26 | **7.39** | 6.81 + 19.94 | 21.58 | 7.06 |
| Ganesh Vulkan | 720p | 3.02 | 2.83 | **1.20** | 0.85 + 1.72 | 2.38 | 0.85 |
| Ganesh Vulkan | 1080p | 6.38 | 5.71 | **2.13** | 1.74 + 4.17 | 5.20 | 1.75 |
| Ganesh Vulkan | 4K | 29.20 | 14.36¹ | **9.22** | 8.38 + 19.33 | 22.69 | 8.83 |

¹ The `_renderTimed({output:'transfer'})` row of the same path measured 23.52 ms. Allocator state
varies between processes; take about 23 ms. GPU record + submit + wait add only 0.3–0.5 ms for
scene A.

Heavier scenes (T4, 4K, wall ms; the old → new render() / `_renderInto`):

| scene | CPU | Ganesh GL | Ganesh Vulkan |
|---|---|---|---|
| C (gradients/shadows) | 1006 → 960 / 945 | 42.5 → 27.0 / **21.5** | 42.1 → 26.3 / **21.6** |
| E (effects) | 371 → 357 / 349 | 69.9 → 57.3 / **50.8** | 84.9 → 74.4 / **69.5** |
| F (text) | 1099 → 1076 / 1075 | 351 → 337 / 307 | 543 → 537 / 532 |
| G1000 (1000 elements) | 312 → 301 / 301 | 97.1 → 83.4 / 76.9 | 91.8 → 72.2 / 75.1 |

Where painting dominates (CPU C/E/F, GPU F), output transport is a few percent of the frame. All
720p/1080p rows are in `results/colab-t4/summary.md`. The L4 shows the same pattern: 4K scene A
GL 27.9 → 23.2 / 8.0 ms, Vulkan 30.0 → 23.7 / 9.4 ms.

Separately instrumented (`_renderTimed` timings): frame JS, resolve, paint/record, GPU submit,
GPU wait, readback, frame allocation, copy, N-API Buffer creation (`buffer`: 0.01–0.03 ms at
≤1080p, 0.4–0.6 ms at 4K), total.

## Animated sequences (1080p, 30 fps timeline, page `seek(t)` + output per frame)

T4, fps over the whole sequence (tight loop, no event-loop turns):

| scene | frames | CPU old → new → into | GL old → new → into | Vulkan old → new → into |
|---|---|---|---|---|
| effects | 120 | 28.0 → 30.0 → **33.9** | 86.7 → 96.3 → **149.9** | 92.0 → 100.5 → **159.9** |
| effects | 300 | 29.0 → 30.0 → **33.7** | 88.0 → 96.5 → **152.7** | 91.8 → 101.4 → **152.7** |
| css | 120 | 44.7 → 45.5 → **56.7** | 86.7 → 96.4 → **151.0** | 92.2 → 100.2 → **147.9** |
| css | 300 | 41.6 → 43.0 → **50.4** | 89.6 → 95.2 → **155.6** | 91.8 → 102.0 → **158.8** |
| gsap | 120 | 122.5 → 127.5 → **249.0** | 114.7 → 125.6 → **245.9** | 122.7 → 134.2 → **251.0** |
| gsap | 300 | 133.8 → 143.5 → **305.2** | 127.7 → 138.4 → **293.3** | 131.6 → 144.2 → **306.9** |

- With an event-loop turn after every frame (effects, 300), GL goes 110.4 → 114.8 → 150.4 fps
  and Vulkan 119.6 → 116.2 → 155.9. Turns help `render()` because finalizers free the old frames,
  so the allocator reuses warm memory. `_renderInto` does not need them.
- Peak RSS over 300 frames without turns: about 2.4–2.6 GB for both render() paths (finalizers
  are deferred, see Memory), against 120–300 MB for `_renderInto`.
- L4 (effects 120): GL 81.6 → 87.5 → 137.9 fps, Vulkan 81.2 → 93.0 → 135.5.

## Async readback

Experimental APIs: `_renderFramesExperimental(times, targets, {mode, depth})` drives a sequence
natively. For every timestamp it calls the page's real `seek(t)` (or the frozen clock), then
renders. There are no Node round-trips between stages. Lower-level calls:
`_pipelineStart/Submit/Complete/Stop`. Two prototypes, no Skia rebuild:

- **deferred** (GL and Vulkan): a ring of `depth` GPU surfaces. Frame N is submitted without
  waiting, and read back synchronously after frames N+1… have been recorded. This is the
  "two-surface" approach.
- **pbo** (GL only): right after the submit, `glReadPixels` into a pixel-pack buffer plus a
  `glFenceSync`. Completion waits on the fence, then maps the buffer and copies it out. This is
  raw GL on Skia's context; Skia's GL state is reset afterwards.

Upper bound first, from the sync baseline without the clone: GPU wait + readback is 35 %
(1080p) to 56–66 % (4K) of the frame. That is the most overlap could save.

T4, 120 frames, fps (effects / css):

| backend | res | sync | deferred d1 | d2 | d3 | d4 | pbo d1 | d2 | d3 | d4 |
|---|---|---|---|---|---|---|---|---|---|---|
| GL | 1080p | 149 / 155 | 160 / 162 | 158 / 158 | 155 / 154 | 147 / 132 | 158 / 160 | 161 / 163 | 163 / 162 | 164 / 156 |
| GL | 4K | 66.8 / 74.3 | 71.2 / 77.0 | 71.2 / 75.9 | 71.5 / 74.9 | 70.8 / 77.5 | 64.0 / 77.0 | **79.0 / 88.1** | 79.6 / 88.3 | 80.2 / 87.0 |
| Vulkan | 1080p | 142 / 138 | 153 / 150 | 155 / 152 | 158 / 154 | 130 / 132 | – | – | – | – |
| Vulkan | 4K | 65.7 / 69.4 | 68.6 / 71.8 | 71.5 / 70.1 | 64.8 / 71.4 | 67.0 / 68.1 | – | – | – | – |

| question | answer |
|---|---|
| works? | Yes. Every mode and depth gives frames in order and byte-identical to sequential `render()`: 30-frame check on T4 and L4, 12-frame check on Mesa (`evidence/pipeline-failures-mesa.txt`). |
| depth | 1–8 supported; 2 is enough (PBO at 4K: d2 ≈ d3 ≈ d4). |
| throughput | Best: GL PBO d2 at 4K, +18 % (effects) and +19 % (css) on the T4, +8 % on the L4 (65.2 → 70.4). GL deferred and 1080p: +2–10 %. Vulkan deferred: +3–12 % on the T4, +5–6 % on the L4; deeper rings are often slower (d4). The overlap is real (GPU wait goes to ~0), but readback stays on the critical path: map + copy of a 4K PBO is still 6.3 ms, and Vulkan's synchronous `read_pixels` stays 8.9 ms. |
| latency | Submit → pixels in memory grows by about one frame per depth step: 4K effects GL PBO 10 / 21 / 34 / 46 ms at d1–d4; Vulkan 12 / 25 / 41 / 54 ms. |
| memory | The ring of surfaces or PBOs: +33 MB per 4K frame in flight (RSS 409 → 546 MB for PBO d4). Bounded by `depth`; a full pipeline rejects new submits. |
| failure behaviour | Submit when full: error "pipeline full (N frames in flight)". `close()` with frames in flight waits for the GPU, discards them and frees the ring. Device loss while in flight: completion and later submits throw "GPU context is lost (abandoned)". No crash, no stale pixels (Mesa GL and Vulkan). |
| GPU utilization | Not captured. The batch call blocks Node's event loop, so the `nvidia-smi` sampler's output was not read until after the call. Harness limitation; the fps and stage timings above stand. |

Verdict: not worth adopting yet. It is a moderate gain in one configuration (GL, 4K), with
latency and complexity costs: raw GL beside Skia, and GL only. `_renderInto` alone gives 3× at 4K.
Revisit if rust-skia binds `asyncRescaleAndReadPixels` (native Vulkan + GL async readback into
mapped transfer buffers), or if a consumer can work on mapped memory directly, such as an encoder
or a GPU texture handoff.

## Ownership / lifetime

| question | answer (all backends, T4 + local; `lifetimes.json`) |
|---|---|
| Can old Buffers outlive the renderer? | **Yes.** A frame is byte-identical after 10 more renders, after `close()`, and after the renderer was garbage-collected. A pooled frame too. |
| Can the renderer close with Buffers alive? | **Yes.** `close()` drops only renderer state (scratch frame, document, GPU device). Frame memory belongs to the Buffers. Pooled Buffers finalized after `close()` + GC return frames to the `Arc` pool, which then frees itself. No crash, no use-after-free. |
| Can in-flight async frames be cancelled or drained? | **Yes.** Drain: `_pipelineComplete` in order (the batch API always drains). Cancel: `_pipelineStop()` or `close()`, which waits for the GPU and then discards. After device loss, completion errors and the frames are dropped. |
| Who owns every allocation? | See the table under "New output path". The renderer never keeps a pointer to memory handed to Node. `_renderInto` borrows the caller's buffer only for the synchronous call. |

Also verified:
- 200 retained 1080p frames stay intact; native in-use goes back to its baseline after they are
  dropped.
- `_renderInto` rejects a buffer that is too small or too large, a detached view (0 bytes), a
  closed renderer, and a non-object (`42`), each with a clear error. It accepts Uint8Array and
  ArrayBuffer/SharedArrayBuffer views. Any other typed-array view of exactly the frame's byte
  length (for example a Float32Array) is accepted and written as raw bytes. That is memory-safe
  because the length is checked in bytes; a public `renderInto` should accept only
  Uint8Array / Uint8ClampedArray / Buffer.
- Frame sizes are validated (1..=32767 px per side, checked multiplication), so a huge or
  infinite DPR is rejected at construction.
- Memory pressure: under a 5 GiB address-space limit, 4K frames are retained until allocation
  fails. Frame 118 throws "could not allocate a 31 MiB frame" (fallible allocation, no abort);
  after the frames are released, rendering works again.
- CPU output is byte-identical to Phase 4A: 39/39 frames, production `render()`
  (`evidence/cpu-unchanged-default-build.json`).
- GPU correctness subset on the T4 with the new build: 54/54 hashes identical to Phase 4A's T4 run
  with the reload fix (`evidence/correctness-t4-vs-phase4a.txt`). The 2 hashes that differ from
  Phase 4A's first run are the scene-B reload drift that Phase 4A fixed.

## Memory (T4; RSS / Node `external` / native in-use, MiB)

| case | old render() | new render() | `_renderInto` |
|---|---|---|---|
| 100 × 4K retained (expected 3164) | 3269 / 3166 | 3237 / 3166 / 3168 | n/a (one buffer) |
| … dropped + GC (CPU) | 105 | 73 | – |
| 300 × 4K, tight loop, at frame 300 (CPU) | 9597 | 9566 | **105** |
| … after turns + GC (CPU) | 9281² | 74 | 105 |
| 300 × 4K with a turn every 10 frames (CPU) | 421–516 | 390–485 | 105 |
| 300 × 4K tight, GL | 9697 | 9665 (native back to 42 after turns) | **203** |

- **No leak**, and nothing new: growth in a tight loop is Node deferring external-buffer
  finalizers until the event loop turns. This is identical for the old and new paths, and Node
  already counts the memory in `external`. `_renderInto` is flat.
- ² **Allocator retention**: after frames are freed, glibc may keep the pages (RSS stays high
  while native in-use is back to baseline). 4K frames (31.6 MiB) sit just under glibc's dynamic
  mmap threshold maximum (32 MiB), so after the first free they come from the heap. Whether the
  heap shrinks depends on fragmentation. On GPU backends the drivers' allocations keep it from
  shrinking (RSS 3334 MiB after dropping 100 frames, native 42 MiB).
  - Fix candidates for production: allocate frames with `mmap`, or set `M_MMAP_THRESHOLD`, so
    freed frames go back to the OS at once. Or use `_renderInto`.
- **Buffer pool steady state** (Design B, `maxFree` 3):
  - Tight loop: 0 reuses. Every finalizer is deferred, so the pool never sees a frame back.
  - A turn every frame: 63 % reuse at 4K, 33 % at 1080p and 15 % at 720p. Finalizers arrive in
    bursts, and anything beyond `maxFree` is freed.
  - Speed is the same as `render()` with turns.
  - Rejected.

## Workers (effects 1080p, 60 frames, every frame delivered to the parent; T4)

| delivery | semantics (`evidence/postmessage-local.jsonl`) | CPU fps 1 / 2 / 4 workers | GL | Vulkan |
|---|---|---|---|---|
| `postMessage(frame)` (render() Buffer) | **copied** (structured clone, ~5 ms per 1080p frame) | 25 / 49 / 79 | 57 / 84 / 75 | 46 / 56 / 52 |
| `postMessage(frame, [frame.buffer])` | **rejected**: `DataCloneError` (Node cannot transfer external memory). Same on the Phase 4A addon. | – | – | – |
| `_renderInto` a worker-owned ArrayBuffer, then transfer it | **zero-copy** (0.07 ms; the worker's view is detached) | 28 / 51 / 85 | 72 / **102** / 78 | 61 / **65** / 52 |
| `_renderInto` a parent-owned SharedArrayBuffer slot | **zero-copy** (0.03 ms) | 29 / 53 / 67 | 74 / 82 / 63 | 56 / 65 / 58 |

- Every frame matches the single-thread reference: 0 mismatches and 0 missing, on all backends,
  T4 and L4.
- All workers exit with 0. Frames stay readable after the workers exited.
- External frames are freed on the thread that created them (Node's rule for finalizers).
- On the GPU, 4 workers (4 devices on one GPU) scale worse than 2. That is GPU contention, not
  transport.
- Electron's memory sandbox would turn the `render()` path into a copy (see above);
  `_renderInto` into Node-allocated memory is unaffected.

## Remaining blockers

| # | blocker | severity | effort | architectural risk |
|---|---|---|---|---|
| 1 | The biggest gain needs a public `renderInto(buf)` (or a frame-ring API); `_renderInto` is private and experimental, and accepts any typed array of the right byte length (should be limited to byte arrays) | medium | low | low |
| 2 | Tight `render()` loops retain every frame until the event loop turns (Node behaviour, pre-existing); document it, or steer bulk users to `renderInto` | medium | low | low |
| 3 | glibc keeps freed 4K frames (RSS stays high, worse beside GPU drivers); mmap-backed frames or `M_MMAP_THRESHOLD` | medium | low | low |
| 4 | Readback into fresh memory is slow (page faults): `render()` cannot reach `_renderInto` speed without reusing memory, which V8's deferred finalization prevents in tight loops | low | – | – |
| 5 | Async readback: no rust-skia binding for Skia's async readback; the GL PBO prototype is raw GL beside Skia; Vulkan has no real async path without a Skia binding or a custom transfer engine | low (rejected for now) | high | medium |
| 6 | Electron / V8 sandbox: `render()` falls back to a copy (napi-rs); not optimized | low | medium | low |
| 7 | GPU utilization not sampled during the synchronous batch calls (harness) | low | low | none |

## Recommendation

- **Should the new zero-copy / reduced-copy raw RGBA path replace the old internal output path?**
  **Yes.** Design A is now `render()`'s internal path: 0 copies, the same API and lifetimes, equal
  or faster everywhere measured, and CPU output byte-identical. Keep `CANVAS_HTML_OUTPUT=clone`
  only as a diagnostic.
- **Should the public synchronous `render()` API remain unchanged?** **Yes.** Same signature,
  same synchronous semantics, a Buffer that owns its pixels. Next, add a public
  `renderInto(target)` (promote `_renderInto`) for sequence rendering, workers and encoders. That
  is where the 2–4× lives.
- **Is async/pipelined readback worth carrying forward?** **Not yet.** Keep the prototypes and
  `_renderFramesExperimental` as experiments. The measured gain (GL 4K +8–19 %, otherwise ≤ 8 %)
  does not pay for the latency and the raw-GL complexity. Revisit with a rust-skia binding for
  Skia's async readback, or a consumer that reads mapped GPU memory directly.
- **Should the next phase proceed to WebGPU texture/device interoperability?** **Yes, but scoped
  by this result.** The CPU-side transport is no longer the bottleneck once frames go into reused
  memory: 4K GPU frames reach Node in about 7–9 ms. Above that, a 4K GPU frame is dominated by
  the PCIe readback plus the CPU-side recording. Avoiding the readback entirely (keeping frames
  on the GPU for a GPU consumer) is the next real lever. That is what device/texture
  interoperability would test.

## Regression (before / after)

| check | before | after |
|---|---|---|
| prod smoke, smoke-js, smoke-waapi, smoke-fonts | pass | pass (`evidence/prod-tests-*.txt`) |
| prod workers (CSS, GSAP, Motion) | identical frames | identical frames |
| Phase 3 contract suite | 30/30 both engines | 30/30 both engines (`evidence/phase3-suites-after.txt`) |
| Phase 3 scenes, lifecycle tests (9 modes) | pass | pass |
| CPU output vs Phase 4A addon | – | 39/39 identical |
| GPU correctness vs Phase 4A T4 (fixed) | – | 54/54 identical |
| `index.d.ts` | – | type-checks with `@types/node` |

Upstream: `upstream-patches/anyrender_skia/0004` (Ganesh options from an environment variable,
experiments only) and `0005` (render into the caller's buffer; pipelined readback prototype).
