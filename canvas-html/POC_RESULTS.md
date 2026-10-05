# canvas-html Deno runtime POC

## Decision

**Result: CONDITIONAL GO for staged experimental integration; keep Boa as the production default.**
The tested in-process runtime and direct Blitz/Skia bridge work. A long-lived
N-API renderer object and supported-platform distribution still need validation.
This report distinguishes measured results from source inspection and untested
migration work. Production Boa dependencies and implementation are unchanged.

## Input and environment

- Supplied snapshot: canvas-html v0.5.0.
- Snapshot ZIP SHA-256: `7db3d38e253b6172c58adaebbf35af5b358d81e9e698897a4839520db2febbbe`.
- Supplied addon SHA-256: `f959ef1bd4c72e2f3e4beabd4326caef5ca48b68d470706a4bb901de03bc0b72`.
- Linux x86_64, kernel 6.18.44; restricted workspace execution.
- Node 24.19.0; Node V8 `13.6.233.17-node.51`; npm 11.9.0.
- GCC/cc 13.3.0; Rust/Cargo 1.99.0.
- `deno_core` 0.412.0; `v8`/rusty_v8 150.4.0; `napi` 3.14.1 in the initial runtime POC.
- Existing baseline uses Boa 0.22.0 and `napi` 3.14.0 from its supplied lockfile.
- Blitz base `0db8c74a5f8a0df77eed1b33c846eb041515b6c7`; setup applies all twelve supplied patches.
- Render experiments use the supplied patched Stylo/AnyRender/Skia packages.
- RSS is unavailable: Node reports `ENOENT ... uv_resident_set_memory` because `/proc` is absent.

