# Upstream patches

canvas-html builds against patched copies of three upstream projects. Each folder holds a
`git format-patch` series that can be opened as pull requests. v0.3 added the typography fixes;
v0.5 added the animation fixes (Blitz 0007–0009, Stylo 0002–0005).

All of them were checked against Chrome with `test/typo/compare-typo.mjs`, and the Blitz
patches pass `cargo fmt` and `cargo clippy` (blitz-paint and blitz-dom) with the patched Stylo.

## DioxusLabs/blitz (base: `0db8c74`)

| Patch | What it fixes | Typography sheet (PSNR vs Chrome) |
|---|---|---|
| 0001 synthetic bold | Uses `run.synthesis().embolden()`, so a missing bold face is synthesised (it was only enabled by a global feature flag) | 25.7 → 29.3 dB |
| 0002 `text-transform: capitalize` | Implemented, with word-start state carried across text nodes and inline elements. Includes a unit test | 17.3 → 29.9 dB |
| 0003 `text-overflow` | `ellipsis` and `<string>` markers on left-to-right lines when the inline root's `overflow` clips. The marker uses the font of the run where the cut happens | 27.5 → 31.8 dB |
| 0004 `text-shadow` | Offset, colour and blur (a layer gaussian filter with std-dev = radius / 2), painted below the line's text, back to front. Shares the text-overflow truncation with the text | 23.3 → 34.1 dB |
| 0005 `background-clip: text` | Paints the background in an isolated layer, then keeps it only under the element's own glyphs (DestIn). **Requires the Stylo patch below.** | 11.1 → 37.1 dB |
| 0006 | `cargo fmt` | — |
| 0007 animation time for script restyles | `resolve()` remembers its time; restyles that script triggers (layout queries) reuse it instead of restyling at t = 0, which jumped running animations back to their start | — |
| 0008 no redundant animation restyles | Animating elements are only marked for restyle when the timeline time changed, so a `getComputedStyle` at the same time no longer restyles every animating element | CSS seek scenes 1.2–1.9× faster |
| 0009 seek a paused animation from script | `BaseDocument::set_paused_animation_time` and the vibey global `__blitz_set_animation_time(element, name, seconds)` move a paused Stylo animation without a style change, so no keyframes are recomputed. A building block for `Animation.currentTime`. **Requires Stylo 0002.** | — |
| 0010 empty inline content keeps the block's height | `<div style="height: 52px"><span></span></div>` (an empty line in a code view) collapsed to 0×0 | found making the promo video |
| 0011 angled gradients centred on their tile | With `background-size`, `linear-gradient(90deg, c 1px, transparent 1px)` filled whole tiles, because the gradient line was centred on the element, not the tile | grid backgrounds |
| 0013 vibey-script on canvas-dom-host (Phase 3) | The Boa DOM delegates the shared subset (selectors, text, attributes, `classList`, inline/computed style, geometry, listener metadata, timer ordering, clock contract) to `canvas-html/dom-host`, which the Deno/V8 adapter shares. Also: cached `element.style`/`classList`, `Event`/`CustomEvent` + `dispatchEvent`, microtasks after each timer, stable equal-deadline timer order, fractional `performance.now()`, settable epoch. **Not upstreamable as is**: it depends on canvas-html by path (`../../../canvas-html/dom-host`). | — |
| 0012 `background-clip: text` on inline elements | A gradient `<span>` inside a heading was not painted (inline elements only got `background-color`). Its background is now painted over the box of its glyph runs and masked by them. Limit: one box over all line fragments when it wraps | gradient words in headings |

Known limits worth mentioning in the PRs:

- text-overflow: right-to-left lines are not truncated yet, and the marker is mapped character by character through the cmap, without shaping.
- background-clip: text only uses the element's own inline layout, not text inside descendant block boxes. If any background layer clips to text, the whole background does.

## DioxusLabs/anyrender, crate `anyrender_skia` (base: 0.12.0)

