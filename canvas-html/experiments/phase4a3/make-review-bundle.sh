#!/bin/bash
# Builds experiments/phase4a3/review-bundle/ and phase4a3-review-bundle.zip from the canonical
# repository (final main) and the logs of this phase.
#   make-review-bundle.sh <canonical repo> <logs dir: check.log, check-gpu.log, phase3.log, l4-run.log>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(realpath "$1") logs=$(realpath "$2")
out=$here/review-bundle
rm -rf "$out" "$here/phase4a3-review-bundle.zip"; mkdir -p "$out"
cd "$repo"
base=$(git rev-list --max-parents=0 HEAD)                       # build: import the v0.5.0 engine
pre=$(git log --format=%h --grep='^docs(experiments): phase 4A.2' -1)   # end of the 4A.2 work

# Sources and docs, at their repository paths
git ls-files -z -- PHASE4A3_RESULTS.md docs/phases/PHASE4A3_RESULTS.md PROJECT_IDENTITY.md README.md CHANGELOG.md \
  THIRD_PARTY_NOTICES.md Cargo.toml package.json index.js index.d.ts build.rs rustfmt.toml .gitignore \
  docs/*.md docs/ci src dom-host/Cargo.toml dom-host/src upstream-patches scripts \
  test/hardening.mjs test/render-into.mjs test/render-into-workers.mjs test/render-into-examples.mjs test/types \
  experiments/phase4a3/*.mjs experiments/phase4a3/evidence experiments/phase4a3/colab \
  experiments/phase4a3/history/build_history.py experiments/phase4a3/history/plan.json \
  experiments/phase4a3/history/run_history.sh experiments/phase4a3/history/verify.log \
  | xargs -0 -I{} cp --parents {} "$out/"

# Diffs: the whole engine since the v0.5.0 import, and this phase alone
git diff "$base" HEAD -- . ':!experiments' ':!docs/phases' ':!docs/handoff' ':!vendor/stylo' > "$out/PATCH.diff"
git diff "$pre" HEAD -- . ':!experiments' > "$out/PATCH-4A3.diff"
git diff --stat "$base" HEAD -- vendor/stylo > "$out/PATCH-vendor-stylo.stat"

# History
git log --oneline --decorate --graph --all > "$out/git-log-graph.txt"
git status > "$out/git-status.txt"
git remote -v | sed -E 's#://[^/@]*@#://<redacted>@#' > "$out/git-remote.txt"
git log --format='%h %an <%ae> | %cn <%ce> | %aI | %s' > "$out/git-authors.txt"
{
  echo "# Commit plan (as executed)"
  echo
  echo "The canonical history and how each commit was produced and verified are described in"
  echo "\`docs/GIT-HISTORY.md\`; the machine-readable plan is \`experiments/phase4a3/history/plan.json\`."
  echo
  for c in $(git rev-list --reverse HEAD); do
    echo "## $(git log -1 --format='%h %s' $c)"
    echo; echo '```'; git log -1 --format=%b $c | sed '/^Co-Authored-By/,$d'; git show --stat --format= $c | tail -25; echo '```'; echo
  done
} > "$out/COMMIT_PLAN.md"

# Test logs
{
  echo "# Test logs (Phase 4A.3)"
  for f in check.log check-gpu.log phase3.log l4-run.log; do
    [ -f "$logs/$f" ] || continue
    echo; echo "## $f"; echo; echo '```'; grep -v '^\s*\(Compiling\|Checking\|Downloaded\|Downloading\)' "$logs/$f" | grep -v '^$' | tail -150; echo '```'
  done
  echo; echo "## per-commit verification (experiments/phase4a3/history/verify.log)"; echo; echo '```'; cat experiments/phase4a3/history/verify.log; echo '```'
} > "$out/TEST_LOGS.md"

cd "$here" && zip -qr phase4a3-review-bundle.zip review-bundle && ls -l phase4a3-review-bundle.zip && du -sh review-bundle
