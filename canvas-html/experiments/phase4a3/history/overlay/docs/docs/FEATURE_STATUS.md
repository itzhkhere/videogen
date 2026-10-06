# Feature status

What the engine supports today, and what only exists as research. "Supported" means documented,
tested on every change (`scripts/check.sh`) and covered by the public typings; nothing is called
supported because a prototype once worked.

| feature | status | notes |
|---|---|---|
| HTML/CSS/SVG → pixels, CPU (Skia raster) | **supported, default** | Blitz (Stylo, Taffy, Parley); the only backend of default builds |
| Host-controlled time (`clock: 'frozen'`, `advanceClock`, `epochMs`) | **supported, default** | deterministic: the same state renders the same bytes |
| `clock: 'real'` | supported | follows the wall clock; not deterministic by design |
| Page JavaScript (Boa, `scripts: true`) | **supported** | DOM subset via the shared DOM host; GSAP, Motion, Preact, WAAPI covered by tests; no canvas 2D/WebGL, `fetch` only for local files |
| Shared DOM host (`dom-host` crate) | **supported** (internal) | engine-neutral DOM subset used by the Boa runtime |
| CSS animations, Web Animations | **supported** | driven by the frozen clock or by the page's `seek(t)` |
| `render()` (RGBA, PNG) | **supported** | convenience API; zero-copy hand-off of the frame to Node; straight-alpha PNG |
| `renderInto(target)`, `frameByteLength` | **supported** (new in 0.6) | caller-owned `Buffer`/`Uint8Array`/`Uint8ClampedArray`; workers via transferable `ArrayBuffer` |
| SharedArrayBuffer targets | not supported | rejected; needs a hand-off protocol |
| Worker threads (one renderer per worker) | **supported** | identical pixels across workers |
| Deno/V8 runtime adapter | **research only** | `experiments/phase3`; not built or shipped |
| Ganesh GL backend (EGL, headless) | **experimental** | `--features experimental-gpu`, private `experimentalBackend: 'gpu-gl'`; Mesa and NVIDIA T4/L4 validated |
| Ganesh Vulkan backend | **experimental** | `--features experimental-gpu-vulkan`, `experimentalBackend: 'gpu-vulkan'` |
| Graphite (Vulkan) backend | **research only** | separate Skia binary; drift and image-provider gaps (phase 4A); not carried forward |
| Pipelined / async GPU readback | **research only** | `_pipeline*`, `_renderFramesExperimental`; measured, not adopted (phase 4A.1) |
| Frame pools | rejected | phase 4A.1 |
| WebGPU / device or texture interoperability | not implemented | phase 4B, on an experiment branch |
| Three.js | not implemented | |
| GPU video encoding (NVENC, VAAPI, VideoToolbox), FFmpeg integration | not implemented | out of the engine's scope; applications encode frames |
| Platforms | Linux x64 only | built and tested there; no Windows/macOS validation |
| Node | 24.x tested | `engines` says ≥ 18; only 24.19 is exercised |
