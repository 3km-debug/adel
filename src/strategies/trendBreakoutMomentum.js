import { clamp } from '../utils/math.js';

export class TrendBreakoutMomentum {
  constructor(config) {
    this.id = 'trendBreakoutMomentum';
    this.config = config;
  }

  evaluate({ candidate, regime }) {
    const cfg = this.config.strategies[this.id];
    if (!cfg?.enabled) return null;

    const m5 = Number(candidate.priceChangeM5 || 0);
    const h1 = Number(candidate.priceChangeH1 || 0);
    const flowRatio = Number(candidate.buyTx24h || 0) / Math.max(1, Number(candidate.sellTx24h || 0));

    const regimeBoost = regime.name === 'TRENDING' || regime.name === 'VOLATILE_TREND' ? 1 : 0.6;
    const rawConfidence = (h1 * 3 + m5 * 1.5 + (flowRatio - 1) * 0.2 + regimeBoost * 0.35);
    const confidence = clamp(rawConfidence, 0, 1);

    const actionable = h1 > 0.02 && m5 >= 0 && flowRatio >= 1.05;

    return {
      strategyId: this.id,
      action: actionable ? 'BUY' : 'HOLD',
      confidence,
      shadow: Boolean(cfg.shadow),
      reasonCode: actionable ? 'momentum_breakout_confirmed' : 'momentum_not_confirmed',
      metadata: { m5, h1, flowRatio },
    };
  }
}
