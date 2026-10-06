#!/usr/bin/env bash
# Clones Blitz into third_party/blitz at the tested commit and applies upstream-patches/blitz,
# which the [patch] section of Cargo.toml expects. Safe to re-run: it resets the checkout to the
# base commit and re-applies the series. BLITZ_REPO overrides where Blitz is cloned from.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/third_party/blitz"
base=0db8c74a5f8a0df77eed1b33c846eb041515b6c7
if [ ! -d "$dest/.git" ]; then
  mkdir -p "$here/third_party"
  git clone -q "${BLITZ_REPO:-https://github.com/DioxusLabs/blitz}" "$dest"
fi
cd "$dest"
git am --abort >/dev/null 2>&1 || true
git checkout -q -f "$base"
git clean -q -fdx
git checkout -q -B patched
git -c user.name=html-renderer -c user.email=html-renderer@localhost am -q "$here"/upstream-patches/blitz/*.patch
echo "Blitz ready at $dest (branch patched, $(ls "$here"/upstream-patches/blitz/*.patch | wc -l) patches)"
