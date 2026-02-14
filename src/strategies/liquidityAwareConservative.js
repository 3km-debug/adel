import { clamp } from '../utils/math.js';

export class LiquidityAwareConservative {
  constructor(config) {
    this.id = 'liquidityAwareConservative';
    this.config = config;
  }

  evaluate({ candidate, regime }) {
    const cfg = this.config.strategies[this.id];
    if (!cfg?.enabled) return null;

    const liquidity = Number(candidate.liquidityUsd || 0);
    const volume = Number(candidate.volume24hUsd || 0);
    const spreadBps = Number(candidate.spreadBps || 9_999);

    const liqRatio = liquidity / Math.max(1, this.config.watchlist.minLiquidityUsd);
    const volRatio = volume / Math.max(1, this.config.watchlist.minVolume24hUsd);
    const spreadScore = spreadBps <= this.config.watchlist.maxSpreadBps ? 1 : 0;

    const confidence = clamp(
      Math.min(0.5, liqRatio * 0.2)
      + Math.min(0.3, volRatio * 0.1)
      + spreadScore * 0.2
      + (regime.name === 'LOW_LIQUIDITY' ? -0.25 : 0.1),
      0,
      1,
    );

    const actionable = liquidity >= this.config.watchlist.minLiquidityUsd * 1.4
      && volume >= this.config.watchlist.minVolume24hUsd * 1.2
      && spreadBps <= this.config.watchlist.maxSpreadBps * 0.75
      && regime.name !== 'LOW_LIQUIDITY';

    return {
      strategyId: this.id,
      action: actionable ? 'BUY' : 'HOLD',
      confidence,
      shadow: Boolean(cfg.shadow),
      reasonCode: actionable ? 'conservative_liquidity_pass' : 'conservative_filters_not_met',
      metadata: { liquidity, volume, spreadBps },
    };
  }
}
