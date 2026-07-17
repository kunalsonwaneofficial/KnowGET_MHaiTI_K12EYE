#!/usr/bin/env node
/*
 * Phase-1 performance baseline harness (P1-M07).
 *
 * Measures representative operations across the platform's Prisma-free packages
 * against their built `dist` output, to establish reproducible baselines. Run
 * after building the packages:  node tools/benchmarks/bench.cjs
 *
 * Numbers are indicative single-process microbenchmarks on the build host, not
 * SLAs — their purpose is regression detection across milestones.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node CJS tool */
"use strict";

const { InMemoryCache } = require("../../packages/cache/dist/index.js");
const { InMemorySearchIndex } = require("../../packages/search/dist/index.js");
const { hashPassword, verifyPassword } = require("../../packages/security/dist/index.js");
const { signJwt, verifyJwt } = require("../../packages/tokens/dist/index.js");
const { MetricsRegistry } = require("../../packages/metrics/dist/index.js");
const { InMemoryEventBus, createEvent } = require("../../packages/events/dist/index.js");
const { WorkflowEngine } = require("../../packages/workflow/dist/index.js");

async function bench(name, iterations, fn) {
  // Warmup.
  for (let i = 0; i < Math.min(iterations, 100); i += 1) await fn(i);
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) await fn(i);
  const ns = Number(process.hrtime.bigint() - start);
  const nsPerOp = ns / iterations;
  const opsPerSec = 1e9 / nsPerOp;
  return { name, iterations, nsPerOp, opsPerSec };
}

function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(1);
}

function fmtTime(ns) {
  if (ns >= 1e6) return `${(ns / 1e6).toFixed(3)} ms`;
  if (ns >= 1e3) return `${(ns / 1e3).toFixed(2)} µs`;
  return `${ns.toFixed(0)} ns`;
}

async function main() {
  const results = [];

  // Cache: set + get round trip.
  const cache = new InMemoryCache();
  results.push(
    await bench("cache set+get", 200_000, async (i) => {
      await cache.set(`k${i & 1023}`, i);
      await cache.get(`k${i & 1023}`);
    }),
  );

  // Search: query over a seeded index.
  const index = new InMemorySearchIndex();
  for (let i = 0; i < 1000; i += 1)
    index.index({ id: `d${i}`, text: `document number ${i} lorem ipsum dolor` });
  results.push(
    await bench("search query (1k docs)", 50_000, () => index.search({ text: "lorem document" })),
  );

  // Metrics: counter increment + expose.
  const registry = new MetricsRegistry();
  const counter = registry.counter("bench_total", "bench", ["k"]);
  results.push(
    await bench("metrics counter.inc", 500_000, (i) => counter.inc({ k: String(i & 7) })),
  );

  // Events: publish to one subscriber.
  const bus = new InMemoryEventBus();
  bus.subscribe("bench.event", () => undefined);
  results.push(
    await bench("event publish", 200_000, () => bus.publish(createEvent("bench.event", { i: 1 }))),
  );

  // Workflow: start + one transition.
  const engine = new WorkflowEngine({
    name: "b",
    initial: "a",
    states: [{ name: "a" }, { name: "b", final: true }],
    transitions: [{ from: "a", on: "go", to: "b" }],
  });
  results.push(
    await bench("workflow start+transition", 200_000, () => engine.send(engine.start({}), "go")),
  );

  // JWT: sign + verify (HS256).
  const key = Buffer.alloc(32, 7);
  results.push(
    await bench("jwt sign+verify", 20_000, () => {
      const token = signJwt({ sub: "u" }, { key, expiresInMs: 60_000 });
      verifyJwt(token, { key });
    }),
  );

  // Password hashing (scrypt — intentionally slow).
  const hash = hashPassword("Sup3rSecret!Pass");
  results.push(await bench("password hash (scrypt)", 25, () => hashPassword("Sup3rSecret!Pass")));
  results.push(
    await bench("password verify (scrypt)", 25, () => verifyPassword("Sup3rSecret!Pass", hash)),
  );

  // Markdown table.
  console.log("| Operation | Iterations | ns/op | ops/sec |");
  console.log("| --------- | ---------: | ----: | ------: |");
  for (const r of results) {
    console.log(
      `| ${r.name} | ${r.iterations.toLocaleString()} | ${fmtTime(r.nsPerOp)} | ${fmt(r.opsPerSec)}/s |`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
