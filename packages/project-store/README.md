# project-store

Translates the authoring model between the document the generator consumes and
the rows the database holds.

Like `map-generator`, this package has no driver, no connection and no
framework — `toRows` and `fromRows` are pure functions over plain row types.
The SQL adapter that eventually runs them is a thin layer with nothing to
decide, and everything worth testing is tested without infrastructure.

```bash
npm test
npm run typecheck
```

## What the round-trip proves

Splitting one nested document into six tables is exactly where a migration
loses an ordering, an empty string or a null, and does it quietly. The proof
that this one does not is in `tests/round-trip.test.ts`: the map generated from
the rebuilt document is still, byte for byte, the map production published.

`toRows` emits rows in a canonical order, so importing what it exported
produces identical rows. That makes the import diffable — worth having when
what you are moving is someone's production data.

## Two shape changes, on purpose

**`witnessOrder` is gone as stored data.** Files and themes now share one
`witness_position` ordering space. The legacy kept the order in a separate
array that could name ids that no longer existed and omit ids that did; the
generator had to reconcile the two on every publish. There is now no second
copy to disagree with, so that class of bug is not handled — it is absent.

**An unassigned state is `null`, not `''`.** The absence of a state is not a
state, and a foreign key cannot point at the empty string.

## What it cleans up, and what it deliberately does not

| Input | Behaviour |
| --- | --- |
| File with a blank path | Dropped, and the schema refuses to store one |
| Social theme with no links | Kept |

The difference is intent. A file row with no path is corruption — the old
generator skipped it at publish time, so it never reached anyone anyway. An
empty theme is someone midway through authoring, and publish is still where it
gets filtered out. Storage keeps drafts; publish decides what ships.
