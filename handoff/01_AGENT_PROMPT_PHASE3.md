# canvas-html Phase 3 — Shared DOM/Web Adapter

You are taking over `canvas-html` after a successful Phase 2 runtime experiment.

Read `PHASE2_RESULTS.md` completely before editing code.

The previous phase established that:

- `deno_core` can coexist with Node's embedded V8 on the tested Linux/Node configuration;
- the caller-thread persistent V8 model is not the recommended architecture;
- the dedicated renderer-thread model passed aggressive lifecycle and worker tests;
- deterministic virtual time worked;
- a minimal Deno DOM adapter ran actual GSAP selector animation;
- production Boa remained unchanged;
- the next recommended step is a real engine-neutral DOM/Web adapter shared by Boa and Deno.

Your task is to implement and test that shared layer.

Do **not** implement WebGPU, GPU-backed Skia, Three.js, GSS, CAD, networking, Node compatibility, or full browser emulation in this phase.

---

# 1. Primary objective

Create a shared engine-neutral DOM/Web behavior layer used by both:

```text
Boa
Deno/V8
```

The architecture should move toward:

```text
                 canvas-html

              shared DOM/Web host
                     |
          +----------+----------+
          |                     |
      Boa adapter           Deno adapter
          |                     |
         Boa                    V8
```

The shared host owns DOM behavior.

The runtime adapters expose that behavior into each JavaScript engine.

Boa remains the production/default runtime throughout this phase.

---

# 2. Core dependency rule

Do not let JS-engine-specific types enter the shared DOM/layout/paint layer.

The shared layer must not depend directly on types such as:

```text
boa_engine::JsObject
boa_engine::JsValue
deno_core::JsRuntime
v8::Global
v8::Local
v8::Value
```

except inside engine-specific adapter code.

Prefer Rust-native shared types:

```rust
NodeHandle
ElementHandle
String
Vec<T>
Option<T>
Result<T, DomError>
plain enums
plain structs
```

A stable engine-neutral handle is strongly preferred.

For example:

```rust
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct NodeHandle(u64);
```

If the existing Phase 2 versioned node ID model is better, reuse it.

The exact representation is not prescribed.

---

# 3. Target dependency direction

Aim for:

```text
runtime adapter
      |
      v
shared DOM/Web host
      |
      v
document/layout/paint
```

Avoid:

```text
document/layout/paint
      |
      v
Boa/V8
```

V8 and Boa handles must remain out of Blitz/Stylo/paint data structures.

---

# 4. Suggested module structure

Use repository conventions, but a shape like this is reasonable:

```text
src/
  dom_host/
    mod.rs
    handles.rs
    document.rs
    element.rs
    selectors.rs
    attributes.rs
    style.rs
    computed_style.rs
    geometry.rs
    events.rs
    clock.rs
    errors.rs

  scripting/
    mod.rs
    runtime.rs
    boa_adapter.rs
    deno_adapter.rs
```

Do not create unnecessary crates just for architectural appearance.

Modules are fine if dependency boundaries remain clear.

---

# 5. Shared DOM host

Design a small engine-neutral host interface.

Illustrative only:

```rust
trait DomHost {
    fn get_element_by_id(
        &self,
        id: &str,
    ) -> Option<NodeHandle>;

    fn query_selector(
        &self,
        root: Option<NodeHandle>,
        selector: &str,
    ) -> Result<Option<NodeHandle>, DomError>;

    fn query_selector_all(
        &self,
        root: Option<NodeHandle>,
        selector: &str,
    ) -> Result<Vec<NodeHandle>, DomError>;

    fn get_text_content(
        &self,
        node: NodeHandle,
    ) -> Result<String, DomError>;

    fn set_text_content(
        &mut self,
        node: NodeHandle,
        value: &str,
    ) -> Result<(), DomError>;
}
```

Do not build a giant trait prematurely.

Split responsibilities if that improves ownership and testing.

---

# 6. Required shared global behavior

Support in both engines:

```js
window === globalThis
self === globalThis
document
```

Do not implement browser navigation, location, browsing contexts, or window-management APIs.

