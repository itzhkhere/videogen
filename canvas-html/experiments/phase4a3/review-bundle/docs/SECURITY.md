# Trust model

The engine is a rendering library, not a sandbox. **Treat the HTML, CSS and JavaScript you load as
trusted code**, with the same privileges as the Node process that renders it.

What a page can do:

- **Read local files.** `file:` URLs are resolved for images, stylesheets, fonts, `<script src>`
  and page-script `fetch()`, and they are **not confined** to `baseUrl`: any file the process can
  read can be loaded into the page, drawn into the frame, or returned through `eval()`/`call()`.
- **Use `data:` URLs.**
- **Run arbitrary JavaScript** (with `scripts: true`) in the renderer's Boa engine. It has no access
  to Node objects, but it can loop forever: there is **no script timeout**, so a call such as
  `load`, `render` or `eval` can block its thread indefinitely. More than 100 000 timer callbacks in
  one `advanceClock` call is an error.
- **Use memory and CPU without limits**: there are no quotas on DOM size, image decoding or layout.

What a page cannot do:

- **No network.** Only `file:` and `data:` URLs load; `http(s):` and other schemes fail (recorded in
  `loadErrors` / `jsErrors`).
- No access to Node APIs, the process environment or other renderers.

What is **not** provided: process isolation, filesystem confinement, resource limits, script
timeouts, or protection against malicious fonts/images beyond what the parsing libraries give.

Rendering untrusted content therefore needs isolation around the engine: a separate process (or
container) per job with a restricted filesystem view, CPU/memory limits and a wall-clock timeout.

Malformed input from the *caller* (options, arguments) is validated and returned as JS errors;
see `PANIC-SAFETY.md`.
