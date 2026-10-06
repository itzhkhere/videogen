# Unsafe audit: frame output

Scope: every `unsafe` block involved, directly or indirectly, in `render()`, `renderInto()`,
Buffer creation, ArrayBuffer/TypedArray access, GPU readback into a target, and frame
finalization. Done in Phase 4A.2 (graph and scripts in `experiments/phase4a2/graphify/`); line numbers are
those of the 4A.2 sources and have moved since, so look sites up by function. Phase 4A.3 added no
`unsafe`; it changed the panic boundary (T5) and the panic hardening at the end.

## Method

1. **Inventory and reachability with Graphify** (`experiments/phase4a2/graphify/`). `stage-and-extract.sh` builds a
   Graphify 0.9.77 graph of the engine's `src/`, the vendored `anyrender_skia` and `anyrender`,
   napi-rs 3.14.1's Buffer and finalizer code (`bindgen_runtime/js_values/buffer.rs`,
   `bindgen_runtime/mod.rs`, `env.rs`) and skia-safe 0.153.3's `core/surface.rs`: 638 nodes,
   1434 edges. Graphify's Rust extraction misses path-qualified calls (`ByteTarget::from_js(..)`,
   `BufferSlice::from_data(..)`) and some calls inside `unsafe { }`. That would under-report
   reachability, the unsafe direction for an audit, so `reach.py` adds name-resolved edges from
   brace-matched function bodies: a call `.f(` or `T::f(` reaches **every** staged function named
   `f`. Result (`graphify/reach.txt`): 342 functions, 1717 call edges, 266 `unsafe` sites, each
   with the entry points that **may** reach it and one call chain.
2. **Manual review** of every first-party site and of the third-party functions on the actual
   frame path. The over-approximation produces false positives (for example `.new()` and
   `.drop()` name collisions make Vulkan device setup look reachable from a Buffer finalizer);
   the "confirmed" column below is the manual verdict.

Entry points analysed: `renderInto`, `render`, `frameByteLength`, `close`, the constructor,
`_renderIntoTimed`, `_renderTimed`, `_renderFramesExperimental`, `_pipelineComplete`, and the
napi-rs Buffer finalizer.

## First-party unsafe on the frame path

