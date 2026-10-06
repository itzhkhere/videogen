# Test logs (Phase 4A.3)

## check.log

```
== cargo fmt --check
== cargo clippy (default features)
    Finished `release` profile [optimized] target(s) in 3.99s
== cargo test (dom-host)
    Finished `release` profile [optimized] target(s) in 51.83s
     Running unittests src/lib.rs (/home/user/harender-target/release/deps/dom_host-4ab6c633b08dbb5a)
running 9 tests
test clock::tests::contract_values ... ok
test style::tests::declared ... ok
test events::tests::dedupe_and_capture ... ok
test style::tests::names ... ok
test timers::tests::deadline_then_insertion_order ... ok
test events::tests::once_and_removed_during_dispatch ... ok
test timers::tests::many_equal_deadlines_keep_insertion_order ... ok
test timers::tests::rescheduled_interval_runs_after_waiting_timers ... ok
test timers::tests::not_due_stays ... ok
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running tests/document.rs (/home/user/harender-target/release/deps/document-05c4700988aa1a28)
running 7 tests
test inline_style_policy ... ok
test computed_style_and_geometry_follow_mutations ... ok
test class_list ... ok
test lookup_and_identity ... ok
test stale_and_detached_handles ... ok
test created_elements_and_event_path ... ok
test text_and_attributes ... ok
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
   Doc-tests dom_host
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
== release build
    Finished `release` profile [optimized] target(s) in 0.23s
== npm test
smoke: all passed
smoke-js: all passed
smoke-waapi: all passed
smoke-fonts: all passed
render-into: all passed
render-into-examples: all passed
hardening: all passed
== workers
CSS motion, 30 fps       identical | 1 renderer 0.76 s, 2 workers 0.49 s (1.6x)
GSAP, 30 fps             identical | 1 renderer 0.47 s, 2 workers 0.32 s (1.5x)
Motion library, 24 fps   identical | 1 renderer 0.44 s, 2 workers 0.36 s (1.2x)
transfer   1 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0, 2 buffers allocated for 24 frames, use-after-transfer rejected 24/24, 88.4 fps
transfer   2 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0,0, 4 buffers allocated for 24 frames, use-after-transfer rejected 24/24, 115.8 fps
transfer   4 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0,0,0,0, 8 buffers allocated for 24 frames, use-after-transfer rejected 24/24, 130.0 fps
in-process 1 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0, 83.2 fps
in-process 2 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0,0, 121.4 fps
in-process 4 worker(s): 24 frames, 0 missing, 0 mismatched, exits 0,0,0,0, 163.2 fps
render-into-workers: all passed
== TypeScript (strict) type tests
all checks passed
real	1m7.747s
user	3m10.096s
sys	0m10.634s
CHECK_EXIT=0
```

## check-gpu.log

