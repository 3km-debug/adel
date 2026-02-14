export function utcDateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function isBlacklisted(blacklist, mint) {
  return Boolean(blacklist && blacklist[mint]);
}

export function cooldownRemainingMs(cooldowns, mint, now = Date.now()) {
  const until = Number(cooldowns?.[mint]?.untilTimestamp || 0);
  return Math.max(0, until - now);
}

export function isInCooldown(cooldowns, mint, now = Date.now()) {
  return cooldownRemainingMs(cooldowns, mint, now) > 0;
}

export function parsePriceImpactBps(rawValue) {
  const n = Number(rawValue);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Jupiter returns decimal fraction for percent (e.g. 0.015 = 1.5%).
  return Math.round(n * 10_000);
}

export function computeInstantLossBps(inSol, expectedOutSol) {
  const inAmount = Number(inSol || 0);
  if (!(inAmount > 0)) return 0;
  const outAmount = Number(expectedOutSol || 0);
  const loss = (inAmount - outAmount) / inAmount;
  if (!Number.isFinite(loss) || loss <= 0) return 0;
  return Math.round(loss * 10_000);
}

export function lamportsToSol(rawLamports) {
  const n = Number(rawLamports || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 1e9;
}

export function calcPnlPct(expectedOutSol, costBasisSol) {
  const expected = Number(expectedOutSol || 0);
  const cost = Number(costBasisSol || 0);
  if (!(cost > 0)) return null;
  return (expected - cost) / cost;
}

export function escalatedValue(base, step, max, attempt) {
  const b = Math.max(0, Number(base || 0));
  const s = Math.max(0, Number(step || 0));
  const m = Math.max(0, Number(max || 0));
  const a = Math.max(0, Number(attempt || 0));
  const value = b + s * a;
  if (!(m > 0)) return Math.round(value);
  return Math.round(Math.min(value, m));
}

export function nextBackoffMs(baseMs, attempt) {
  const base = Math.max(0, Number(baseMs || 0));
  const a = Math.max(0, Number(attempt || 0));
  return Math.round(base * (2 ** a));
}

export function evaluateRoundTrip({
  buyQuote,
  sellQuote,
  inAmountSol,
  maxImpactBps,
  maxInstantLossBps,
}) {
  if (!buyQuote) {
    return { ok: false, reason: 'buy_quote_missing' };
  }
  if (!sellQuote) {
    return { ok: false, reason: 'no_sell_quote' };
  }

  const buyImpactBps = parsePriceImpactBps(buyQuote.priceImpactPct);
  const sellImpactBps = parsePriceImpactBps(sellQuote.priceImpactPct);

  if (buyImpactBps > maxImpactBps) {
    return {
      ok: false,
      reason: 'buy_impact_too_high',
      buyImpactBps,
      sellImpactBps,
    };
  }
  if (sellImpactBps > maxImpactBps) {
    return {
      ok: false,
      reason: 'sell_impact_too_high',
      buyImpactBps,
      sellImpactBps,
    };
  }

  const expectedOutSol = lamportsToSol(sellQuote.outAmount);
  const instantLossBps = computeInstantLossBps(inAmountSol, expectedOutSol);

  if (instantLossBps > maxInstantLossBps) {
    return {
      ok: false,
      reason: 'instant_loss_too_high',
      buyImpactBps,
      sellImpactBps,
      expectedOutSol,
      instantLossBps,
    };
  }

  return {
    ok: true,
    reason: 'round_trip_ok',
    buyImpactBps,
    sellImpactBps,
    expectedOutSol,
    instantLossBps,
  };
}

export function normalizeMintList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

export function computeProbeSellRaw(qtyRaw, probeSellPct) {
  const qty = BigInt(String(qtyRaw || '0'));
  if (qty <= 0n) return 0n;
  const pct = Number(probeSellPct || 0);
  if (!(pct > 0)) return 0n;
  const bps = Math.max(1, Math.min(10_000, Math.round(pct * 10_000)));
  const out = (qty * BigInt(bps)) / 10_000n;
  return out > 0n ? out : 1n;
}