Version verification: fetched the crates.io sparse index for `deno_core`,
which reported 0.412.0 published 2026-09-16; inspected its published crate,
`examples/op2.rs`, `examples/eval_js_value.rs`, and `runtime/jsruntime.rs`.
Sources: [crate](https://docs.rs/deno_core/0.412.0/deno_core/),
[op example](https://docs.rs/crate/deno_core/0.412.0/source/examples/op2.rs),
[embedding API](https://docs.rs/deno_core/latest/deno_core/struct.JsRuntime.html),
[sparse index](https://index.crates.io/de/no/deno_core).
No `deno_runtime` or `deno_webgpu` is required or pinned by these experiments.

## Reproduction

Unpack the original snapshot, then overlay this POC bundle's `canvas-html/`
folder. Run from the project directory on a normal Linux build host:

```bash
bash scripts/setup-blitz.sh
cargo build --release --locked
# The npm build command copies the built .so into the .node package location.
npm run build
npm test
node test/workers.mjs
node test/speed-js.mjs gsap 30
cd experiments
bash run.sh
```

The experiment workspace has its own lockfile and release profile with thin
LTO and four codegen units. It does not add a permanent engine option to the
product API. `run.sh` stops at a failed gate; use the individual commands in
that file for diagnosis. Logs from this run are under `evidence/` in the bundle.

### Environment setup corrections in this run

Rust/Cargo were initially absent. Rustup could not operate without `/proc/self/exe`.
Official Rust 1.99.0 component archives were installed inside the workspace.
The shell archive extraction left incomplete compiler/standard-library files;
re-extracting the full bytes with Python's tarfile/shutil resolved that issue.
Rust 1.99's default lld wrapper also requires `/proc/self/exe`, so compilation
used `RUSTFLAGS="--sysroot=<local-toolchain> -C linker-features=-lld"` and
`LD_LIBRARY_PATH` for the local compiler. Some generated build scripts lacked
execute permission; their permissions were corrected before retrying.

The baseline initially failed because pkg-config/fontconfig development
metadata was absent. Downloaded Ubuntu development packages into the workspace,
used local `pkgconf`, `PKG_CONFIG_SYSROOT_DIR` and `PKG_CONFIG_LIBDIR`, and linked
the already-installed system fontconfig/freetype libraries through local
symlinks. These are build environment corrections; renderer source and Cargo
features were not changed. Historical package metadata versions are recorded
in the prerequisite logs; this is not a production provisioning recipe.
A normal host should install matching development packages using its package
manager. Skia's prebuilt binaries were obtained by its standard build script.

## Baseline

The supplied 30,911,832-byte addon passed all four npm smoke tests:
core rendering, JavaScript, WAAPI, and fonts. Existing worker tests reported
identical frames with one renderer and two workers for CSS motion, GSAP, and
the Motion library.

The GSAP speed scene (30 frames, 1280x720) reported 127 ms load,
158.3 fps, 1.8 ms seek and 4.5 ms render per frame, with no JS errors.
These are single-run workload observations, not universal throughput.

After local build prerequisites were supplied, `cargo build --release --locked`
succeeded. Its final successful retry took 5m28s and reused dependencies from
earlier attempts, so this is not a clean build duration. The rebuilt addon is
39,430,352 bytes; all four smoke tests and all three existing worker scenarios
passed against it as well. The original supplied addon was preserved byte for
byte. A test-only require-cache loader selected the rebuilt addon without
changing the package loader. The run used `NODE_OPTIONS=--require=<workspace>/tools/rebuilt-loader.cjs`
with `npm test`, `node test/workers.mjs`, and `node experiments/baseline.mjs`.
Its contents are included in `environment/rebuilt-loader.cjs`.

The exact experimental build/run commands used after local setup were:

```bash
source tools/env.sh
export CARGO_HOME="$POC_ROOT/tools/cargo-deno"
cd canvas-html/experiments
cargo build --release --locked -j 4 -p deno-core-smoke -p deno-napi-coexist -p deno-canvas-bridge
timeout 60 target/release/deno-core-smoke
cp target/release/libdeno_napi_coexist.so deno-napi-coexist/addon.node
timeout 180 node deno-napi-coexist/test.mjs
node compatibility.mjs
timeout 90 target/release/deno-canvas-bridge <output-directory>
node compare-bench.mjs <absolute-path-to-rebuilt-addon.node>
```

A separate baseline probe found an existing clock limitation: `Date.now()` is
frozen within each renderer but anchored to wall time at construction. Three
fresh renderers displaying that value produced different frame hashes.
`clock.rs::BoaClockAdapter::base_system_millis` confirms the source of the
variation. The relative-time scene below still passes; that result must not
be generalized to all page scripts. The Deno POC intentionally uses epoch zero.

Five fresh Boa renderers replayed the same test scene at 0, 16.6667, 500,
1000 and 2500 ms with identical SHA-256 hashes. The first two hashes match
because the subpixel position change did not alter pixels in this scene.
See `baseline-measurements-full.json` for hashes and ten measurement samples.

## Runtime gates

### A: standalone Deno

Release executable compiled and ran. Assertions covered `1+2`, a typed Rust
addition op, host-owned time, explicit Promise job draining, a frozen Date,
ordered same-deadline timers, a timer that schedules another timer, rAF at
requested time, and rejection of backward time. No network is needed for
execution. Runtime construction, use, job drain and destruction occur with
an owned current-thread Tokio context. Tokio drives internal work; the visual
clock is updated explicitly in Rust.

### B: Node / rusty_v8 coexistence

Passed on the tested Linux/Node combination:

- addon load, first eval, thrown exception propagation, 100 repeated fresh runtimes;
- 1 worker, 2 concurrent workers, ten sequential worker lifecycles;
- each worker creates, uses and drops its own runtime on its own thread;
- separate child process load and clean exit;
- separate worker-first child process with two sequential lifecycles;
- two physical copies of the addon in the same process, each used twenty times;
- stripped addon loading and basic evaluation.

Main matrix uses explicit `JsRuntime::init_platform(None)` on the main thread
before workers. There are no custom V8 platform tricks, symbol-renaming patches,
Node/V8 pointer sharing, or linker binding hacks. The documented common-parent
initialization policy remains the recommended one, even though the worker-first
probe passed here. Synchronous exports create and drop runtimes locally, so
this does not validate a long-lived N-API renderer object holding `JsRuntime`.

No crashes or hangs occurred in the final verified matrix. RSS/leaks were not
measurable in this environment; lifecycle success is not proof of no leaks.
Other Node versions and operating systems have not been tested.

### Implementation failures and corrections

1. The first POC op was named `op_add`, colliding with Deno's builtin op.
   Standalone and Node execution failed with V8's fatal check
   `IsTheHole(exports->Lookup(name))`. Renaming it to `op_poc_add` fixed this.
   This was a POC error, not evidence of a Node/V8 conflict.
2. An initial subsequent runtime aborted because it was created outside a
   Tokio runtime context and V8 posted a delayed task. Runtime ownership now
   includes a current-thread executor, entered during creation/eval/drop.
   Standalone and Node tests then passed.
3. One incremental release link reported missing Rust ThinLTO symbols;
   cleaning only the experimental packages and rebuilding resolved it.
   The next release rebuild succeeded. No V8 symbol workaround was used.
4. Mutation ops initially lacked the required `op2(fast)` annotation; adding it
   resolved the compile error. An added benchmark assertion compared integer
   and floating JSON representations of the same JS number, causing a test
   panic in standalone and Node runs. Comparing numeric values fixed it.
   Final release, smoke and worker tests passed after those corrections.

### C/D/E: document bridge, determinism, compatibility

**C: passed.** `deno-canvas-bridge` parses through `HtmlDocument`, loads the
supplied Inter font with system fonts disabled, and runs JS in Deno. Rust ops
queue typed text/style commands. The bridge applies them using Blitz's node
mutator, resolves style/layout at host time, and paints through the supplied
AnyRender/Skia backend. Assertions prove text changes the initial frame and
a timer changes both box color and width. PNGs show the text and green box.
The production renderer and its Boa path are unchanged. This is a standalone
bridge executable, not a full Deno-backed `HtmlRenderer` N-API object.

**D: passed for the tested scene.** Five fresh document/runtime pairs matched
SHA-256 hashes of raw RGBA at all requested times. Timer deadlines and rAF are
explicitly driven; no visual time comes from the event loop. No external assets
or network requests were involved. Hashes are in `deno-bridge-verified.log`.

| Time (ms) | Deno RGBA SHA-256 |
| --- | --- |
| 0 | `a0d45ad6496cf44620485aa0a34d94ca762d01a1a5e19246f638a801a6fb04b1` |
| 16.6667 | `a0d45ad6496cf44620485aa0a34d94ca762d01a1a5e19246f638a801a6fb04b1` |
| 500 | `6b12ad757a1588526d4199966e6ec696764a14229cd414fea5ee984cb0fe2bb1` |
| 1000 | `691947c8fb7f3f7d742c784cd76c94946aae59808671ce82bf038963a068ff35` |
| 2500 | `f3216a6276ea02038521d581290c6bce2158daed527f1034f2e44f9ce331d0b9` |

**E: partial compatibility.** Arithmetic, host mutations and timer/rAF scenes
work. The existing prelude evaluates without an exception, but that is not
WAAPI/DOM conformance: absent DOM types cause functionality to be skipped and
it replaces the rAF function. It was not used for the deterministic bridge.
GSAP 3.15.0 from the snapshot ran a CommonJS-export object tween, explicitly
sought to 0.5 seconds and returned `x=0.5`. The browser bundle initially exported
into a separate `window` object; a `window=globalThis` alias fixed that packaging
gap. A selector-based tween then failed at `querySelectorAll`. No attempt was
made to implement a complete DOM to make it pass.

| Contract / gap | Evidence / caller | Difficulty estimate | Owner |
| --- | --- | --- | --- |
| Global window alias / bundle export shape | Raw GSAP bundle cannot resolve global `gsap`; explicit adapter works | Low | Bootstrap |
| Standards-shaped document and selectors | GSAP DOM tween: `querySelectorAll is not a function` | Medium | DOM adapter |
| Element wrappers, style setters and identity | Bridge uses explicit host commands; no Element wrappers exist | High | DOM adapter with backend-owned roots |
| Computed style and layout queries | `typeof getComputedStyle` is undefined; required by existing scenes/GSAP CSS integration | Medium/high | DOM adapter over Blitz |
| Events and browser callback ownership | Source inspection shows Boa JsObject listeners; not ported | Medium/high | Engine/Web API adapter |
| WAAPI / native animation hook | Prelude load alone does not provide Element or `__blitz_set_animation_time` | High | Prelude plus Blitz animation adapter |
| Date epoch / timezone policy | Existing Boa Date origin varies; POC epoch zero and incomplete Date compatibility | Low/medium | Runtime policy |
| Fetch / navigator / WebGPU | Bare-global probes return undefined | Separate scope | Optional Web API extensions |

Difficulty entries are engineering estimates, not measured implementation costs.
The existing full smoke scenes passed on Boa; only their arithmetic, mutation
and timer/rAF concepts were exercised on Deno.

## Measurements

Ten alternating samples in one Node process, with no compilers running.
`compare-bench.mjs` selected the rebuilt Boa addon. Times below are medians.

| Metric | Boa renderer path | Minimal Deno path |
| --- | ---: | ---: |
| Release build | Passed | Passed |
| Controlled clean build time | Not measured after setup retries | Not measured after setup retries |
| Unstripped native addon (bytes) | 39,430,352 | 67,734,768 |
| Stripped native addon (bytes) | 30,715,168 | 50,707,264 |
| Create runtime/document (ms) | 39.27 | 8.94 |
| 10,000 repeated `1+2` evaluations (ms) | 1759.19 | 9.10 |
| One 100,000-iteration JS sum loop (ms) | 82.99 | 1.71 |
| One 10,000-iteration `Date.now()` loop (ms) | 9.55 | 0.92 |
| 10,000 tiny Rust add ops in a JS loop (ms) | No matching add op exposed | 0.661 |
| RSS / lifecycle memory growth | Unavailable | Unavailable |
| Five fresh deterministic frame replays | Passed for relative-time scene | Passed for bridge scene |
| Worker frame comparison / runtime matrix | Passed | Passed |
| Clean child-process exit | Passed in executed tests | Passed in executed tests |

Creation/eval rows measure different boundaries: Boa includes HTML parsing,
font/layout setup, DOM bindings/prelude and its eval/message JSON wrapper; Deno
includes a minimal runtime/clock bootstrap and direct serde_v8 conversion.
The same JS sum and Date loops give a more focused workload comparison, but
remain single-call microbenchmarks without warmup. The tiny-op row includes JS
loop/compile cost and is not a measurement of pure crossing overhead.
No general engine-speedup factor is claimed. Earlier measurements ran during
compilation and were noisier; the final comparison above is the decision data.

The Deno native addon excludes the renderer; the Boa addon includes it.
The standalone Deno/Blitz/Skia bridge executable is 91,286,944 bytes.
A production dual-engine addon size was not measured. Stripping was tested
for Deno smoke/eval and baseline load/render. Both addons also ran together
in the final comparison process.

Observed successful build segments: baseline retry 5m28s; initial minimal
Deno release 1m55s; final shared experimental rebuild 2m23s. All reused cache
from preceding setup/build attempts. The standalone/minimal addon dependency
closure has 209 locked packages including platform-specific dependencies; the
full original renderer closure has 417. Adding the renderer yields 436 total
packages in the experiment lockfile. These counts are not additive binary costs.
Native V8 and Skia downloads, a C/C++ toolchain, and platform artifact caching
remain part of CI/distribution cost. Build/packaging on other platforms is untested.

## Architecture and remaining work

See `SCRIPTING_COUPLING.md` for the inspected Boa coupling. Blitz node mutation,
style/layout resolution and painting can be reused. Boa wrapper identity caches,
prototypes, listener callbacks, timer values and GC roots cannot simply be
passed to V8. Engine-specific storage must remain in each runtime adapter.

A minimal future `ScriptRuntime` boundary should provide JSON eval, virtual
time advancement and job draining. The POC also returns plain Rust mutation
commands; those are applied to `BaseDocument` before resolution and painting.
That boundary avoids V8 handles in layout/paint. It is a temporary explicit
host API, not browser DOM bindings.

Frozen-clock tests do not establish universal deterministic JavaScript:
Math.random, timezone/locale, full Date behavior, modules, arbitrary library
side effects, and every browser API still need policy and tests. The POC rAF
runs once at each explicit advance, not a complete browser rendering algorithm.

Optional WebGPU and CAD implementation were not attempted. They are separate
projects after the script runtime boundary is validated.

## Recommendation

**Result: CONDITIONAL GO.**

The release Deno runtime executed inside Node, including concurrent and repeated
worker lifecycles, without special V8/linker hacks. A direct Deno-to-Blitz-to-Skia
bridge rendered visible mutations deterministically. This is sufficient evidence
to start a staged engine-neutral adapter experiment; it does not justify replacing
the working Boa implementation today.

**Biggest benefit:** measured fast ECMAScript execution on the tested small
workloads, with explicit Rust ops and host-owned visual time. The GSAP object
tween shows library ECMAScript compatibility; DOM support remains separate.

**Biggest cost/risk:** binary/build cost and the substantial Boa-specific DOM
adapter. The critical remaining product issue is safe ownership/cleanup of a
long-lived, thread-affine JsRuntime inside a N-API renderer instance. The current
Node POC deliberately creates and destroys a runtime per call on its caller's
thread; the bridge owns a persistent runtime in a standalone executable.
Neither tests the exact production object lifecycle.

**Next step:** implement a private long-lived N-API prototype with an
engine-neutral document handle and explicit eval/time/job interfaces. Test its
constructor, method calls, environment cleanup, worker shutdown/termination and
repeated instance destruction. Measure RSS and growth on a normal host, then
run the supported Node/OS/architecture matrix and confirm distribution size
is acceptable before committing to production integration. Keep Boa default.

If that ownership/platform gate fails, retain Boa in process and reuse the
working standalone bridge as a starting point for an IPC sidecar experiment.
A sidecar has not been tested here; it adds lifecycle and data-transfer cost.
Another engine would still require the same engine-neutral DOM adapter.

Do not build full browser DOM, WebGPU, Three.js, or CAD yet.