```
warning: constant `UNPREMULTIPLY_SKSL` is never used
  --> vendor/anyrender_skia/src/vulkan.rs:35:7
   |
35 | const UNPREMULTIPLY_SKSL: &str = r#"
   |       ^^^^^^^^^^^^^^^^^^
   |
   = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default
warning: struct `VulkanBackend` is never constructed
  --> vendor/anyrender_skia/src/vulkan.rs:49:19
   |
49 | pub(crate) struct VulkanBackend {
   |                   ^^^^^^^^^^^^^
warning: associated items `new`, `recreate_swapchain`, `prepare_intermediate_surface`, `prepare_swapchain_surface`, and `flush_post_multiplied` are never used
   --> vendor/anyrender_skia/src/vulkan.rs:79:19
    |
 78 | impl VulkanBackend {
    | ------------------ associated items in this implementation
 79 |     pub(crate) fn new(
    |                   ^^^
...
195 |     fn recreate_swapchain(&mut self) {
    |        ^^^^^^^^^^^^^^^^^^
...
240 |     fn prepare_intermediate_surface(&mut self) -> Surface {
    |        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
...
281 |     unsafe fn prepare_swapchain_surface(&mut self, image_index: u32) -> Surface {
    |               ^^^^^^^^^^^^^^^^^^^^^^^^^
...
322 |     fn flush_post_multiplied(&mut self, surface: &mut Surface) {
    |        ^^^^^^^^^^^^^^^^^^^^^
warning: function `create_instance` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:524:4
    |
524 | fn create_instance(entry: &Entry, display_handle: DisplayHandle<'_>) -> Instance {
    |    ^^^^^^^^^^^^^^^
warning: function `pick_physical_device` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:545:4
    |
545 | fn pick_physical_device(
    |    ^^^^^^^^^^^^^^^^^^^^
warning: function `create_logical_device` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:596:4
    |
596 | fn create_logical_device(
    |    ^^^^^^^^^^^^^^^^^^^^^
warning: function `create_swapchain` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:626:4
    |
626 | fn create_swapchain(
    |    ^^^^^^^^^^^^^^^^
warning: function `create_gr_context` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:759:4
    |
759 | fn create_gr_context(
    |    ^^^^^^^^^^^^^^^^^
warning: function `create_sync_objects` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:803:4
    |
803 | fn create_sync_objects(device: &Device) -> (Semaphore, Semaphore, Fence) {
    |    ^^^^^^^^^^^^^^^^^^^
warning: `anyrender_skia` (lib) generated 9 warnings
    Finished `release` profile [optimized] target(s) in 4.14s
warning: constant `UNPREMULTIPLY_SKSL` is never used
  --> vendor/anyrender_skia/src/vulkan.rs:35:7
   |
35 | const UNPREMULTIPLY_SKSL: &str = r#"
   |       ^^^^^^^^^^^^^^^^^^
   |
   = note: `#[warn(dead_code)]` (part of `#[warn(unused)]`) on by default
warning: struct `VulkanBackend` is never constructed
  --> vendor/anyrender_skia/src/vulkan.rs:49:19
   |
