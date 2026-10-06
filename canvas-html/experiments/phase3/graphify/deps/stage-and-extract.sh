#!/usr/bin/env bash
# Rebuild the directed Graphify graph of the dependency sources and the reachability report.
# Needs: graphify 0.9.77 (pip install graphifyy==0.9.77), a built canvas-html (cargo fetched the
# git/registry sources), and the patched Blitz checkout next to canvas-html.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; ch="$here/../../../.."; stage="${1:-$(mktemp -d)}"
mkdir -p "$stage/src" && cd "$stage/src"
for c in blitz-dom blitz-html blitz-paint blitz-traits stylo_taffy; do mkdir -p blitz/$c && cp -r "$ch/../blitz/packages/$c/src" blitz/$c/; done
parley=$(ls -d ~/.cargo/git/checkouts/parley-*/718dcb7); for c in fontique parley parley_engine; do mkdir -p parley/$c && cp -r "$parley/$c/src" parley/$c/; done
mkdir -p stylo && cp -r "$ch/vendor/stylo/"* stylo/ && rm -rf stylo/gecko stylo/gecko_bindings stylo/gecko_string_cache stylo/build_gecko.rs stylo/Cargo.* stylo/README.md
mkdir -p anyrender_skia taffy && cp -r "$ch/vendor/anyrender_skia/src" anyrender_skia/ && cp -r "$(ls -d ~/.cargo/git/checkouts/taffy-*/04965fc)/src" taffy/
graphify extract . --code-only --no-cluster --out "$stage/out"
python3 "$here/reach.py" "$stage/out/graphify-out/graph.json" "$stage/src" "$here/reach-new-document.json" \
  blitz_blitz_html_src_html_document_htmldocument_from_html,blitz_blitz_dom_src_document_basedocument_new,blitz_blitz_dom_src_resolve_basedocument_resolve,parley_fontique_src_source_cache_sourcecache_new_shared 5
