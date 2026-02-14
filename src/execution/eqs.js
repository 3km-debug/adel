import { clamp } from '../utils/math.js';

export function scoreExecutionQuality({
  priceImpactBps,
  maxPriceImpactBps,
  quoteLatencyMs,
  maxLatencyMs,
  routeHops,
  liquidityUsd,
  minRouteLiquidityUsd,
  spreadBps,
  maxSpreadBps,
}) {
  const impactScore = clamp(1 - (priceImpactBps / Math.max(1, maxPriceImpactBps)), 0, 1) * 35;
  const latencyScore = clamp(1 - (quoteLatencyMs / Math.max(1, maxLatencyMs)), 0, 1) * 20;
  const hopScore = clamp(1 - ((routeHops - 1) / 4), 0, 1) * 15;
  const liquidityScore = clamp(liquidityUsd / Math.max(1, minRouteLiquidityUsd), 0, 2) / 2 * 20;
  const spreadScore = clamp(1 - (spreadBps / Math.max(1, maxSpreadBps)), 0, 1) * 10;

  return Number((impactScore + latencyScore + hopScore + liquidityScore + spreadScore).toFixed(2));
}
