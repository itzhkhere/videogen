# Future GPU Direction — Not Part of Phase 3

This file exists only so the next agent understands where the project may go after the DOM/runtime layer is stable.

Do **not** implement any of this during Phase 3.

---

# Current hypothesis

There are two separate GPU goals.

## Goal A — accelerate existing HTML/CSS/SVG painting

Current conceptual pipeline:

```text
HTML
  ↓
DOM
  ↓
Stylo
  ↓
Blitz layout
  ↓
paint commands
  ↓
Skia
  ↓
CPU raster surface
```

A future experiment should evaluate:

```text
HTML
  ↓
DOM
  ↓
Stylo
  ↓
Blitz layout
  ↓
paint commands
  ↓
Skia GPU surface
```

This does **not** require exposing WebGPU to page JavaScript.

The likely Phase 4A question is:

> Can the existing AnyRender/Skia path render unchanged into a GPU-backed SkSurface, and does that materially improve realistic workloads?

---

# What should remain CPU-side

GPU-backed HTML rendering does not mean moving the entire browser pipeline onto compute shaders.

Expected CPU responsibilities remain:

```text
DOM
selector matching
cascade
computed style
flex/grid layout
text shaping
paint-list generation
```

GPU acceleration mainly targets:

```text
rasterization
paths
images
gradients
filters
shadows
clips
layers
compositing
```

---

# Goal B — user-facing GPU content later

Separately, the project may later expose a standard GPU API for authored scenes:

```text
WebGPU
  ↓
Three.js / GSS / vgpu / custom shaders
```

This is distinct from GPU-accelerating Skia.

Do not conflate:

```text
Skia uses GPU internally
```

with:

```text
Three.js can use Skia as its GPU API
```

Those are different abstractions.

---

# Shared GPU foundation question

A future architecture should investigate whether HTML/CSS Skia rendering and user-facing WebGPU can share one native GPU foundation.

Two broad directions to test:

```text
Skia Graphite + Dawn
WebGPU runtime + Dawn
```

versus:

```text
Skia GPU backend
wgpu for user-facing WebGPU
```

The key practical question is:

> Can both rendering paths share devices/textures efficiently enough to avoid expensive GPU↔CPU copies?

Do not decide this from aesthetics.

Prototype and measure.

---

# Why Dawn deserves a future test

Skia Graphite has a Dawn backend.

That raises the possibility of:

```text
                     Dawn
                      |
             +--------+--------+
             |                 |
      Skia Graphite        WebGPU runtime
             |                 |
       HTML/CSS/SVG       Three/GSS/etc.
```

Potential benefit:

```text
one GPU implementation
possible texture/device alignment
cleaner composition path
```

This is only an architectural hypothesis until measured.

---

# Why wgpu remains interesting

The rest of canvas-html is heavily Rust-based.

wgpu offers:

```text
Rust-native API
Vulkan / Metal / DX12
headless rendering
strong Deno/Firefox/Servo precedent
```

It may still be the best user-facing GPU implementation even if Skia uses another native backend.

Again: measure interop cost before deciding.

---

# Three.js later

Do not design Phase 4 around Three.js specifically.

Three should be one guest workload.

Prefer an abstraction capable of hosting multiple GPU authoring systems:

```text
GPU surface
   |
   +-- Three.js
   +-- GSS
   +-- vgpu
   +-- custom WebGPU
```

Three.js support should come after the underlying WebGPU/runtime/compositor architecture is stable.

---

# Video pipeline endgame

A longer-term performance goal may be:

```text
HTML/CSS GPU paint
        +
GPU-authored scenes
        |
        v
final GPU texture
        |
        v
hardware video encoder
```

instead of:

```text
GPU
  ↓
CPU RGBA
  ↓
Node Buffer
  ↓
encoder
```

This could avoid large per-frame CPU readbacks.

That is a future optimization, not a Phase 3 task.

---

# Explicit exclusion

CAD is not part of the current project plan.

Do not add CAD assumptions to runtime, GPU, DOM, or future roadmap decisions.
