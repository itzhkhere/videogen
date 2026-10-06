#!/usr/bin/env python3
"""Writes review-bundle/MANIFEST.md: every bundled file with its repository path, why it is
included, whether Phase 4A.2 changed it (git diff against the baseline), whether it contains
`unsafe` (grep, outside comments), and production / test / experiment / third-party / document.
usage: manifest.py BUNDLE_DIR CANVAS_HTML_DIR BASE_REV"""
import re, subprocess, sys
from pathlib import Path

B, ch, base = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
repo = Path(subprocess.check_output(['git', '-C', ch, 'rev-parse', '--show-toplevel'], text=True).strip())
changed = set(subprocess.check_output(['git', '-C', repo, 'diff', '--name-only', base, 'HEAD'], text=True).split())
prefix = ch.relative_to(repo).as_posix() + '/'

WHY = {
    'src/lib.rs': 'HtmlRenderer N-API class: render(), renderInto(), frameByteLength, close(), private diagnostics; frame ownership hand-off to Node; catch_unwind boundary',
    'src/target.rs': 'NEW: renderInto target validation (typed-array kind, SharedArrayBuffer, detached, exact length) and the &mut [u8] view; the aliasing argument',
    'src/frames.rs': 'frame size (checked) and fallible frame allocation; pool and huge-page experiments removed',
    'Cargo.toml': 'crate features and dependencies (napi 3 with napi8; unchanged)',
    'Cargo.lock': 'exact dependency versions (unchanged)',
    'build.rs': 'napi-rs build setup (unchanged)',
    'index.js': 'JS loader and call() helper (unchanged)',
    'index.d.ts': 'public typings: FrameTarget, renderInto, frameByteLength, pixel format docs',
    'package.json': 'npm test now runs the renderInto tests',
    'README.md': 'user documentation: render() vs renderInto(), examples, targets, pixel format',
    'vendor/anyrender_skia/src/image_renderer.rs': 'CPU raster renderer: try_render (no panic on a short buffer), patch 0006',
    'vendor/anyrender_skia/src/gpu_image_renderer.rs': 'Ganesh GPU renderer: readback into the caller slice; pipelined readback (experimental) with SAFETY comments, patch 0007',
    'vendor/anyrender_skia/src/lib.rs': 'crate exports (unchanged in 4A.2)',
    'vendor/anyrender_skia/src/gpu_common.rs': 'Vulkan device setup unsafe referenced by the audit (unchanged)',
    'vendor/anyrender_skia/src/scene.rs': 'scene painter; image-brush unsafe referenced by the audit (unchanged)',
    'vendor/anyrender_skia/Cargo.toml': 'vendored crate features (unchanged)',
    'vendor/anyrender/src/lib.rs': 'ImageRenderer trait that try_render sits next to (unchanged)',
    'upstream-patches/UPSTREAM.md': 'patch index: 0006 and 0007 added',
    'experiments/phase4a1/OUTPUT_PIPELINE.md': 'Phase 4A.1 map of the old output path (context)',
}
KIND = [('third-party/', 'third-party (exact copy, unchanged)'), ('source/src/', 'production'), ('source/vendor/', 'production (vendored)'),
        ('source/index', 'production'), ('source/package.json', 'production'), ('source/Cargo', 'production'), ('source/build.rs', 'production'),
        ('source/README.md', 'documentation'), ('source/upstream-patches', 'documentation'), ('source/experiments', 'documentation'),
        ('patches/', 'upstream patch'), ('tests/test/', 'test'), ('tests/experiments/', 'experiment / probe'), ('graphify/', 'audit tooling'),
        ('logs/', 'evidence'), ('', 'document')]
TEST_WHY = {
    'test/render-into.mjs': 'contract: accepted/rejected targets, errors and codes, no side effects, lifetimes, close, size limits',
    'test/render-into-workers.mjs': '1/2/4 workers: transferable ArrayBuffer (recycled) and in-process; use-after-transfer',
    'test/render-into-examples.mjs': 'README examples as written, incl. the async-consumer ring and the hazard it avoids',
    'test/types/render-into.test-d.ts': 'type-level tests incl. @ts-expect-error negatives',
    'test/types/tsconfig.json': 'tsc config for the type tests',
    'test/smoke.mjs': 'existing render() smoke test (regression)',
    'test/workers.mjs': 'existing render() worker determinism test (regression)',
    'experiments/phase4a2/output-regression.mjs': 'CPU/GPU output: 4A.1 render == 4A.2 render == 4A.2 renderInto',
    'experiments/phase4a2/pixel-format.mjs': 'measures channel order, row order, alpha bytes incl. translucent backgrounds',
    'experiments/phase4a2/oom.mjs': 'fallible allocation under ulimit -v',
    'experiments/phase4a2/sanity-bench.mjs': 'small render()/renderInto() performance matrix vs the 4A.1 build',
    'experiments/phase4a2/catch-unwind-bench.mjs': 'catch_unwind overhead A/B',
    'experiments/phase4a2/mmap-experiment.mjs': 'rejected mmap frame experiment (needs commit 9fd0be7)',
    'experiments/phase4a1/probes/postmessage.mjs': 'worker hand-off semantics (clone, transfer rejected, shared, into-transfer)',
    'experiments/phase4a1/probes/pipeline-failures.mjs': 'pipelined readback order and failure paths (private API)',
}