49 | pub(crate) struct VulkanBackend {
   |                   ^^^^^^^^^^^^^
warning: associated items `new`, `recreate_swapchain`, `prepare_intermediate_surface`, `prepare_swapchain_surface`, and `flush_post_multiplied` are never used
   --> vendor/anyrender_skia/src/vulkan.rs:79:19
    |
 78 | impl VulkanBackend {
    | ------------------ associated items in this implementation
 79 |     pub(crate) fn new(
    |                   ^^^
...
195 |     fn recreate_swapchain(&mut self) {
    |        ^^^^^^^^^^^^^^^^^^
...
240 |     fn prepare_intermediate_surface(&mut self) -> Surface {
    |        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
...
281 |     unsafe fn prepare_swapchain_surface(&mut self, image_index: u32) -> Surface {
    |               ^^^^^^^^^^^^^^^^^^^^^^^^^
...
322 |     fn flush_post_multiplied(&mut self, surface: &mut Surface) {
    |        ^^^^^^^^^^^^^^^^^^^^^
warning: function `create_instance` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:524:4
    |
524 | fn create_instance(entry: &Entry, display_handle: DisplayHandle<'_>) -> Instance {
    |    ^^^^^^^^^^^^^^^
warning: function `pick_physical_device` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:545:4
    |
545 | fn pick_physical_device(
    |    ^^^^^^^^^^^^^^^^^^^^
warning: function `create_logical_device` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:596:4
    |
596 | fn create_logical_device(
    |    ^^^^^^^^^^^^^^^^^^^^^
warning: function `create_swapchain` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:626:4
    |
626 | fn create_swapchain(
    |    ^^^^^^^^^^^^^^^^
warning: function `create_gr_context` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:759:4
    |
759 | fn create_gr_context(
    |    ^^^^^^^^^^^^^^^^^
warning: function `create_sync_objects` is never used
   --> vendor/anyrender_skia/src/vulkan.rs:803:4
    |
803 | fn create_sync_objects(device: &Device) -> (Semaphore, Semaphore, Fence) {
    |    ^^^^^^^^^^^^^^^^^^^
warning: `anyrender_skia` (lib) generated 9 warnings
    Finished `release` profile [optimized] target(s) in 0.24s
== gpu-gl
render-into (gpu-gl): all passed
hardening (gpu-gl): all passed
== gpu-vulkan
render-into (gpu-vulkan): all passed
hardening (gpu-vulkan): all passed
GPU checks passed
real	0m7.424s
user	0m6.895s
sys	0m1.456s
GPU_EXIT=0
```

## phase3.log

```
== contract/run.mjs
  Promise ordering       boa:pass deno:pass same:yes microtasks: eval, timer, rAF and listener boundaries
  unsupported operation  boa:diag deno:diag same:NO  APIs outside the shared subset (diagnostic, engines may differ)
30/30 cases pass on both engines with identical results
exit 0
== contract/scenes.mjs
    at file:///home/user/harender/experiments/phase3/contract/scenes.mjs:61:17
    at ModuleJob.run (node:internal/modules/esm/module_job:439:25)
    at async node:internal/modules/esm/loader:643:26
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5) {
  code: 'GenericFailure'
}
Node.js v24.19.0
== tests/run.mjs
{"mode":"contracts","status":0,"signal":null,"elapsedMs":583.2792029999999}
{"mode":"cycles","status":0,"signal":null,"elapsedMs":37449.135332000005}
{"mode":"long","status":0,"signal":null,"elapsedMs":1105.816402999997}
{"mode":"simultaneous","status":0,"signal":null,"elapsedMs":962.0594429999983}
{"mode":"workers","status":0,"signal":null,"elapsedMs":5302.654762999999}
{"mode":"exit-alive","status":0,"signal":null,"elapsedMs":80.8684609999982}
{"mode":"exit-closed","status":0,"signal":null,"elapsedMs":83.53340700000263}
{"mode":"exit-multiple","status":0,"signal":null,"elapsedMs":203.50399599999946}
{"mode":"exit-exception","status":0,"signal":null,"elapsedMs":104.1197669999965}
```

## l4-run.log

```
name, driver_version, clocks.max.sm [MHz], temperature.gpu
NVIDIA L4, 580.82.07, 2040 MHz, 36
render-into (gpu-gl): all passed
RENDER_INTO_gpu-gl=0
render-into-workers (gpu-gl): all passed
WORKERS_gpu-gl=0
hardening (gpu-gl): all passed
HARDENING_gpu-gl=0
render-into (gpu-vulkan): all passed
RENDER_INTO_gpu-vulkan=0
render-into-workers (gpu-vulkan): all passed
WORKERS_gpu-vulkan=0
hardening (gpu-vulkan): all passed
HARDENING_gpu-vulkan=0
gpu-gl: 39 frames; before render() vs after render(): 0 differ; after render() vs renderInto(): 0 differ
REGRESSION_gpu-gl=0
gpu-vulkan: 39 frames; before render() vs after render(): 0 differ; after render() vs renderInto(): 0 differ
REGRESSION_gpu-vulkan=0
CORRECTNESS_EXIT=0
cpu        A 1080p baseline render() median 5.86 ms  p95 7.44 ms  peak RSS 218 MiB
cpu        A 1080p baseline into     median 2.15 ms  p95 2.18 ms  peak RSS 83 MiB
cpu        A 1080p 4A.3 render()     median 5.86 ms  p95 7.61 ms  peak RSS 217 MiB
cpu        A 1080p 4A.3 renderInto   median 2.14 ms  p95 2.63 ms  peak RSS 82 MiB
cpu        A 4K    baseline render() median 25.32 ms  p95 26.29 ms  peak RSS 487 MiB
cpu        A 4K    baseline into     median 11.4 ms  p95 12.09 ms  peak RSS 106 MiB
cpu        A 4K    4A.3 render()     median 24.88 ms  p95 27.22 ms  peak RSS 486 MiB
cpu        A 4K    4A.3 renderInto   median 11.13 ms  p95 12.27 ms  peak RSS 106 MiB
cpu        E 1080p baseline render() median 187.94 ms  p95 190.91 ms  peak RSS 219 MiB
cpu        E 1080p baseline into     median 185.39 ms  p95 188.21 ms  peak RSS 84 MiB
cpu        E 1080p 4A.3 render()     median 187.48 ms  p95 189.83 ms  peak RSS 219 MiB
cpu        E 1080p 4A.3 renderInto   median 184.44 ms  p95 187.25 ms  peak RSS 84 MiB
cpu        E 4K    baseline render() median 410.48 ms  p95 416.73 ms  peak RSS 493 MiB
cpu        E 4K    baseline into     median 403.33 ms  p95 408.24 ms  peak RSS 113 MiB
cpu        E 4K    4A.3 render()     median 412.7 ms  p95 414.09 ms  peak RSS 493 MiB
cpu        E 4K    4A.3 renderInto   median 403.72 ms  p95 406.79 ms  peak RSS 113 MiB
gpu-gl     A 1080p baseline render() median 6.03 ms  p95 7.92 ms  peak RSS 325 MiB
gpu-gl     A 1080p baseline into     median 2.23 ms  p95 3.91 ms  peak RSS 190 MiB
gpu-gl     A 1080p 4A.3 render()     median 5.97 ms  p95 7.69 ms  peak RSS 325 MiB
gpu-gl     A 1080p 4A.3 renderInto   median 2.21 ms  p95 3.91 ms  peak RSS 190 MiB
gpu-gl     A 4K    baseline render() median 22.88 ms  p95 24.13 ms  peak RSS 648 MiB
gpu-gl     A 4K    baseline into     median 7.49 ms  p95 7.66 ms  peak RSS 211 MiB
gpu-gl     A 4K    4A.3 render()     median 22.49 ms  p95 23.64 ms  peak RSS 590 MiB
gpu-gl     A 4K    4A.3 renderInto   median 7.47 ms  p95 7.56 ms  peak RSS 210 MiB
gpu-gl     E 1080p baseline render() median 32.35 ms  p95 34.14 ms  peak RSS 371 MiB
gpu-gl     E 1080p baseline into     median 29.31 ms  p95 30.13 ms  peak RSS 236 MiB
gpu-gl     E 1080p 4A.3 render()     median 32.25 ms  p95 36.27 ms  peak RSS 371 MiB
gpu-gl     E 1080p 4A.3 renderInto   median 28.13 ms  p95 30.27 ms  peak RSS 236 MiB
gpu-gl     E 4K    baseline render() median 64.54 ms  p95 65.61 ms  peak RSS 727 MiB
gpu-gl     E 4K    baseline into     median 48.93 ms  p95 49.34 ms  peak RSS 290 MiB
gpu-gl     E 4K    4A.3 render()     median 64.54 ms  p95 66.15 ms  peak RSS 669 MiB
gpu-gl     E 4K    4A.3 renderInto   median 48.79 ms  p95 49.05 ms  peak RSS 289 MiB
gpu-vulkan A 1080p baseline render() median 5.5 ms  p95 7.61 ms  peak RSS 377 MiB
gpu-vulkan A 1080p baseline into     median 1.82 ms  p95 2.1 ms  peak RSS 241 MiB
gpu-vulkan A 1080p 4A.3 render()     median 5.42 ms  p95 7.1 ms  peak RSS 376 MiB
gpu-vulkan A 1080p 4A.3 renderInto   median 1.85 ms  p95 2.12 ms  peak RSS 241 MiB
gpu-vulkan A 4K    baseline render() median 22.91 ms  p95 24.23 ms  peak RSS 682 MiB
gpu-vulkan A 4K    baseline into     median 9.17 ms  p95 9.2 ms  peak RSS 289 MiB
gpu-vulkan A 4K    4A.3 render()     median 22.66 ms  p95 23.88 ms  peak RSS 669 MiB
gpu-vulkan A 4K    4A.3 renderInto   median 9.2 ms  p95 9.37 ms  peak RSS 289 MiB
gpu-vulkan E 1080p baseline render() median 24.33 ms  p95 26 ms  peak RSS 406 MiB
gpu-vulkan E 1080p baseline into     median 21.23 ms  p95 21.5 ms  peak RSS 271 MiB
gpu-vulkan E 1080p 4A.3 render()     median 24.65 ms  p95 26.38 ms  peak RSS 406 MiB
gpu-vulkan E 1080p 4A.3 renderInto   median 21.33 ms  p95 21.73 ms  peak RSS 271 MiB
gpu-vulkan E 4K    baseline render() median 76.3 ms  p95 78.28 ms  peak RSS 734 MiB
gpu-vulkan E 4K    baseline into     median 61.66 ms  p95 67.42 ms  peak RSS 342 MiB
gpu-vulkan E 4K    4A.3 render()     median 76.42 ms  p95 80.43 ms  peak RSS 722 MiB
gpu-vulkan E 4K    4A.3 renderInto   median 61.43 ms  p95 61.63 ms  peak RSS 342 MiB
TIMING_EXIT=0
-rw-r--r-- 1 root root 6650 Oct  6 22:14 /content/results-4a3-l4.tgz
ALL_DONE
```

## per-commit verification (experiments/phase4a3/history/verify.log)

```
== step 0: cb1ad7c build: import the v0.5.0 engine
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 12 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   step 0 verified (cb1ad7c)
== step 1: 1dbc75e docs(experiments): phase 2 runtime research and the phase 3 handoff
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 2: d6ec43b refactor(dom): introduce the shared engine-neutral DOM host
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   step 2 verified (d6ec43b)
== step 3: 2780cb2 feat(experiments): experimental Deno/V8 runtime adapter and shared contract suite
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 4: 8be1f2c feat(gpu): experimental headless GPU backends (Ganesh GL/Vulkan, Graphite)
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 4 verified (8be1f2c)
== step 5: 9bf9e44 fix(gpu): deterministic Ganesh output across document reloads
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 5 verified (9bf9e44)
== step 6: a84fd2d docs(experiments): phase 4A GPU backend research and results
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 7: 3a8a34f perf(output): hand render() frames to Node without a copy
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 7 verified (3a8a34f)
== step 8: f0de9cb feat(gpu): experimental pipelined GPU readback; types for the output experiments
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 8 verified (f0de9cb)
== step 9: 593182c docs(experiments): phase 4A.1 output-path research
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 10: 2d47861 feat(api): add renderInto() and frameByteLength
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 10 verified (2d47861)
== step 11: de0ce23 test(frame-api): renderInto contract, workers and documented examples
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   npm test ok
   step 11 verified (de0ce23)
== step 12: 7b85faf docs(frame-api): document render(), renderInto() and the pixel format
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 13: 8c480ee docs(gpu): SAFETY comments on the pipelined GL readback
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 13 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 13 verified (8c480ee)
== step 14: 47d7ade docs(experiments): phase 4A.2 frame API research
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 15: b53479a fix(render): malformed input is a JS error, never a panic
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 15 verified (b53479a)
== step 16: 8300701 fix(png): encode transparent output with straight alpha
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 16 verified (8300701)
== step 17: e39c901 style: rustfmt configuration, cargo fmt, clippy clean
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 17 verified (e39c901)
== step 18: 49a3da8 docs: project status, contracts, trust model, third-party notices, local checks
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   step 18 verified (49a3da8)
== step 19: 9466c86 chore(release): 0.6.0-rc.1
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 19 verified (9466c86)
== regenerating steps 18-19 after fixing scripts/check.sh (TypeScript tools) and scripts/check-gpu.sh (addon path)
== step 18: e184ea2 docs: project status, contracts, trust model, third-party notices, local checks
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   step 18 verified (e184ea2)
== step 19: 4065915 chore(release): 0.6.0-rc.1
   Blitz ready at /home/user/harender/third_party/blitz (branch patched, 14 patches)
   release build ok
   smoke: all passed
   smoke-js: all passed
   smoke-waapi: all passed
   smoke-fonts: all passed
   render-into: all passed
   render-into-examples: all passed
   hardening: all passed
   npm test ok
   gpu build ok
   gpu-gl ganesh-gl pixels differing from CPU by >64: 0
   gpu-vulkan ganesh-vulkan pixels differing from CPU by >64: 0
   step 19 verified (4065915)
== step 20: a98ea85 docs(experiments): phase 4A.3 hardening and repository normalization
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 20: a14cf62 docs(experiments): phase 4A.3 hardening and repository normalization
   docs/experiments only: code unchanged, build and tests as the previous commit
== step 20: 032f605 docs(experiments): phase 4A.3 hardening and repository normalization
   docs/experiments only: code unchanged, build and tests as the previous commit
```
