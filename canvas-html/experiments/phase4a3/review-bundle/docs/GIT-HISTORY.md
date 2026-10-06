# Git history

This repository's history was **reconstructed** in Phase 4A.3 from the research repository
(`itzhkhere/videogen`, branch `claude/serene-ritchie-o55j58`, directory `canvas-html/`), where the
engine was developed together with its experiments. The research history stays there unchanged and
is the record of how each result was obtained (see "Archive" below).

## Rules

- Every commit is a real state of the research repository (or of the Phase 4A.3 working tree),
  transformed the same way; no commit contains code that did not exist at that point.
- **Layout:** the engine is at the repository root (`canvas-html/*` → `/`); phase reports →
  `docs/phases/`; the Phase 3 handoff → `docs/handoff/`; Blitz is cloned into
  `third_party/blitz` (git-ignored) by `scripts/setup-blitz.sh`.
- **Names:** the provisional internal names are used from the first commit (`canvas-html` →
  `html-renderer`, `canvas_html` → `html_renderer`, `CANVAS_HTML_` → `HTML_RENDERER_`,
  `canvasHtml` → `htmlRenderer`, `canvas-dom-host` → `dom-host`). Recorded evidence (logs, JSON
  results) keeps the names it was recorded with.
- **Licence:** none chosen; `package.json` is `private` and `UNLICENSED` from the first commit and the
  engine's crates carry no licence field. Vendored third-party code keeps its licences.
- **Experiments** are separate `docs(experiments)`/`feat(experiments)` commits under
  `experiments/`, never mixed with engine code. Large artifacts (images, archives, review bundles,
  built addons, files over 500 kB in `experiments/`) stay in the research repository.
- **Verification:** every commit that changes code was checked out, Blitz set up from its own patch
  series, built (`cargo build --release`) and tested with its own `npm test`; commits touching the GPU
  code were also built with `experimental-gpu-vulkan` and smoke-tested on Ganesh GL and Vulkan
  (Mesa). Log: `experiments/phase4a3/history/verify.log`. Documentation-only commits share the
  build of their parent.
- **Author and committer** of every commit: `Harikrishnan <hkupim@gmail.com>`; dates are those of
  the research commit each one comes from.

Tooling: `experiments/phase4a3/history/` (`build_history.py`, `plan.json`, `run_history.sh`,
overlays). Rerunning it against the research repository reproduces the same trees.

## Commits

