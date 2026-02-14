import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcPnlPct,
  escalatedValue,
  evaluateRoundTrip,
  isBlacklisted,
  isInCooldown,
} from '../src/risk.js';

test('blacklisted -> skip', () => {
  const blacklist = {
    Mint111: { mint: 'Mint111', reason: 'probe_fail' },
  };

  assert.equal(isBlacklisted(blacklist, 'Mint111'), true);
  assert.equal(isBlacklisted(blacklist, 'Mint222'), false);
});

test('cooldown -> skip', () => {
  const now = Date.now();
  const cooldown = {
    Mint111: { mint: 'Mint111', untilTimestamp: now + 60_000 },
  };

  assert.equal(isInCooldown(cooldown, 'Mint111', now), true);
  assert.equal(isInCooldown(cooldown, 'Mint111', now + 120_000), false);
});

test('round-trip no sell quote -> skip', () => {
  const result = evaluateRoundTrip({
    buyQuote: { outAmount: '1000', priceImpactPct: '0.001' },
    sellQuote: null,
    inAmountSol: 0.01,
    maxImpactBps: 150,
    maxInstantLossBps: 300,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_sell_quote');
});

test('profit calc from quote -> correct', () => {
  const pnl = calcPnlPct(0.015, 0.01);
  assert.ok(Math.abs(pnl - 0.5) < 1e-9);
});

test('slippage escalation stops at max', () => {
  assert.equal(escalatedValue(50, 50, 300, 0), 50);
  assert.equal(escalatedValue(50, 50, 300, 2), 150);
  assert.equal(escalatedValue(50, 50, 300, 20), 300);
});
