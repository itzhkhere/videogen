#!/usr/bin/env python3
"""Rebuilds the canonical history of the engine from the research ("scratch") repository.

Every canonical commit is a real state of the scratch repository (or of the Phase 4A.3 working
tree), transformed the same way:

  * layout: `canvas-html/*` moves to the repository root; `handoff/` → `docs/handoff/`;
    phase reports (`PHASE*_RESULTS.md`, `POC_RESULTS.md`) → `docs/phases/`;
  * names: canvas-html → html-renderer, canvas_html → html_renderer, canvasHtml → htmlRenderer,
    CANVAS_HTML_ → HTML_RENDERER_, canvas-dom-host / canvas_dom_host → dom-host / dom_host
    (source, scripts, docs and patches; recorded evidence — logs, JSON results — is left verbatim);
  * Blitz: cloned into `third_party/blitz` (git-ignored) instead of `../blitz`; relative paths are
    rewritten accordingly, and `scripts/setup-blitz.sh` is the Phase 4A.3 version from the start;
  * large or generated artifacts stay in the scratch repository (see EXCLUDE).

usage: build_history.py PLAN_STEP... (see PLAN) — run by run_history.sh, which also builds and
tests every commit.
"""
import json, os, re, subprocess, sys
from pathlib import Path

SCRATCH = Path(os.environ.get('SCRATCH', '/home/user/videogen'))
REPO = Path(os.environ.get('REPO', '/home/user/harender'))
OVERLAY = Path(os.environ.get('OVERLAY', str(SCRATCH / 'canvas-html/experiments/phase4a3/history/overlay')))
AUTHOR = ('Harikrishnan', 'hkupim@gmail.com')

TEXT_EXT = {'.rs', '.toml', '.lock', '.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.sh', '.py', '.patch', '.html', '.css',
            '.txt', '.yml', '.yaml', '.d.ts', '.gitignore', '.graphifyignore', ''}
EVIDENCE_EXT = {'.json', '.log', '.txt', '.stdout', '.stderr', '.jsonl', '.csv', '.diff', '.stat'}


def git(*args, cwd=SCRATCH, input=None, env=None):
    return subprocess.run(['git', *args], cwd=cwd, input=input, env=env, capture_output=True, check=True).stdout


def tree(rev):
    """All files of `rev` under canvas-html/ and handoff/ → {path: bytes}."""
    out = {}
    listing = git('ls-tree', '-r', '-z', rev, '--', 'canvas-html', 'handoff').split(b'\0')
    shas = []
    for item in listing:
        if not item:
            continue
        meta, path = item.split(b'\t', 1)
        mode, typ, sha = meta.split()
        if typ == b'blob':
            shas.append((path.decode(), sha.decode(), mode.decode()))
    batch = git('cat-file', '--batch', input=''.join(s + '\n' for _, s, _ in shas).encode())
    pos = 0
    for path, sha, mode in shas:
        nl = batch.index(b'\n', pos)
        size = int(batch[pos:nl].split()[2])
        out[path] = (batch[nl + 1:nl + 1 + size], mode)
        pos = nl + 1 + size + 1
    return out


def worktree(paths, base=None):
    """Files from the scratch working tree (or a staged copy laid out like it) → {path: bytes}."""
    base = Path(base) if base else SCRATCH
    out = {}
    for p in paths:
        f = base / p
        for g in ([f] if f.is_file() else sorted(x for x in f.rglob('*') if x.is_file())):
            out[g.relative_to(base).as_posix()] = (g.read_bytes(), '100755' if os.access(g, os.X_OK) else '100644')
    return out


def new_path(p):
    if p.startswith('handoff/'):
        return 'docs/handoff/' + p[len('handoff/'):]
    assert p.startswith('canvas-html/'), p
    p = p[len('canvas-html/'):]
    if re.fullmatch(r'(PHASE[0-9A-Z]*_RESULTS|POC_RESULTS)\.md', p) and p != 'PHASE4A3_RESULTS.md':
        return 'docs/phases/' + p
    return p


EXCLUDE = [
    r'^graphify-out/', r'^\.graphifyignore$', r'(^|/)node_modules/', r'(^|/)target(-[\w-]+)?/', r'\.node$',
    r'^experiments/.*\.(png|zip|tgz)$', r'^experiments/phase4a2/review-bundle/', r'^experiments/phase4a2/phase4a2-review-bundle\.zip$',
    r'^experiments/phase4a1/colab/bundle\.tgz$',
    r'^experiments/phase4a3/history/(state\.json|cargo-step\.log|step\.log|run\.out)$',
]
# The tooling that performs the rename must keep the old names it maps from.
VERBATIM = r'^experiments/phase4a3/history/'
MAX_EXPERIMENT_FILE = 500_000
excluded_log = []


