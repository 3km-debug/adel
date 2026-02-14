export class CapitalAllocator {
  constructor(config) {
    this.config = config;
  }

  allocate(intent, portfolioState) {
    const allocCfg = this.config.allocation;
    const baseCapital = allocCfg.baseCapitalSol;
    const reserveSol = baseCapital * allocCfg.reservePct;
    const deployableCapital = Math.max(0, baseCapital - reserveSol);
    const availableCapital = Math.max(0, deployableCapital - portfolioState.exposureSol);

    const weightedSignalStrength = intent.signals.reduce((sum, signal) => {
      const strategyCfg = this.config.strategies[signal.strategyId];
      return sum + signal.confidence * Number(strategyCfg.baseWeight || 0);
    }, 0);

    const confidenceFactor = Math.pow(Math.max(0.01, intent.aggregateConfidence), allocCfg.confidenceExponent);
    const rawAmount = deployableCapital * weightedSignalStrength * confidenceFactor;

    const capPerTradeByAlloc = baseCapital * allocCfg.maxPerTradePct;
    const capPerStrategy = baseCapital * allocCfg.maxPerStrategyPct;
    const capByRisk = this.config.risk.maxTradeSol;

    const amountSol = Math.max(0, Math.min(rawAmount, capPerTradeByAlloc, capPerStrategy, capByRisk, availableCapital));

    return {
      amountSol,
      reserveSol,
      deployableCapital,
      availableCapital,
      weightedSignalStrength,
      confidenceFactor,
      rawAmount,
    };
  }
}
