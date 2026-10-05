# Graph Report - canvas-html  (2026-10-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 539 nodes · 843 edges · 32 communities (19 shown, 13 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 21
- Community 22
- Community 23
- Community 28
- Community 30

## God Nodes (most connected - your core abstractions)
1. `Animation` - 26 edges
2. `HtmlRenderer` - 25 edges
3. `Element` - 18 edges
4. `DenoRuntime` - 17 edges
5. `ExperimentalDenoRenderer` - 15 edges
6. `load()` - 13 edges
7. `Document` - 11 edges
8. `HtmlRenderer` - 10 edges
9. `Watchdog` - 10 edges
10. `Kind` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Renderer` --references--> `DenoRuntime`  [EXTRACTED]
  experiments/phase2/addon/src/lib.rs → experiments/phase2/engine/src/lib.rs
- `DenoRuntime` --references--> `Runtime`  [EXTRACTED]
  experiments/phase2/engine/src/lib.rs → experiments/runtime-poc/src/lib.rs
- `State` --references--> `DomHost`  [EXTRACTED]
  experiments/phase2/engine/src/lib.rs → experiments/phase2/host/src/lib.rs
- `Document` --implements--> `DomHost`  [EXTRACTED]
  experiments/phase2/addon/src/document.rs → experiments/phase2/host/src/lib.rs
- `Renderer` --references--> `Document`  [EXTRACTED]
  experiments/phase2/addon/src/lib.rs → experiments/phase2/addon/src/document.rs

## Import Cycles
- None detected.

## Communities (32 total, 13 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (45): before, close(), constructors, create(), firstEvals, font, points, r (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (16): decode_data_url(), DEFAULT_FALLBACKS, Doc, Plain, Script, ElementBox, HtmlRenderer, JS_PRELUDE (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (12): counters(), CREATED, Deadline, DenoRuntime, DROPPED, op_phase2_dom(), op_phase2_now(), State (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (21): Command, EXECUTION_THREADS, ExperimentalDenoRenderer, ExperimentalOptions, Kind, Errors, Eval, Render (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (35): description, devDependencies, gsap, playwright-core, pngjs, engines, node, files (+27 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (12): apply(), document(), HEIGHT, HTML, main(), png(), render(), run() (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (11): bench(), HostState, Mutation, MutationKind, Style, Text, op_now_ms(), op_poc_set_style() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): a, at(), b, forward, here, { HtmlRenderer }, load(), off (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (10): font, {HtmlRenderer}, samples, {HtmlRenderer}, reference, result, rssBefore, samples (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (9): { HtmlRenderer }, path, f, { HtmlRenderer }, r, t0, here, renderRange() (+1 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (6): ElementBox, HtmlRenderer, JsonValue, MissingGlyphs, RendererOptions, RenderOptions

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (3): native, p, v

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (9): boxes, f, { HtmlRenderer }, orange, png, r, r3, r4 (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.20
Nodes (7): {denoEval}, gsapSource, probes, results, all, results, selected

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (5): encode(), file, { HtmlRenderer }, [out = 'out.mp4', scene = 'scenes/motion.html', duration = '6000'], r

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (6): here, { HtmlRenderer }, inter, m, missing, t

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (4): deno, {HtmlRenderer}, require, samples

### Community 22 - "Community 22"
Cohesion: 0.50
Nodes (4): deno-canvas-bridge, deno-core-smoke, deno-napi-coexist, runtime-poc

### Community 23 - "Community 23"
Cohesion: 1.00
Nodes (3): phase2-addon, phase2-engine, phase2-host

## Knowledge Gaps
- **147 isolated node(s):** `ElementBox`, `JsonValue`, `MissingGlyphs`, `RendererOptions`, `RenderOptions` (+142 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 284 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DenoRuntime` connect `Community 2` to `Community 3`, `Community 7`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `ElementBox`, `JsonValue`, `MissingGlyphs` to the rest of the system?**
  _147 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05834464043419267 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.055811571940604196 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06560283687943262 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07342995169082125 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.04994192799070848 - nodes in this community are weakly interconnected._