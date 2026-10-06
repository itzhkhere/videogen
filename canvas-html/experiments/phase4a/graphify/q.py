#!/usr/bin/env python3
"""Directed queries over a Graphify graph.json (Skia GPU sources).
  q.py GRAPH find  <substr> [file-substr]      nodes whose label/id contains substr
  q.py GRAPH out   <id> [depth] [rels]          callees (default rels: calls,method,inherits)
  q.py GRAPH in    <id> [depth] [rels]          callers
  q.py GRAPH path  <from-id> <to-id> [rels]     shortest directed path
"""
import json, sys, collections
g = json.load(open(sys.argv[1])); cmd = sys.argv[2]; a = sys.argv[3:]
N = {n['id']: n for n in g['nodes']}
OUT, IN = collections.defaultdict(list), collections.defaultdict(list)
for e in g['edges']:
    OUT[e['source']].append(e); IN[e['target']].append(e)
loc = lambda e: f"{e.get('source_file','')}:{e.get('source_location','')}"
rels = lambda i, d: set((a[i] if len(a) > i else d).split(','))
if cmd == 'find':
    s = a[0].lower(); f = a[1].lower() if len(a) > 1 else ''
    for n in g['nodes']:
        if s in (n['label'] + ' ' + n['id']).lower() and f in (n.get('source_file') or n['id']).lower():
            print(n['id'], '|', n['label'], '|', n.get('source_file', ''), n.get('source_location', ''))
elif cmd in ('out', 'in'):
    start, depth, R = a[0], int(a[1]) if len(a) > 1 else 1, rels(2, 'calls,method,inherits')
    seen, frontier = {start}, [start]
    for d in range(depth):
        nxt = []
        for x in frontier:
            for e in (OUT if cmd == 'out' else IN)[x]:
                if e['relation'] not in R: continue
                y = e['target'] if cmd == 'out' else e['source']
                print('  ' * d + ('→ ' if cmd == 'out' else '← ') + f"[{e['relation']}] {N.get(y, {}).get('label', y)}  ({y})  @{loc(e)}")
                if y not in seen: seen.add(y); nxt.append(y)
        frontier = nxt
elif cmd == 'path':
    s, t, R = a[0], a[1], rels(2, 'calls,method,inherits,references')
    prev, q = {s: None}, collections.deque([s])
    while q:
        x = q.popleft()
        if x == t: break
        for e in OUT[x]:
            if e['relation'] in R and e['target'] not in prev: prev[e['target']] = (x, e); q.append(e['target'])
    if t not in prev: print('no path'); sys.exit()
    steps = []
    while prev[t]: x, e = prev[t]; steps.append(f"{N[x]['label']} -[{e['relation']}]-> {N.get(t,{}).get('label',t)} @{loc(e)}"); t = x
    print('\n'.join(reversed(steps)))
