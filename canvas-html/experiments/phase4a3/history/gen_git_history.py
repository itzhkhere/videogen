#!/usr/bin/env python3
"""Writes overlay/final/docs/GIT-HISTORY.md from plan.json and the canonical repository's log.
usage: gen_git_history.py   (run after the last code step, before the final step)"""
import json, subprocess
from pathlib import Path
here = Path(__file__).resolve().parent
REPO = '/home/user/harender'
ARCHIVE = subprocess.run(['git', '-C', '/home/user/videogen', 'rev-parse', '--short', 'archive/research-scratch-20261006^{commit}'], capture_output=True, text=True, check=True).stdout.strip()
plan = json.loads((here / 'plan.json').read_text())['steps']
log = subprocess.run(['git', '-C', REPO, 'log', '--reverse', '--format=%h%x09%s'], capture_output=True, text=True, check=True).stdout.splitlines()
log = [l.split('\t', 1) for l in log]

def sources(step):
    out = []
    for op in step['ops']:
        if op[0] == 'rev':
            out.append(f'`{op[1]}` (`{op[2]}`)'.replace('|', '\\|'))
        elif op[0] in ('work', 'work_from'):
            out.append('Phase 4A.3 working tree')
        elif op[0] == 'overlay':
            out.append('new files: ' + ', '.join(f'`overlay/{n}`' for n in op[1]))
        elif op[0] == 'delete':
            out.append(f'removes `{op[1]}`'.replace('|', '\\|'))
        elif op[0] == 'replace':
            out.append(f'version in `{op[1]}`')
    return '; '.join(dict.fromkeys(out))

rows = []
for i, step in enumerate(plan):
    sha, subj = log[i] if i < len(log) else ('(this commit)', step['message'].split('\n')[0])
    rows.append(f'| {i} | `{sha}` | {subj} | {sources(step)} |')

doc = f"""# Git history

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
""" + '\n'.join(rows) + """

Research commits: `951dc13` v0.5.0 baseline · `9b0d148` shared DOM host · `65baa4c` GPU backends ·
`7a02570` deterministic Ganesh reloads · `d5eb865` Phase 4A README · `9ab1b7f` zero-copy render ·
`5bc5553`/`e185c33` pipelined readback and types · `13fc5d0`/`99e59cf`/`286aa5c` renderInto ·
`a938f6b` SAFETY comments · `f61788a` Phase 4A.2 · `fc6b1e4`/`1940663` Phase 4A.3.

## Archive

The research history is preserved, not rewritten: branch `claude/serene-ritchie-o55j58` of
`itzhkhere/videogen` holds every research commit. The annotated tag
`archive/research-scratch-20261006` marks research commit `{ARCHIVE}` (Phase 4A.3 with its L4
results); the session that created it could not push tags, so push it from a clone of the
research repository:

```sh
git fetch origin claude/serene-ritchie-o55j58
git tag -a archive/research-scratch-20261006 -m "Research history at the end of Phase 4A.3" {ARCHIVE}
git push origin archive/research-scratch-20261006
```
""".replace('{ARCHIVE}', ARCHIVE)
(here / 'overlay/final/docs/GIT-HISTORY.md').write_text(doc)
print('wrote', len(rows), 'rows')
