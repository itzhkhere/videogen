# Frame API contract

The contract for raw RGBA frame output from `HtmlRenderer`. Precise enough to test an
implementation against; `test/render-into.mjs`, `test/render-into-workers.mjs`,
`test/render-into-examples.mjs` and `test/types/render-into.test-d.ts` check every point marked
**[tested]**.

## Signatures

```ts
export type FrameTarget = Buffer | Uint8Array | Uint8ClampedArray

export declare class HtmlRenderer {
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly frameByteLength: number
  render(options?: { format?: 'rgba' }): Buffer
  render(options: { format: 'png' }): Buffer
  renderInto(target: FrameTarget): void
  close(): void
}
```

## `frameByteLength`

- Equals `pixelWidth × pixelHeight × 4` **[tested]**, where `pixelWidth = round(width × devicePixelRatio)`
  and likewise for the height. Computed once at construction with checked arithmetic.
- Constant for the renderer's life: size and `devicePixelRatio` cannot change. Still readable
  after `close()` **[tested]**.
- Construction fails with an `Error` when a frame cannot exist: a side outside `1..=32767` device
  pixels, `devicePixelRatio` not a finite number `> 0` (NaN, ±Infinity, 0, negative), `width` or
  `height` 0 **[tested]**. A GPU backend may also refuse a surface above its texture limit
  ("GPU surface WxH could not be created") **[tested on Mesa]**.

## `render()`

- Convenience API. Each call returns a **new** `Buffer` of `frameByteLength` bytes (RGBA) or a PNG
  file (`format: 'png'`).
- The Buffer owns its pixels: unchanged by later renders, `renderInto` calls, `close()` and the
  renderer being garbage-collected **[tested]**.
- RGBA memory is native (an external buffer adopted from Rust, no copy) and is freed by the
  Buffer's finalizer, which Node runs on an event-loop turn. A synchronous loop of `render()`
  calls keeps every frame alive until it yields.
- It cannot be transferred: `postMessage(buf, [buf.buffer])` throws `DataCloneError` (Node does
  not transfer external memory); `postMessage(buf)` copies it.
- Runtimes without external buffers (Electron with the V8 memory sandbox): napi-rs copies the
  frame once into a V8-owned Buffer; results and lifetimes are the same.

## `renderInto(target)`

High-throughput API for sequences, workers and encoders.

**Effect.** Runs the same frame step as `render()` (due timers with a real clock; Web Animations;
`requestAnimationFrame` callbacks; style; layout; paint) and writes exactly the bytes `render()`
would return for that state into `target` **[tested: same bytes, same rAF count]**.

**Synchronous.** When it returns, `target` holds the complete frame **[tested]**. Returns
`undefined` **[tested]**.

**Ownership.** `target` stays the caller's. The renderer writes it only during the call, keeps no
reference afterwards, and never touches it again **[tested: earlier targets unchanged by later
renders]**. The caller may read, reuse, or transfer it as soon as the call returns. The renderer
may be closed right after; targets outlive `close()` and the renderer **[tested]**.

**Allocation.** The engine allocates and copies nothing per call on the output side. (The GPU
backends read back from the GPU straight into `target`; on Vulkan, Skia copies from its own
transfer buffer into `target`.)

### Accepted targets

| target | accepted when |
|---|---|
| `Buffer` | its byte length is `frameByteLength` |
| `Uint8Array` | as above; any byte offset into its `ArrayBuffer` **[tested]** |
| `Uint8ClampedArray` | as above |
| views of a resizable `ArrayBuffer` | as above, at the time of the call **[tested]** |

Bytes of the underlying `ArrayBuffer` outside the view are never written **[tested]**.

### Rejected targets

A rejected call throws **before anything runs**: no frame step, no rAF callback, no byte written
**[tested]**. Checks run in this order:

| # | condition | thrown |
|---|---|---|
| 1 | renderer closed | `Error`, message `renderer is closed` (also for an invalid target) |
| 2 | not a typed array (`ArrayBuffer`, `DataView`, `Array`, object, string, number, `null`, missing) | `TypeError`, `code: 'ERR_INVALID_ARG_TYPE'` |
| 3 | a typed array other than `Uint8Array`/`Uint8ClampedArray` (`Int8Array`, `Int16Array`, `Uint32Array`, `Float32Array`, `BigUint64Array`, …) | `TypeError`, `code: 'ERR_INVALID_ARG_TYPE'` |
| 4 | backed by a `SharedArrayBuffer` (fixed or growable; includes `Buffer.from(sab)`) | `TypeError`, `code: 'ERR_INVALID_ARG_TYPE'` |
| 5 | its `ArrayBuffer` is detached (transferred by `postMessage`, `structuredClone`, `ArrayBuffer.prototype.transfer`) | `TypeError`, `code: 'ERR_INVALID_ARG_VALUE'` |
| 6 | byte length ≠ `frameByteLength` (too small, too large, 0, a shrunk resizable buffer) | `RangeError`, `code: 'ERR_OUT_OF_RANGE'` |