---

# 7. Required Document subset

Implement shared behavior for:

```js
document.getElementById()
document.querySelector()
document.querySelectorAll()
document.createElement()
```

`querySelectorAll()` may remain a static collection for now.

If implementing a complete `NodeList` would materially expand scope, provide a minimal consistent list-like result and document the deviation.

Invalid selectors must fail consistently across both engines.

---

# 8. Stable object identity

This must hold in both runtimes:

```js
document.querySelector("#x") ===
document.querySelector("#x")
```

and:

```js
document.getElementById("x") ===
document.querySelector("#x")
```

for the same native node.

The adapter may cache wrappers.

Rules:

- wrapper caches are runtime-local;
- native identity comes from the shared handle;
- JS wrappers do not become the canonical node identity;
- stale handles must fail predictably;
- V8 wrappers never cross the Deno owner thread;
- Boa wrappers remain Boa-owned.

Document wrapper lifetime and invalidation behavior.

---

# 9. Required Node / Element subset

Support at least:

```js
element.textContent
element.id
element.className

element.getAttribute()
element.setAttribute()
element.removeAttribute()
```

If low-cost and useful, also support:

```js
element.parentElement
element.children
element.firstElementChild
```

Do not expand into the entire DOM tree API unless tests prove it is needed.

---

# 10. classList

Implement a minimal shared `classList` if practical:

```js
element.classList.add()
element.classList.remove()
element.classList.contains()
element.classList.toggle()
```

If not implemented, document the exact reason and compatibility impact.

---

# 11. Inline style / CSSOM subset

Create one shared inline-style policy.

At minimum preserve Phase 2 support for:

```text
opacity
transform
width
height
background
```

Strongly consider adding commonly required motion properties:

```text
left
top
right
bottom
display
position
color
backgroundColor
fontSize
fontWeight
letterSpacing
borderRadius
transformOrigin
visibility
```

Do not implement the complete `CSSStyleDeclaration` specification.

The important requirement is that Boa and Deno use the **same native style semantics**.

Do not allow separate Boa-style and Deno-style parsing rules.

---

# 12. Style object identity

This should hold in both runtimes:

```js
element.style === element.style
```

The JS adapter may use a proxy/wrapper.

The canonical inline style state must remain in the shared native layer.

---

# 13. getComputedStyle

Implement shared:

```js
getComputedStyle(element)
```

for the supported subset.

At minimum verify:

```js
const s = getComputedStyle(element);

s.opacity;
s.transform;
s.width;
s.height;
```

Values should come from real resolved style/layout state where possible.

Do not fabricate browser values in the JS adapter.

If serialization differs from browsers, define and document the supported contract.

Boa and Deno must return equivalent values for shared contract tests.

---

# 14. Geometry

Implement:

```js
element.getBoundingClientRect()
```

using the actual resolved layout tree.

Required fields:

```text
x
y
width
height
top
right
bottom
left
```

Do not implement geometry calculations independently in Boa or Deno adapters.

Optionally add if low-cost:

```js
clientWidth
clientHeight
offsetWidth
offsetHeight
```

Only if they materially help GSAP/Motion compatibility.

---

# 15. Mutation / layout invalidation policy

Define one shared rule for when mutations become visible to:

```text
getComputedStyle()
getBoundingClientRect()
render()
```

Prefer a clear model such as:

```text
mutation
→ mark document dirty
→ lazily resolve on layout-dependent query or render
```

Document the policy and test it identically across engines.

---

# 16. Minimal event model

Add a small engine-neutral event contract.

Target:

```js
addEventListener()
removeEventListener()
dispatchEvent()
```

Support synthetic events only if that is enough for current compatibility tests.

Minimal useful event properties:

```text
type
target
currentTarget
defaultPrevented
preventDefault()
```

Do not build pointer/mouse/keyboard/browser input infrastructure unless required by tests.

Important ownership rule:

- the shared DOM host may track engine-neutral listener IDs/metadata;
- actual JS callback values must remain in their runtime adapter;
- Boa callbacks stay Boa-owned;
- V8 callbacks stay V8-owned on the Deno runtime thread.

