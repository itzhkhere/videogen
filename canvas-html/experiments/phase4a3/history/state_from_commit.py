#!/usr/bin/env python3
"""Recreates state.json from a canonical commit, to rebuild the history from that step on
(after `git reset --hard <commit>` in the canonical repository).
usage: state_from_commit.py <commit> [state.json]"""
import json, subprocess, sys
REPO = '/home/user/harender'
rev = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'state.json'
git = lambda *a, **k: subprocess.run(['git', '-C', REPO, *a], capture_output=True, check=True, **k).stdout
state = {}
for item in git('ls-tree', '-r', '-z', rev).split(b'\0'):
    if not item:
        continue
    meta, path = item.split(b'\t', 1)
    mode, typ, sha = meta.decode().split()
    if typ == 'blob':
        state[path.decode()] = (git('cat-file', 'blob', sha).hex(), mode)
open(out, 'w').write(json.dumps(state))
print(len(state), 'files from', rev)