Before `load()`, both `render()` and `renderInto()` throw `Error: call load(html) first` and write
nothing **[tested]**.

### Errors during rendering

After the target was accepted, an error from the frame step or the backend (for example a lost
GPU device) throws an `Error`. The contents of `target` are then unspecified (a GPU readback may
not have happened); its size and ownership are unchanged.

A Rust panic inside any method would be a bug. It is caught at the N-API boundary and thrown as a
generic `Error` (`internal error in renderInto(); the renderer was closed (please report this)`)
instead of aborting the process; the renderer is closed. See [`PANIC-SAFETY.md`](PANIC-SAFETY.md).

## Pixel format (both APIs, every backend) **[tested: CPU, Ganesh GL, Ganesh Vulkan]**

| property | value |
|---|---|
| bytes per pixel | 4 |
| channel order | R, G, B, A |
| row order | top row first |
| row stride | `pixelWidth × 4` bytes (no padding) |
| total | `frameByteLength` |
| colour values | 8-bit sRGB-encoded values as CSS specifies them; no colour-space conversion; blending in sRGB-encoded space (as browsers do) |
| alpha | **premultiplied** |
| opaque `background` (default `#ffffff`) | every alpha byte is 255 |
| transparent / translucent `background` | alpha is the real coverage; colours premultiplied: 50 % red over `#00000000` is `[128, 0, 0, 128]`; 50 % red over 50 % green is `[128, 64, 0, 192]` |

`render({ format: 'png' })` converts to **straight** alpha, as PNG requires: 50 % red over
`#00000000` is stored as `[255, 0, 0, 128]` **[tested]**. Opaque frames encode unchanged. The
surface's Skia `AlphaType` and the reasoning behind it: [`PIXEL-FORMAT.md`](PIXEL-FORMAT.md).

## Worker transfer pattern (zero-copy) **[tested: 1, 2, 4 workers, CPU and Mesa GL/Vulkan]**

```js
const ab = new ArrayBuffer(renderer.frameByteLength)
renderer.renderInto(new Uint8Array(ab))
parentPort.postMessage(ab, [ab])   // moves the memory; ab is detached in the worker
```

- Zero-copy because `ab` is ordinary V8 memory and the transfer list moves its backing store
  (Phase 4A.1: 0.07 ms for a 1080p frame vs ~5 ms for a copy).
- After the transfer every view of `ab` in the worker is detached; `renderInto` on it throws
  `ERR_INVALID_ARG_VALUE` **[tested: 24/24]**. The next frame needs another buffer: allocate one,
  or receive buffers back from the parent and reuse them **[tested: ≈2 buffers per worker]**.
- Do not transfer a `render()` Buffer (external memory: `DataCloneError`).

## SharedArrayBuffer policy

Not supported in this version; rejected (rule 4). `renderInto` writes through an exclusive Rust
`&mut [u8]` without synchronization, and a `SharedArrayBuffer` may be read or written by another
thread at the same time, which would be a data race. Support needs an explicit hand-off protocol
(for example: ownership of a slot passes to the renderer via `Atomics` before the call and back
after) and is deferred.

## Concurrency

A renderer is not shared between threads (napi classes belong to one JS thread). Different
renderers in different workers are independent and give identical pixels **[tested]**.

## Diagnostics (private, not part of the contract)

`_renderTimed`, `_renderIntoTimed`, `_renderFramesExperimental`, `_pipeline*`, `_nativeHeap`,
`_backendInfo`, `_gpu*`, `_purgeSkiaFontCache`, `_dropNodeForTesting` may change or disappear.
`_renderTimed({ output: 'clone' })` keeps the Phase 4A copy path for A/B measurements only.

## Compatibility

Additive: `renderInto`, `frameByteLength` and the `FrameTarget` type are new; `render()` keeps its
signature and behaviour. Under the project's 0.x semver this is a minor release (0.6.0). Removed in 4A.2 (all private or experimental):
`_renderInto` (now `_renderIntoTimed`), `_poolStats`, `_renderTimed` outputs `pool` and
`transfer-huge`, and the output-mode environment switch.