| Patch | What it fixes |
|---|---|
| 0001 per-glyph skew + embolden | `glyph_transform` was concatenated to the canvas matrix, shearing glyph *positions* around the page origin. That is why synthetic italic came out garbled. A pure horizontal skew now maps to `Font::set_skew_x` (sign flipped, because glyph transforms are y-up). The `embolden` argument was ignored; it now sets `Font::set_embolden`. Synthetic italic went from 15.5 to 33.3 dB. |
| 0002 brush alpha | `set_paint_alpha` replaced the colour's alpha instead of multiplying it, so `color: transparent` and `rgba(…, 0.5)` text were painted opaque. |
| 0003 headless GPU renderers (Phase 4A, experimental) | Offscreen GPU image renderers next to the CPU one: Ganesh (OpenGL via an EGL device and a surfaceless context; Vulkan without surface extensions) and Graphite (Vulkan), with per-frame record/submit/wait/readback timings. skia-safe `gl` becomes the default feature `ganesh-gl` so a Graphite-only Skia binary can be linked (rust-skia ships none with both engines). Graphite drops raster images and rust-skia does not bind Recorder image providers, so the scene painter uploads images through the recorder. Off by default; the window renderer and the default feature set are unchanged. |
| 0004 Ganesh context options from an environment variable (Phase 4A, experiments only) | `CANVAS_HTML_GANESH_OPTIONS` turns off Ganesh path renderers and caches without a rebuild. Used to find the cause of frame drift after a reload. **Not for upstream as is**: an upstream version would take `ContextOptions` from the caller. |
| 0005 render into the caller's buffer; pipelined readback (Phase 4A.1, experimental) | `render_timed()` writes into a slice the caller owns (length checked) instead of resizing a `Vec`, so pixels go straight into embedder memory. Adds a prototype readback pipeline to `SkiaGpuImageRenderer`: a ring of surfaces read back later (GL or Vulkan), or `glReadPixels` into pixel-pack buffers with fences (GL). rust-skia does not bind Ganesh's async readback, so the GL path uses the `gl` crate on the renderer's context and resets Skia's GL state after. |
| 0006 `try_render` (Phase 4A.2) | `ImageRenderer::render` unwrapped `surfaces::wrap_pixels`, so a buffer shorter than `width × height × 4` panicked. `SkiaImageRenderer::try_render` returns an error and draws nothing; `render` keeps its signature and calls it. |

## servo/stylo (base: 0.22.0)

| Patch | What it fixes |
|---|---|
| 0001 `background-clip: text` | The `Text` value was only parsed in Gecko builds. Blitz uses Stylo in Servo mode, so the declaration was dropped. |
| 0002 paused animations hold their current time | Changing the delay, duration or direction of a paused animation could only move it forward by whole iterations and kept the old direction. Seeking backwards or across an `alternate` iteration showed the wrong frame. Adds `Animation::set_paused_time`. |
| 0003 every animation of an element updates | `maybe_start_animations` returned after the first match, so with `animation: a 1s, b 2s` style changes never reached `b`. |
| 0004 easing in reverse iterations | `ease-in` in a `reverse`/`alternate` iteration played as a mirrored `ease-out`. Now the forward interval and its timing function get the directed progress, as in browsers. |
| 0005 keyframes from the underlying style | Implicit `from`/`to` keyframes were computed from a style that already held the animated values, so a single-keyframe animation drifted on every restyle. |

The Stylo patches are made against the crates.io package (`servo/animation.rs`), so in the
servo/stylo repository the paths start with `style/`.

The WAAPI cells of `test/scenes/waapi.html` went from 15–17 dB (cells 7 and 12) to 34–36 dB
against Chrome with these patches.

## Applying them

`scripts/setup-blitz.sh` clones Blitz at the base commit next to this folder and applies the
series. The anyrender_skia and Stylo patches are already applied in `vendor/`.
