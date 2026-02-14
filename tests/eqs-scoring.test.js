import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreExecutionQuality } from '../src/execution/eqs.js';

test('EQS is high for low-impact high-liquidity low-latency route', () => {
  const eqs = scoreExecutionQuality({
    priceImpactBps: 30,
    maxPriceImpactBps: 220,
    quoteLatencyMs: 200,
    maxLatencyMs: 2000,
    routeHops: 1,
    liquidityUsd: 80_000,
    minRouteLiquidityUsd: 12_000,
    spreadBps: 80,
    maxSpreadBps: 450,
  });

  assert.ok(eqs >= 80);
});

test('EQS is low for high impact, poor liquidity, and slow quote', () => {
  const eqs = scoreExecutionQuality({
    priceImpactBps: 400,
    maxPriceImpactBps: 220,
    quoteLatencyMs: 4000,
    maxLatencyMs: 2000,
    routeHops: 5,
    liquidityUsd: 1000,
    minRouteLiquidityUsd: 12_000,
    spreadBps: 900,
    maxSpreadBps: 450,
  });

  assert.ok(eqs <= 25);
});

test('EQS responds monotonically to price impact degradation', () => {
  const good = scoreExecutionQuality({
    priceImpactBps: 20,
    maxPriceImpactBps: 220,
    quoteLatencyMs: 300,
    maxLatencyMs: 2000,
    routeHops: 1,
    liquidityUsd: 50_000,
    minRouteLiquidityUsd: 12_000,
    spreadBps: 100,
    maxSpreadBps: 450,
  });

  const bad = scoreExecutionQuality({
    priceImpactBps: 200,
    maxPriceImpactBps: 220,
    quoteLatencyMs: 300,
    maxLatencyMs: 2000,
    routeHops: 1,
    liquidityUsd: 50_000,
    minRouteLiquidityUsd: 12_000,
    spreadBps: 100,
    maxSpreadBps: 450,
  });

  assert.ok(good > bad);
});