| # | commit | subject | taken from (research commit and paths) |
|---|---|---|---|
| 0 | `cb1ad7c` | build: import the v0.5.0 engine | `951dc13` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|index\.d\.ts\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base` |
| 1 | `1dbc75e` | docs(experiments): phase 2 runtime research and the phase 3 handoff | `fc6b1e4` (`^(experiments/(?!phase3/\|phase4)\|docs/handoff/\|docs/phases/(POC\|PHASE2)_RESULTS\.md)`) |
| 2 | `d6ec43b` | refactor(dom): introduce the shared engine-neutral DOM host | `9b0d148` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|index\.d\.ts\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base` |
| 3 | `2780cb2` | feat(experiments): experimental Deno/V8 runtime adapter and shared contract suite | `fc6b1e4` (`^(experiments/phase3/\|docs/phases/PHASE3_RESULTS\.md)`) |
| 4 | `8be1f2c` | feat(gpu): experimental headless GPU backends (Ganesh GL/Vulkan, Graphite) | `65baa4c` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|index\.d\.ts\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base` |
| 5 | `9bf9e44` | fix(gpu): deterministic Ganesh output across document reloads | `7a02570` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|index\.d\.ts\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base`; `e185c33` (`^upstream-patches/anyrender_skia/0004`) |
| 6 | `a84fd2d` | docs(experiments): phase 4A GPU backend research and results | `d5eb865` (`^README\.md`); `fc6b1e4` (`^(experiments/phase4a/\|docs/phases/PHASE4A_RESULTS\.md)`) |
| 7 | `3a8a34f` | perf(output): hand render() frames to Node without a copy | `9ab1b7f` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base` |
| 8 | `f0de9cb` | feat(gpu): experimental pipelined GPU readback; types for the output experiments | `5bc5553` (`^(Cargo\.toml\|Cargo\.lock\|build\.rs\|index\.js\|package\.json\|package-lock\.json\|README\.md\|src/\|dom-host/\|vendor/\|upstream-patches/\|scripts/\|test/)`); new files: `overlay/base`; `e185c33` (`^(index\.d\.ts\|upstream-patches/)`) |
| 9 | `593182c` | docs(experiments): phase 4A.1 output-path research | `fc6b1e4` (`^(experiments/phase4a1/\|docs/phases/PHASE4A1_RESULTS\.md)`) |
| 10 | `2d47861` | feat(api): add renderInto() and frameByteLength | `13fc5d0` (`^(src/\|index\.d\.ts)`); `99e59cf` (`^vendor/`); `286aa5c` (`^upstream-patches/`) |
| 11 | `de0ce23` | test(frame-api): renderInto contract, workers and documented examples | `13fc5d0` (`^(test/\|package\.json)`) |
| 12 | `7b85faf` | docs(frame-api): document render(), renderInto() and the pixel format | `13fc5d0` (`^README\.md`) |
| 13 | `8c480ee` | docs(gpu): SAFETY comments on the pipelined GL readback | `a938f6b` (`^(vendor/\|upstream-patches/)`) |
| 14 | `47d7ade` | docs(experiments): phase 4A.2 frame API research | `fc6b1e4` (`^(experiments/phase4a2/\|docs/phases/PHASE4A2_RESULTS\.md)`) |
| 15 | `b53479a` | fix(render): malformed input is a JS error, never a panic | Phase 4A.3 working tree; `fc6b1e4` (`^upstream-patches/blitz/`) |
| 16 | `8300701` | fix(png): encode transparent output with straight alpha | `fc6b1e4` (`^(src/lib\.rs\|test/hardening\.mjs)`) |
| 17 | `e39c901` | style: rustfmt configuration, cargo fmt, clippy clean | `1940663` (`^(rustfmt\.toml\|src/\|dom-host/)`) |
| 18 | `e184ea2` | docs: project status, contracts, trust model, third-party notices, local checks | new files: `overlay/docs`; removes `^upstream-patches/UPSTREAM\.md$` |
| 19 | `4065915` | chore(release): 0.6.0-rc.1 | new files: `overlay/release`; version in `package.json`; version in `package-lock.json`; version in `Cargo.toml`; version in `Cargo.lock` |
| 20 | `(this commit)` | docs(experiments): phase 4A.3 hardening and repository normalization | Phase 4A.3 working tree; new files: `overlay/final` |

Research commits: `951dc13` v0.5.0 baseline · `9b0d148` shared DOM host · `65baa4c` GPU backends ·
`7a02570` deterministic Ganesh reloads · `d5eb865` Phase 4A README · `9ab1b7f` zero-copy render ·
`5bc5553`/`e185c33` pipelined readback and types · `13fc5d0`/`99e59cf`/`286aa5c` renderInto ·
`a938f6b` SAFETY comments · `f61788a` Phase 4A.2 · `fc6b1e4`/`1940663` Phase 4A.3.

## Archive

The research history is preserved, not rewritten: branch `claude/serene-ritchie-o55j58` of
`itzhkhere/videogen` holds every research commit. The annotated tag
`archive/research-scratch-20261006` marks research commit `b523602` (Phase 4A.3 with its L4
results); the session that created it could not push tags, so push it from a clone of the
research repository:

```sh
git fetch origin claude/serene-ritchie-o55j58
git tag -a archive/research-scratch-20261006 -m "Research history at the end of Phase 4A.3" b523602
git push origin archive/research-scratch-20261006
```
