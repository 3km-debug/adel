import { VersionedTransaction } from '@solana/web3.js';
import { scoreExecutionQuality } from './eqs.js';
import { parsePriceImpactBps, lamportsToSol, computeInstantLossBps } from '../risk/metrics.js';
import { sleep } from '../utils/time.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function escalatedValue(base, step, max, attempt) {
  const raw = Number(base || 0) + Number(step || 0) * Number(attempt || 0);
  return Math.round(Math.min(Math.max(0, raw), Math.max(0, Number(max || 0))));
}

export class ExecutionIntelligence {
  constructor({ config, logger, jupiterClient, rpcManager, walletProvider }) {
    this.config = config;
    this.logger = logger;
    this.jupiter = jupiterClient;
    this.rpcManager = rpcManager;
    this.walletProvider = walletProvider;
  }

  async quoteRoundTrip({ mint, amountSol }) {
    const amountLamports = Math.floor(amountSol * 1_000_000_000);

    const buyQuote = await this.jupiter.quote({
      inputMint: SOL_MINT,
      outputMint: mint,
      amountRaw: amountLamports,
      slippageBps: this.config.execution.baseSlippageBps,
    });

    const buyOutRaw = buyQuote?.outAmount;
    if (!buyOutRaw) {
      throw new Error('Buy quote missing outAmount');
    }

    const sellQuote = await this.jupiter.quote({
      inputMint: mint,
      outputMint: SOL_MINT,
      amountRaw: buyOutRaw,
      slippageBps: this.config.execution.baseSlippageBps,
    });

    const priceImpactBps = parsePriceImpactBps(buyQuote?.priceImpactPct);
    const expectedOutSol = lamportsToSol(sellQuote?.outAmount);
    const instantLossBps = computeInstantLossBps(amountSol, expectedOutSol);

    const routeHops = Array.isArray(buyQuote?.routePlan) ? buyQuote.routePlan.length : 1;

    return {
      buyQuote,
      sellQuote,
      amountLamports,
      buyOutRaw,
      priceImpactBps,
      instantLossBps,
      expectedOutSol,
      routeHops,
      quoteLatencyMs: buyQuote?._meta?.latencyMs || 0,
    };
  }

  scoreEntryQuality({ intent, roundTrip }) {
    const eqs = scoreExecutionQuality({
      priceImpactBps: roundTrip.priceImpactBps,
      maxPriceImpactBps: this.config.risk.maxPriceImpactBps,
      quoteLatencyMs: roundTrip.quoteLatencyMs,
      maxLatencyMs: this.config.performanceGuard.maxMedianLatencyMs,
      routeHops: roundTrip.routeHops,
      liquidityUsd: Number(intent.candidate.liquidityUsd || 0),
      minRouteLiquidityUsd: this.config.execution.minRouteLiquidityUsd,
      spreadBps: Number(intent.candidate.spreadBps || this.config.watchlist.maxSpreadBps),
      maxSpreadBps: this.config.watchlist.maxSpreadBps,
    });

    return eqs;
  }

  async planEntry({ intent, allocation }) {
    const roundTrip = await this.quoteRoundTrip({
      mint: intent.mint,
      amountSol: allocation.amountSol,
    });

    const eqs = this.scoreEntryQuality({ intent, roundTrip });

    return {
      intent,
      allocation,
      roundTrip,
      eqs,
      mode: intent.allShadow || this.config.system.shadowMode ? 'shadow' : 'live',
    };
  }

