# Phase 3: shared DOM/Web host

Read `../../PHASE3_RESULTS.md` for results. The shared host itself is production code in
`../../dom-host`; the Boa adapter is `../../upstream-patches/blitz/0013-*.patch`.

| Folder | What |
|---|---|
| `engine/` | Deno/V8 adapter: typed ops into `canvas-dom-host`, `bootstrap.js` (wrapper caches, callbacks, rAF queue), watchdog, `ScriptRuntime` |
| `addon/` | `ExperimentalDenoRenderer` (N-API): one owner thread per renderer, document/layout/paint |
| `contract/` | One engine-independent contract suite (`run.mjs`), determinism + GSAP + Motion probe (`scenes.mjs`), the same cases on the pre-Phase-3 Boa (`run-boa-v05.mjs`) |
| `tests/` | Phase 2 lifecycle matrix on the Phase 3 addon (`run.mjs`), memory probes, `benchmark.mjs`, `ab-boa.mjs` |
| `graphify/` | Directed Graphify code graph of the Phase 3 code, layer analysis (`layers.py`), crate graph, `graph.html` |
| `evidence/` | JSON/log output of every run above, PNG frames |

```js
const a = require('./addon.node')
a.initPlatform()                       // Node main thread, before worker_threads
const r = new a.ExperimentalDenoRenderer(html, { width: 160, height: 64, epochMs: 0, evalTimeoutMs: 1000 })
r.eval('document.getElementById("box").style.opacity = "0.5"')
r.advanceTo(250)                       // absolute, monotonic visual ms; due timers run in order
const rgba = r.render()                // rAF, then style, layout, paint (same as the Boa renderer)
r.close()                              // idempotent; the finalizer also closes on the owner thread
```

Build: `cd .. && cargo build --release --locked -p phase3-addon && cp target/release/libphase3_addon.so phase3/addon.node`.