Do not store V8/Boa callback objects inside the shared DOM model.

---

# 17. Shared error model

Define engine-neutral DOM error categories.

Illustrative:

```rust
enum DomError {
    InvalidHandle,
    InvalidSelector,
    UnsupportedOperation,
    InvalidState,
}
```

Both runtime adapters should map shared errors into sensible JS exceptions.

Contract-test at least:

```text
invalid selector
stale/invalid node
unsupported operation
closed renderer
```

Do not let Boa and Deno silently diverge.

---

# 18. Script runtime abstraction

Refine the runtime boundary without over-designing it.

Conceptually:

```rust
trait ScriptRuntime {
    fn eval(
        &mut self,
        source: &str,
    ) -> Result<ScriptValue, ScriptError>;

    fn advance_to(
        &mut self,
        time_ms: f64,
    ) -> Result<(), ScriptError>;

    fn drain_jobs(
        &mut self,
    ) -> Result<(), ScriptError>;

    fn shutdown(
        &mut self,
    ) -> Result<(), ScriptError>;
}
```

Do not force everything through JSON if that clearly becomes limiting.

Do not invent a huge universal dynamic-value abstraction in this phase.

The goal is separation, not framework-building.

---

# 19. Deno architecture — preserve Phase 2 winner

Keep the dedicated-thread model:

```text
Node N-API object
      |
 command channel
      |
 dedicated Rust thread
      |
 Tokio current-thread runtime
      |
 persistent deno_core::JsRuntime
```

Preserve:

```text
owner-thread V8 creation/use/destruction
thread-safe execution watchdog
explicit shutdown
worker-safe finalization
no raw Node isolate pointer sharing
no V8 symbol hacks
```

Do not return to the caller-thread runtime model.

---

# 20. Boa architecture

Boa remains:

```text
production default
control implementation
regression baseline
```

Refactor only enough to use the shared DOM host.

Do not degrade existing behavior to force abstraction symmetry.

If a shared abstraction meaningfully harms the working Boa implementation, stop and document the conflict instead of forcing it.

---

# 21. Deterministic clock contract

Preserve the Phase 2 deterministic time model.

Both engines should conform to:

```text
Date.now() = epochMs + visualTime
performance.now() = visualTime
performance.timeOrigin = epochMs
```

Do not use wall time for visual execution.

Shared scheduling contract should cover:

```js
setTimeout
clearTimeout
requestAnimationFrame
cancelAnimationFrame
Promise microtasks
```

Run equivalent ordering tests in both engines.

Do not redesign time semantics beyond what is required for equivalence.

---

# 22. Contract test harness

Build **one engine-independent test suite**.

Conceptually:

```text
run_dom_contract(BoaRuntime)
run_dom_contract(DenoRuntime)
```

Every test must assert observable behavior rather than internal implementation.

---

# 23. Required shared contract tests

## Global identity

```js
window === globalThis
self === globalThis
```

## Selector identity

```js
const a = document.getElementById("box");
const b = document.querySelector("#box");
const c = document.querySelectorAll("#box")[0];

a === b;
b === c;
```

## textContent

```js
element.textContent = "hello";
element.textContent === "hello";
```

and rendering reflects the change.

## Attributes

Test:

```js
setAttribute
getAttribute
removeAttribute
```

## class behavior

If implemented:

```js
className
classList.add
classList.remove
classList.toggle
classList.contains
```

## style identity

```js
element.style === element.style
```

## inline style

Set/read:

```text
opacity
transform
width
height
background
```

Verify native document state.

## getComputedStyle

Mutate styles and confirm equivalent resolved values.

## geometry

Verify:

```js
getBoundingClientRect()
```

against known layout.

Mutate dimensions and verify the resolved geometry policy.

## errors

Test invalid selector and invalid/stale node behavior.

## deterministic clock

Verify:

```text
Date.now
performance.now
timer ordering
rAF ordering
Promise ordering
```

## deterministic rendering

For both engines:

- create 5 fresh instances;
- render identical timestamps;
- hash raw RGBA;
- verify replay determinism.

