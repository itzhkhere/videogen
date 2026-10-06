# canvas-html Phase 4A.2 — public frame API

Phase 4A.1 proved `_renderInto` as the high-throughput output path. Phase 4A.2 makes it a safe,
documented public API, `renderInto(target)` with `frameByteLength`; keeps `render()` as the
convenience API; and packages the implementation for independent review
(`experiments/phase4a2/phase4a2-review-bundle.zip`).

Environments: development and most checks on a 4-vCPU container (CPU raster; Mesa llvmpipe for
Ganesh GL, lavapipe for Ganesh Vulkan); final hardware pass on a Colab **NVIDIA L4** (driver
580.82.07), comparing the Phase 4A.1 and 4A.2 builds side by side on the same GPU. Node 24.19.0,
napi-rs 3.14.1, Skia m153 (skia-safe 0.153.3). Baseline for every comparison: commit `e185c33`
(end of Phase 4A.1).

## Decision

**GO** for `renderInto()` as a supported public API.

All 13 acceptance criteria hold (details below):

| # | criterion | result |
|---|---|---|
| 1 | clean public API | `renderInto(target: FrameTarget): void`, `frameByteLength`; private names unchanged or renamed with `_` |
| 2 | only byte-oriented targets | `Buffer`, `Uint8Array`, `Uint8ClampedArray`; the typed-array kind is read with N-API directly |
| 3 | wrong-sized and detached targets fail cleanly | `RangeError ERR_OUT_OF_RANGE` / `TypeError ERR_INVALID_ARG_VALUE`, before anything runs |
| 4 | no unsafe aliasing | SharedArrayBuffer rejected; aliasing argument in `UNSAFE_AUDIT.md` |
| 5 | explicit SharedArrayBuffer policy | not supported (rejected), deferred until a hand-off protocol exists |
| 6 | ownership/lifetime documented | `API_CONTRACT.md`, README, typings; tested |
| 7 | `frameByteLength` | public, checked arithmetic, constant per renderer |
| 8 | worker transfer documented and tested | 1/2/4 workers, CPU + Mesa GL/Vulkan + L4: 0 missing, 0 mismatched |
| 9 | `render()` compatible | same signature, same bytes, same lifetimes |
| 10 | CPU byte-identical | 39/39 frames vs the 4A.1 build; `renderInto` = `render()` |
| 11 | GPU unchanged | 39/39 on Mesa GL/Vulkan and on the L4 (GL, Vulkan) vs the 4A.1 build |
| 12 | no user input can panic Rust | panic paths removed; probes return JS errors; `catch_unwind` backstop on `render`/`renderInto` |
| 13 | self-contained review bundle | `phase4a2-review-bundle.zip` (sources, PATCH.diff, patches, audit, contract, tests, logs) |

## Final public API

```ts
export type FrameTarget = Buffer | Uint8Array | Uint8ClampedArray

export declare class HtmlRenderer {
  readonly pixelWidth: number            // unchanged
  readonly pixelHeight: number           // unchanged
  readonly frameByteLength: number       // NEW: pixelWidth × pixelHeight × 4
  render(options?: { format?: 'rgba' }): Buffer   // unchanged
  render(options: { format: 'png' }): Buffer      // unchanged
  renderInto(target: FrameTarget): void  // NEW
}
```

```js
const frame = Buffer.alloc(renderer.frameByteLength)
for (let i = 0; i < 300; i++) {
  renderer.call('seek', (i * 1000) / 30)   // the page's own seek(t); or advanceClock(ms)
  renderer.renderInto(frame)
  consume(frame)                           // done with the bytes before the next renderInto(frame)
}
```

No `renderer.seek()` was added: pages expose `seek(t)` and are driven with `call('seek', t)`, or
with `advanceClock(ms)` for pages that play themselves (README).

