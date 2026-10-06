# canvas-html Phase 4A.2 review bundle

Everything needed to review the public frame API (`renderInto`, `frameByteLength`) and the
frame-output code without the repository.

Start here:

1. `PHASE4A2_RESULTS.md`: decision, API, ownership diagrams, results.
2. `API_CONTRACT.md`: the testable contract (targets, errors, pixel format, ownership, workers).
3. `UNSAFE_AUDIT.md`: every `unsafe` block on the frame path, with invariants and reachability
   (Graphify call graph in `graphify/`).
4. `PATCH.diff`: the complete production change since Phase 4A.1 (`PATCH.stat` for an overview);
   `PATCH-experiments.diff`: the Phase 4A.2 experiment scripts.
5. `source/`: exact copies of the changed production files and of the unchanged files needed to
   read them, including the dependency code the audit relies on (`source/third-party/`: napi-rs
   3.14.1 Buffer/finalizer code, skia-safe 0.153.3 surface wrapping/readback).
6. `patches/`: full text of the anyrender_skia patches on the output path (0003 headless GPU
   renderers, 0005 render into the caller's buffer, 0006 try_render, 0007 SAFETY comments).
7. `tests/`: source of the tests and probes; `logs/`: their outputs and measurements.

Read the Rust in this order: `source/src/target.rs` (validation and the `&mut [u8]` view),
`source/src/lib.rs` (`render_into`, `render`, `paint_into`, `checked_target`, `close`),
`source/src/frames.rs`, `source/vendor/anyrender_skia/src/image_renderer.rs` (`try_render`),
`source/vendor/anyrender_skia/src/gpu_image_renderer.rs` (`render_timed` readback).

`MANIFEST.md` lists every file: repository path, why it is included, whether 4A.2 changed it,
whether it contains `unsafe`, and whether it is production, test, experiment or third-party.