When cross-engine pixel hashes differ, attribute the source:

```text
DOM semantics
style semantics
timing
layout
paint
```

Do not report only "hash mismatch."

---

# 24. GSAP contract

Use the same bundled GSAP version already validated in Phase 2.

Run the same selector tween through both engines:

```js
gsap.to("#box", {
  x: 100,
  opacity: 0.5,
  duration: 1,
  ease: "none"
});
```

Test at:

```text
0
250
500
750
1000 ms
```

Verify:

```text
computed opacity
computed transform
rendered output
JS errors
```

Also run unpaused ticker playback driven only by virtual time.

Do not replace GSAP animation with manual style mutation.

---

# 25. Motion probe

If the existing Motion smoke scene can be reused without substantially increasing scope, run it on both engines.

This is diagnostic, not mandatory.

If it fails, record the exact missing DOM/Web API contract.

Do not spend the phase implementing large browser subsystems just to make Motion pass.

---

# 26. Existing production regression suite

Run the existing Boa tests before and after changes.

At minimum preserve current working coverage for:

```text
core rendering
JavaScript
WAAPI
fonts
worker determinism
GSAP
Motion
```

Do not weaken assertions.

---

# 27. DOM ownership / GC documentation

Explicitly document:

```text
who owns native nodes
who owns JS wrapper caches
when wrappers become stale
what happens after native removal
how event callbacks are rooted
how callbacks are released
what happens at renderer close
```

No cross-runtime callback storage.

No V8 handle may be released from the wrong thread.

---

# 28. Node removal / stale handles

If cheap and supported by the underlying document model, test:

```js
const el = document.querySelector("#x");
el.remove();
```

Then define behavior if `el` is used afterward.

If removal is too large for this phase, document the intended stale-handle model without implementing it.

---

# 29. Automatic HTML script execution

Do not build a complete script loader in this phase.

Phase 2 constructor behavior may remain:

```text
parse HTML
scripts are executed explicitly via eval
```

unless automatic execution is trivial and naturally falls out of the new shared runtime layer.

Script/module loading is a later compatibility problem.

---

# 30. No full WebIDL

Do not create a general WebIDL generator unless an existing project component already provides one and it clearly reduces work.

Manual adapters for the supported subset are acceptable.

The goal is shared semantics and ownership.

---

# 31. Performance measurements

Measure whether the shared host adds unacceptable overhead.

Where practical compare:

```text
Boa construction
Deno construction
warm eval
100 DOM mutations
querySelector
querySelectorAll
getComputedStyle
getBoundingClientRect
seek
render
seek + render
GSAP frame
```

Separate:

```text
JS execution
DOM host bridge
layout resolution
paint
channel/RPC overhead
```

Do not make a single overall "Deno is X times faster" claim.

---

# 32. Deno channel cost

Phase 2 showed that tiny `seek()` operations are more expensive through the dedicated runtime-thread channel.

Measure whether a shared DOM host creates excessive chatty JS↔native traffic.

Do not prematurely redesign the public API.

If measurements show a real problem, document future options such as:

```text
mutation batching
dirty queues
renderAt(time)
renderFrames([...])
```

Do not implement large batching systems unless needed to make Phase 3 viable.

---

# 33. Memory follow-up

Preserve the important Phase 2 findings:

- raw RGBA external buffers can accumulate when Node is not allowed to process finalizers;
- periodically yielding/collecting kept long-lived render loops nearly flat;
- separate native retained allocation exists around render lifecycle/churn;
- that retained allocation was also visible in a Boa paint-only control;
- the exact native owner remains unresolved.

Phase 3 is not a memory-profiling phase.

However:

- rerun enough lifecycle/memory probes to detect regressions;
- use current RSS/allocation profiling if naturally available;
- do not claim "no leak" without evidence.

---

# 34. Platform validation

The previous evidence is Linux x64 / Node 24.19.0 only.

If additional runners are naturally available, test:

```text
Linux arm64
macOS arm64
macOS x64
Windows x64
```

Do not block Phase 3 if those environments are unavailable.

Document all untested targets.

