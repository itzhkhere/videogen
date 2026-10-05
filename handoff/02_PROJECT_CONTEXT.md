# canvas-html — Project Context for Phase 3

## Product concept

`canvas-html` is a native renderer for web-authored visual scenes.

The important model is:

```text
document state at time t
        ↓
      pixels
```

It is not intended to become a browser UI or navigation engine.

The runtime is optimized around deterministic offline visual execution.

---

# Current rendering stack

Conceptually:

```text
Node / N-API
    |
    v
Rust canvas-html
    |
    +-- JavaScript runtime
    |
    +-- Blitz document
          |
          +-- Stylo
          +-- Taffy
          +-- Parley
    |
    v
AnyRender / Skia
    |
    v
pixels
```

Boa is currently the production/default scripting engine.

Deno/V8 is experimental.

---

# Why Deno/V8 is being explored

The project is increasingly expected to run non-trivial JavaScript animation/tooling.

Phase 1 and Phase 2 measured strong V8 performance on several JavaScript workloads and proved that `deno_core` can be embedded in the tested Node/N-API configuration.

The migration is **not** justified by JS speed alone.

The real architectural opportunity is:

```text
engine-neutral DOM/Web host
       |
 +-----+-----+
 |           |
Boa       Deno/V8
```

That lets the project choose scripting engines without rewriting DOM/layout behavior.

---

# Deterministic time is non-negotiable

Visual time must remain host controlled.

The desired policy is:

```text
Date.now() = epochMs + visualTime
performance.now() = visualTime
performance.timeOrigin = epochMs
```

Timers and rAF advance only because the renderer advances visual time.

Do not silently adopt wall-clock or Tokio time for visual state.

---

# Current Deno runtime architecture

Phase 2 established that the recommended runtime architecture is:

```text
Node N-API object
      |
 command channel
      |
 dedicated Rust execution thread
      |
 Tokio current-thread runtime
      |
 persistent deno_core::JsRuntime
      |
 document/layout/paint
```

The caller-thread persistent runtime model is not the recommended baseline.

---

# Current Phase 2 DOM capability

The Deno prototype demonstrated a deliberately narrow DOM/CSS subset sufficient for an actual GSAP selector tween.

Implemented/tested behaviors included:

```text
window === globalThis
getElementById
querySelector
querySelectorAll
stable element wrapper identity
textContent
stable style wrapper identity
opacity
transform
width
height
background
getComputedStyle for tested values
partial element bounds
partial createElement
```

This is not yet a production browser-compatible DOM.

The whole purpose of Phase 3 is to move those semantics into one shared engine-neutral host instead of maintaining separate Boa and Deno behaviors.

---

# Production behavior to preserve

Boa stays production/default throughout Phase 3.

The existing production smoke tests and worker determinism tests must remain green.

Do not remove or replace the working Boa path.

---

# Project direction after Phase 3

The project may later evaluate:

```text
GPU-backed Skia for HTML/CSS paint
shared GPU foundation
user-facing WebGPU
Three.js / other GPU authoring tools
GPU-native video pipeline
```

Those are separate future phases.

Do not let those future plans contaminate the Phase 3 DOM/runtime extraction.

---

# Explicitly not on the roadmap for this handoff

CAD is out of scope and should not be planned or referenced as a future deliverable.

The project focus is the visual runtime itself:

```text
HTML
CSS
SVG
JS animation
GPU-authored scenes later
deterministic rendering
video/image output
```
