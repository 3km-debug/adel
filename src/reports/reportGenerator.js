import fs from 'node:fs';
import path from 'node:path';
import { utcDateKey } from '../utils/time.js';

function parseStrategySet(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class ReportGenerator {
  constructor({ config, storage, logger }) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;

    this.reportsDir = path.resolve(config.storage.reportsDir);
    fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  generateDailyReport(dateKey = utcDateKey()) {
    const start = `${dateKey}T00:00:00.000Z`;
    const trades = this.storage.getTradesSince(start)
      .filter((trade) => trade.ts.startsWith(dateKey));

    const buys = trades.filter((t) => t.side === 'BUY');
    const sells = trades.filter((t) => t.side === 'SELL');

    const totalPnl = sells.reduce((sum, t) => sum + Number(t.pnl_sol || 0), 0);
    const wins = sells.filter((t) => Number(t.pnl_sol || 0) > 0).length;
    const losses = sells.filter((t) => Number(t.pnl_sol || 0) < 0).length;
    const winRate = sells.length > 0 ? wins / sells.length : 0;

    const byStrategy = new Map();
    for (const sell of sells) {
      for (const strategyId of parseStrategySet(sell.strategy_set)) {
        if (!byStrategy.has(strategyId)) {
          byStrategy.set(strategyId, { trades: 0, pnlSol: 0 });
        }
        const row = byStrategy.get(strategyId);
        row.trades += 1;
        row.pnlSol += Number(sell.pnl_sol || 0);
      }
    }

    const report = {
      date: dateKey,
      generatedAt: new Date().toISOString(),
      trades: {
        buys: buys.length,
        sells: sells.length,
        wins,
        losses,
        winRate,
      },
      pnl: {
        totalSol: totalPnl,
      },
      strategyBreakdown: Object.fromEntries(byStrategy.entries()),
    };

    const jsonPath = path.join(this.reportsDir, `${dateKey}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    const mdLines = [
      `# Daily Trading Report ${dateKey}`,
      '',
      `- Generated at: ${report.generatedAt}`,
      `- Buys: ${buys.length}`,
      `- Sells: ${sells.length}`,
      `- Win rate: ${(winRate * 100).toFixed(2)}%`,
      `- Total PnL (SOL): ${totalPnl.toFixed(6)}`,
      '',
      '## Strategy Breakdown',
      '',
    ];

    for (const [strategyId, row] of byStrategy.entries()) {
      mdLines.push(`- ${strategyId}: trades=${row.trades}, pnl=${row.pnlSol.toFixed(6)} SOL`);
    }

    if (byStrategy.size === 0) {
      mdLines.push('- No closed trades today.');
    }

    const mdPath = path.join(this.reportsDir, `${dateKey}.md`);
    fs.writeFileSync(mdPath, `${mdLines.join('\n')}\n`);

    this.logger.info('report.generated', {
      date: dateKey,
      jsonPath,
      mdPath,
      totalPnl,
    });

    return { report, jsonPath, mdPath };
  }
}
