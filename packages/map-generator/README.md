# map-generator

Projects the authoring model (`datos/proyecto.json`) onto the six flat tables
the published map assigns to `PROJECT_DATA`.

This package is deliberately framework-free: no Nuxt, no HTTP, no database, no
filesystem beyond the test fixtures. The riskiest part of the migration is also
the part that runs with a bare test runner.

```bash
npm test        # node --test, no bundler, no transpile step
npm run typecheck
```

Node 24 executes the TypeScript directly via type stripping, so there is no
build. `erasableSyntaxOnly` in `tsconfig.json` keeps it that way — enums and
parameter properties will not compile.

## The reference

`tests/fixtures/expected-map-data.json` was not written by hand. It was lifted
out of `entrega/ABRIR MAPA.html` — the map the PowerShell pipeline actually
published — by `scripts/extract-reference.mjs`. `tests/fixtures/project.json`
is the input that produced it.

Regenerate both only when the legacy pipeline itself is re-run:

```bash
npm run extract-reference
```

Never edit the fixtures to make a test pass. They are the definition of
correct; if they change, the definition changed.

## What the reference cannot prove

The golden test only exercises the branches these 29 media happen to reach.
Six branches are never walked by this dataset, so a green golden run says
nothing about them:

| Branch | Coverage in reference |
| --- | --- |
| `active: false` on a medium | 0 of 29 |
| Medium with no `stateId` | 0 of 29 |
| Social theme with all five links empty | 0 of 43 |
| File of type `imagen` | 0 (audio and video only) |
| Medium with empty `notes` | 0 of 29 |
| `witnessOrder` out of sync with its ids | 0 of 29 |

`tests/branches.test.ts` covers each of them with hand-built input, and its
expectations were read off `generar-mapa.ps1` rather than off the data. When
one of those branches is in doubt, that file is the specification — not the
fixtures, which are silent on all six.

## Serialisation differs from PowerShell, on purpose

`JSON.stringify` of this generator's output is 95 bytes shorter than what
`ConvertTo-Json` wrote: PowerShell escapes non-ASCII as `\uXXXX` (19
occurrences, all accented place names) and `JSON.stringify` emits UTF-8
directly. The two parse to identical strings, so the map cannot tell them
apart. Do not try to reproduce the escaping.

## Status

Phases 0 and 1 are done. `generateMapData` reproduces the published output,
key order included. What it deliberately does not do is validate: state
catalogue size, duplicate ids, unknown state references and missing files on
disk are the publish pipeline's concern, since the last of those needs a
filesystem and this package has none.
