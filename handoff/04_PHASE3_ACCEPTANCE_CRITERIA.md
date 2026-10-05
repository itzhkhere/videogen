# Phase 3 Acceptance Criteria

Use this file as a final checklist before claiming Phase 3 complete.

---

# Architecture

- [ ] There is one engine-neutral DOM/Web host layer.
- [ ] Boa uses it for the targeted subset.
- [ ] Deno/V8 uses it for the targeted subset.
- [ ] Layout/paint code does not depend on Boa/V8 handles.
- [ ] Stable native node handles are the source of identity.
- [ ] Deno V8 handles remain on the dedicated runtime thread.
- [ ] Boa wrappers remain runtime-local.
- [ ] Event callbacks remain engine-specific and are not stored as shared JS values.

---

# Globals

- [ ] `window === globalThis`
- [ ] `self === globalThis`
- [ ] `document` behaves equivalently in both runtimes.

---

# Selectors / identity

- [ ] `getElementById`
- [ ] `querySelector`
- [ ] `querySelectorAll`
- [ ] invalid selector error behavior is aligned.
- [ ] repeated lookup returns the same JS wrapper.
- [ ] ID lookup and selector lookup of the same native node return the same JS wrapper.

---

# Element basics

- [ ] `textContent`
- [ ] `id`
- [ ] `className`
- [ ] `getAttribute`
- [ ] `setAttribute`
- [ ] `removeAttribute`

Optional if implemented:

- [ ] `parentElement`
- [ ] `children`
- [ ] `firstElementChild`

---

# classList

If included:

- [ ] `add`
- [ ] `remove`
- [ ] `contains`
- [ ] `toggle`

If not included:

- [ ] omission and compatibility impact are documented.

---

# Inline style

- [ ] `element.style === element.style`
- [ ] opacity
- [ ] transform
- [ ] width
- [ ] height
- [ ] background

Strongly preferred:

- [ ] left
- [ ] top
- [ ] display
- [ ] position
- [ ] color
- [ ] backgroundColor
- [ ] fontSize
- [ ] fontWeight
- [ ] letterSpacing
- [ ] borderRadius
- [ ] transformOrigin
- [ ] visibility

---

# Computed style

- [ ] `getComputedStyle(element)` works in both engines.
- [ ] opacity matches.
- [ ] transform matches.
- [ ] width matches.
- [ ] height matches.
- [ ] formatting deviations are documented.
- [ ] values come from native resolved state, not JS-side guessing.

---

# Geometry

- [ ] `getBoundingClientRect()` returns:
  - [ ] x
  - [ ] y
  - [ ] width
  - [ ] height
  - [ ] top
  - [ ] right
  - [ ] bottom
  - [ ] left
- [ ] geometry comes from resolved layout.
- [ ] mutation → layout query policy is documented.

---

# Events

If included in the Phase 3 target:

- [ ] `addEventListener`
- [ ] `removeEventListener`
- [ ] `dispatchEvent`
- [ ] event `type`
- [ ] event `target`
- [ ] event `currentTarget`
- [ ] `preventDefault`
- [ ] `defaultPrevented`
- [ ] callbacks remain runtime-local.

If deferred:

- [ ] exact reason and compatibility impact are documented.

---

# Time / scheduling

- [ ] deterministic `Date.now`
- [ ] deterministic `performance.now`
- [ ] deterministic `performance.timeOrigin`
- [ ] `setTimeout`
- [ ] `clearTimeout`
- [ ] `requestAnimationFrame`
- [ ] `cancelAnimationFrame`
- [ ] Promise/microtask ordering
- [ ] no visual wall-clock dependency

---

# GSAP

- [ ] bundled GSAP version runs in Boa.
- [ ] bundled GSAP version runs in Deno.
- [ ] selector tween is real GSAP CSSPlugin behavior.
- [ ] 0 ms output checked.
- [ ] 250 ms output checked.
- [ ] 500 ms output checked.
- [ ] 750 ms output checked.
- [ ] 1000 ms output checked.
- [ ] computed opacity matches.
- [ ] computed transform matches.
- [ ] unpaused ticker playback works from virtual time only.
- [ ] rendered output is checked.

---

# Determinism

For Boa:

- [ ] 5 fresh instances replay identically.

For Deno:

- [ ] 5 fresh instances replay identically.

For each timestamp:

- [ ] RGBA hash recorded.
- [ ] any cross-engine mismatch attributed to a specific layer.

---

# Lifecycle regression

Deno dedicated-thread model:

- [ ] persistent runtime remains persistent.
- [ ] explicit close works.
- [ ] finalizer close works.
- [ ] worker graceful exit works.
- [ ] worker forced termination behavior remains bounded/documented.
- [ ] no wrong-thread V8 destruction.
- [ ] watchdog still works.

Boa:

- [ ] existing lifecycle tests remain green.

---

# Production regression tests

- [ ] core rendering
- [ ] JavaScript
- [ ] WAAPI
- [ ] fonts
- [ ] worker determinism
- [ ] GSAP
- [ ] Motion where already covered

No assertion weakening.

---

# Performance

Measured after shared-host extraction:

- [ ] Boa construction
- [ ] Deno construction
- [ ] warm eval
- [ ] DOM mutation workload
- [ ] selector lookup
- [ ] computed style query
- [ ] geometry query
- [ ] seek
- [ ] render
- [ ] seek + render
- [ ] GSAP frame workload

- [ ] JS execution separated from DOM/layout/paint where practical.
- [ ] no unsupported universal speedup claim.

---

# Memory

- [ ] no obvious new Phase 3 regression.
- [ ] pixel-buffer finalizer behavior is understood.
- [ ] native render-churn retention remains documented.
- [ ] no unsupported "no leak" claim.

---

# Scope

Confirm Phase 3 did **not** implement:

- [ ] WebGPU
- [ ] wgpu
- [ ] Dawn
- [ ] Three.js
- [ ] GSS
- [ ] GPU-backed Skia
- [ ] CAD
- [ ] networking
- [ ] Node compatibility
- [ ] full browser DOM
- [ ] full WebIDL

---

# Required final decision

`PHASE3_RESULTS.md` must end with one of:

```text
GO
CONDITIONAL GO
NO-GO
```

and explicitly answer:

1. Is the shared engine-neutral DOM/Web host strong enough to become canvas-html's architectural center?
2. Should Boa remain the production default?
3. Is Deno/V8 ready to remain as the experimental/optional runtime on top of the same host?
4. Is the project ready for a **separate** GPU architecture phase after this?
