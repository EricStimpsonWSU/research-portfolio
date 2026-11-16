# Metadata scheme: example.toml and model.toml

`Z:/research/models/.../model.toml` and `portfolio/examples/<slug>/example.toml` follow
one convention. **They share table names and meanings, not every field.** The filename tells which kind it is.

## Shared core (both files)
| key | meaning |
|---|---|
| `[meta].name` | slug, must equal the folder name; lowercase, hyphens (examples) or underscores (models, Python packages) |
| `[meta].title` | human title |
| `[meta].status` | `active` \| `planned` \| `retired` |
| `[meta].tags` | free list |
| `[provenance]` | where results/code come from: catalogue slug, tags, reference scripts, notes |

> model.toml currently keeps these under `[model]`; moving name/title/status to `[meta]` is a
> later, separate change in the models repo (not done here).

## example.toml only
`[example]`: `method` (PFC | phase-field | DFT | MD | MC | ...), `runtime`
(`browser-js` | `precomputed` | `pyodide`), `entry`, `thumb` (png/gif/webp; use the page's Record button → animated WebP; animated thumb ≤ ~1.5 MB, ~320 px wide, short loop), `blurb`, `default_variant` (index).

`[[variants]]`: one row per switchable model × backend × precision the page offers:
`model` (family slug: stdpfc, logpfc, loghydro, binarypfc...), `backend` (`webgpu` | `js-cpu`),
`precision` (`float32` | `float64`), `catalogue` (closest pfc-models entry it mirrors, or "" if none),
`status` (`active` = selectable now, `planned`).

## Naming examples
`<method>-<process>-<distinguisher>`. The slug names the *physics demonstrated*, never the model
variant or backend (those are variants). E.g. `pfc-quench-pure`, `pfc-quench-binary`, later
`md-lj-melting`, `mc-ising-coarsening`, `dft-si-bands`.

## Direction of links
example → catalogue (`variants.catalogue`) is the source of truth. The reverse list
(which examples use a model) is produced by `tools/build.py` and never edited by hand.

## Shared page features
Every interactive example includes `<script src="../../shared/record.js" data-canvas="<id>"></script>`, which adds a Record button that saves an animated WebP of that canvas (WebM fallback where WebP encoding is unavailable).
