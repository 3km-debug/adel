function parseStrategySet(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeMaxDrawdown(cumulativePnlSeries) {
  let peak = 0;
  let maxDd = 0;
  for (const value of cumulativePnlSeries) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - value) / peak);
    }
  }
  return maxDd;
}

export class SelfEvaluationLoop {
  constructor({ config, storage, logger }) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
  }

  run() {
    const trades = this.storage.getRecentTrades(3_000)
      .filter((t) => t.side === 'SELL' && t.pnl_sol != null)
      .reverse();

    const stats = new Map();

    for (const trade of trades) {
      const strategySet = parseStrategySet(trade.strategy_set);
      for (const strategyId of strategySet) {
        if (!stats.has(strategyId)) {
          stats.set(strategyId, {
            strategyId,
            mode: 'shadow',
            totalTrades: 0,
            wins: 0,
            losses: 0,
            pnlSol: 0,
            maxDrawdownPct: 0,
            shadowTrades: 0,
            liveTrades: 0,
            firstTradeTs: trade.ts,
            lastTradeTs: trade.ts,
            _cumPnlSeries: [],
          });
        }

        const row = stats.get(strategyId);
        const pnl = Number(trade.pnl_sol || 0);
        row.totalTrades += 1;
        if (pnl > 0) row.wins += 1;
        if (pnl < 0) row.losses += 1;
        row.pnlSol += pnl;
        row.lastTradeTs = trade.ts;
        row.mode = trade.mode === 'live' ? 'live' : row.mode;

        if (trade.mode === 'live') row.liveTrades += 1;
        else row.shadowTrades += 1;

        const previous = row._cumPnlSeries[row._cumPnlSeries.length - 1] || 0;
        row._cumPnlSeries.push(previous + pnl);
      }
    }

    for (const stat of stats.values()) {
      stat.maxDrawdownPct = computeMaxDrawdown(stat._cumPnlSeries);
      delete stat._cumPnlSeries;
      this.storage.upsertStrategyStat(stat);
    }

    this.logger.info('evaluation.strategy_stats_updated', {
      strategyCount: stats.size,
      evaluatedTrades: trades.length,
    });

    return stats;
  }
}
