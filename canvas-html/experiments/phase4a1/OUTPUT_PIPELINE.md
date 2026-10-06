# Phase 4A.1 — the output path as it was (before any change)

Mapped from the source at the end of Phase 4A (`canvas-html/src/lib.rs`,
`vendor/anyrender_skia/src/{image_renderer,gpu_image_renderer}.rs`, napi-rs 3.14.1
`src/bindgen_runtime/js_values/buffer.rs` and `src/bindgen_runtime/mod.rs`).

```text
HtmlRenderer.render({format: "rgba"})                        src/lib.rs render()
  frame JS (rAF, animations) → resolve() → paint(true)
     CPU:  SkiaImageRenderer::render_to_vec(draw, &mut self.buffer)
             buffer.resize(w*h*4, 0)                          (allocates once; later frames: no-op)
             surfaces::wrap_pixels(buffer) → clear → paint    Skia rasterizes INTO self.buffer
     GPU:  SkiaGpuImageRenderer::render_timed(draw, Some(&mut self.buffer))
             paint on the GPU surface → flush/submit → wait
             out.resize(w*h*4, 0); surface.read_pixels(out)   GPU → self.buffer (driver copy)
  Buffer::from(self.buffer.clone())                           COPY 1: full frame, new Vec
     napi-rs ToNapiValue: napi_create_external_buffer(ptr, len, drop_buffer, Box<Buffer>)
                                                              adopts the cloned Vec, no copy
  → JS Buffer (external memory, freed by drop_buffer when V8 collects it)
```

| Question | Answer |
|---|---|
| Where is the output `Vec<u8>` allocated? | `HtmlRenderer::new`: `buffer: Vec::with_capacity(pw*ph*4)` (no pages touched yet). First frame: `buffer.resize(len, 0)` in `render_to_vec` (CPU) or `render_timed` (GPU) fills it with zeros (memset, page faults). Same `Vec` reused for every later frame. |
| Who owns it? | The `HtmlRenderer` (`self.buffer`), for its whole life. Never handed to JS. |
| When does Skia write into it? | CPU: during painting (`wrap_pixels` makes an `SkSurface` over the Vec's bytes; `clear` + every draw write straight into it). GPU: in `read_pixels` after the GPU finished (GL `glReadPixels`; Vulkan: transfer buffer → Skia memcpy into the Vec). |
| Same allocation shape on CPU and GPU? | Yes: one tightly packed RGBA8888 buffer, `w*4` row bytes, `w*h*4` bytes, alpha opaque. |
| Where is `Buffer::from(...)` called? | `render()` (RGBA), `render()` PNG branch (`Buffer::from(out)`, the encoded file), `_renderTimed` (RGBA and PNG). |
| Where does `clone()` happen? | `render()`: `Buffer::from(self.buffer.clone())`; `_renderTimed` format `"rgba"`: same. **One full-frame CPU copy per RGBA frame** (8.3 MB at 1080p, 33 MB at 4K) into a freshly allocated Vec (fresh pages: allocation + page faults + memcpy). |
| Does napi-rs copy or adopt? | **Adopts.** `impl From<Vec<u8>> for Buffer` forgets the Vec and keeps ptr/len/capacity; `ToNapiValue` calls `napi_create_external_buffer` with that pointer — no copy. Exception: if the runtime refuses external buffers (`napi_no_external_buffers_allowed`: Electron with the V8 memory sandbox, some wasm targets) napi-rs falls back to `napi_create_buffer_copy` (one copy) and frees the Vec right away. Node 24 accepts external buffers. |
| How do Buffer finalizers release memory? | `drop_buffer` (napi-rs `bindgen_runtime/mod.rs`) runs when V8 collects the Buffer: `Box::from_raw(hint)` drops the napi-rs `Buffer`, whose Vec is freed with Rust's global allocator. Node runs external-buffer finalizers on the JS thread of the environment that created the Buffer (main thread or that worker). Timing is V8's: in a loop that never yields, finalizers wait (Phase 2/3 finding: 10,000 renders without GC turns → ~400 MiB RSS, back to normal after a GC turn). |
| How does PNG access the frame? | `png::Encoder` reads `&self.buffer` directly (no extra copy of the raw frame); the encoded bytes go to a new Vec handed to Node with `Buffer::from(out)` (adopted). |
| `close()`/drop vs outstanding Buffers | `close()` sets `self.buffer = Vec::new()` (frees the renderer's frame). Returned Buffers are independent copies owned by V8/napi-rs, so they stay valid after `close()`, after the renderer is collected, and their finalizers touch no renderer state (the finalize hint is the Buffer itself). |

## Copy count per RGBA frame (before)

| backend | GPU→CPU transfer | full-frame CPU copies in canvas-html | total CPU-side frame writes |
|---|---|---|---|
| CPU | – | 1 (`clone`) | raster + 1 copy |
| Ganesh GL | 1 (`glReadPixels` into the Vec) | 1 (`clone`) | readback + 1 copy |
| Ganesh Vulkan | 1 (GPU → transfer buffer) + Skia memcpy into the Vec | 1 (`clone`) | readback + memcpy + 1 copy |

Measured cost of the clone in Phase 4A (`buffer` column): 1.7–2.1 ms (720p), 4.0–4.5 ms (1080p),
19–21 ms (4K) on the T4 VM's Xeon.

## What can change (this phase) and what cannot

- **Design A (baseline): transfer ownership.** After painting, `std::mem::take` the frame Vec and
  hand it to Node (`Buffer::from(vec)`, adopted). The renderer allocates a new Vec for the next
  frame. Zero CPU copies; cost moves to allocating and first-touching a new frame (page faults).
  Lifetime safety comes from Rust ownership: the renderer never sees that memory again.
- **Design C (experimental): render into a caller-provided Buffer** (`_renderInto(buf)`). Skia
  (CPU raster via `SkiaImageRenderer::render(draw, &mut [u8])`) or `read_pixels` (GPU) write
  straight into JS-owned memory during the call. Zero copies, zero allocations per frame; the
  caller decides reuse, so no dependency on V8 finalization. Safety: the JS Buffer cannot move or
  be freed during the synchronous call; the length must match exactly.
- **Design B (measured option): bounded pool.** Frames are external Buffers whose finalizer
  returns the Vec to a pool shared by `Arc` (so it may outlive the renderer). Only useful if
  finalizers run often enough; in a tight loop they do not.
- **Cannot change**: the GPU→CPU transfer itself (Skia's synchronous `readPixels`); Skia's
  internal memcpy from a Vulkan transfer buffer (rust-skia 0.153.3 does not bind Ganesh's async
  readback, which would hand out the mapped transfer buffer); the copy napi-rs falls back to on
  runtimes without external buffers.
