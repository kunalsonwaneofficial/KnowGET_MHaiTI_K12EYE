# Performance Baseline — Phase 1

Reproducible microbenchmarks used for **regression detection** across milestones.
Run with:

```bash
pnpm build   # build the packages first (produces dist/)
pnpm bench   # node tools/benchmarks/bench.cjs
```

These are single-process microbenchmarks against the built, Prisma-free packages
on the build host. They are **indicative, not SLAs** — their purpose is to catch
a regression (a hot path getting an order of magnitude slower), not to promise
throughput. Absolute numbers vary with hardware.

## Baseline (P1-M07, `v0.1.0`)

| Operation                 | Iterations | ns/op    | ops/sec |
| ------------------------- | ---------: | -------- | ------- |
| cache set+get             |    200,000 | 836 ns   | 1.20M/s |
| search query (1k docs)    |     50,000 | 281.8 µs | 3.5k/s  |
| metrics counter.inc       |    500,000 | 518 ns   | 1.93M/s |
| event publish             |    200,000 | 2.05 µs  | 487k/s  |
| workflow start+transition |    200,000 | 1.27 µs  | 788k/s  |
| jwt sign+verify (HS256)   |     20,000 | 8.55 µs  | 117k/s  |
| password hash (scrypt)    |         25 | 38.6 ms  | 25.9/s  |
| password verify (scrypt)  |         25 | 38.7 ms  | 25.8/s  |

## Interpretation

- In-memory hot paths (cache, metrics, events, workflow) are sub-microsecond to
  low-microsecond — well clear of any request-path concern.
- Full-text search over 1k documents is ~280 µs/query for the in-memory index;
  the PostgreSQL-FTS/OpenSearch backend (TD-19) is the scale path.
- **Password hashing is deliberately ~39 ms** (scrypt work factor). This is a
  security feature, not a regression — do not "optimize" it.

## Adding benchmarks

Add an operation to `tools/benchmarks/bench.cjs` via `bench(name, iterations, fn)`
(it `require`s the packages' built `dist`). Keep iteration counts high enough to
dwarf timer noise, and low enough to finish quickly for intentionally-slow ops.
