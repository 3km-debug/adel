import { clamp } from '../utils/math.js';

export class MeanReversionRange {
  constructor(config) {
    this.id = 'meanReversionRange';
    this.config = config;
  }

  evaluate({ candidate, regime }) {
    const cfg = this.config.strategies[this.id];
    if (!cfg?.enabled) return null;

    const h1 = Number(candidate.priceChangeH1 || 0);
    const m5 = Number(candidate.priceChangeM5 || 0);
    const spreadBps = Number(candidate.spreadBps || 9_999);

    const inRangeRegime = regime.name === 'RANGING' || regime.name === 'NEUTRAL';
    const oversold = h1 < -0.015 && h1 > -0.14;
    const stabilization = m5 > -0.012;
    const tradableSpread = spreadBps <= this.config.watchlist.maxSpreadBps;

    const confidence = clamp(
      (inRangeRegime ? 0.35 : 0.1) + Math.min(0.35, Math.abs(h1) * 2.5) + (stabilization ? 0.2 : 0) + (tradableSpread ? 0.1 : 0),
      0,
      1,
    );

    const actionable = inRangeRegime && oversold && stabilization && tradableSpread;

    return {
      strategyId: this.id,
      action: actionable ? 'BUY' : 'HOLD',
      confidence,
      shadow: Boolean(cfg.shadow),
      reasonCode: actionable ? 'range_reversion_setup' : 'range_reversion_not_ready',
      metadata: { h1, m5, spreadBps },
    };
  }
}
