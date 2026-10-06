# canvas-html

HTML, CSS and JavaScript rendered to pixels in Node, **without a browser**.

You load a page, change it with JavaScript if you want, and call `render()` to get its pixels, much like drawing an element into a canvas with Chrome's HTML-in-Canvas API. Style, layout and text come from [Blitz](https://github.com/DioxusLabs/blitz) (Firefox's Stylo CSS engine, Taffy for flexbox and grid, Parley for text). Skia paints the pixels, and Boa runs the JavaScript. The package is a Node addon built with napi-rs, in the same spirit as `@napi-rs/canvas`, except that you give it HTML instead of draw calls.

```js
const { HtmlRenderer } = require('canvas-html')

const r = new HtmlRenderer({ width: 1280, height: 720, scripts: true })
r.registerFont(fs.readFileSync('Inter-Bold.otf'))  // or @font-face with a file URL
r.load(html, 'file:///path/to/assets/')            // baseUrl resolves images, fonts, stylesheets

r.call('seek', 1500)              // run a function of the page (see "Making video" below)
const rgba = r.render()           // RGBA pixels, 4 bytes per pixel, row by row
const png = r.render({ format: 'png' })

r.eval('document.title')          // run code in the page; the result comes back through JSON
r.boxes()                         // layout boxes of elements with an id
r.missingGlyphs()                 // text that no available font can draw
r.close()                         // release the document and script runtime now (optional)
```

## The engine has no video concepts

canvas-html draws a page as it is now. It has no frames, no fps and no timeline. Time reaches the page in one of two ways:

- **The clock.** By default the clock is **frozen**: `Date.now()`, `performance.now()`, timers and CSS animations stand still, so rendering the same state twice gives the same pixels. `advanceClock(ms)` moves it forward and runs the timers that come due on the way, in order. With `clock: 'real'` the clock follows the wall clock, like a browser tab. `Date.now()` starts at the wall-clock time of the load unless you pass `epochMs`: then `Date.now() = floor(epochMs + clock)`, `performance.now() = clock` and `performance.timeOrigin = epochMs`, so pages that print the date also render the same pixels on every run.
- **Your page.** Script can change anything before a render: styles, text, a GSAP timeline, Web Animations.

`requestAnimationFrame` callbacks run once per `render()`, right before style and layout, like a browser's rendering step. Their timestamp is the clock time.

## Making video: the seek(t) contract

To make video, write the page as a pure function of time, the same rule as recording a page with Chrome: define `window.seek(ms)` so that it shows the page at `ms`. Then each frame is `r.call('seek', t)` followed by `r.render()`. Frames can be rendered in any order and split across workers, and Chrome can render the same page by calling the same function (that is how `npm run compare` works).

```html
<!-- CSS animations: pause every animation at ms -->
<script>window.seek = (ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms } }</script>

<!-- GSAP -->
<script>const tl = gsap.timeline({ paused: true }); /* ... */ window.seek = (ms) => { tl.seek(ms / 1000, false) }</script>

<!-- Motion (motion.dev) -->
<script>const c = [animate('#title', { opacity: [0, 1] }, { duration: 0.8 }) /* ... */]; c.forEach((x) => x.pause())
window.seek = (ms) => { for (const x of c) x.time = ms / 1000 }</script>
```

```js
for (let i = 0; i < 180; i++) {
  r.call('seek', (i * 1000) / 30)
  ffmpeg.stdin.write(r.render())   // see test/encode.mjs
}
```

A page that plays on its own (GSAP without `paused`, a rAF loop) also works: step it with `advanceClock(1000 / fps)` and `render()`, in order. Seeking is better for video, because any frame costs the same and workers can share the work.

## Scope

canvas-html is an engine: **the page as it is now → the right pixels**, as fast as one renderer can make them. Everything about video belongs to the application that uses it (for us, a separate video pipeline):

| canvas-html | Your application |
|---|---|
| Style, layout, text, painting, CSS animations, Web Animations, JavaScript | The `seek(t)` convention, frame times, fps |
| `render()`, `eval()`, `call()`, a clock you control | Encoding (ffmpeg), audio, splitting frames across workers, caching |
| `registerFont`, fallback order per script | Choosing and shipping fonts |
| Raw facts: `boxes`, `missingGlyphs`, `loadErrors`, `jsErrors` | Policies: fail the render, fall back to Chrome, review images |

Renderers share no state, so renderers in separate `worker_threads` give exactly the same pixels as one renderer (`test/workers.mjs`).

