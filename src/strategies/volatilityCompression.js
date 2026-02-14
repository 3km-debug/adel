import { clamp } from '../utils/math.js';

export class VolatilityCompression {
  constructor(config) {
    this.id = 'volatilityCompression';
    this.config = config;
  }

  evaluate({ candidate, regime }) {
    const cfg = this.config.strategies[this.id];
    if (!cfg?.enabled) return null;

    const m5 = Number(candidate.priceChangeM5 || 0);
    const h1 = Number(candidate.priceChangeH1 || 0);
    const h24 = Number(candidate.priceChangeH24 || 0);

    const compression = Math.abs(m5) <= 0.006 && Math.abs(h1) <= 0.025;
    const latentTrend = h24 > 0.02;
    const regimeSupports = ['NEUTRAL', 'RANGING', 'TRENDING'].includes(regime.name);

    const confidence = clamp(
      (compression ? 0.45 : 0.1)
      + (latentTrend ? 0.25 : 0)
      + (regimeSupports ? 0.15 : 0)
      + Math.min(0.15, Math.max(0, 0.02 - Math.abs(m5)) * 4),
      0,
      1,
    );

    const actionable = compression && latentTrend && regimeSupports;

    return {
      strategyId: this.id,
      action: actionable ? 'BUY' : 'HOLD',
      confidence,
      shadow: Boolean(cfg.shadow),
      reasonCode: actionable ? 'compression_breakout_setup' : 'compression_not_ready',
      metadata: { m5, h1, h24 },
    };
  }
}
