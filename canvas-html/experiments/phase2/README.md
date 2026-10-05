# Phase 2: private persistent Deno renderer

The experiment uses Model B: one owned Rust execution thread per renderer, plus
one deadline thread. All V8, document, layout, and paint operations stay on the
execution thread. Channel payloads contain Rust-owned strings, numbers, JSON,
and pixel vectors. Production Boa source and defaults remain unchanged.

```js
const addon = require('./addon.node');
addon.initPlatform(); // Node main thread, before creating worker_threads
const r = new addon.ExperimentalDenoRenderer('<div id="box">Hello</div>', {
  width: 160, height: 64, epochMs: 0, evalTimeoutMs: 1000
});
r.eval('document.getElementById("box").style.opacity="0.5";null');
r.seek(250);                 // absolute, monotonic visual time in milliseconds
const rgba = r.render();     // RGBA Buffer; r.render(true) returns PNG
console.log(r.jsErrors());
r.close();                   // idempotent; GC and environment teardown also close
```

This is an experiment, not a public package. HTML script elements are inert;
use `eval()` explicitly. Backward seek requires a fresh renderer and replay.
A timed-out runtime is poisoned and must be closed. The timeout covers JS
execution, not arbitrary native layout/paint stalls. Node methods are synchronous;
forced worker termination waits for a pending call to return. Use a frame pipeline
that yields to Node so pixel Buffer finalizers can run.

## Build

Start with the supplied canvas-html v0.5 repository, or use this archive's source.
Keep Blitz as its sibling. On a standard Linux x64 Rust installation:

```bash
cd canvas-html
bash scripts/setup-blitz.sh
cd experiments
cargo build --release --locked -p phase2-addon
cp target/release/libphase2_addon.so phase2/addon.node
node --expose-gc phase2/tests/run.mjs
```

Build prerequisites are the original repository's Skia/Fontconfig/Freetype/C++
requirements, plus deno_core's cached/downloaded rusty_v8 archive. Only Linux x64
was built. Do not infer that the copy command or libraries work on another OS.
The custom compiler installation used for the measured run is not included.

## Tests and measurements

`tests/run.mjs` gives each subprocess a 240-second deadline and captures stdout,
stderr, status, and signal under `evidence/`. Its default matrix includes DOM,
clock, exceptions, JS deadlines, lifecycle cycles, simultaneous renderers, five
fresh deterministic scenes, actual GSAP selector tween and ticker playback,
workers, and normal process shutdown. The caller-thread crash probes are preserved
for diagnosis and must be run only against the archived Model A source/binary,
not treated as a passing test of Model B.

```bash
node --expose-gc phase2/tests/run.mjs memory-cycles-construct memory-cycles-eval memory-cycles-render memory-long-eval memory-long-seek memory-long-render memory-long-style memory-long-render-gc memory-boa-render
node --expose-gc phase2/tests/memory-footprint.mjs deno
node --expose-gc phase2/tests/memory-footprint.mjs boa
node --expose-gc phase2/tests/benchmark.mjs deno
node --expose-gc phase2/tests/benchmark.mjs boa
node phase2/tests/worker-startup.mjs
```

Boa measurements in this run use the unchanged production addon rebuilt in
Phase 1. For reproduction, set `BOA_ADDON_PATH` to an absolute path to your
production `.node` addon. The helper otherwise uses the Phase 1 rebuilt addon if
present, then the normal production `index.js` loader.

Memory snapshots use Node heap/external statistics, glibc mallinfo2, embedded V8
statistics, and process high-water RSS. Current RSS is unavailable here. Read
`../../PHASE2_RESULTS.md` for the allocation findings and limitations.

## Graphify

Graphify 0.9.77 was installed in an isolated workspace environment. The final map
is rebuilt from current code, without reading the old map or using a semantic
layer. Its outputs are under `evidence/graphify/graphify-out/`. Dependency queries,
health diagnostics, install log, exact dependency versions, and source SHA-256
values are preserved. AST navigation helps locate boundaries; it does not prove
thread safety or replace source inspection and tests.

```bash
python3 -m venv /path/to/graphify-env
/path/to/graphify-env/bin/pip install graphifyy==0.9.77
/path/to/graphify-env/bin/graphify extract . --code-only --force --out experiments/phase2/evidence/graphify
/path/to/graphify-env/bin/graphify cluster-only . --graph experiments/phase2/evidence/graphify/graphify-out/graph.json --no-label
```
