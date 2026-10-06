#!/usr/bin/env python3
"""Which `unsafe` code can the frame-output entry points reach? (Phase 4A.2 safety audit)

Input: a Graphify graph.json of the staged sources (stage-and-extract.sh) and the staged source
tree. Graphify (0.9.77, AST mode) gives the function/method inventory with file and line, plus
`calls` edges. Its Rust extraction misses path-qualified calls (`Type::f(..)`) and some method
calls inside `unsafe { .. }`, which would under-report reachability, the wrong direction for a
safety audit. So this script adds edges of its own:

  1. every function/method node gets a body span by brace matching from its line;
  2. in each body, every `Type::f(`, `.f(` and bare `f(` call is resolved by NAME to all
     functions of that name in the staged sources (a deliberate over-approximation: a call
     `.render_timed(` reaches every `render_timed` of every type);
  3. Graphify's own `calls` edges are kept.

`unsafe` sites (`unsafe {`, `unsafe fn`, `unsafe impl`, outside comments) are mapped to their
enclosing function. The result is "may reach" (sound up to dynamic dispatch through closures
and trait objects, which the audit checks by hand), not "does reach".

usage: reach.py GRAPH.json SRC_ROOT [--json OUT]
"""
import collections, json, re, sys
from pathlib import Path

graph = json.load(open(sys.argv[1]))
root = Path(sys.argv[2])
out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None

ENTRY = {
    'renderInto (public)': 'canvas_html_lib_htmlrenderer_render_into',
    'render (public)': 'canvas_html_lib_htmlrenderer_render',
    'frameByteLength (public)': 'canvas_html_lib_htmlrenderer_frame_byte_length',
    'close (public)': 'canvas_html_lib_htmlrenderer_close',
    'constructor (public)': 'canvas_html_lib_htmlrenderer_new',
    '_renderIntoTimed (private)': 'canvas_html_lib_htmlrenderer_render_into_timed',
    '_renderTimed (private)': 'canvas_html_lib_htmlrenderer_render_timed',
    '_renderFramesExperimental (private)': 'canvas_html_lib_htmlrenderer_render_frames_experimental',
    '_pipelineComplete (private)': 'canvas_html_lib_htmlrenderer_pipeline_complete',
    'Buffer finalizer (napi-rs drop_buffer)': 'napi_bindgen_runtime_mod_drop_buffer',
}

fns = [n for n in graph['nodes'] if n['label'].endswith('()') and n.get('source_file') and n.get('source_location', '').startswith('L')]
by_name = collections.defaultdict(list)
for n in fns:
    by_name[n['label'].strip('.').rstrip('()')].append(n['id'])
src = {f: (root / f).read_text().split('\n') for f in {n['source_file'] for n in fns}}

def strip_comment(line):
    i = line.find('//')
    return line if i < 0 else line[:i]

def span(n):
    lines, start = src[n['source_file']], int(n['source_location'][1:]) - 1
    depth, seen = 0, False
    for i in range(start, len(lines)):
        code = re.sub(r'"(\\.|[^"\\])*"', '""', strip_comment(lines[i]))
        if not seen and ';' in code and '{' not in code:
            return (start, i)  # declaration without a body (trait method)
        for ch in code:
            if ch == '{': depth += 1; seen = True
            elif ch == '}': depth -= 1
        if seen and depth <= 0:
            return (start, i)
    return (start, len(lines) - 1)

spans = {n['id']: span(n) for n in fns}
node = {n['id']: n for n in fns}
CALL = re.compile(r'(?:\b[A-Za-z_]\w*::)?\.?\b([a-z_]\w*)\s*(?:::<[^>]*>)?\s*\(')
KEYWORDS = {'if', 'while', 'for', 'match', 'return', 'loop', 'fn', 'Some', 'Ok', 'Err', 'unsafe', 'move', 'as', 'in'}

edges = collections.defaultdict(set)
for nid, (a, b) in spans.items():
    f = node[nid]['source_file']
    body = '\n'.join(strip_comment(l) for l in src[f][a + 1:b + 1])  # skip the signature line
    for m in CALL.finditer(body):
        name = m.group(1)
        if name in KEYWORDS: continue
        for t in by_name.get(name, []):
            if t != nid: edges[nid].add(t)
for e in graph['edges']:
    if e['relation'] == 'calls' and e['source'] in node and e['target'] in node:
        edges[e['source']].add(e['target'])

UNSAFE = re.compile(r'\bunsafe\s*(\{|fn\b|impl\b)')
sites = []
for f, lines in src.items():
    for i, l in enumerate(lines):
        code = strip_comment(l)
        if UNSAFE.search(code):
            owner = [nid for nid, (a, b) in spans.items() if node[nid]['source_file'] == f and a <= i <= b]
            owner = min(owner, key=lambda x: spans[x][1] - spans[x][0]) if owner else None
            sites.append({'file': f, 'line': i + 1, 'code': l.strip()[:110], 'fn': owner})

def reach(start):
    seen, q, parent = {start}, collections.deque([start]), {start: None}
    while q:
        x = q.popleft()
        for y in edges[x]:
            if y not in seen: seen.add(y); parent[y] = x; q.append(y)
    return seen, parent

def chain(parent, t):
    out = []
    while t is not None: out.append(node[t]['label']); t = parent[t]
    return ' ← '.join(out)

result = []
for s in sites:
    s['reachedFrom'] = {}
for label, eid in ENTRY.items():
    if eid not in node: print('missing entry', eid, file=sys.stderr); continue
    seen, parent = reach(eid)
    for s in sites:
        if s['fn'] in seen:
            s['reachedFrom'][label] = chain(parent, s['fn'])

print(f'{len(fns)} functions, {sum(len(v) for v in edges.values())} call edges (Graphify + name-based), {len(sites)} unsafe sites\n')
for s in sorted(sites, key=lambda s: (-len(s['reachedFrom']), s['file'], s['line'])):
    fn = node[s['fn']]['label'] if s['fn'] else '?'
    print(f"{s['file']}:{s['line']}  in {fn}  — {s['code']}")
    if not s['reachedFrom']:
        print('    not reachable from the frame-output entry points')
    for k, v in s['reachedFrom'].items():
        print(f'    may be reached from {k}: {v}')
if out_json:
    json.dump(sites, open(out_json, 'w'), indent=1)