def has_unsafe(p):
    if p.suffix not in ('.rs', '.patch', '.diff'): return 'n/a'
    for line in p.read_text(errors='replace').split('\n'):
        code = line.split('//')[0]
        if p.suffix != '.rs' and not code.startswith('+'): continue
        if re.search(r'\bunsafe\b', code): return 'yes'
    return 'no'

rows = []
for p in sorted(B.rglob('*')):
    if not p.is_file() or p.name == 'MANIFEST.md': continue
    rel = p.relative_to(B).as_posix()
    kind = next(k for pre, k in KIND if rel.startswith(pre))
    orig = rel
    if rel.startswith('source/third-party/'):
        orig = '~/.cargo/registry/.../' + rel[len('source/third-party/'):]
    elif rel.startswith('source/'):
        orig = rel[len('source/'):]
    elif rel.startswith('tests/'):
        orig = rel[len('tests/'):]
    elif rel.startswith('patches/'):
        orig = 'upstream-patches/' + rel[len('patches/'):]
    elif rel.startswith('graphify/'):
        orig = 'experiments/phase4a2/' + rel
    elif rel.startswith('logs/'):
        orig = 'experiments/phase4a2/evidence/' + rel[len('logs/'):]
    elif rel in ('PHASE4A2_RESULTS.md',):
        orig = rel
    else:
        orig = 'experiments/phase4a2/review-bundle/' + rel
    is_changed = 'n/a (unchanged dependency)' if orig.startswith('~') else ('yes' if (prefix + orig) in changed else 'no')
    if rel.startswith(('logs/', 'graphify/')) or rel in ('PATCH.diff', 'PATCH-experiments.diff', 'PATCH.stat', 'README.md', 'UNSAFE_AUDIT.md', 'API_CONTRACT.md', 'PHASE4A2_RESULTS.md'):
        is_changed = 'new in 4A.2'
    why = WHY.get(orig) or TEST_WHY.get(orig) or {
        'PATCH.diff': f'complete production change: git diff {base} HEAD (src, vendor, typings, package.json, README, tests, upstream patches)',
        'PATCH-experiments.diff': f'git diff {base} HEAD of the Phase 4A.2 experiment scripts',
        'PATCH.stat': 'diffstat of PATCH.diff',
        'README.md': 'how to read this bundle',
        'UNSAFE_AUDIT.md': 'every unsafe block on the frame path, invariants, owners, reachability',
        'API_CONTRACT.md': 'testable contract of render(), renderInto(), frameByteLength',
        'PHASE4A2_RESULTS.md': 'the phase report',
    }.get(rel)
    if not why:
        if rel.startswith('patches/'): why = 'anyrender_skia patch on the frame/output path (full text)'
        elif rel.startswith('third-party/') or 'third-party' in rel: why = 'dependency code the unsafe audit relies on (Buffer adoption, finalizer, wrap_pixels, read_pixels)'
        elif rel.startswith('graphify/'): why = 'Graphify call graph and unsafe reachability (see UNSAFE_AUDIT.md, Method)'
        elif rel.startswith('logs/'): why = 'test log / measurement'
        else: why = ''
    rows.append((rel, orig, why, is_changed, has_unsafe(p), kind))

out = ['# Review bundle manifest', '',
       f'Generated by `experiments/phase4a2/manifest.py` against baseline `{base}` (end of Phase 4A.1).',
       '"changed" = differs from the baseline in git; "unsafe" = contains the `unsafe` keyword outside comments',
       '(for diffs and patches: in added lines).', '',
       '| bundle path | repository path | why included | changed in 4A.2 | unsafe | kind |', '|---|---|---|---|---|---|']
out += [f'| `{a}` | `{b}` | {c} | {d} | {e} | {f} |' for a, b, c, d, e, f in rows]
(B / 'MANIFEST.md').write_text('\n'.join(out) + '\n')
print(f'MANIFEST.md: {len(rows)} files')
