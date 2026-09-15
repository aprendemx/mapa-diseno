# postgres

The driver-bound adapter. Reads and writes catalogue rows; holds no rules.

Everything worth deciding lives in `project-store` (how the document becomes
rows) and `map-generator` (what the map is). This package knows SQL and
nothing else — which is why it is the only one with a dependency that opens a
socket.

## Running the integration suite

```bash
docker compose -f docker-compose.dev.yml up -d
npm test --workspace @mapa-mexico/postgres
```

Tests skip cleanly when no database answers, so the suite stays runnable
without Docker. They also refuse to run against anything but a loopback
address: they drop and recreate the public schema, and a test that can reach
production is a test that will eventually reach production.

## Why this suite exists at all

`project-store` already proves the round-trip with pure functions. What it
cannot prove is what a real driver does to the values on the way through.

Writing it caught one such thing before it shipped: `pg` returns `numeric`
columns as strings, so the three glow parameters would have come back as `"2"`
instead of `2` and quietly broken the generated map. The fix was in the schema
— those are continuous display parameters, not money, so `double precision` is
what they should have been. A stubbed driver would have agreed with the bug.

The suite also pins the transaction: a failed import must leave every table as
it was, not half-replaced.