## Web Animations

With `scripts: true`, the page has `document.getAnimations()`, `element.getAnimations()`, `element.animate()` and `document.timeline`. Every animation is a paused CSS animation inside Stylo, so interpolation is native. `currentTime` moves it directly in the engine, without a style change. What is not supported throws a `NotSupportedError`; nothing is half implemented.

| Supported | Not yet (throws `NotSupportedError` where an API exists) |
|---|---|
| CSS animations from stylesheets in `getAnimations()`, with `animationName` | CSS transitions in `getAnimations()` |
| `element.animate()` with keyframe arrays or property-indexed keyframes, `offset`, per-keyframe `easing` | `composite: 'add'` / `'accumulate'` |
| `duration`, `delay`, `endDelay`, `iterations` (also `Infinity`), `direction`, `fill`, `easing`, `id` | `iterationStart`, `reverse()`, negative `playbackRate`, an overshooting overall `easing` with 3+ keyframes |
| `currentTime`, `startTime`, `playState`, `playbackRate` > 0, `play`, `pause`, `finish`, `cancel` | `commitStyles()` in the middle of an animation (start and end work) |
| `finished` promise, `onfinish`/`oncancel`, `addEventListener` | `new KeyframeEffect()`, `new Animation()` |
| `effect.getTiming`, `getComputedTiming`, `updateTiming`, `getKeyframes` | Scroll and view timelines |

Two limits to know:

- An overall `easing` on an animation with three or more keyframes is split exactly into one curve per keyframe interval. That works for every curve that stays between 0 and 1. An overshooting curve (such as `cubic-bezier(.34, 1.56, .64, 1)`) on such an animation throws a `NotSupportedError`; put it on the keyframes instead. With two keyframes any easing works.
- Once script takes over an element's animations, its `animation-*` lists live in its inline style, so later stylesheet changes to those lists are overridden.

`test/scenes/waapi.html` has twelve cells that use these features. Each cell matches Chrome at every tested time (31–40 dB per cell), and the scripted state (`currentTime`, progress, iteration) is identical.

## Results (v0.5, 2-core cloud VM, 1280×720)

`npm run compare` renders every scene in `test/scenes/` with canvas-html and with headless Chrome. Both call the scene's `window.seek(t)`. It writes `[canvas-html | Chrome | difference ×4]` images to `test/report/`.

| scene | PSNR vs Chrome | canvas-html fps (seek + render) | Chrome fps (JPEG capture) | speedup |
|---|---|---|---|---|
| effects (image clip, conic/radial gradients, skew, SVG, glass) | 38.1 dB | 52 | 29 | 1.8× |
| gsap (GSAP timeline, stagger, elastic, text counter) | 38.7 dB | 194 | 30 | 6.5× |
| layout (flex, wrap, grid spans, wrapped text, lists) | 33.4 dB | 117 | 30 | 4.0× |
| motion-library (motion.dev `animate()`, springs, stagger) | 36.1 dB | 180 | 30 | 6.1× |
| motion (CSS keyframes, transforms, opacity, colour, width) | 34.7 dB | 81 | 30 | 2.7× |
| typography (gradient headline, justified columns, ellipsis) | 32.7 dB | 149 | 30 | 5.0× |
| waapi (twelve `element.animate` timing cases) | 36.6 dB | 193 | 30 | 6.5× |

PSNR guide: about 30 dB looks the same at a glance, and 40 dB or more is near identical. The fps numbers vary by about 10% between runs on this VM. Piped to x264 (`node test/video.mjs out.mp4 scenes/motion-library.html`), the Motion scene encodes at about 93 fps.

The CSS-only scenes pay about 2 ms per frame for the JavaScript seek: `document.getAnimations()` reads the computed style of every element that has no animation yet. For long renders, get the list once: `let all; window.seek = (ms) => { all ||= document.getAnimations(); ... }`.

## Typography

`node test/typo/compare-typo.mjs` renders a sheet of 20 typography features with canvas-html and with Chrome, and scores each cell. The fixes live in patched Blitz, anyrender_skia and Stylo; see `upstream-patches/UPSTREAM.md`.

