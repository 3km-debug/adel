import { calcPnlPct, calcPnlSol } from '../risk/metrics.js';

export class PositionManager {
  constructor({ config, storage, logger, execution }) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
    this.execution = execution;
  }

  openPositionFromEntry(plan, entryResult) {
    const qtyRaw = String(entryResult.outAmountRaw || plan.roundTrip.buyOutRaw);
    const amountSol = Number(plan.allocation.amountSol || 0);
    const stopLossSol = amountSol * (1 - this.config.risk.stopLossPct);
    const takeProfitSol = amountSol * (1 + this.config.risk.takeProfitPct);
    const trailingStopSol = amountSol * (1 - this.config.risk.trailingStopPct);

    const position = {
      mint: plan.intent.mint,
      symbol: plan.intent.symbol,
      qtyRaw,
      qtyDecimals: Number(plan.intent.candidate?.decimals || 0),
      costBasisSol: amountSol,
      amountSol,
      strategySet: plan.intent.signals.map((s) => s.strategyId),
      openedAt: new Date().toISOString(),
      highestValueSol: amountSol,
      stopLossSol,
      takeProfitSol,
      trailingStopSol,
      mode: entryResult.mode,
      metadata: {
        regime: plan.intent.regime.name,
        eqs: plan.eqs,
      },
    };

    this.storage.upsertPosition(position);
    this.storage.recordTrade({
      mode: entryResult.mode,
      mint: plan.intent.mint,
      symbol: plan.intent.symbol,
      side: 'BUY',
      strategySet: position.strategySet,
      confidence: plan.intent.aggregateConfidence,
      amountSol,
      qtyRaw,
      priceImpactBps: plan.roundTrip.priceImpactBps,
      instantLossBps: plan.roundTrip.instantLossBps,
      eqs: plan.eqs,
      status: entryResult.status,
      reason: entryResult.reason || 'entry_filled',
      txSig: entryResult.txSig,
      metadata: {
        regime: plan.intent.regime,
        signals: plan.intent.signals,
        allocation: plan.allocation,
      },
    });

    this.logger.info('position.opened', {
      mint: position.mint,
      symbol: position.symbol,
      amountSol,
      mode: entryResult.mode,
      qtyRaw,
    });

    return position;
  }

  async evaluateOpenPositions({ performanceGuard, riskGovernor }) {
    const positions = this.storage.listOpenPositions();
    const closes = [];

    for (const position of positions) {
      try {
        const exitPlan = await this.execution.planExit(position);
        const currentValueSol = exitPlan.expectedOutSol;

        const highestValueSol = Math.max(position.highestValueSol, currentValueSol);
        const trailingStopSol = Math.max(
          position.trailingStopSol,
          highestValueSol * (1 - this.config.risk.trailingStopPct),
        );

        const pnlPct = calcPnlPct(currentValueSol, position.costBasisSol);

        let reason = null;
        if (currentValueSol <= position.stopLossSol) {
          reason = 'stop_loss_hit';
        } else if (currentValueSol <= trailingStopSol && highestValueSol > position.costBasisSol) {
          reason = 'trailing_stop_hit';
        } else if (currentValueSol >= position.takeProfitSol) {
          reason = 'take_profit_hit';
        } else if (pnlPct <= -this.config.risk.maxUnrealizedLossPct) {
          reason = 'max_unrealized_loss_hit';
        }

        if (!reason) {
          this.storage.upsertPosition({
            ...position,
            highestValueSol,
            trailingStopSol,
          });
          continue;
        }

        const mode = position.mode === 'live' && this.config.system.liveTradingEnabled ? 'live' : 'shadow';
        const exitResult = await this.execution.executeExit(exitPlan, mode);

        if (!exitResult.ok) {
          this.storage.recordEvent({
            type: 'exit_failed',
            severity: 'warn',
            payload: {
              mint: position.mint,
              reason,
              error: exitResult.error || exitResult.reason,
            },
          });
          continue;
        }

        const receivedSol = Number(exitResult.outAmountRaw || exitPlan.sellQuote?.outAmount || 0) / 1_000_000_000;
        const pnlSol = calcPnlSol(receivedSol, position.costBasisSol);

        this.storage.recordTrade({
          mode,
          mint: position.mint,
          symbol: position.symbol,
          side: 'SELL',
          strategySet: position.strategySet,
          confidence: null,
          amountSol: receivedSol,
          qtyRaw: position.qtyRaw,
          priceImpactBps: exitPlan.priceImpactBps,
          instantLossBps: null,
          eqs: null,
          status: exitResult.status,
          reason,
          txSig: exitResult.txSig,
          pnlSol,
          metadata: {
            currentValueSol,
            costBasisSol: position.costBasisSol,
            pnlPct,
          },
        });

        this.storage.removePosition(position.mint);
        performanceGuard.registerTradeResult(pnlSol);
        riskGovernor.onTradeClosed({ mint: position.mint, pnlSol });

        closes.push({
          mint: position.mint,
          symbol: position.symbol,
          pnlSol,
          reason,
          mode,
        });

        this.logger.info('position.closed', {
          mint: position.mint,
          symbol: position.symbol,
          pnlSol,
          reason,
          mode,
        });
      } catch (error) {
        this.logger.warn('position.evaluate_failed', {
          mint: position.mint,
          error: error.message,
        });
      }
    }

    return closes;
  }
}