Private / diagnostic only (unchanged contract: may change): `_renderTimed` (keeps `output:
'clone'` for A/B), `_renderIntoTimed` (renamed from 4A.1's `_renderInto`), `_renderFramesExperimental`,
`_pipelineStart/Submit/Complete/Stop`, `_nativeHeap`. Removed: `_poolStats`, the pool and
huge-page outputs, and the `CANVAS_HTML_OUTPUT=clone` environment switch (an environment variable
silently changing a library's allocation behaviour).

**Versioning.** Purely additive for public users. Under the project's 0.x semver this warrants a
minor release, **0.6.0**; `package.json` stays at 0.5.0 in this phase, as agreed.

## Ownership model

```text
render()
  frame Vec: renderer scratch (if it fits) or alloc_frame()  ── fallible; OOM → JS Error
        │  Skia raster / GPU read_pixels write into it
        ▼
  BufferSlice::from_data(env, vec)       napi_create_external_buffer: adopted, no copy
        │                                (no external buffers, e.g. Electron sandbox: one copy)
        ▼
  Node Buffer (owns the memory) ──► V8 collects it ──► napi-rs drop_buffer_slice
                                                        Vec::from_raw_parts → freed by Rust,
                                                        on the creating JS thread; touches no
                                                        renderer state (safe after close())

renderInto(target)
  JS owns target (Buffer / Uint8Array / Uint8ClampedArray over a non-shared ArrayBuffer)
        │  checked first: open renderer → typed array → byte kind → not shared → attached
        │  → exactly frameByteLength bytes        (any failure: throw, nothing runs)
        ▼
  ByteTarget → &mut [u8] for this call only
        │  frame step, then Skia raster / GPU read_pixels straight into it
        ▼
  return: the renderer keeps no reference; V8 frees target like any buffer

worker transfer
  worker:  ab = new ArrayBuffer(frameByteLength)
           renderer.renderInto(new Uint8Array(ab))
           postMessage(ab, [ab])  ──── backing store moves, no copy ────►  parent owns ab
           (ab and its views are now detached here;                          │
            renderInto on them throws ERR_INVALID_ARG_VALUE)                 │
  worker:  ◄──── optional: parent sends ab back with [ab] for reuse ─────────┘
```

## Supported targets

| accepted | rejected (thrown before any work) |
|---|---|
| `Buffer`, `Uint8Array`, `Uint8ClampedArray` of exactly `frameByteLength` bytes, at any byte offset of an ordinary or resizable `ArrayBuffer` | other typed arrays (`Int8Array`, `Int16Array`, `Uint32Array`, `Float32Array`, `BigUint64Array`, …), `DataView`, bare `ArrayBuffer`, arrays, objects, strings, numbers, `null`, missing → `TypeError ERR_INVALID_ARG_TYPE` |
| | views over a `SharedArrayBuffer` (fixed or growable; `Buffer.from(sab)`) → `TypeError ERR_INVALID_ARG_TYPE` |
| | detached views (after `postMessage` transfer, `structuredClone` transfer, `ArrayBuffer.prototype.transfer`) → `TypeError ERR_INVALID_ARG_VALUE` |
| | wrong byte length (smaller, larger, 0, shrunk resizable buffer) → `RangeError ERR_OUT_OF_RANGE` |
| | after `close()` → `Error: renderer is closed` |

A rejected call runs no frame step (the page's rAF counter is unchanged) and writes nothing
(sentinel bytes intact) — `test/render-into.mjs`.

## SharedArrayBuffer decision

**Is SharedArrayBuffer publicly supported? No.**

`renderInto` writes the frame through an exclusive Rust `&mut [u8]` over the target. For an
ordinary `ArrayBuffer` that exclusivity really holds during the call: this thread's JS cannot run
(synchronous call; page scripts run in Boa, not Node), other threads cannot reach the memory
(an `ArrayBuffer` leaves its isolate only by transfer, which detaches it first and needs JS here
to run), and V8 does not move or free the backing store of a live argument. A
`SharedArrayBuffer` can be read and written by another worker at any moment, so the same
`&mut [u8]` would be a data race — undefined behaviour in Rust's memory model even if every test
passes. The implementation detects it with `napi_is_arraybuffer` on the view's buffer (V8's
`IsArrayBuffer()` is false for shared buffers) and rejects it. Supporting it would need an
explicit protocol (for example a slot handed to the renderer with `Atomics` before the call and
back after, with the renderer writing through raw pointers rather than `&mut`); deferred. The
zero-copy worker pattern is the transferable `ArrayBuffer` above.

## Pixel format contract

Measured, not inferred (`experiments/phase4a2/pixel-format.mjs`; CPU, Mesa GL, Mesa Vulkan give
identical bytes; `render()` and `renderInto()` identical):

| property | value |
|---|---|
| layout | 4 bytes per pixel, **R, G, B, A**; rows top to bottom; stride `pixelWidth × 4` (no padding) |
| values | 8-bit sRGB-encoded as CSS gives them; no colour-space tag or conversion; blending in sRGB-encoded space |
| alpha | **premultiplied** |
| opaque background (default `#ffffff`) | every alpha byte is 255 (white bg + 50 % red → `[255,127,127,255]`) |
| transparent background `#00000000` | coverage alpha, premultiplied: red → `[255,0,0,255]`; 50 % red → `[128,0,0,128]`; background `[0,0,0,0]` |
| translucent background `#00ff0080` | background `[0,128,0,128]`; 50 % red over it → `[128,64,0,192]` |

Skia labels the surfaces `AlphaType::Opaque`, but with a non-opaque background the alpha bytes
carry real coverage. Found on the way, not changed (rendering semantics are out of scope):
`render({format:'png'})` encodes these premultiplied bytes as a straight-alpha PNG, so with a
non-opaque background translucent pixels come out darker (`[128,0,0,128]` where a straight PNG
needs `[255,0,0,128]`). Opaque backgrounds are exact. Fix: unpremultiply before PNG encoding.

## Safety audit

Full inventory: `review-bundle/UNSAFE_AUDIT.md`. Method: a **Graphify** call graph of the
frame-output code (canvas-html, vendored anyrender_skia/anyrender, napi-rs 3.14.1 Buffer and
finalizer code, skia-safe 0.153.3 surface code; 638 nodes, 1434 edges). Graphify's Rust
extraction misses path-qualified calls and some calls inside `unsafe { }`, which would
under-report reachability, so `reach.py` adds name-resolved edges (a call reaches every function
of that name) for a sound "may reach" over-approximation: 342 functions, 1717 edges, 266 `unsafe`
sites with the entry points that may reach them; every first-party site was then confirmed or
rejected by hand.

Summary of the first-party `unsafe` on the frame path:

- `src/target.rs`: four N-API queries (typed-array check, typed-array info, `is_arraybuffer`,
  `is_detached`) on the call's own arguments, and `ByteTarget::bytes`, the only place a
  `&mut [u8]` over JS memory is made — valid for the validating call only, exact length, never
  two at once (the private batch API may receive the same view twice, so each slice lives for one
  write).
- `src/frames.rs`: `alloc_zeroed` + `Vec::from_raw_parts` with the exact layout `Vec<u8>` frees
  with; null → error. The pool (`from_external` finalizer) and huge-page (`madvise`) unsafe were
  removed with those experiments.
- Vendored: the CPU raster path has no `unsafe` (safe `wrap_pixels`, now `try_render`); the GPU
  readback path has none (safe `read_pixels` after an exact length check); the private PBO
  pipeline's raw GL blocks now carry SAFETY comments (patch 0007). Device setup/teardown (EGL,
  Vulkan) and the upstream image-brush `SkData::new_bytes` are not frame memory; reviewed, noted.
- Third-party on the path: napi-rs `from_data` (adopts the Vec) and `drop_buffer_slice`
  (`Vec::from_raw_parts(ptr, len, cap)`: layout-compatible with `alloc_frame`), skia-safe
  `wrap_pixels`/`read_pixels` (both length-checked).

Panic hardening: `expect`/`unwrap` on user-reachable paths became errors (`paint_into`,
`doc_mut`, `boxes`, `missingGlyphs`, mutex poisoning, vendored `wrap_pixels(..).unwrap()` →
`try_render`, patch 0006); `devicePixelRatio` must be finite. napi-rs `catch_unwind` on `render`
and `renderInto` as the boundary backstop: overhead within noise (≈10 µs calls, ±1.5 µs; nothing at
frame scale), ordinary errors keep their class and code, and a synthetic panic (throwaway build)
surfaced as `Error: synthetic panic…` with the process alive.

## Worker transfer

Recommended pattern (README, `API_CONTRACT.md`):

```js
const ab = new ArrayBuffer(renderer.frameByteLength)
renderer.renderInto(new Uint8Array(ab))
parentPort.postMessage(ab, [ab])     // zero-copy; ab is detached in the worker afterwards
```

- Zero-copy: `ab` is ordinary V8 memory; the transfer list moves its backing store (Phase 4A.1:
  0.07 ms per 1080p frame vs ~5 ms for a structured-clone copy).
- `render()` Buffers are not transferable: their memory is external (`DataCloneError`), and
  `postMessage(buf)` copies.
- The next frame needs another buffer; the parent can send buffers back for reuse.

`test/render-into-workers.mjs` (effects scene, 24 frames, page `seek(t)` per frame):

| backend | mode | 1 worker | 2 workers | 4 workers |
|---|---|---|---|---|
| CPU (local) | transfer, buffers returned and reused | 78 fps, 2 buffers | 97 fps, 4 buffers | 116 fps, 8 buffers |
| CPU (local) | in-process Buffer/Uint8Array | 66 fps | 100 fps | 102 fps |
| Mesa GL / Vulkan | both modes | pass | pass | pass |
| L4 GL | transfer / in-process | 84 / 73 fps | 88 / 83 fps | 68 / 69 fps |
| L4 Vulkan | transfer / in-process | 51 / 47 fps | 44 / 43 fps | 32 / 33 fps |

Every run: 0 missing, 0 mismatched frames vs a single-thread `render()` reference; all workers
exit 0; using a transferred (detached) view throws `ERR_INVALID_ARG_VALUE` 24/24.

## Memory

Productization did not change memory behaviour (the frame paths are the 4A.1 ones; only
validation, error paths and removals changed):

| case | result |
|---|---|
| tight loop, `renderInto` | flat: one caller buffer; peak RSS 80 MiB at 1080p, 104 MiB at 4K (sanity bench, same as 4A.1's `_renderInto`) |
| tight loop, `render()` | unchanged from 4A.1: frames live until Node runs finalizers on an event-loop turn (215 MiB / 484 MiB peak in the 15/10-frame sanity runs) |
| retained `render()` frames | 100 × 4K retained = 3230 MiB, back to the 66 MiB baseline after drop + GC (CPU) |
| allocation failure | under `ulimit -v` 3 GiB: frame 52 throws `could not allocate a 31 MiB frame`; `renderInto` still works at the limit; `render()` works again after release |

**Allocator follow-up (time-boxed).** A local strategy — each `render()` frame in its own
anonymous `mmap`, unmapped by the Buffer's finalizer — matched the heap path in tight loops but
made `render()` with event-loop turns **1.7–2.4× slower** (1080p 2.1 → 5.0–5.5 ms, 4K 11.8–14.5 →
21.7–24.2 ms), because every frame pays fresh-page faults that the heap recycles; on CPU the heap
already returned 100 retained 4K frames to the baseline. Not adopted; no global `mallopt`. The
answer for bulk rendering is `renderInto` (no per-frame allocation at all). Experiment code is in
commit `9fd0be7` only.

## Performance sanity check

Phase 4A.1 build vs the productized build, run side by side in separate processes (median ms per
frame, tight loop; scene A output-dominated, scene E paint-heavy).

Local container, CPU:

| scene | res | 4A.1 render() | 4A.2 render() | 4A.1 _renderInto | 4A.2 renderInto |
|---|---|---|---|---|---|
| A | 1080p | 7.19 | 6.42 | 3.18 | **1.84** |
| A | 4K | 33.85 | 30.01 | 8.15 | **6.95** |
| E | 1080p | 139.9 | 136.7 | 138.2 | 135.7 |
| E | 4K | 349.9 | 319.9 | 306.3 | 314.0 |

NVIDIA L4 (same session, same GPU for both builds):

| backend | scene | res | 4A.1 render() | 4A.2 render() | 4A.1 _renderInto | 4A.2 renderInto |
|---|---|---|---|---|---|---|
| CPU | A | 1080p | 5.71 | 5.68 | 2.02 | 2.04 |
| CPU | A | 4K | 24.58 | 24.21 | 9.97 | 10.22 |
| CPU | E | 1080p | 183.1 | 184.0 | 180.6 | 182.2 |
| CPU | E | 4K | 395.8 | 401.6 | 386.6 | 394.3 |
| Ganesh GL | A | 1080p | 5.91 | 5.91 | 2.19 | **2.18** |
| Ganesh GL | A | 4K | 22.58 | 22.94 | 7.41 | **7.29** |
| Ganesh GL | E | 1080p | 31.98 | 31.42 | 27.15 | 27.12 |
| Ganesh GL | E | 4K | 63.29 | 64.89 | 47.17 | **46.69** |
| Ganesh Vulkan | A | 1080p | 5.26 | 5.38 | 1.74 | 1.84 |
| Ganesh Vulkan | A | 4K | 22.91 | 22.74 | 8.95 | 9.06 |
| Ganesh Vulkan | E | 1080p | 23.67 | 23.60 | 20.81 | 20.22 |
| Ganesh Vulkan | E | 4K | 74.82 | 74.57 | 60.50 | 60.45 |

Every 4A.2 row is within ±3 % of its 4A.1 counterpart except Vulkan A 1080p `renderInto`
(+0.10 ms, +6 % on a 1.8 ms frame), all within run-to-run noise on a shared VM and in both
directions, so no T4 re-run for an apples-to-apples comparison was needed. `renderInto` keeps the
Phase 4A.1 gain: 4K output-dominated frames 2.4–3.1× faster than `render()` (GL 22.9 → 7.3 ms,
Vulkan 22.7 → 9.1 ms, CPU 24.2 → 10.2 ms); paint-heavy GPU frames 1.2–1.4× faster; peak RSS
1.5–4.6× lower.

Validation costs microseconds; the gains of Phase 4A.1 are intact.

## Regression

| check | result |
|---|---|
| CPU hashes, 4A.1 build → 4A.2 (`output-regression.mjs`: scenes A–G1000 at 720p/1080p, test/scenes at 0/500/1500 ms) | **39/39 identical**; `renderInto` = `render()` 39/39 |
| GPU subset, Mesa GL and Vulkan, 4A.1 → 4A.2 | **39/39 identical** each; `renderInto` = `render()` |
| GPU subset, L4 GL and Vulkan, 4A.1 → 4A.2 (same GPU, same session) | **39/39 identical** each; `renderInto` = `render()` 39/39 |
| Phase 4A GPU correctness subset with the 4A.2 GPU build (L4, 720p/1080p, 18 scene×resolution pairs) | CPU vs GL and CPU vs Vulkan: 15 minor + 3 edge-aa each; GL vs Vulkan: 17 near-exact + 1 minor — the same classes as Phase 4A's T4 reference (no major); CPU hashes identical to the T4 run 18/18 |
| Phase 3 contract suite | 30/30 cases, both engines identical |
| Phase 3 scenes (Boa/Deno determinism, GSAP paused/auto, Motion) and lifecycle tests (9 modes) | pass |
| prod smoke, smoke-js (JS), smoke-waapi (WAAPI), smoke-fonts (fonts) | pass |
| prod workers: CSS motion, GSAP, Motion library | identical frames across workers |
| new: render-into, render-into-examples, render-into-workers | pass (CPU; Mesa GL/Vulkan; L4) |
| TypeScript (`tsc` 5.9.3 + `@types/node` 24, strict) | 0 errors; every `@ts-expect-error` negative case is an error |

## Remaining blockers

| # | item | severity | effort | architectural risk |
|---|---|---|---|---|
| 1 | PNG output with a non-opaque background writes premultiplied bytes as straight alpha (pre-existing) | medium | low (unpremultiply before encoding) | low |
| 2 | SharedArrayBuffer targets unsupported; needs a synchronization/hand-off protocol and raw-pointer writes | low (transfer pattern covers workers) | medium | medium |
| 3 | Tight `render()` loops keep frames until the event loop turns (Node finalizer timing; documented, `renderInto` avoids it) | low | — | low |
| 4 | Electron / V8 sandbox: `render()` copies once (napi-rs fallback); `renderInto` unaffected; not measured in Electron | low | medium | low |
| 5 | Graphify's Rust call extraction misses path calls; the audit compensates with name-resolved edges (over-approximation + manual review) | low (tooling) | — | none |
| 6 | Upstream image-brush `SkData::new_bytes` relies on the scene cache holding the pixel blob (pre-existing, paint path) | low | low | low |

## Recommendation

- **Should `renderInto()` be public and supported?** **Yes.** It is boring, explicit and safe: byte
  targets only, exact length, checked before any work, no retained references, no allocation, and
  the same bytes as `render()`.
- **Should `render()` remain the convenience API?** **Yes**, unchanged (Phase 4A.1's zero-copy
  hand-off; no pool, no environment switch).
- **Is SharedArrayBuffer supported or deferred?** **Deferred** — rejected with a clear error until
  a hand-off protocol exists. Workers use transferable `ArrayBuffer`s (zero-copy, tested).
- **Should async readback remain experimental only?** **Yes.** `_pipeline*` and
  `_renderFramesExperimental` stay private; 4A.1's measurements do not justify promotion.
- **Is the project ready to start Phase 4B (WebGPU device/texture interoperability)?** **Yes.**
  The CPU-side frame transport is settled and reviewed; the remaining cost of a GPU frame is the
  readback itself, which is what 4B investigates. Release `renderInto` as 0.6.0 first.
