# canvas-html Phase 3 — Agent Handoff

This package is for a **new agent** taking over the next engineering phase of `canvas-html`.

## What to read, in order

1. `PHASE2_RESULTS.md` — authoritative measured evidence from the previous run.
2. `02_PROJECT_CONTEXT.md` — project architecture and constraints.
3. `03_PHASE2_FINDINGS.md` — short operational summary of what Phase 2 established.
4. `01_AGENT_PROMPT_PHASE3.md` — the actual task prompt to execute.
5. `04_PHASE3_ACCEPTANCE_CRITERIA.md` — pass/fail checklist.
6. `05_FUTURE_GPU_DIRECTION.md` — context for what comes after Phase 3.

## Immediate goal

Phase 3 is **not** about new graphics features.

It is about extracting one clean, engine-neutral DOM/Web behavior layer shared by:

```text
Boa
Deno/V8
```

while:

```text
Boa remains production/default
Deno remains experimental
```

The result should make the JavaScript engine replaceable without allowing engine-specific objects to leak into layout/paint.

## Explicitly out of scope

Do not implement:

```text
WebGPU
wgpu
Dawn
Three.js
GSS
GPU-backed Skia
Canvas 2D expansion
CAD
networking
Node compatibility
full browser DOM
full WebIDL
```

These are future phases.

## Important architectural direction

The intended dependency shape is:

```text
                 canvas-html

              shared DOM/Web host
                     |
            +--------+--------+
            |                 |
        Boa adapter       Deno adapter
            |                 |
           Boa                V8

                     |
              Blitz / Stylo
                     |
                   Skia
```

JS engines adapt to the shared host.

The shared host must not adapt itself around engine-specific JS object models.

## Main Phase 2 conclusion

The production-style Deno design is the **dedicated runtime thread** model:

```text
Node / N-API
    |
 command channel
    |
 dedicated Rust thread
    |
 Tokio current-thread runtime
    |
 persistent deno_core::JsRuntime
    |
 DOM host / document / paint
```

Do not go back to caller-thread V8 ownership unless you are deliberately investigating a new design and can prove its lifecycle safety.

## Deliverable expected from the next agent

The next agent should leave:

```text
PHASE3_RESULTS.md
source changes / experiment code
shared contract tests
benchmark outputs
determinism hashes
architecture notes
remaining-gap table
```

and a clear:

```text
GO
CONDITIONAL GO
NO-GO
```

decision for whether the shared DOM/Web adapter is ready to become the architectural center of canvas-html.