def excluded(newp, data):
    if any(re.search(x, newp) for x in EXCLUDE):
        return True
    return newp.startswith('experiments/') and len(data) > MAX_EXPERIMENT_FILE


def is_evidence(newp):
    if not newp.startswith('experiments/'):
        return False
    ext = Path(newp).suffix
    return ext in EVIDENCE_EXT or any(seg in ('results', 'evidence', 'logs') for seg in newp.split('/')[:-1])


def rename_text(newp, s):
    depth = newp.count('/')  # directories below the repository root
    # Blitz moved from <scratch>/blitz (sibling of canvas-html) to <root>/third_party/blitz.
    def blitz_rel(m):
        ups = len(m.group(1)) // 3
        return ('../' * depth + 'third_party/blitz/') if ups == depth + 1 else m.group(0)
    s = re.sub(r'((?:\.\./)+)blitz/', blitz_rel, s)
    s = re.sub(r'((?:\.\./)+)blitz"', lambda m: ('../' * depth + 'third_party/blitz"') if len(m.group(1)) // 3 == depth + 1 else m.group(0), s)
    # Blitz patches point back at the DOM host: from third_party/blitz/packages/<crate> it is 4 levels up.
    s = s.replace('../../../canvas-html/dom-host', '../../../../dom-host')
    for a, b in [('canvas-dom-host', 'dom-host'), ('canvas_dom_host', 'dom_host'), ('libcanvas_html', 'libhtml_renderer'),
                 ('CANVAS_HTML_', 'HTML_RENDERER_'), ('canvasHtml', 'htmlRenderer'), ('canvas_html', 'html_renderer'),
                 ('canvas-html', 'html-renderer'), ('Canvas-HTML', 'html-renderer')]:
        s = s.replace(a, b)
    return s


def transform(files):
    out = {}
    for p, (data, mode) in files.items():
        q = new_path(p)
        if excluded(q, data):
            excluded_log.append((q, len(data)))
            continue
        if not is_evidence(q) and not re.search(VERBATIM, q) and (Path(q).suffix in TEXT_EXT or Path(q).name in ('.gitignore',)):
            try:
                data = rename_text(q, data.decode()).encode()
            except UnicodeDecodeError:
                pass
        for x, y in [('canvas-dom-host', 'dom-host'), ('CANVAS_HTML_', 'HTML_RENDERER_'), ('canvas-html', 'html-renderer'), ('canvas_html', 'html_renderer')]:
            q = q.replace(x, y)
        data = licence_policy(q, data)
        out[q] = (data, mode)
    return out


def sort_lock(text):
    """Cargo.lock in Cargo's own order (packages by name, version, source; dependency lists sorted).
    The renamed crates (html-renderer, dom-host) would otherwise sit where their old names sorted,
    and every build would rewrite the lockfile."""
    head, *blocks = text.split('\n[[package]]\n')
    dep_key = lambda s: tuple(s.strip().rstrip(',').strip('"').split(' '))
    def fix(b):
        return re.sub(r'(dependencies = \[\n)((?: .*\n)+?)(\])',
                      lambda m: m.group(1) + '\n'.join(sorted(m.group(2).strip('\n').split('\n'), key=dep_key)) + '\n' + m.group(3), b)
    def key(b):
        f = dict(re.findall(r'^(name|version|source) = "([^"]*)"', b, re.M))
        ver = tuple((0, int(x), '') if x.isdigit() else (1, 0, x) for x in re.split(r'[.+-]', f.get('version', '')))
        return (f.get('name', ''), ver, f.get('source', ''))
    trail = '\n' if blocks and blocks[-1].endswith('\n') else ''
    blocks = sorted((fix(b).rstrip('\n') for b in blocks), key=key)
    return head + ''.join('\n[[package]]\n' + b + '\n' for b in blocks).rstrip('\n') + trail


def licence_policy(q, data):
    """No licence has been chosen for the engine yet: the package is private and UNLICENSED and
    the engine's own crates carry no licence field. Vendored crates keep their licences."""
    if q == 'package.json':
        s = data.decode()
        s = re.sub(r'"license": "[^"]*"', '"license": "UNLICENSED"', s)
        if '"private"' not in s:
            s = s.replace('"version":', '"private": true,\n  "version":', 1)
        return s.encode()
    if q == 'package-lock.json':
        return re.sub(rb'("name": "html-renderer",\s*"version": "[^"]*",\s*)"license": "[^"]*",\s*', rb'\1', data)
    if q == 'Cargo.lock':
        return sort_lock(data.decode()).encode()
    if q in ('Cargo.toml', 'dom-host/Cargo.toml'):
        data = re.sub(rb'(?m)^license = "[^"]*"\n', b'', data)
        # Layout: Blitz lives in third_party/ inside the workspace directory, so it must be
        # excluded, or Cargo makes its crates members of this workspace. The root package is a
        # member implicitly; listing "." as a member would match every path below the root and
        # override the exclusion.
        data = data.replace(b'members = [".", "dom-host"]', b'members = ["dom-host"]')
        return data.replace(b'exclude = ["experiments"]', b'exclude = ["experiments", "third_party"]')
    return data


def overlay(names):
    out = {}
    for n in names:
        root = OVERLAY / n
        for f in sorted(x for x in root.rglob('*') if x.is_file()):
            out[f.relative_to(root).as_posix()] = (f.read_bytes(), '100755' if os.access(f, os.X_OK) else '100644')
    return out


PROD = re.compile(r'^(Cargo\.toml|Cargo\.lock|build\.rs|index\.js|index\.d\.ts|package\.json|package-lock\.json|README\.md|rustfmt\.toml|\.gitignore|'
                  r'src/|dom-host/|vendor/|upstream-patches/|scripts/|test/)')


def select(files, pattern):
    rx = re.compile(pattern)
    return {p: v for p, v in files.items() if rx.search(p)}


def write_tree(state):
    """Make the repository work tree exactly `state` (tracked files), then stage everything."""
    tracked = set(git('ls-files', '-z', cwd=REPO).decode().split('\0')) - {''}
    for p in tracked - set(state):
        (REPO / p).unlink(missing_ok=True)
    for p, (data, mode) in state.items():
        f = REPO / p
        f.parent.mkdir(parents=True, exist_ok=True)
        if not f.exists() or f.read_bytes() != data:
            f.write_bytes(data)
        os.chmod(f, 0o755 if mode == '100755' else 0o644)
    git('add', '-A', cwd=REPO)


def commit(message, date):
    env = dict(os.environ, GIT_AUTHOR_NAME=AUTHOR[0], GIT_AUTHOR_EMAIL=AUTHOR[1], GIT_COMMITTER_NAME=AUTHOR[0],
               GIT_COMMITTER_EMAIL=AUTHOR[1], GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
    trailer = '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Wws6BFY6k25UWSvTBAVwb3\n'
    git('commit', '-q', '-F', '-', cwd=REPO, input=(message.strip() + trailer).encode(), env=env)
    return git('rev-parse', '--short', 'HEAD', cwd=REPO).decode().strip()


def date_of(rev):
    return git('log', '-1', '--format=%aI', rev).decode().strip()


if __name__ == '__main__':
    plan = json.loads(Path(sys.argv[1]).read_text())
    step = plan['steps'][int(sys.argv[2])]
    state_file = Path(sys.argv[3])
    state = {}
    if state_file.exists():
        raw = json.loads(state_file.read_text())
        state = {p: (bytes.fromhex(h), m) for p, (h, m) in raw.items()}
    for op in step['ops']:
        kind = op[0]
        if kind == 'rev':          # ["rev", <scratch rev>, <regex over new paths>]
            files = select(transform(tree(op[1])), op[2])
            state = {p: v for p, v in state.items() if not re.search(op[2], p)} | files
        elif kind == 'work':       # ["work", [scratch paths], <regex over new paths>]
            files = select(transform(worktree(op[1])), op[2])
            state = {p: v for p, v in state.items() if not re.search(op[2], p)} | files
        elif kind == 'work_from':  # ["work_from", <staging dir laid out like the scratch repo>, [paths], <regex>]
            files = select(transform(worktree(op[2], op[1])), op[3])
            state = {p: v for p, v in state.items() if not re.search(op[3], p)} | files
        elif kind == 'overlay':    # ["overlay", <overlay dir names>]
            state |= overlay(op[1])
        elif kind == 'delete':     # ["delete", <regex>]
            state = {p: v for p, v in state.items() if not re.search(op[1], p)}
        elif kind == 'replace':    # ["replace", <path>, <regex>, <replacement>, <expected count>]
            data, mode = state[op[1]]
            data, n = re.subn(op[2].encode(), op[3].encode(), data)
            assert n == op[4], f'{op[1]}: {n} replacements of {op[2]!r}, expected {op[4]}'
            state[op[1]] = (data, mode)
    write_tree(state)
    date = step.get('date') or date_of(step.get('date_from', 'HEAD'))
    if date.startswith('@'):  # placeholder: the time the step is built
        date = subprocess.run(['date', '-u', '+%Y-%m-%dT%H:%M:%S+00:00'], capture_output=True, text=True).stdout.strip()
    sha = commit(step['message'], date)
    state_file.write_text(json.dumps({p: (d.hex(), m) for p, (d, m) in state.items()}))
    log = Path(str(state_file) + '.excluded.json')
    old = json.loads(log.read_text()) if log.exists() else {}
    for q, n in excluded_log:
        old[q] = n
    log.write_text(json.dumps(old, indent=0))
    print(sha, step['message'].split('\n')[0])
