export class Verifier {
  constructor(config) {
    this.config = config;
  }

  verifyIntent(intent) {
    const reasons = [];

    if (!intent?.candidate?.gate?.allowed) {
      reasons.push('candidate_not_whitelisted');
    }

    if ((intent?.candidate?.gate?.score || 0) < 0.55) {
      reasons.push('candidate_quality_score_low');
    }

    if (!Number.isFinite(intent?.candidate?.priceUsd) || intent.candidate.priceUsd <= 0) {
      reasons.push('price_data_invalid');
    }

    const hasLiquidityConservative = intent.signals.some((s) => s.strategyId === 'liquidityAwareConservative');
    if (intent.regime.name === 'LOW_LIQUIDITY' && !hasLiquidityConservative) {
      reasons.push('low_liquidity_without_conservative_signal');
    }

    const uniqueStrategies = new Set(intent.signals.map((signal) => signal.strategyId));
    if (uniqueStrategies.size < this.config.portfolio.minConsensusStrategies) {
      reasons.push('insufficient_strategy_consensus');
    }

    const liveSignals = intent.signals.filter((signal) => signal.enabledForLive);
    if (liveSignals.length === 0 && !this.config.system.shadowMode) {
      reasons.push('no_live_enabled_strategy_signal');
    }

    return {
      approved: reasons.length === 0,
      reasons,
      confidence: intent.aggregateConfidence,
      consensusCount: uniqueStrategies.size,
      tradeMode: intent.allShadow || this.config.system.shadowMode ? 'shadow' : 'live',
    };
  }
}
