# Project identity

**No permanent project name has been chosen.** The repository is `harender` (private, provisional);
internally the engine uses descriptive names, so a later rename is one mechanical search and
replace.

## Current names

| name | where | public API? | rename impact |
|---|---|---|---|
| `harender` | GitHub repository (`itzhkhere/harender`, private; planned move to the `harihkim` account) | no | GitHub keeps redirects after a rename or transfer; update clone URLs |
| `html-renderer` | npm package name in `package.json` (`"private": true`, `UNLICENSED`, never published) | yes, once published | choose the final name **before** the first publish; afterwards it is a new package |
| `html-renderer.linux-x64-gnu.node` | native addon file loaded by `index.js` | indirectly (file in the package) | rename in `package.json` scripts and `index.js` |
| `html-renderer` / `html_renderer` | Rust crate / library name (`Cargo.toml`, `cdylib`) | no | rename the crate; nothing outside the repo depends on it |
| `dom-host` / `dom_host` | shared DOM host crate | no | also named by Blitz patch 0013 (path dependency) |
| `HtmlRenderer` | the N-API class | **yes** | descriptive; can survive any project rename |
| `render`, `renderInto`, `frameByteLength`, `FrameTarget`, options names | public API | **yes** | independent of the project name |
| `HTML_RENDERER_*` | environment variables of tests and experiments (`HTML_RENDERER_NODE`, `HTML_RENDERER_BACKEND`, `HTML_RENDERER_GANESH_OPTIONS`) | no (testing/experiments) | search and replace |
| `__htmlRenderer` | page-internal JS global used by the runtime glue | no (visible to page scripts, undocumented) | search and replace |
| `html-renderer:` | prefix in comments of vendored files and patches | no | cosmetic |

`blitz-vibey-script` is Blitz's own crate name (upstream) and stays.

Historical evidence (logs, JSON results under `experiments/*/results` and `*/evidence`) keeps the
names it was recorded with (`canvas-html`); it is data, not code.

## When the final name is chosen

1. Replace `html-renderer`/`html_renderer`/`HTML_RENDERER_`/`htmlRenderer` across the repository
   (source, scripts, patches, docs), rebuild, run `scripts/check.sh`.
2. Rename (or transfer) the GitHub repository.
3. Publish the npm package under the final name only then.

## Versioning

The package is at **0.5.0** (the imported baseline). `renderInto()` is a new public API, so the next
release is a minor one: **0.6.0-rc.1 → 0.6.0** under the 0.x semver scheme. If the project is renamed
before its first public release, keep the version line (0.6.x) rather than resetting it: the
history and the changelog continue, only the name changes.