| # | file:line, function | why unsafe | safety invariant | memory owner | concurrent access | lifetime ends | confirmed reached from |
|---|---|---|---|---|---|---|---|
| 1 | `src/target.rs:39` `ByteTarget::from_js` — `napi_is_typedarray` | N-API FFI | `env` and `value` are the env and an argument of the current native call | n/a (writes a local `bool`) | none | call | renderInto, _renderIntoTimed, _renderFramesExperimental, _pipelineComplete |
| 2 | `src/target.rs:49` — `napi_get_typedarray_info` | N-API FFI; returns a raw data pointer | called only after #1 proved a typed array; all out-pointers are locals. `data` is the view's first byte (byte offset applied by N-API); `arraybuffer` is a handle valid in the call's handle scope | JS (`ArrayBuffer`) | see #5 | call | same as #1 |
| 3 | `src/target.rs:58` — `napi_is_arraybuffer` | N-API FFI | `arraybuffer` from #2. V8's `IsArrayBuffer()` is **false for a SharedArrayBuffer**, so shared targets are rejected here | n/a | none | call | same as #1 |
| 4 | `src/target.rs:64` — `napi_is_detached_arraybuffer` | N-API FFI | `arraybuffer` is an ArrayBuffer (#3); detached targets rejected | n/a | none | call | same as #1 |
| 5 | `src/target.rs:84,88` `ByteTarget::bytes` (`unsafe fn` + `slice::from_raw_parts_mut`) | creates `&mut [u8]` over JS memory | (a) `ptr`/`len` describe the attached, non-shared view validated by #1–#4 and the exact-length check (`len == frameByteLength`, so a zero/null view never reaches here); (b) called only inside the native call that validated it (the `ByteTarget` is a local of that call); (c) no other reference to these bytes exists during the call — see "Aliasing argument" | caller (JS `ArrayBuffer`) | none possible during the call | the `&mut` borrow ends before the call returns | renderInto, _renderIntoTimed, _renderFramesExperimental, _pipelineComplete (not render: the graph's chain `.bytes() ← .try_render() ← .paint_into() ← .render()` is a name match on `bytes`, not a call of `ByteTarget::bytes`) |
| 6 | `src/lib.rs:982` `render_into`; `:995` `render_into_timed` — `target.bytes()` call sites | calling an `unsafe fn` | one slice of the target, passed down for one paint/readback | caller | none | end of statement | renderInto / _renderIntoTimed |
| 7 | `src/lib.rs:1107` `pipeline_complete`; `:1174, :1196, :1208` `render_frames_experimental` | calling an `unsafe fn` (private APIs) | the same view may appear twice in `targets`, so each slice is created for one write and dropped before the next; never two live `&mut` to one target | caller | none | end of statement | _pipelineComplete, _renderFramesExperimental |
| 8 | `src/frames.rs:32` `alloc_frame` — `alloc_zeroed` + `Vec::from_raw_parts` | raw allocation | non-zero `Layout::array::<u8>(len)`; null → `Err` ("could not allocate a N MiB frame"), never abort; the Vec gets `len == cap == len` with alignment 1, exactly the layout `Vec<u8>` frees with | Rust, then the Node Buffer (#T1) | none (fresh memory) | dropped by the renderer, or by the Buffer finalizer (#T2) | render, _renderTimed (and paint_into's CPU scratch) |
| 9 | `src/lib.rs:1243` `native_heap` — `libc::mallinfo2` | FFI | no arguments; reads allocator statistics | n/a | n/a | n/a | none of the output entry points (diagnostic `_nativeHeap` only) |

`src/frames.rs` had two more unsafe blocks in Phase 4A.1 (`madvise` for huge-page frames, and
the pool's `from_external` finalizer in `lib.rs`); both were **removed** with those experiments.
The time-boxed mmap frame (`MmapFrame`, `mmap`/`munmap`) existed only in commit `9fd0be7` and was
removed after it was rejected.

### Aliasing argument for `ByteTarget::bytes` (#5)

A `&mut [u8]` over JS memory is sound only if nothing else reads or writes those bytes while it
lives:

- **This thread's JS cannot run**: `renderInto` is a synchronous N-API call. The engine runs no
  Node JS during it (page scripts run in the renderer's own Boa engine, which has no access to
  Node objects), and the slice is dropped before any napi-rs code that could call back into JS
  (error construction happens after `?` returns).
- **Other threads cannot reach the bytes**: an ordinary `ArrayBuffer` belongs to one isolate. It
  can move to another thread only by transfer, which detaches it here first and needs JS on this
  thread to run. `SharedArrayBuffer`-backed views are rejected (#3), because another worker could
  access them at any time; exposing them needs a synchronization protocol (deferred).
- **The memory cannot move or be freed**: V8 never relocates an `ArrayBuffer` backing store, the
  target is a live argument of the current call, and it cannot be detached or resized during the
  call (both need JS on this thread). A resizable buffer is checked at its current length.
- **No overlap with renderer memory**: the renderer never hands out memory it still uses.
  `render()` gives its frame away (the scratch frame is never exposed to JS), so a target cannot
  alias renderer-owned memory. Two different targets may overlap (two views of one buffer), but
  only one is ever borrowed at a time (#6, #7).
- **Bounds**: Skia writes at most `width × height × 4` bytes: CPU raster through
  `surfaces::wrap_pixels` (#T3: checks `len >= rowBytes × height`), GPU readback through
  `Surface::read_pixels` (#T4: checks `valid_pixels`), the PBO copy with exactly `out.len()`
  (#V5). The engine requires `len == frameByteLength` before any of them.

## Vendored anyrender_skia (patches 0003, 0005–0007)

| # | file:line, function | why unsafe | invariant | owner | concurrent access | lifetime ends | reached from (confirmed) |
|---|---|---|---|---|---|---|---|
| V1 | `image_renderer.rs` `try_render` (0006) | **no unsafe**: uses safe `surfaces::wrap_pixels` (#T3) and returns an error instead of panicking when the buffer does not fit | — | — | — | — | render, renderInto (CPU) |
| V2 | `gpu_image_renderer.rs:338` `render_timed` readback | **no unsafe**: `Surface::read_pixels` (#T4) after an explicit `out.len() == width × height × 4` check | — | caller / frame Vec | none | — | render, renderInto (GPU) |
| V3 | `gpu_image_renderer.rs:486` `pipeline_start` (GL PBO) | raw GL | `GenBuffers` writes exactly `depth` names into a `depth`-long Vec; each PBO sized to one frame; context current | renderer (GL) | none | `GpuPipeline::drop` (V6) | _renderFramesExperimental, _pipelineStart |
| V4 | `gpu_image_renderer.rs:557` `pipeline_submit` | raw GL | with a PIXEL_PACK buffer bound, `ReadPixels`' pointer is an offset (0) into a one-frame PBO: no client memory is written; Skia GL state reset after | renderer (GL) | GPU writes the PBO asynchronously; nothing on the CPU reads it before the fence (V5) | fence signalled | _renderFramesExperimental, _pipelineSubmit |
| V5 | `gpu_image_renderer.rs:617–618, 632` `pipeline_complete` | raw GL + `ptr::copy_nonoverlapping` | fence created by this pipeline, waited and deleted once; the mapping covers `out.len()` bytes = one frame (checked against the PBO size); copy of exactly `out.len()` bytes from the GL mapping into the exclusive `out` slice, non-overlapping; unmapped after | caller (`out`) | none (exclusive slice) | `UnmapBuffer` | _renderFramesExperimental, _pipelineComplete |
| V6 | `gpu_image_renderer.rs:434, 440` `GpuPipeline::drop` | raw GL | deletes fences still in flight and the PBO names, once; context current (the renderer makes it current before dropping fields) | renderer | none | drop | close, _pipelineStop |
| V7 | `gpu_image_renderer.rs:170` `GpuDevice::drop`; `:215–250` `GlDevice::new`; `gpu_common.rs:57–139` `VkDevice` new/with_backend/drop; `graphite_image_renderer.rs:53` | EGL/GL/Vulkan device lifecycle FFI (Phase 4A) | context made current before Skia's context is dropped; Vulkan objects destroyed in reverse creation order after `device_wait_idle`; `GetString` transmuted from a non-null `eglGetProcAddress` result | renderer / device | the device belongs to one JS thread | drop | constructor, close; **not** frame memory. Graph also lists render/renderInto/finalizer: false positives via `new`/`drop` name collisions (e.g. `.drop() ← drop_buffer()`, where `drop` is `std::mem::drop` of a Box) |
| V8 | `scene.rs:1013` `shader_from_image_brush` | `SkData::new_bytes` references image pixels without copying (upstream code) | the scene cache stores the pixel `Blob` together with the shader (`image_shader: (Shader, Blob)`), so the pixels outlive every draw that uses the shader | Blitz image data (`Arc` blob) | none | cache eviction (generational) | paint path of render/renderInto; **not** frame-output memory; pre-existing, out of 4A.2 scope |

Residual note on V8: the cache's `Paint` keeps the last shader set on it after the cache entry
expires; it is replaced before the next draw that uses a shader, so the stale reference is never
dereferenced. Worth an upstream look, not a 4A.2 issue.

## Third-party unsafe on the frame path (unchanged dependencies)

| # | crate:file:line | role | why it is sound for the engine's use |
|---|---|---|---|
| T1 | napi 3.14.1 `bindgen_runtime/js_values/buffer.rs:118` `BufferSlice::from_data` | `render()` hands its frame `Vec` to Node: `napi_create_external_buffer(ptr, len, drop_buffer_slice, Box<(len, cap)>)`, then `mem::forget(vec)` | the Vec's heap block is owned by the Buffer from here; the engine keeps no pointer (`render()` moves the Vec in). If the runtime refuses external buffers, napi-rs copies with `napi_create_buffer_copy` and drops the Vec at once |
| T2 | napi 3.14.1 `bindgen_runtime/mod.rs:132` `drop_buffer_slice` (finalizer) | frees the frame: `Vec::from_raw_parts(data, len, cap)` | the block came from `alloc_frame` (#8: global allocator, `Layout::array::<u8>(cap)`, alignment 1) or from a `Vec<u8>` (scratch), so the layout matches. Node runs it on the JS thread that created the Buffer, at GC/event-loop time; it touches no renderer state, so it is safe after `close()` and after the renderer was collected **[tested]** |
| T3 | skia-safe 0.153.3 `core/surface.rs:110` `surfaces::wrap_pixels` | CPU raster target | returns `None` if `pixels.len() < image_info.compute_byte_size(row_bytes)`; the returned surface `Borrows<'pixels>` the slice, so it cannot outlive it |
| T4 | skia-safe 0.153.3 `core/surface.rs:581` `Surface::read_pixels` | GPU readback into the target / frame | `dst_info.valid_pixels(row_bytes, dst)` checks the destination length before `readPixels1` |
| T5 | `src/lib.rs` `HtmlRenderer::guarded` and the constructor (since 4A.3; replaces 4A.2's `#[napi(catch_unwind)]` on `render`/`renderInto`) | `std::panic::catch_unwind` around every method that runs engine code | ordinary `Err` passes through unchanged; a panic becomes a generic JS `Error` (no panic text), the renderer is closed and its document leaked rather than dropped mid-invariant, instead of unwinding into C (which aborts) **[tested: `setTimeout(f, 1e25)` before Blitz patch 0014]**. Policy: `PANIC-SAFETY.md` |

## Panic hardening (user-reachable inputs)

Removed in 4A.2: `expect("document")` in `paint_into`/`prepare_timed`/`pipeline_submit_inner`,
`unwrap()` after building the document (`doc_mut`), `doc.unwrap()` and `get_node(..).unwrap()` in
`boxes()`/`missingGlyphs()`, `Mutex::lock().unwrap()` on the load-error list (poisoning), and
`wrap_pixels(..).unwrap()` in the vendored CPU renderer (now `try_render`). `devicePixelRatio`
must be finite (Infinity previously relied on a saturating cast reaching the size check).

Probed with JS errors, never a panic **[tested]**: zero-length target, every wrong target type,
detached and SharedArrayBuffer targets, wrong lengths, shrunk resizable buffers, huge dimensions,
huge/NaN/Infinity/0/negative DPR, closed renderer, repeated `close()`, 50 repeated `renderInto`
calls, `renderInto` before `load()`, allocation failure under `ulimit -v` (`Error: could not
allocate a 31 MiB frame`, recovery after release).

Remaining `expect`/`unwrap` that are invariants, not input-driven: `f.fence.expect("GlPbo frames
carry a fence")` in the private PBO pipeline (every GlPbo submit stores a fence),
`serde_json::to_string(&str).unwrap()` in `eval` (cannot fail), and `debug_assertions`-only
checks inside napi-rs. With the guard on every method, even an unexpected panic on those paths is reported as an
`Error`.

Phase 4A.3 removed the remaining input-driven panics outside the frame path: the `background`
parser (byte slicing of non-ASCII input), `advanceClock` (`Duration`/`Instant` overflow for huge
finite values) and page timer delays (`setTimeout(f, 1e25)`, Blitz patch 0014). Inventory of every
public method: `PANIC-SAFETY.md`.