---

# 35. Strict scope guardrails

Do NOT implement:

```text
WebGPU
wgpu
Dawn
Three.js
GSS
GPU-backed Skia
CAD
networking
fetch
WebSocket
Node.js compatibility
filesystem APIs
Service Worker
iframe
navigation/history
full script/module loading
full CSSOM
full DOM
full WebIDL
WebXR
media/video/audio APIs
new layout engine
Stylo replacement
Blitz replacement
Skia replacement
Boa removal
Deno as production default
```

If a dependency appears necessary, document it rather than expanding the phase.

---

# 36. Required report

Create:

```text
PHASE3_RESULTS.md
```

with these sections:

## Decision

```text
GO
CONDITIONAL GO
NO-GO
```

## Executive summary

Did the shared host architecture work?

## Final architecture

Include a diagram.

## Dependency boundaries

Show which modules may depend on:

```text
Boa
deno_core
V8
Blitz
Stylo
Skia
```

## DOM contract matrix

Example:

| Contract | Boa | Deno | Shared host? | Notes |
|---|---|---|---|---|
| global aliases | | | | |
| getElementById | | | | |
| querySelector | | | | |
| querySelectorAll | | | | |
| stable identity | | | | |
| textContent | | | | |
| attributes | | | | |
| classList | | | | |
| style identity | | | | |
| inline style | | | | |
| getComputedStyle | | | | |
| getBoundingClientRect | | | | |
| events | | | | |
| deterministic timers | | | | |
| rAF | | | | |
| Promise ordering | | | | |
| GSAP selector tween | | | | |

## Ownership / lifetime model

Document:

```text
native node ownership
wrapper caches
event callback roots
renderer close
runtime shutdown
stale handles
```

## Determinism

Include traces and frame hashes.

## Performance

Before/after shared-host measurements.

## Existing-test preservation

Report the production regression suite.

## Memory observations

Evidence only.

## Remaining incompatibilities

Rank by:

```text
severity
engineering effort
architectural risk
```

## Recommendation

Explicitly answer:

> Is the shared engine-neutral DOM/Web adapter now strong enough to become the architectural center of canvas-html?

Also answer:

> Should Boa remain production default while Deno/V8 continues as an experimental/optional runtime?

And:

> Is the project ready to begin a separate GPU-backed Skia/WebGPU architecture phase after this, or are DOM/runtime blockers still too significant?

Do **not** implement that future GPU phase in this task.

---

# 37. Success criteria

A strong **GO** requires:

1. Boa and Deno use the same engine-neutral host for the targeted subset.
2. Stable native node identity works in both.
3. selectors/text/attributes/style/computed style/geometry contracts pass.
4. deterministic timers/rAF/microtask behavior passes.
5. GSAP selector animation works in both, or any difference is isolated to a clear shared contract.
6. Boa/V8 handles remain out of layout/paint.
7. the Deno dedicated-thread lifecycle remains stable.
8. production Boa tests remain green.
9. the shared host does not introduce an unacceptable performance regression.
10. remaining gaps are explicit and testable.

A **CONDITIONAL GO** is appropriate if the architecture is sound but a small number of isolated contracts remain incomplete.

A **NO-GO** is appropriate if sharing the DOM layer requires engine-specific behavior to leak deeply into core layout/paint or creates unacceptable lifecycle/performance regressions.

---

# 38. Preserve artifacts

Keep:

```text
source changes
Cargo manifests
Cargo.lock
contract tests
benchmark scripts
lifecycle logs
frame hashes
generated PNGs
architecture notes
error logs
```

in a clearly reviewable area.

Avoid irreversible production restructuring.

Any shared abstraction moved into production code must be small, justified, and covered by tests.

---

# Final instruction

Treat Phase 3 as a **conformance and architecture extraction phase**, not a graphics feature phase.

The central question is:

> Can canvas-html own one clean DOM/Web behavior layer while Boa and Deno are merely script-engine adapters?

Answer that with code, tests, measurements, and failure evidence.

Do not start WebGPU, Three.js, GPU-backed Skia, or CAD in this phase.
