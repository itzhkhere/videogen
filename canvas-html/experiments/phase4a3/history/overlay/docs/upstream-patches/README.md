# Upstream patches

The engine builds against patched copies of three upstream projects. Every change to third-party
code is a patch here; nothing is modified without one. No upstream issue or pull request has been
filed yet for any of them ("upstream: none" below); the Blitz patches were written so they can be.

| project | base | how it is applied |
|---|---|---|
| [DioxusLabs/blitz](https://github.com/DioxusLabs/blitz) | commit `0db8c74a5f8a0df77eed1b33c846eb041515b6c7` | `scripts/setup-blitz.sh` clones Blitz into `third_party/blitz` (git-ignored) and `git am`s `blitz/*.patch`; `Cargo.toml` `[patch]` points there |
| [DioxusLabs/anyrender](https://github.com/DioxusLabs/anyrender), crate `anyrender_skia` | crates.io 0.12.0 | vendored, already patched, in `vendor/anyrender_skia` (`vendor/anyrender` is the unpatched 0.14 trait crate) |
| [servo/stylo](https://github.com/servo/stylo) | crates.io `stylo` 0.22.0 | vendored, already patched, in `vendor/stylo` (paths start at the crate root; in the servo/stylo repository they start with `style/`) |

A patch can be deleted when the upstream release the engine moves to contains an equivalent change
and the listed test still passes without it.

## Blitz

| patch | why | test that depends on it | delete when |
|---|---|---|---|
| `0001-paint-use-font-synthesis-embolden-for-synthetic-bold` | a missing bold face was not synthesised (only behind a global feature flag) | `test/typo/compare-typo.mjs`, `test/smoke-fonts.mjs` | Blitz paints with `run.synthesis().embolden()` |
| `0002-layout-support-text-transform-capitalize-across-inli` | `text-transform: capitalize` was not implemented (word-start state across text nodes) | `test/typo/compare-typo.mjs` (includes a unit test) | upstream implements capitalize |
| `0003-paint-implement-text-overflow-ellipsis-and-string-ma` | `text-overflow: ellipsis` and string markers | `test/typo/compare-typo.mjs` | upstream implements text-overflow |
| `0004-paint-implement-text-shadow-offset-colour-gaussian-b` | `text-shadow` (offset, colour, blur) | `test/typo/compare-typo.mjs` | upstream implements text-shadow |
| `0005-paint-support-background-clip-text-mask-background-w` | `background-clip: text` (needs Stylo 0001) | `test/typo/compare-typo.mjs` | upstream supports it |
| `0006-style-cargo-fmt` | formatting of 0001–0005 | — | together with them |
| `0007-dom-keep-the-animation-timeline-time-for-restyles-tr` | restyles triggered by script (layout queries) restarted running animations at t = 0 | `test/smoke-waapi.mjs`, Phase 3 scene replay | upstream keeps the timeline time |
| `0008-dom-skip-restyling-animating-elements-when-the-anima` | every animating element was restyled even when the timeline time had not changed (perf; same pixels) | Phase 3 benchmarks | upstream skips redundant animation restyles |
| `0009-dom-vibey-script-seek-paused-CSS-animations-from-scr` | seek a paused animation from script without a style change (`__blitz_set_animation_time`; needs Stylo 0002) | `test/smoke-waapi.mjs` | upstream offers paused-animation seeking |
| `0010-layout-keep-the-height-of-a-block-whose-inline-conte` | `<div style="height:52px"><span></span></div>` collapsed to 0×0 | `test/smoke.mjs` scenes (code views) | upstream fixes empty inline content height |
| `0011-paint-centre-angled-linear-gradients-on-their-tile` | angled gradients with `background-size` were centred on the element, not the tile | grid backgrounds in `test/scenes` | upstream fixes gradient tiling |
| `0012-paint-background-clip-text-on-inline-elements` | gradient text on inline elements was not painted | `test/typo/compare-typo.mjs` | upstream paints inline background-clip: text |
| `0013-vibey-script-use-dom-host-for-the-shared-DOM` | the Boa runtime delegates the shared DOM subset to `dom-host` (engine-neutral host shared with the experimental Deno adapter). **Not upstreamable as is**: depends on `dom-host` by path | `test/smoke-js.mjs`, Phase 3 contract suite | the shared host is published or upstreamed |
| `0014-vibey-script-timer-delays-above-i32-MAX-wrap-like-a-` | `setTimeout(f, 1e25)` panicked in `Duration::from_secs_f64`; delays now follow WebIDL `long` (wrap above i32::MAX, negative → 0) | `test/hardening.mjs` | upstream validates timer delays |

## anyrender_skia

| patch | why | test | delete when |
|---|---|---|---|
| `0001-Per-glyph-skew-for-synthetic-italic-font-skewX-and-h` | glyph transforms sheared glyph positions; `embolden` was ignored (synthetic italic/bold) | `test/typo/compare-typo.mjs` | upstream maps skew/embolden to font settings |
| `0002-Multiply-brush-alpha-instead-of-overwriting-it-fixes` | `rgba(…, 0.5)` and `transparent` text painted opaque | `test/smoke.mjs`, `test/typo` | upstream multiplies brush alpha |
| `0003-Headless-GPU-image-renderers-Ganesh-EGL-GL-Vulkan-an` | experimental offscreen GPU renderers (Ganesh GL/Vulkan, Graphite); `ganesh-gl` feature split | GPU builds: `test/render-into.mjs` / `test/hardening.mjs` with `HTML_RENDERER_BACKEND=gpu-gl\|gpu-vulkan`, `experiments/phase4a` | GPU support is upstream or replaced (phase 4B) |
| `0004-Ganesh-context-options-from-HTML_RENDERER_GANESH_OPTIO` | Ganesh options from an environment variable, **experiments only** | `experiments/phase4a` drift investigation | when the experiments are retired; not for upstream |
| `0005-Headless-GPU-renderers-render-into-a-caller-s-buffer` | readback into a caller's slice (used by `render()`/`renderInto()` on GPU); experimental pipelined readback | GPU `test/render-into.mjs`; `experiments/phase4a1/probes/pipeline-failures.mjs` | with 0003 |
| `0006-CPU-image-renderer-try_render-an-error-instead-of-a-` | `ImageRenderer::render` unwrapped `wrap_pixels`; `try_render` returns an error | `test/render-into.mjs` (size handling), every render | upstream returns errors |
| `0007-Pipelined-GL-readback-SAFETY-comments-on-the-raw-GL-` | comments only (SAFETY invariants for 0005's raw GL) | — | with 0005 |

## Stylo

| patch | why | test | delete when |
|---|---|---|---|
| `0001-Parse-background-clip-text-in-Servo-builds-too` | `background-clip: text` was only parsed in Gecko builds | `test/typo/compare-typo.mjs` | upstream parses it in Servo mode |
| `0002-servo-animation-let-paused-animations-keep-their-cur` | seeking a paused animation backwards or across an alternate iteration showed the wrong frame (`Animation::set_paused_time`) | `test/smoke-waapi.mjs` | upstream |
| `0003-servo-animation-update-every-animation-of-an-element` | with `animation: a 1s, b 2s` only the first animation got style changes | `test/smoke-waapi.mjs` | upstream |
| `0004-servo-animation-apply-keyframe-easing-to-the-directe` | `ease-in` in reverse/alternate iterations played as a mirrored `ease-out` | `test/smoke-waapi.mjs` | upstream |
| `0005-Compute-keyframes-from-the-underlying-style-without-` | implicit from/to keyframes drifted on every restyle | `test/smoke-waapi.mjs` | upstream |

The typography patches were checked against Chrome with `test/typo/compare-typo.mjs` (PSNR per
feature in `docs/phases/`); the WAAPI test cells went from 15–17 dB to 34–36 dB with the Stylo
patches.
