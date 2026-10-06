"""Directed reachability over a Graphify code-only extraction of the dependency sources.

From entry nodes (what a renderer does per document), follow outgoing `calls`, `method`,
`references` and `indirect_call` edges breadth-first, then scan the reached source files for
process-global state: statics, thread-locals and lazy/once cells. The output ranks those
globals by the directed distance from the entries, so the closest ones are reviewed first.

Graphify resolves names, not types: a reached node can be a same-named function in another
crate. The global-state list is therefore a list of *candidates* for experiments, not findings.
"""
import collections, json, re, sys

graph_path, stage_root, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
entries = sys.argv[4].split(",")
max_depth = int(sys.argv[5]) if len(sys.argv) > 5 else 6
g = json.load(open(graph_path))
nodes = {n["id"]: n for n in g["nodes"]}
out_edges = collections.defaultdict(list)
for e in g["edges"]:
    if e["relation"] in ("calls", "method", "references", "indirect_call", "contains"):
        out_edges[e["source"]].append(e["target"])

dist = {}
queue = collections.deque()
for entry in entries:
    dist[entry] = 0
    queue.append(entry)
while queue:
    n = queue.popleft()
    if dist[n] >= max_depth:
        continue
    for t in out_edges[n]:
        if t not in dist and t in nodes:
            dist[t] = dist[n] + 1
            queue.append(t)

file_depth = {}
for n, d in dist.items():
    sf = nodes[n].get("source_file")
    if sf:
        file_depth[sf] = min(d, file_depth.get(sf, 99))

GLOBAL = re.compile(r"^\s*(pub(\([a-z]+\))?\s+)?(static\s+(mut\s+)?[A-Z_][A-Z0-9_]*\s*:|thread_local!|lazy_static!)|"
                    r"(LazyLock|OnceLock|OnceCell|Lazy)<|static\s+ref\s+")
candidates = []
for sf, d in sorted(file_depth.items(), key=lambda kv: kv[1]):
    try:
        lines = open(f"{stage_root}/{sf}", encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        continue
    for i, line in enumerate(lines, 1):
        if GLOBAL.search(line) and "const " not in line.split("static")[0]:
            candidates.append({"file": sf, "line": i, "depth": d, "code": line.strip()[:160]})

crates = collections.Counter("/".join(sf.split("/")[:2]) for sf in file_depth)
report = {"entries": entries, "maxDepth": max_depth, "reachedNodes": len(dist), "reachedFiles": len(file_depth),
          "reachedFilesByCrate": crates.most_common(), "globalStateCandidates": candidates}
json.dump(report, open(out_path, "w"), indent=2)
print(f"reached {len(dist)} nodes in {len(file_depth)} files (depth <= {max_depth})")
print("files by crate:", crates.most_common())
print(f"{len(candidates)} global-state candidates:")
for c in candidates:
    print(f"  d={c['depth']} {c['file']}:{c['line']}  {c['code']}")
