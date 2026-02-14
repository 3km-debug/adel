import { mean, median, percentChange, standardDeviation, clamp } from '../utils/math.js';

export class MarketRegimeDetector {
  constructor(config) {
    this.config = config;
    this.history = [];
    this.lastMedianPrice = null;
  }

  snapshotFromCandidates(candidates) {
    const prices = candidates.map((c) => Number(c.priceUsd)).filter(Number.isFinite);
    const liquidity = candidates.map((c) => Number(c.liquidityUsd)).filter(Number.isFinite);
    const oneHourMoves = candidates.map((c) => Number(c.priceChangeH1)).filter(Number.isFinite);

    const medianPrice = median(prices);
    const medianLiquidity = median(liquidity);
    const avgMoveH1 = mean(oneHourMoves);

    const priceReturn = this.lastMedianPrice == null
      ? 0
      : percentChange(medianPrice, this.lastMedianPrice);

    this.lastMedianPrice = medianPrice || this.lastMedianPrice;

    return {
      ts: Date.now(),
      medianPrice,
      medianLiquidity,
      avgMoveH1,
      priceReturn,
    };
  }

  updateHistory(snapshot) {
    this.history.push(snapshot);
    const maxSize = Math.max(5, this.config.mrd.lookbackTicks);
    if (this.history.length > maxSize) {
      this.history = this.history.slice(this.history.length - maxSize);
    }
  }

  detect(candidates) {
    const snapshot = this.snapshotFromCandidates(candidates);
    this.updateHistory(snapshot);

    const returns = this.history.map((h) => h.priceReturn);
    const trend = mean(returns);
    const volatility = standardDeviation(returns);

    const liquidityHistory = this.history.map((h) => h.medianLiquidity).filter(Number.isFinite);
    const currentLiquidity = liquidityHistory[liquidityHistory.length - 1] || 0;

    let regime = 'NEUTRAL';

    if (currentLiquidity < this.config.mrd.lowLiquidityUsd) {
      regime = 'LOW_LIQUIDITY';
    } else if (volatility >= this.config.mrd.highVolatilityThreshold) {
      regime = Math.abs(trend) >= this.config.mrd.trendThreshold ? 'VOLATILE_TREND' : 'VOLATILE_CHOP';
    } else if (Math.abs(trend) >= this.config.mrd.trendThreshold) {
      regime = 'TRENDING';
    } else if (volatility <= this.config.mrd.rangeVolatilityThreshold) {
      regime = 'RANGING';
    }

    const confidence = clamp(
      Math.abs(trend) * 12 + volatility * 8 + (currentLiquidity >= this.config.mrd.lowLiquidityUsd ? 0.1 : 0),
      0,
      1,
    );

    return {
      name: regime,
      confidence,
      trend,
      volatility,
      medianLiquidityUsd: currentLiquidity,
      sampleSize: this.history.length,
    };
  }
}