  async executeEntry(plan) {
    if (plan.eqs < this.config.execution.minExecutionQualityScore) {
      return {
        ok: false,
        status: 'rejected',
        reason: 'eqs_below_threshold',
        eqs: plan.eqs,
      };
    }

    if (plan.mode === 'shadow' || !this.config.system.liveTradingEnabled) {
      return {
        ok: true,
        status: 'shadow_filled',
        mode: 'shadow',
        outAmountRaw: plan.roundTrip.buyOutRaw,
        txSig: null,
      };
    }

    const wallet = this.walletProvider.loadForRuntime();

    for (let attempt = 0; attempt <= this.config.execution.maxRetries; attempt += 1) {
      const slippageBps = escalatedValue(
        this.config.execution.baseSlippageBps,
        this.config.execution.slippageStepBps,
        this.config.execution.maxSlippageBps,
        attempt,
      );

      const priorityFee = escalatedValue(
        this.config.execution.priorityFeeMicrolamportsBase,
        this.config.execution.priorityFeeMicrolamportsStep,
        this.config.execution.priorityFeeMicrolamportsMax,
        attempt,
      );

      try {
        const refreshedQuote = await this.jupiter.quote({
          inputMint: SOL_MINT,
          outputMint: plan.intent.mint,
          amountRaw: plan.roundTrip.amountLamports,
          slippageBps,
        });

        const swapPayload = await this.jupiter.buildSwapTx({
          quoteResponse: refreshedQuote,
          userPublicKey: wallet.publicKey.toBase58(),
          slippageBps,
          priorityFeeMicrolamports: priorityFee,
        });

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapPayload.swapTransaction, 'base64'));
        transaction.sign([wallet]);
        const rawTx = transaction.serialize();

        const signature = await this.rpcManager.withConnection(async (connection) => {
          const sig = await connection.sendRawTransaction(rawTx, {
            skipPreflight: false,
            maxRetries: 2,
          });
          await connection.confirmTransaction(sig, this.config.network.confirmCommitment);
          return sig;
        });

        return {
          ok: true,
          status: 'live_filled',
          mode: 'live',
          outAmountRaw: refreshedQuote.outAmount,
          txSig: signature,
          slippageBps,
          priorityFee,
        };
      } catch (error) {
        const retryable = attempt < this.config.execution.maxRetries;
        this.logger.warn('execution.entry_attempt_failed', {
          mint: plan.intent.mint,
          attempt,
          retryable,
          error: error.message,
        });

        if (!retryable) {
          return {
            ok: false,
            status: 'failed',
            reason: 'live_entry_execution_failed',
            error: error.message,
          };
        }

        await sleep(this.config.execution.retryBackoffMs * (2 ** attempt));
      }
    }

    return {
      ok: false,
      status: 'failed',
      reason: 'unexpected_execution_path',
    };
  }

  async planExit(position) {
    const sellQuote = await this.jupiter.quote({
      inputMint: position.mint,
      outputMint: SOL_MINT,
      amountRaw: position.qtyRaw,
      slippageBps: this.config.execution.baseSlippageBps,
    });

    return {
      position,
      sellQuote,
      expectedOutSol: lamportsToSol(sellQuote.outAmount),
      priceImpactBps: parsePriceImpactBps(sellQuote.priceImpactPct),
    };
  }

  async executeExit(plan, mode = 'shadow') {
    if (mode === 'shadow' || !this.config.system.liveTradingEnabled) {
      return {
        ok: true,
        status: 'shadow_filled',
        txSig: null,
        outAmountRaw: plan.sellQuote.outAmount,
      };
    }

    const wallet = this.walletProvider.loadForRuntime();

    for (let attempt = 0; attempt <= this.config.execution.maxRetries; attempt += 1) {
      const slippageBps = escalatedValue(
        this.config.execution.baseSlippageBps,
        this.config.execution.slippageStepBps,
        this.config.execution.maxSlippageBps,
        attempt,
      );

      const priorityFee = escalatedValue(
        this.config.execution.priorityFeeMicrolamportsBase,
        this.config.execution.priorityFeeMicrolamportsStep,
        this.config.execution.priorityFeeMicrolamportsMax,
        attempt,
      );

      try {
        const refreshedQuote = await this.jupiter.quote({
          inputMint: plan.position.mint,
          outputMint: SOL_MINT,
          amountRaw: plan.position.qtyRaw,
          slippageBps,
        });

        const swapPayload = await this.jupiter.buildSwapTx({
          quoteResponse: refreshedQuote,
          userPublicKey: wallet.publicKey.toBase58(),
          slippageBps,
          priorityFeeMicrolamports: priorityFee,
        });

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapPayload.swapTransaction, 'base64'));
        transaction.sign([wallet]);

        const signature = await this.rpcManager.withConnection(async (connection) => {
          const sig = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 2,
          });
          await connection.confirmTransaction(sig, this.config.network.confirmCommitment);
          return sig;
        });

        return {
          ok: true,
          status: 'live_filled',
          txSig: signature,
          outAmountRaw: refreshedQuote.outAmount,
        };
      } catch (error) {
        const retryable = attempt < this.config.execution.maxRetries;
        this.logger.warn('execution.exit_attempt_failed', {
          mint: plan.position.mint,
          attempt,
          retryable,
          error: error.message,
        });

        if (!retryable) {
          return {
            ok: false,
            status: 'failed',
            reason: 'live_exit_execution_failed',
            error: error.message,
          };
        }

        await sleep(this.config.execution.retryBackoffMs * (2 ** attempt));
      }
    }

    return {
      ok: false,
      status: 'failed',
      reason: 'unexpected_exit_path',
    };
  }
}

export { SOL_MINT };