| Feature | before the patches | now |
|---|---|---|
| `background-clip: text` (gradient text) | 11.1 dB | **37.1 dB** |
| `text-shadow` (incl. blurred glows) | 23.3 dB | **34.1 dB** |
| `text-overflow: ellipsis` / string | 27.5 dB | **31.8 dB** |
| Synthetic italic | 15.5 dB (garbled) | **33.3 dB** |
| Synthetic bold | 25.7 dB | **29.3 dB** |
| `text-transform: capitalize` | 17.3 dB | **29.9 dB** |
| Arabic / Tamil / Hindi when the main font lacks them | broken shaping (fell back to Unifont) | shaped, using a real font for that script when one is installed or registered |
| `rgba()` / `transparent` text colour | painted opaque | correct |

Fonts: canvas-html ships none. Register fonts with `registerFont(buffer)` or `@font-face`, or rely on the fonts installed on the machine (`systemFonts`, default true). For text in a script the element's font lacks, it tries families in a fixed order per script; for Tamil that's "Noto Sans Tamil", "Lohit Tamil", "FreeSerif", then "Unifont". This avoids the default Linux choice, Unifont, which cannot shape Arabic or Indic text. Change the order with `fallbackFonts: { Taml: ['My Tamil Font'] }`. `missingGlyphs()` lists text that no font could draw.

## Known gaps

| Gap | What happens | Workaround for now |
|---|---|---|
| `-webkit-text-stroke` (outlined text) | Not parsed by Stylo outside Firefox builds. With `color: transparent` the text disappears | Use SVG `<text>` with `stroke` |
| `-webkit-line-clamp` | Not clamped (Firefox-only in Stylo, and no layout support) | Clamp the text before rendering |
| `text-overflow` on right-to-left lines | Clipped without a marker | — |
| `background-clip: text` | Works on blocks and inline elements; text inside nested blocks or inline-blocks is not part of the mask, and a wrapped inline element gets one background box over all its lines | Put the clip on the element that holds the text |
| Sub / superscript, box shadows | A few pixels off, slightly softer shadows | Usually fine |
| JavaScript | Off unless `scripts: true`. Boa's DOM covers what GSAP, Motion and Preact use, but not everything (no canvas 2D/WebGL, `fetch` only for local files) | Check `jsErrors` |
| Network resources | Only `file://` and `data:` URLs load; missing ones are listed in `loadErrors` | Keep assets local (also better for determinism) |
| Platforms | Prebuilt for linux-x64 only | `npm run build` with Rust installed |

## Build

```sh
scripts/setup-blitz.sh   # once: clone Blitz next to this folder and apply upstream-patches/blitz
npm run build            # cargo build --release, then copies the .node next to index.js
npm test                 # smoke tests: core, JavaScript, Web Animations, fonts
node test/workers.mjs 2  # worker-thread determinism and speed
npm run compare          # Chrome comparison (needs Chrome / Chromium; pass its path as an argument)
```

Blitz is pinned to commit `0db8c74` plus the patches in `upstream-patches/blitz` (via `[patch]` in `Cargo.toml`). Patched copies of `anyrender`, `anyrender_skia` and `stylo` are in `vendor/`. The first build compiles Stylo and downloads prebuilt Skia, which takes a few minutes.

## Changes in v0.5

The API is now the engine's alone; everything about frames moved to the application.

- Added `render(options?)` (`format: 'rgba' | 'png'`), `call(name, ...args)`, `advanceClock(ms)`, `clockTime` and the `clock: 'frozen' | 'real'` option (frozen by default).
- `eval()` returns the result through JSON and throws when the code throws. `boxes()` and `missingGlyphs()` take no time.
- Removed `frame(t)`, `framePng(t)`, `frames()`, `timeMode` and the `__canvasHtmlFrame` hook. Pages define `window.seek(ms)` instead, and the same page runs in Chrome.
- Added Web Animations (`getAnimations`, `element.animate`, `currentTime` seeking, timing, events) on top of native CSS animations.
- Fixed four Stylo animation bugs and added two Blitz changes (see `upstream-patches/UPSTREAM.md`): seeking paused animations backwards or across iterations, easing in reverse iterations, single-keyframe animations drifting, and only the first of several animations updating.
- Tested with Motion (motion.dev) 14 as well as GSAP 3.

## Next

- `renderElement(id)`: pixels and position of one element, like `drawElementImage` in Chrome's HTML-in-Canvas API.
- A `drawHtml` helper that draws into an `@napi-rs/canvas` context.
- Open the PRs in `upstream-patches/` (Stylo first, then anyrender_skia and Blitz).
- `-webkit-text-stroke` and `line-clamp` (both need Stylo changes first).
