"""Directed layer analysis of a Graphify code-only extraction of the Phase 3 code.

Layers come from the staged directory of each node's source file. Edges are Graphify's raw
directed edges (source -> target). Symbols without a source file in the staged tree are
external; external symbols whose names belong to a JS engine API are classed "engine:boa" or
"engine:v8", so an edge into them is an engine dependency.

AST extraction resolves names, not types: a generic name can resolve to the wrong target.
Every edge reported as a boundary violation is listed with its file and line for review.
"""
import collections, json, sys

graph_path, out_path = sys.argv[1], sys.argv[2]
g = json.load(open(graph_path))
nodes = {n["id"]: n for n in g["nodes"]}
LAYERS = ["shared_host", "boa_adapter", "deno_engine", "deno_addon", "production"]
BOA = {"JsObject", "JsValue", "JsString", "JsResult", "JsError", "JsNativeError", "Context", "JsArray", "NativeFunction",
       "FunctionObjectBuilder", "ObjectInitializer", "Trace", "Finalize", "JsData", "boa_engine", "boa_gc", "boa_runtime"}
V8 = {"JsRuntime", "RuntimeOptions", "OpState", "JsErrorBox", "IsolateHandle", "v8", "serde_v8", "deno_core", "op2", "Global", "Local"}
SHARED_API = {"DomHost", "NodeHandle", "DomError", "DomResult", "JsErrorKind", "ListenerRegistry", "CallbackKey", "ListenerId",
              "EventTarget", "TimerSchedule", "TimerId", "ClockContract", "ScriptRuntime", "ScriptError", "Rect", "canvas_dom_host"}

def layer(nid):
    n = nodes.get(nid, {})
    sf = n.get("source_file") or ""
    top = sf.split("/")[0] if sf else ""
    if top in LAYERS:
        # the addon's document module is layout/paint; keep it separate
        if sf == "deno_addon/document.rs":
            return "layout_paint(deno_addon/document.rs)"
        return top
    label = (n.get("label") or nid).split("::")[-1].strip("()")
    if label in SHARED_API:
        return "shared_api(ext ref)"
    if label in BOA:
        return "engine:boa"
    if label in V8:
        return "engine:v8"
    return "external/other"

matrix = collections.Counter()
matrix_extracted = collections.Counter()
violations = []
for e in g["edges"]:
    a, b = layer(e["source"]), layer(e["target"])
    if a == b:
        continue
    matrix[(a, b)] += 1
    if e.get("confidence") == "EXTRACTED":
        matrix_extracted[(a, b)] += 1
    forbidden = (a == "shared_host" and (b.startswith("engine") or b in ("boa_adapter", "deno_engine", "deno_addon", "production"))) \
        or (a.startswith("layout_paint") and (b.startswith("engine") or b in ("boa_adapter", "deno_engine"))) \
        or (a == "boa_adapter" and b.startswith("engine:v8")) or (a in ("deno_engine", "deno_addon") and b == "engine:boa")
    if forbidden:
        violations.append({"from": a, "to": b, "source": e["source"], "target": e["target"], "relation": e["relation"],
                           "confidence": e["confidence"], "at": f'{e.get("source_file")}:{e.get("source_location")}'})

rows = sorted(matrix.items(), key=lambda kv: (-kv[1]))
report = {
    "graph": {"nodes": len(g["nodes"]), "edges": len(g["edges"]), "directed": "raw Graphify extraction (source -> target)"},
    "crossLayerEdges": [{"from": a, "to": b, "all": n, "extracted": matrix_extracted[(a, b)]} for (a, b), n in rows],
    "forbiddenDirectionEdges": violations,
}
json.dump(report, open(out_path, "w"), indent=2)
print(f'{report["graph"]}')
print(f'{"from":<38}{"to":<38}{"all":>6}{"EXTRACTED":>11}')
for r in report["crossLayerEdges"]:
    print(f'{r["from"]:<38}{r["to"]:<38}{r["all"]:>6}{r["extracted"]:>11}')
print(f"forbidden-direction edges: {len(violations)}")
for v in violations[:40]:
    print("  ", v)
