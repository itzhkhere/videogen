# Changelog

Versions follow semver with the 0.x convention: a minor version may add or change API, a patch
version only fixes. Nothing has been published; the package is private.

## 0.6.0-rc.1 (not published)

Release candidate for the frame API. Every point below is tested by `scripts/check.sh` on the CPU
backend; the frame API and hardening tests also run on the experimental Ganesh GL and Vulkan
backends (`scripts/check-gpu.sh`, Mesa; NVIDIA L4 in the Phase 4A.3 report).

### Added

- `renderInto(target)`: draws the frame into memory the caller owns and reuses (`Buffer`,
  `Uint8Array`, `Uint8ClampedArray` of exactly `frameByteLength` bytes). Same frame step and same
  bytes as `render()`, no allocation or copy in the engine. Synchronous; the renderer keeps no
  reference to the target. Rejected targets (wrong type or length, `SharedArrayBuffer`, detached)
  throw `TypeError`/`RangeError` with Node error codes before anything runs.
- `frameByteLength` (`pixelWidth × pixelHeight × 4`) and the `FrameTarget` type.
- Documentation: [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md),
  [`docs/PIXEL-FORMAT.md`](docs/PIXEL-FORMAT.md), [`docs/PANIC-SAFETY.md`](docs/PANIC-SAFETY.md),
  [`docs/SECURITY.md`](docs/SECURITY.md) (trust model), [`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md).

### Changed

- `render()` hands its frame to Node without a copy (external buffer). The bytes are unchanged.
- Out-of-memory while allocating a frame is a JS `Error`, not a process abort.
- Ganesh (experimental GPU) output no longer depends on what the context drew before a `load()`.

### Fixed

- `render({ format: 'png' })` with a transparent or translucent `background` wrote premultiplied
  colours into the PNG, so translucent pixels came out too dark. PNGs now store straight alpha
  (`[128, 0, 0, 128]` premultiplied → `[255, 0, 0, 128]`). Raw RGBA output and opaque PNGs are
  unchanged.
- Malformed `background` strings (non-ASCII, multi-byte, NUL, wrong length) could panic the
  parser; they are now a JS `Error`.
- `advanceClock(ms)` with a huge finite value (above the range of a JS `Date`, 8.64e15 ms) could
  panic; it is now rejected with an `Error`, and the clock arithmetic is checked.
- `setTimeout`/`setInterval` in a page with a delay above `2^31 − 1` (for example `1e25`) aborted
  the process. Delays now follow WebIDL `long` conversion, as in browsers (Blitz patch 0014).
- Every method that runs engine code is guarded: a Rust panic (a bug) becomes a generic `Error`,
  the renderer is closed, and no panic text is passed to JS.

### Experimental (not part of the supported API)

- Ganesh GL and Vulkan backends behind cargo features and the private `experimentalBackend`
  option; Graphite and pipelined readback remain research code.

### Removed

- Nothing public. Private experiments from the research phases (frame pools, huge-page frames,
  the clone output switch) were removed before this release.

## 0.5.0

The API became the engine's alone; everything about frames moved to the application.

- Added `render(options?)` (`format: 'rgba' | 'png'`), `call(name, ...args)`, `advanceClock(ms)`,
  `clockTime` and the `clock: 'frozen' | 'real'` option (frozen by default).
- `eval()` returns the result through JSON and throws when the code throws. `boxes()` and
  `missingGlyphs()` take no time.
- Removed `frame(t)`, `framePng(t)`, `frames()`, `timeMode` and the frame hook. Pages define
  `window.seek(ms)` instead, and the same page runs in Chrome.
- Added Web Animations (`getAnimations`, `element.animate`, `currentTime` seeking, timing,
  events) on top of native CSS animations.
- Fixed four Stylo animation bugs and added two Blitz changes (see
  `upstream-patches/README.md`): seeking paused animations backwards or across iterations,
  easing in reverse iterations, single-keyframe animations drifting, and only the first of
  several animations updating.
- Tested with Motion (motion.dev) 14 as well as GSAP 3.
