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
Six branches of the legacy generator are never walked by this dataset:

| Branch | Coverage in reference |
| --- | --- |
| `active: false` on a medium | 0 of 29 |
| Medium with no `stateId` (`sin-estado`) | 0 of 29 |
| Social theme with all five links empty | 0 of 43 |
| File of type `imagen` | 0 (audio and video only) |
| Medium with empty `notes` | 0 of 29 |
| `witnessOrder` out of sync with its ids | 0 of 29 |

They are recorded as `test.todo` in `tests/reference.test.ts`. A green golden
run says nothing about any of them, so each needs a hand-written case before
the port can be called complete.

## Status

Phase 0 is done: reference frozen, harness in place, blind spots named.
`generateMapData` throws. The seven failing tests in `tests/golden.test.ts`
are phase 1's definition of done.
