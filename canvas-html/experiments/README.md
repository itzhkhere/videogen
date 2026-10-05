# Experimental scripting runtime gates

This is an independent Cargo workspace. It does not modify canvas-html's
production dependencies or remove Boa. Linux test commands:

```bash
cd canvas-html/experiments
bash run.sh
```

`Cargo.lock` pins the resolved dependencies. On a fresh development host,
install Rust/Cargo, a working C/C++ toolchain, and the requirements of
rusty_v8's prebuilt archive downloader. See `../POC_RESULTS.md` for what
actually ran and the tested versions. `run.sh` stops at the first failed gate.
Do not interpret the presence of source as evidence that it ran.

- `runtime-poc`: Deno extensions, host-owned clock, minimal timer/rAF bootstrap,
  JSON eval, explicit event-loop drain, smoke assertions, small benchmarks.
- `deno-core-smoke`: standalone smoke/benchmark executable.
- `deno-napi-coexist`: synchronous N-API addon. Every exported evaluation creates
  and destroys a runtime on the calling thread. No V8 handle crosses threads.
  The test initializes Deno's platform on the main Node thread before workers.
  A separate worker-first process probes a less controlled startup order.
- `deno-canvas-bridge`: HtmlDocument, plain Rust mutations, style/layout resolve,
  Skia RGBA/PNG output, visible pixel assertions, five fresh replay runs.
- `compatibility.mjs`: bare-global probes, existing prelude, GSAP object/selector probes.
- `baseline-clock-limit.mjs`: records the existing wall-anchored Date limitation.
- `baseline.mjs`: supplied Boa addon measurements and five deterministic replays.

The POC has no module loader or network/process/file extensions. It is not a
Deno CLI or complete browser runtime. rAF runs at explicit host advances;
Date uses epoch zero; timeout callbacks use exact virtual deadlines with
insertion order for ties. Backward time requires a fresh runtime. Randomness
and locale are not controlled: general deterministic web execution is not
established by this bootstrap.

Benchmarks are deliberately simple. Deno runtime creation and raw JSON eval
cannot be compared directly with Boa renderer construction (HTML, layout,
fonts, prelude) or Boa's eval/message wrapper. Host op-add and Date.now loops
also exercise different host contracts. Use the results to scope follow-up
measurements, not to assert a general engine speedup.
