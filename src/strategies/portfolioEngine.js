import { clamp } from '../utils/math.js';
import { TrendBreakoutMomentum } from './trendBreakoutMomentum.js';
import { MeanReversionRange } from './meanReversionRange.js';
import { VolatilityCompression } from './volatilityCompression.js';
import { LiquidityAwareConservative } from './liquidityAwareConservative.js';

function strategyWeight(config, strategyId) {
  return Number(config.strategies?.[strategyId]?.baseWeight || 0);
}

export class PortfolioEngine {
  constructor(config) {
    this.config = config;
    this.strategies = [
      new TrendBreakoutMomentum(config),
      new MeanReversionRange(config),
      new VolatilityCompression(config),
      new LiquidityAwareConservative(config),
    ];
  }

  evaluateCandidate(candidate, regime, governance) {
    const rawSignals = this.strategies
      .map((strategy) => strategy.evaluate({ candidate, regime }))
      .filter(Boolean)
      .map((signal) => {
        const governanceState = governance.getStrategyState(signal.strategyId);
        return {
          ...signal,
          enabledForLive: governanceState.mode === 'live',
          governanceMode: governanceState.mode,
        };
      });

    const buySignals = rawSignals
      .filter((signal) => signal.action === 'BUY')
      .filter((signal) => signal.confidence >= this.config.strategies[signal.strategyId].minConfidence);

    if (buySignals.length === 0) {
      return null;
    }

    const weightedScore = buySignals.reduce((sum, signal) => {
      const weight = strategyWeight(this.config, signal.strategyId);
      return sum + signal.confidence * weight;
    }, 0);

    const totalWeight = buySignals.reduce((sum, signal) => sum + strategyWeight(this.config, signal.strategyId), 0);
    const aggregateConfidence = totalWeight > 0 ? weightedScore / totalWeight : 0;

    const liveSignalCount = buySignals.filter((s) => s.enabledForLive).length;

    return {
      mint: candidate.mint,
      symbol: candidate.symbol,
      candidate,
      regime,
      signals: buySignals,
      aggregateConfidence: clamp(aggregateConfidence, 0, 1),
      consensusCount: buySignals.length,
      liveSignalCount,
      allShadow: liveSignalCount === 0,
      score: aggregateConfidence * (1 + buySignals.length * 0.1),
    };
  }

  buildIntents(candidates, regime, governance) {
    const intents = candidates
      .map((candidate) => this.evaluateCandidate(candidate, regime, governance))
      .filter(Boolean)
      .filter((intent) => intent.consensusCount >= this.config.portfolio.minConsensusStrategies)
      .filter((intent) => intent.aggregateConfidence >= this.config.portfolio.minAggregateConfidence)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.portfolio.maxIntentsPerLoop);

    return intents;
  }
}
