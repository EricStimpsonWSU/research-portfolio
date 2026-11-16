# portfolio

Personal research portfolio (GitHub Pages). It runs without a build step: `index.html` reads `examples.json`,
which `tools/build.py` generates from `examples/*/example.toml` (the Pages workflow runs it).

* Add an example: create `examples/<slug>/` with `index.html` and `example.toml`, then run `python tools/build.py`.
* Scheme and naming rules: [SCHEMA.md](SCHEMA.md).
* `.sandbox/` is for prototypes. Promote a prototype to `examples/` when it is finished.
* Local preview: `python -m http.server` from this folder (fetch() needs http, not file://).
