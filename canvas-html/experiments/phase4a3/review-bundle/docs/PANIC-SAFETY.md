# Panic safety

**Invariant:** ordinary malformed user input — options, arguments, HTML, CSS, page JavaScript —
results in a JavaScript error, never a process abort.

A Rust panic cannot unwind into Node through the N-API boundary: without a guard it aborts the
process. The engine therefore (1) validates input and returns errors for everything a caller or a
page can get wrong, and (2) puts a backstop at the N-API boundary of every method that runs engine
code (Blitz, Stylo, Taffy, Parley, Boa, Skia), for bugs that remain.

## Backstop policy

- `HtmlRenderer::guarded` (`src/lib.rs`) wraps the method body in `std::panic::catch_unwind`. On a
  panic it returns `Error: internal error in <method>(); the renderer was closed (please report
  this)`, marks the renderer closed (every later call throws `renderer is closed`) and leaks the
  document instead of dropping it, because dropping half-updated engine state could panic again.
- The panic message is **not** passed to JavaScript (it may contain internal paths or values); Rust's
  default panic hook still prints it to stderr for debugging.
- The constructor has the same backstop without the renderer part.
- Ordinary validation errors never go through the backstop: they are `Result` errors with their own
  messages (and, for `renderInto` targets, `TypeError`/`RangeError` with Node-style codes).
- Getters and methods that run no engine code are not wrapped.
- Cost: measured on `render()`/`renderInto()` in phase 4A.2 (`experiments/phase4a2/evidence/catch-unwind.md`):
  within run-to-run noise (±1.5 µs on ~10 µs calls; nothing at frame scale). The other wrapped
  methods are not hot.

## Per method

| method | user-controlled input | fallible operations | validation | backstop | remaining assumptions |
|---|---|---|---|---|---|
| `new HtmlRenderer(options)` | width, height, devicePixelRatio, background, fonts options, clock, epochMs, experimentalBackend, experimentalGpuShare | float → u32 size, frame size arithmetic, hex parsing, GPU device creation | size 1..=32767 px per side with checked multiplication (`frames::frame_len`); DPR finite and > 0; background: ASCII-hex bytes only, `#rrggbb`/`#rrggbbaa`; clock `frozen`/`real`; epoch finite within ±8.64e15; backend names; GPU device errors returned | yes | `as u32` float casts saturate (no panic) |
| `registerFont(data)` | font bytes | none (copied; parsed at `load`) | — | no (no engine code) | font parsing happens in `load`/`render`, which are guarded |
| `load(html, baseUrl?)` | HTML, CSS, scripts, URLs | URL parsing, HTML/CSS parsing, script execution, resource loading | `baseUrl` parsed with `url`; resources: only `file:`/`data:`, failures recorded in `loadErrors`; script errors in `jsErrors` | yes | parser/engine bugs in Blitz/Stylo/Boa are contained by the backstop |
| `render(options?)` | format | frame allocation, paint, PNG encoding | format `rgba`/`png`; fallible allocation (`could not allocate a N MiB frame`) | yes | — |
| `renderInto(target)` | target | N-API typed-array queries, slice creation | open renderer → typed array → `Uint8Array`/`Uint8ClampedArray`/`Buffer` → not shared → attached → exact length (`src/target.rs`); rejected before any work | yes | see `UNSAFE_AUDIT.md` for the slice invariant |
| `frameByteLength`, `pixelWidth`, `pixelHeight`, `clockTime`, `jsErrors`, `loadErrors` | — | — | — | no | trivial getters |
| `advanceClock(ms)` | ms | Duration/Instant arithmetic, timer callbacks | finite, ≥ 0, and clock + ms ≤ 8.64e15 ms (range of a JS `Date`), checked before any conversion; `Duration::try_from_secs_f64` + `Instant::checked_add`; more than 100 000 timer callbacks in one call → error | yes | — |
| page `setTimeout`/`setInterval(f, delay)` | delay (page JS) | Duration conversion | non-finite/negative → 0; above i32::MAX → wraps like a WebIDL `long` (Blitz patch 0014) | via the calling method (`load`/`render`/`advanceClock`/`eval`) | — |
| `eval(code)` / `call(name, ...args)` | arbitrary JS | script execution, JSON conversion | needs `scripts: true`; exceptions → `Error` with the JS message; results through JSON | yes | `call` is `eval` with JSON-encoded arguments (`index.js`) |
| `boxes()`, `missingGlyphs()` | — (document) | layout traversal | missing nodes skipped; no document → error | yes | — |
| `close()` | — | drops document, runtime, GPU device | idempotent | no | `Drop` of engine state is assumed not to panic |
| `_renderTimed`, `_renderIntoTimed`, `_renderFramesExperimental`, `_pipelineSubmit`, `_pipelineComplete`, `_dropNodeForTesting` (private) | options, targets, times | as above, GPU pipeline | as above; pipeline depth 1..=8; frame times finite ≥ 0 | yes | `fence.expect` in the GL PBO pipeline is an invariant (every GlPbo submit stores a fence) |
| `_pipelineStart/_pipelineStop`, `_nativeHeap`, `_backendInfo`, `_purgeSkiaFontCache`, `_gpuFreeResources`, `_gpuAbandonForTesting` (private) | mode, depth | GPU allocation | mode names, depth range | no | no engine painting runs |

Argument conversion is done by napi-rs before the method body: a wrong JS type is a `TypeError`/
`Error` from napi-rs, not a panic.

## Removed panic paths (phases 4A.2–4A.3)

- `background`: byte-index slicing of a UTF-8 string (`&h[i..i + 2]`) could split a multi-byte
  character → now parsed as bytes after an ASCII-hex check.
- `advanceClock`: `Duration::from_secs_f64` on huge finite values, unchecked `Instant + Duration`
  → explicit maximum and checked arithmetic.
- page timers: `Duration::from_secs_f64(delay / 1000)` for any finite delay (Blitz patch 0014).
- `expect("document")` / `unwrap()` on the document in paint, layout queries and `doc_mut`; mutex
  poisoning on the load-error list; `get_node(..).unwrap()` in `boxes`/`missingGlyphs`.
- vendored CPU renderer: `surfaces::wrap_pixels(..).unwrap()` → `try_render` (anyrender_skia patch 0006).
- `devicePixelRatio: Infinity` relied on a saturating cast reaching the size check → rejected explicitly.

## Tests

`test/hardening.mjs` (background strings incl. multi-byte UTF-8 at every position, emoji,
combining marks, NUL, empty and 100 000-character input; `advanceClock` NaN/±Infinity/negative,
the maximum and one past it; page timers up to `Number.MAX_VALUE`), `test/render-into.mjs`
(target validation, closed renderer, size limits, NaN/Infinity/0/negative DPR). A synthetic panic
in a throwaway build was turned into `Error` with the process alive (`experiments/phase4a2/evidence/catch-unwind.md`;
since 4A.3 the message is generic).
