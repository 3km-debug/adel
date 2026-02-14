import { hoursToMs } from '../utils/time.js';

function initialMode(config, strategyCfg) {
  if (!strategyCfg.enabled) return 'disabled';
  if (config.system.shadowMode) return 'shadow';
  return strategyCfg.shadow ? 'shadow' : 'live';
}

export class StrategyGovernance {
  constructor(config, storage, logger) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;

    const persisted = storage.getState('strategyGovernanceModes', null);
    if (persisted) {
      this.state = persisted;
    } else {
      this.state = {
        globalShadow: Boolean(config.system.shadowMode),
        strategies: {},
      };

      for (const [strategyId, strategyCfg] of Object.entries(config.strategies)) {
        this.state.strategies[strategyId] = {
          mode: initialMode(config, strategyCfg),
          updatedAt: new Date().toISOString(),
          shadowSinceMs: Date.now(),
        };
      }

      this.persist();
    }
  }

  persist() {
    this.storage.setState('strategyGovernanceModes', this.state);
  }

  setGlobalShadow(enabled) {
    this.state.globalShadow = Boolean(enabled);
    this.state.updatedAt = new Date().toISOString();

    for (const strategy of Object.values(this.state.strategies)) {
      if (this.state.globalShadow && strategy.mode !== 'disabled') {
        strategy.mode = 'shadow';
        strategy.shadowSinceMs = Date.now();
      }
    }

    this.persist();
  }

  getStrategyState(strategyId) {
    const strategy = this.state.strategies[strategyId] || { mode: 'disabled' };
    if (this.state.globalShadow && strategy.mode !== 'disabled') {
      return { mode: 'shadow' };
    }
    return { mode: strategy.mode };
  }

  applyEvaluation(strategyStatsMap) {
    const minShadowMs = hoursToMs(this.config.governance.shadowDurationHours);
    const now = Date.now();

    for (const [strategyId, strategyState] of Object.entries(this.state.strategies)) {
      if (strategyState.mode === 'disabled') continue;

      const stats = strategyStatsMap.get(strategyId);
      if (!stats) continue;

      const trades = Number(stats.totalTrades || 0);
      const wins = Number(stats.wins || 0);
      const losses = Number(stats.losses || 0);
      const winRate = trades > 0 ? wins / trades : 0;
      const drawdown = Number(stats.maxDrawdownPct || 0);
      const pnlSol = Number(stats.pnlSol || 0);

      if (strategyState.mode === 'shadow') {
        const shadowAgeMs = now - Number(strategyState.shadowSinceMs || now);
        const promote = !this.state.globalShadow
          && shadowAgeMs >= minShadowMs
          && trades >= this.config.governance.promotionMinTrades
          && winRate >= this.config.governance.promotionMinWinRate
          && pnlSol >= this.config.governance.promotionMinPnlSol;

        if (promote) {
          strategyState.mode = 'live';
          strategyState.updatedAt = new Date().toISOString();
          this.logger.info('governance.strategy_promoted', { strategyId, trades, winRate, pnlSol });
        }
      }

      if (strategyState.mode === 'live') {
        const rollback = (trades >= 10)
          && (drawdown >= this.config.governance.rollbackMaxDrawdownPct
            || winRate <= this.config.governance.rollbackMinWinRate
            || losses >= this.config.risk.maxConsecutiveLosses);

        if (rollback) {
          strategyState.mode = 'shadow';
          strategyState.shadowSinceMs = now;
          strategyState.updatedAt = new Date().toISOString();
          this.logger.warn('governance.strategy_rolled_back', { strategyId, trades, winRate, drawdown });
        }
      }
    }

    this.persist();
  }

  summary() {
    return {
      globalShadow: this.state.globalShadow,
      strategies: this.state.strategies,
    };
  }
}
