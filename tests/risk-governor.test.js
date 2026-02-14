import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { evaluateRiskConstraints } from '../src/risk/riskGovernor.js';

function config() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function baseInput() {
  return {
    nowMs: Date.now(),
    controls: {
      emergencyStop: false,
      pauseUntilMs: 0,
    },
    intent: {
      mint: 'Mint111111111111111111111111111111111',
    },
    allocation: {
      amountSol: 0.2,
    },
    portfolio: {
      openPositions: 1,
      exposureSol: 0.4,
      equitySol: 5,
    },
    performance: {
      dailyPnlSol: 0.1,
      drawdownPct: 0.05,
      consecutiveLosses: 1,
    },
    quoteMetrics: {
      priceImpactBps: 50,
      instantLossBps: 100,
    },
  };
}

test('risk governor allows trade under limits', () => {
  const result = evaluateRiskConstraints(baseInput(), config(), {});
  assert.equal(result.allowed, true);
  assert.deepEqual(result.reasons, []);
});

test('risk governor blocks when daily loss breached', () => {
  const cfg = config();
  const input = baseInput();
  input.performance.dailyPnlSol = -cfg.risk.maxDailyLossSol;

  const result = evaluateRiskConstraints(input, cfg, {});
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('daily_loss_limit_breached'));
});

test('risk governor blocks token in cooldown', () => {
  const input = baseInput();
  const cooldowns = {
    [input.intent.mint]: {
      reason: 'loss_realized',
      untilMs: Date.now() + 30_000,
    },
  };

  const result = evaluateRiskConstraints(input, config(), cooldowns);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('token_cooldown_active'));
});

test('risk governor blocks when quote quality exceeds max impact', () => {
  const cfg = config();
  const input = baseInput();
  input.quoteMetrics.priceImpactBps = cfg.risk.maxPriceImpactBps + 1;

  const result = evaluateRiskConstraints(input, cfg, {});
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('price_impact_too_high'));
});
