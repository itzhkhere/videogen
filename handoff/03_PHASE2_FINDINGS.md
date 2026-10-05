# Phase 2 Findings — Short Handoff Summary

This document is a compact summary only.

`PHASE2_RESULTS.md` is the authoritative source.

---

# Decision

Phase 2 concluded:

```text
CONDITIONAL GO
```

for continuing an engine-neutral JS/DOM architecture while keeping Boa as the production runtime.

---

# Most important architecture result

The recommended Deno/V8 design is:

```text
Node / N-API
    |
 synchronous command channel
    |
 dedicated Rust thread
    |
 Tokio current-thread runtime
    |
 persistent deno_core::JsRuntime
    |
 DOM/document/layout/paint
```

The caller-thread persistent V8 model was not accepted as the baseline.

Two live caller-thread runtime instances hit a V8 handle-scope/isolate lifecycle failure.

The dedicated-thread model avoided that ownership problem.

---

# Lifecycle evidence

The final dedicated-thread prototype survived:

```text
2,111 runtime create/drop cycles
10,000 evals on one persistent runtime
10,000 seeks
1,000 renders
16 simultaneous renderers
workers up to 8
graceful worker exit
forced worker termination
normal Node exit with live renderers
JS exception then continued use
watchdog termination of runaway JS
```

No V8 symbol renaming or Node isolate-pointer sharing was used.

---

# DOM / GSAP evidence

The Deno prototype ran actual bundled GSAP selector animation:

```js
gsap.to("#box", {
  x: 100,
  opacity: 0.5,
  duration: 1,
  ease: "none"
});
```

At:

```text
0
250
500
750
1000 ms
```

the expected transform and opacity values were observed and rendered deterministically.

This proved:

```text
GSAP
  ↓
JS wrappers
  ↓
engine-neutral-ish host boundary
  ↓
Blitz / Stylo
  ↓
Skia
```

is viable.

---

# Deterministic time evidence

The Deno prototype used:

```text
Date.now() = epochMs + visual time
performance.now() = visual time
```

with no wall-time advancement.

Five fresh renderers produced identical frame hashes for the tested scene at identical timestamps.

---

# Performance shape

Phase 2 showed:

```text
V8/Deno:
very strong on JS execution
higher tiny-call/channel overhead
slower empty seek than Boa
slightly slower render in the tested tiny scene
```

This means the project should avoid designing an excessively chatty Node↔Deno public API.

It does **not** imply a single universal Deno-vs-Boa speed factor.

---

# Memory result

The apparent large growth during long synchronous render loops was mostly explained by returned RGBA external Node Buffers whose finalizers could not run until Node got event-loop/GC turns.

When Node was allowed to collect periodically, a 10,000-frame live-renderer run stayed approximately flat in native allocated bytes.

A separate native retained-allocation slope exists during render/create/destroy churn.

That slope was also reproduced in a Boa paint-only control.

The exact native owner is unresolved and may involve renderer/backend/cache lifecycle.

Do not call it a Deno leak without allocation-stack evidence.

---

# Current blockers

The important unresolved work is:

```text
shared DOM/CSSOM adapter
cross-platform/Node-version validation
native render-churn allocation profiling
production-quality ownership/errors/script semantics
```

Phase 3 is specifically about the first item.

---

# What Phase 3 should NOT do

Do not widen into:

```text
WebGPU
GPU-backed Skia
Three.js
GSS
CAD
networking
full browser DOM
full WebIDL
```
