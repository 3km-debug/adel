import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { evaluateAntiScamGate } from '../src/watchlist/antiScamGate.js';

function cfg() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

test('anti-scam gate allows clean token', () => {
  const config = cfg();
  const candidate = {
    mint: 'Mint111',
    exists: true,
    isToken2022: false,
    freezeAuthority: null,
    mintAuthority: null,
    isVerified: true,
    liquidityUsd: config.watchlist.minLiquidityUsd * 2,
    volume24hUsd: config.watchlist.minVolume24hUsd * 2,
    holders: config.watchlist.minHolders + 20,
    ageHours: 5,
    spreadBps: 120,
  };

  const result = evaluateAntiScamGate(candidate, config);
  assert.equal(result.allowed, true);
  assert.equal(result.reasons.length, 0);
  assert.ok(result.score > 0.5);
});

test('anti-scam gate rejects token-2022 by default', () => {
  const result = evaluateAntiScamGate({
    mint: 'Mint222',
    exists: true,
    isToken2022: true,
    freezeAuthority: null,
    mintAuthority: null,
    liquidityUsd: 100_000,
    volume24hUsd: 100_000,
    holders: 500,
    ageHours: 2,
    spreadBps: 80,
  }, cfg());

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('token2022_blocked'));
});

test('anti-scam gate rejects low liquidity and freeze authority', () => {
  const config = cfg();
  const result = evaluateAntiScamGate({
    mint: 'Mint333',
    exists: true,
    isToken2022: false,
    freezeAuthority: 'FreezeAuth111',
    mintAuthority: null,
    liquidityUsd: config.watchlist.minLiquidityUsd - 1,
    volume24hUsd: config.watchlist.minVolume24hUsd - 1,
    holders: config.watchlist.minHolders - 1,
    ageHours: 3,
    spreadBps: config.watchlist.maxSpreadBps + 20,
  }, config);

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('freeze_authority_present'));
  assert.ok(result.reasons.includes('liquidity_too_low'));
  assert.ok(result.reasons.includes('volume_too_low'));
  assert.ok(result.reasons.includes('holders_too_low'));
  assert.ok(result.reasons.includes('spread_too_wide'));
});
