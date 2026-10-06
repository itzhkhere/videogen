Small single-purpose probes (run one output path per process, so allocator and GC state do not
leak between paths). `node probes/output-paths.mjs <render|clone|transfer|pool|into> [dpr]`,
`DPR=3 node probes/yield-ab.mjs render <0|1>` (1 = event-loop turn per frame, so Buffer
finalizers run), `node probes/breakdown.mjs <clone|transfer|pool|into>` (4K, per-step medians).
Set CANVAS_HTML_NODE to compare another addon (e.g. build/phase4a-cpu.node, the Phase 4A one).
