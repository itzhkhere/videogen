# Phase 4A.3 — core hardening and repository normalization

Phase 4A.3 closes the foundation before Phase 4B (GPU texture/device interoperability): the last
input-triggerable panics are gone, transparent PNGs are correct, the surface `AlphaType` is a
documented decision, and the engine has a clean canonical repository, `itzhkhere/harender`
(private), rebuilt from the research history as 20 verified logical commits ending in
**0.6.0-rc.1** (not published).

Environments: development and every per-commit check on a 4-vCPU container (CPU raster; Mesa
llvmpipe for Ganesh GL, lavapipe for Ganesh Vulkan); hardware subset on a Colab **NVIDIA L4**
(driver 580.82.07). Node 24.19.0, Rust 1.97 (cargo 1.97.0), napi-rs 3.14.1, Skia m153
(skia-safe 0.153.3).

## Decision

**GO** for closing the pre-Phase-4B foundation, with two deviations that were decided by the
project owner, not left open:

- **Hosted CI is not enabled** (owner's decision: Rust builds make it slow). Its role is taken by
  `scripts/check.sh` / `scripts/check-gpu.sh`, run on every canonical commit and on the final
  tree; a ready workflow is kept inactive in `docs/ci/`.
- **No permanent name**: the repository is `harender`, the package/crates use the descriptive
  provisional name `html-renderer`; renaming is one mechanical step (`PROJECT_IDENTITY.md`).

Acceptance criteria:

| # | criterion | result |
|---|---|---|
| 1 | malformed background strings cannot panic | parsed as bytes after an ASCII-hex check; every malformed class tested |
| 2 | huge `advanceClock()` values cannot panic | limit 8.64e15 ms (JS `Date` range), checked `Duration`/`Instant` arithmetic; boundary exact |
| 3 | input-triggerable N-API panics removed or contained | every public method audited (`docs/PANIC-SAFETY.md`); page timer delays fixed (Blitz 0014); generic guard on every method running engine code |
| 4 | transparent PNG correct | straight alpha; decoded-pixel tests on CPU, Mesa GL/Vulkan, L4 GL/Vulkan |
| 5 | raw RGBA compatible | 39/39 frames identical to 4A.1/4A.2 on CPU, Mesa GL/Vulkan, L4 GL/Vulkan; `renderInto` = `render()` |
| 6 | AlphaType deliberate and documented | **Opaque kept** (Opaque and Premul builds give identical bytes); `docs/PIXEL-FORMAT.md` |
| 7 | full regression passes | see Regression (one research-only item noted) |
| 8 | L4 GL/Vulkan subset passes | yes |
| 9 | scratch history preserved | research branch unchanged on GitHub; archive tag created (push pending, see Git normalization) |
| 10 | canonical history clean | 20 commits, each built and tested; `docs/GIT-HISTORY.md` |
| 11 | CI exists | local check scripts on every commit; hosted workflow drafted, **inactive by decision** |
| 12 | experiments separated | `experiments/` only, own commits, never built; large artifacts excluded |
| 13 | upstream patches documented | `upstream-patches/README.md`: base, reason, test, removal condition per patch |
| 14 | naming status explicit | `PROJECT_IDENTITY.md` |
| 15 | GitHub canonicalized | `itzhkhere/harender` `main`; migration to `harihkim` documented (`docs/GITHUB_MIGRATION.md`) |
| 16 | Phase 4B can start from a stable branch | `main` at 0.6.0-rc.1; Phase 4B on `exp/phase4b-…` branches |

## Panic hardening

**Background parser.** `parse_hex` sliced the string by byte index (`&h[i..i+2]`), so any
non-ASCII character could split a UTF-8 sequence and panic. It now trims, strips `#`, requires
6 or 8 bytes that are all ASCII hex digits, and decodes nibbles from bytes. Errors quote at most
64 characters of the input. `test/hardening.mjs` covers valid forms (upper/lower case, 6 and 8
digits, surrounding spaces) and rejects: empty, `#`, wrong lengths, non-hex, a two-byte and a
three-byte character and an emoji at **every** position of a 6- and 8-digit string, combining
marks, NUL, 100 000 characters.

**advanceClock range.** Finite values used to reach `Duration::from_secs_f64` and
`Instant + Duration`, both of which panic on overflow (`advanceClock(1e300)`). Now: finite, ≥ 0,
and `clock + ms ≤ 8.64e15` ms (the range of a JS `Date`, so `Date.now()` stays valid), checked
before any conversion; the conversion itself uses `Duration::try_from_secs_f64` +
`Instant::checked_add`. Tested: NaN, ±Infinity, negative, `MAX + 2`, `1e300`, and the exact
boundary (clock at `MAX − 1`: `+2` rejected, `+1` accepted, clock unchanged after a rejection).

**Page timers (found by the audit).** `setTimeout(f, 1e25)` in a page aborted the process
(`Duration::from_secs_f64` inside Blitz's Boa runtime). Delays now follow WebIDL `long`
conversion like browsers: non-finite or negative → 0, above `i32::MAX` wrap modulo 2³² (negative
results → 0). Blitz patch `0014`; tests check that `1e25`, `1e300` and `Number.MAX_VALUE` no longer
abort, that wrapped delays fire as short timers (`2147483648` and `-5` → 0, `4294967297` → 1 ms),
and that `2147483647` (about 24.8 days) does not fire early.

**Public N-API audit.** Every exported method and getter with its user-controlled inputs,
fallible operations, validation, guard and remaining assumptions: `docs/PANIC-SAFETY.md`. Other
fixes: `Mutex::lock().unwrap()` → poison-tolerant, `doc.as_mut()` and `get_node(..)` without
`unwrap` in `boxes()`/`missingGlyphs()`.

**catch_unwind policy.** `HtmlRenderer::guarded` wraps every method that runs engine code
(`load`, `render`, `renderInto`, `advanceClock`, `eval`, `boxes`, `missingGlyphs` and the private
`_render*`/`_pipeline*`/`_dropNodeForTesting`); the constructor has its own backstop. On a panic:
`Error: internal error in <method>(); the renderer was closed (please report this)`, the renderer
is marked closed and its document leaked (dropping half-updated engine state could panic again).
**No panic text reaches JS**; Rust's panic hook still prints it to stderr. Verified by running
`setTimeout(f, 1e25)` against the build without patch 0014: JS `Error`, process alive, later calls
`renderer is closed`. Getters and methods that run no engine code are not wrapped. Cost: measured
in 4A.2 as within noise.

## PNG alpha correctness

| | raw RGBA (`render()`, `renderInto()`) | PNG before 4A.3 | PNG now |
|---|---|---|---|
| 50 % red over `#00000000` | `[128, 0, 0, 128]` (premultiplied) | `[128, 0, 0, 128]` — read as straight alpha: too dark | `[255, 0, 0, 128]` |
| opaque pixels | unchanged | unchanged | unchanged (bit-identical files) |

Conversion: `A = 255` unchanged, `A = 0` → `0, 0, 0, 0`, otherwise `min(255, round(c·255/A))`
(integer: `(c·255 + A/2) / A`). The raw frame is untouched; only the PNG path converts, into a
copy (`Cow`, no copy for fully opaque frames).

Decoded-pixel checks (`test/hardening.mjs`, pngjs): 25 %, 50 %, 75 % and opaque red; coloured
translucent fills; a translucent background; translucent text; every PNG pixel compared with the
straight-alpha value computed from the raw frame of the same renderer, plus fixed spot values
(`[128,0,0,128]` raw → `[255,0,0,128]` PNG). **Passes on CPU, Mesa GL, Mesa Vulkan, L4 GL and
L4 Vulkan**: the test runs per backend, each PNG checked against that backend's own raw frame, and
the spot values (solid fills, no antialiasing) are the same on every backend.

## AlphaType decision

> **Is production surface AlphaType still Opaque or changed to Premul?**

**Still `Opaque`**, deliberately. The addon was built twice, identical except the surface
`AlphaType` (CPU raster and Ganesh), and frames compared for an opaque scene, transparent and
translucent backgrounds, semi-transparent fills, text, an image with alpha, box-shadow, blur,
drop-shadow, opacity groups and gradients, at 1× and 2×: **byte-identical on CPU, Ganesh GL and
Ganesh Vulkan** (`experiments/phase4a3/alphatype.mjs`, `evidence/alphatype-*.json`). The surface is
cleared to transparent, Skia blends premultiplied colour either way, and readback uses the
surface's own `ImageInfo`, so the label changes nothing. Changing it would have no correctness gain
and would add risk. Phase 4B: a texture/`SkImage` export must declare **Premul** (an image snapped
from an `Opaque` surface is composited as opaque) — change the label in the commit that adds the
export, and rerun this experiment. Details: `docs/PIXEL-FORMAT.md`.

## Regression

Final tree = canonical `main` (`4065915`, 0.6.0-rc.1) unless noted. "Per commit" = run on every
canonical commit that changes code (`experiments/phase4a3/history/verify.log`).

| area | result |
|---|---|
| CPU | `scripts/check.sh`: fmt clean, clippy `-D warnings` clean, dom-host 16 tests, `npm test` (smoke, JS, WAAPI, fonts, render-into, examples, hardening) all passed; 39/39 frames identical to 4A.1 (= 4A.2) via `render()` and `renderInto()` |
| Mesa GL | `scripts/check-gpu.sh`: render-into, hardening passed; 39/39 identical |
| Mesa Vulkan | same; 39/39 identical |
| L4 GL | render-into, workers (1/2/4), hardening passed; 39/39 identical to the 4A.1 GPU build (`render()` and `renderInto()`); correctness vs CPU (Phase 4A subset, 720p/1080p) identical (classes and metrics) to the 4A.2 L4 run: minor / edge-AA only, no major |
| L4 Vulkan | render-into, workers, hardening passed; 39/39 identical; correctness identical to 4A.2 |
| Phase 3 | contract suite 30/30 identical on Boa and V8 against the canonical build; lifecycle/cycles/long/simultaneous/workers/exit modes all pass. Scene replay (`contract/scenes.mjs`): Boa determinism passes; its V8 half needs the research Deno adapter rebuilt with the renamed page global (`__htmlRenderer`), which the canonical tree does not build (experiments are outside the workspace) — passed on the research tree with the 4A.3 code (`evidence/regression-scratch.txt`) |
| Phase 4A | GPU vs CPU correctness subset on L4 (above) and on Mesa (bundle check) |
| Phase 4A.2 | frame API contract (`render-into.mjs`), examples, workers: CPU, Mesa, L4 |
| GSAP | `smoke-js` (GSAP playing on rAF and seeked), worker determinism (GSAP scene identical), `scenes/gsap.html` in the 39-frame output regression |
| Motion | worker determinism (Motion library scene identical), `scenes/motion-library.html` in the 39-frame output regression |
| WAAPI | `smoke-waapi` all passed |
| fonts | `smoke-fonts` all passed |
| workers | `test/workers.mjs`: identical across 1 renderer / 2 workers; `render-into-workers.mjs`: 0 missing, 0 mismatched, use-after-transfer rejected 24/24 |
| TypeScript | `tsc` 5.9.3 strict on `test/types`: 0 errors, every `@ts-expect-error` is an error |

1080p/4K timing on the L4 (scene A output-dominated, scene E paint-heavy; median ms; baseline =
4A.1 build, whose bytes and timings matched 4A.2 on the L4 in Phase 4A.2):

| backend | scene | res | render() baseline | render() 4A.3 | into baseline (`_renderInto`) | `renderInto` 4A.3 |
|---|---|---|---|---|---|---|
| cpu | A | 1080p | 5.86 | 5.86 | 2.15 | 2.14 |
| cpu | A | 4K | 25.32 | 24.88 | 11.4 | 11.13 |
| cpu | E | 1080p | 187.94 | 187.48 | 185.39 | 184.44 |
| cpu | E | 4K | 410.48 | 412.7 | 403.33 | 403.72 |
| gpu-gl | A | 1080p | 6.03 | 5.97 | 2.23 | 2.21 |
| gpu-gl | A | 4K | 22.88 | 22.49 | 7.49 | 7.47 |
| gpu-gl | E | 1080p | 32.35 | 32.25 | 29.31 | 28.13 |
| gpu-gl | E | 4K | 64.54 | 64.54 | 48.93 | 48.79 |
| gpu-vulkan | A | 1080p | 5.5 | 5.42 | 1.82 | 1.85 |
| gpu-vulkan | A | 4K | 22.91 | 22.66 | 9.17 | 9.2 |
| gpu-vulkan | E | 1080p | 24.33 | 24.65 | 21.23 | 21.33 |
| gpu-vulkan | E | 4K | 76.3 | 76.42 | 61.66 | 61.43 |

No regression: every 4A.3 number is within run-to-run noise of the baseline, and `renderInto` keeps its 4A.1/4A.2 advantage (CPU 4K output 2.2× faster than `render()`, GL 4K 3.0×, Vulkan 4K 2.5×). Raw data: `experiments/phase4a3/evidence/l4/timing-l4.json`.

## Git normalization

**Scratch archive ref.** The research repository `itzhkhere/videogen` is unchanged: branch
`claude/serene-ritchie-o55j58` keeps every research commit and is the archive on GitHub. The
annotated tag `archive/research-scratch-20261006` (on the research commit that adds the L4 results,
SHA in `docs/GIT-HISTORY.md`) was created, but this session's git proxy refused to push tags
(HTTP 403); push it from a normal clone with the command in `docs/GIT-HISTORY.md`.

**Chosen canonical baseline.** `951dc13` (v0.5.0, the engine before the research phases), laid
out with the engine at the root. Each later research step that changed the engine became one or
more logical commits; experiments became separate `docs(experiments)` / `feat(experiments)`
commits.

**Clean commit list** (`main`, oldest first; sources per commit in `docs/GIT-HISTORY.md`):

1. `cb1ad7c` build: import the v0.5.0 engine
2. `1dbc75e` docs(experiments): phase 2 runtime research and the phase 3 handoff
3. `d6ec43b` refactor(dom): introduce the shared engine-neutral DOM host
4. `2780cb2` feat(experiments): experimental Deno/V8 runtime adapter and shared contract suite
5. `8be1f2c` feat(gpu): experimental headless GPU backends (Ganesh GL/Vulkan, Graphite)
6. `9bf9e44` fix(gpu): deterministic Ganesh output across document reloads
7. `a84fd2d` docs(experiments): phase 4A GPU backend research and results
8. `3a8a34f` perf(output): hand render() frames to Node without a copy
9. `f0de9cb` feat(gpu): experimental pipelined GPU readback; types for the output experiments
10. `593182c` docs(experiments): phase 4A.1 output-path research
11. `2d47861` feat(api): add renderInto() and frameByteLength
12. `de0ce23` test(frame-api): renderInto contract, workers and documented examples
13. `7b85faf` docs(frame-api): document render(), renderInto() and the pixel format
14. `8c480ee` docs(gpu): SAFETY comments on the pipelined GL readback
15. `47d7ade` docs(experiments): phase 4A.2 frame API research
16. `b53479a` fix(render): malformed input is a JS error, never a panic
17. `8300701` fix(png): encode transparent output with straight alpha
18. `e39c901` style: rustfmt configuration, cargo fmt, clippy clean
19. `e184ea2` docs: project status, contracts, trust model, third-party notices, local checks
20. `4065915` chore(release): 0.6.0-rc.1
21. (the commit that adds this report) docs(experiments): phase 4A.3 hardening and repository normalization

Every commit: author and committer `Harikrishnan <hkupim@gmail.com>`, dated like its research
source, Claude co-author trailer. Every commit that changes code was built from a clean checkout
with Blitz set up from its own patch series and passed its own `npm test`; GPU-relevant commits
also built with `experimental-gpu-vulkan` and passed a Ganesh GL/Vulkan smoke render (Mesa). The
build leaves the tree clean (checked).

Problems found while verifying, all fixed in the transformation (from the first commit):
- workspace `members = [".", …]` made every path below the root a member, so `third_party/blitz`
  was pulled into the workspace despite `exclude` → root member implicit, `third_party` excluded;
- renaming crates left `Cargo.lock` out of Cargo's order, so every build rewrote it → lockfile
  re-sorted exactly as Cargo writes it;
- the first harness version could report a failed build as verified (stale addon reused) → it now
  deletes the previous addon, checks every exit status, and fails if a build modifies tracked files.

**Branch structure.** `main` only. Phase 4B starts on `exp/phase4b-webgpu-interop` (and similar
`exp/…` branches); `main` stays buildable, tested, without known input-triggerable panics.

**Files removed from normal Git** (stay in the research repository; 230 files, ~75 MB): images,
archives and review bundles under `experiments/` (PNG evidence, `bundle.tgz`, the 4A.2 review
bundle and ZIP), experiment files over 500 kB, `graphify-out/` (generated), built addons
(`*.node`), `target*/`, `node_modules/`. Blitz is no longer a sibling checkout: it is cloned into
`third_party/blitz` (git-ignored) by `scripts/setup-blitz.sh` from the pinned commit and patched
there.

**Experiments retained.** `experiments/phase2` (runtime research), `phase3` (Deno/V8 adapter and
contract suite), `phase4a` (GPU backends), `phase4a1` (output path), `phase4a2` (frame API, unsafe
audit), `phase4a3` (AlphaType, L4 scripts, history tooling): code, scripts and JSON/log evidence,
not part of any build. Phase reports in `docs/phases/`.

Canonical repository size at 0.6.0-rc.1: 1 018 files, 8.4 MiB of Git objects.

## GitHub status

**Canonical repository created and updated:** `itzhkhere/harender` (private), branch `main` (head: the commit that adds this report; see
`git-log-graph.txt` in the review bundle). Remotes (no credentials stored in either repository):

```
harender (canonical)   origin  https://github.com/itzhkhere/harender (fetch/push)
videogen (research)    origin  https://github.com/itzhkhere/videogen (fetch/push)
```

Migration to the `harihkim` account (transfer, or mirror push from `harender.bundle`) is
documented in `docs/GITHUB_MIGRATION.md`; no history change is needed because every commit is
already authored by Harikrishnan.

## CI

| | |
|---|---|
| workflows added | none active (owner's decision); `docs/ci/check.yml` drafted, kept outside `.github/workflows/` |
| jobs | draft: one `check` job on `ubuntu-24.04` running `scripts/check.sh` (fmt, clippy, dom-host tests, release build, `npm test`, workers, TypeScript) with cargo/Blitz caching |
| matrix | Linux x64, Node 24 (the only validated platform); GPU checks need a GPU runner and stay local (`scripts/check-gpu.sh`, Mesa is enough) |
| blocking vs informational | blocking: everything in `check.sh`; informational: `check-gpu.sh`, Chrome comparisons (`npm run compare`), experiments |

Until hosted CI is enabled, `scripts/check.sh` is the gate: it was run on the final tree, and its
build/test part on every canonical commit.

## Project identity

- **Permanent name known?** No.
- **Current names:** repository `harender`; npm package `html-renderer` (`private`, `UNLICENSED`,
  0.6.0-rc.1); crates `html-renderer` (lib `html_renderer`) and `dom-host`; addon
  `html-renderer.linux-x64-gnu.node`; environment variables `HTML_RENDERER_*`; page global
  `__htmlRenderer`. Public API names (`HtmlRenderer`, `render`, `renderInto`, `frameByteLength`)
  are descriptive and independent of the project name.
- **Remaining rename work:** one search-and-replace of those names, `scripts/check.sh`, rename or
  transfer the GitHub repository, then the first npm publish. Version line continues (0.6.x).
  No licence chosen yet (`THIRD_PARTY_NOTICES.md` lists what a distribution would require; MPL-2.0
  Stylo source including our patches is the notable obligation).

## Release readiness

> **Is the core ready for 0.6.0-rc.1?**

**Yes.** `main` is tagged in content as 0.6.0-rc.1 (version, changelog): public API
documented and tested, no known input-triggerable panics, raw output unchanged, PNG fixed, all
checks green on CPU, Mesa and L4. Not published; the remaining steps to 0.6.0 are a licence and
name decision and release validation on the consumer side.

> **Is the repository clean enough to become canonical?**

**Yes.** Engine at the root, 20 logical commits each verified, experiments separated, no large
artifacts or secrets (history scanned), one author identity, documented patches and status. It
already is canonical (`itzhkhere/harender`); the research repository is kept as the archive.

> **Is Phase 4B ready to begin on a separate experiment branch?**

**Yes**, from `main` on `exp/phase4b-webgpu-interop`. Prerequisites known from this phase: a
texture/`SkImage` export must declare premultiplied alpha; the Ganesh backends and their patches
(anyrender_skia 0003–0007) are experimental and documented; the Graphite and async-readback
prototypes stay research only.

## Deliverables

- `itzhkhere/harender` `main`; `harender.bundle` (offline clone) and `harender-repo.zip`.
- `experiments/phase4a3/review-bundle/` and `phase4a3-review-bundle.zip`: this report, contracts,
  sources, tests, `PATCH.diff` (0.5.0 baseline → final engine), `COMMIT_PLAN.md`, `TEST_LOGS.md`,
  canonical `git log --graph`, `git status`, redacted remotes.
