#!/usr/bin/env bash
# Clones Blitz next to canvas-html (../blitz) at the tested commit and applies the
# patches (typography, animation) that the [patch] section of Cargo.toml expects.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/../blitz"
if [ ! -d "$dest/.git" ]; then
  git clone https://github.com/DioxusLabs/blitz "$dest"
fi
cd "$dest"
git checkout -q 0db8c74a5f8a0df77eed1b33c846eb041515b6c7
git checkout -q -B typography-fixes
git -c user.name=canvas-html -c user.email=canvas-html@localhost am -q "$here"/upstream-patches/blitz/*.patch
echo "Blitz ready at $dest (branch typography-fixes)"
