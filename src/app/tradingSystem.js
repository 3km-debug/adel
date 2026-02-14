import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/loadConfig.js';
import { Logger } from '../utils/logger.js';
import { sleep, utcDateKey } from '../utils/time.js';
import { Storage } from '../storage/database.js';
import { RpcManager } from '../data/rpcManager.js';
import { JupiterClient } from '../data/jupiterClient.js';
import { MarketDataClient } from '../data/marketDataClient.js';
import { TokenInspector } from '../watchlist/tokenInspector.js';
import { TokenWatchlist } from '../watchlist/tokenWatchlist.js';
import { MarketRegimeDetector } from '../mrd/marketRegimeDetector.js';
import { PortfolioEngine } from '../strategies/portfolioEngine.js';
import { Verifier } from '../verifier/verifier.js';
import { RiskGovernor } from '../risk/riskGovernor.js';
import { CapitalAllocator } from '../allocation/capitalAllocator.js';
import { WalletProvider } from '../security/walletProvider.js';
import { ExecutionIntelligence } from '../execution/executionIntelligence.js';
import { PositionManager } from '../positions/positionManager.js';
import { SelfEvaluationLoop } from '../evaluation/selfEvaluationLoop.js';
import { PerformanceGuard } from '../risk/performanceGuard.js';
import { StrategyGovernance } from '../governance/strategyGovernance.js';
import { TelegramBotInterface } from '../telegram/telegramBot.js';
import { HealthMonitor } from '../health/healthMonitor.js';
import { ReportGenerator } from '../reports/reportGenerator.js';
import { ControlPlane } from './controlPlane.js';

function ensureRuntimeDirs(config) {
  const dirs = [
    path.dirname(config.storage.dbPath),
    config.storage.backupsDir,
    config.storage.reportsDir,
    path.dirname(config.storage.healthFile),
    path.dirname(config.wallet.encryptedKeyPath),
    path.dirname(config.watchlist.manualFile),
    'storage/logs',
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.resolve(dir), { recursive: true });
  }

  const watchlistPath = path.resolve(config.watchlist.manualFile);
  if (!fs.existsSync(watchlistPath)) {
    fs.writeFileSync(watchlistPath, JSON.stringify({
      tokens: [],
      notes: 'Add Solana mint addresses to activate scanning candidates.',
    }, null, 2));
  }
}

export class TradingSystem {
  constructor(configPath) {
    this.config = loadConfig(configPath);
    ensureRuntimeDirs(this.config);

    this.logger = new Logger({
      logDir: 'storage/logs',
      level: process.env.LOG_LEVEL || 'info',
      consoleEnabled: true,
    });

    this.storage = new Storage(this.config, this.logger);
    this.controlPlane = new ControlPlane(this.storage);

    this.rpcManager = new RpcManager(this.config, this.logger);
    this.jupiterClient = new JupiterClient(this.config, this.logger);
    this.marketDataClient = new MarketDataClient(this.config, this.logger);
    this.tokenInspector = new TokenInspector(this.rpcManager, this.logger);
    this.watchlist = new TokenWatchlist({
      config: this.config,
      logger: this.logger,
      marketDataClient: this.marketDataClient,
      tokenInspector: this.tokenInspector,
    });

    this.mrd = new MarketRegimeDetector(this.config);
    this.governance = new StrategyGovernance(this.config, this.storage, this.logger);
    this.portfolioEngine = new PortfolioEngine(this.config);
    this.verifier = new Verifier(this.config);
    this.riskGovernor = new RiskGovernor(this.config, this.storage, this.logger);
    this.capitalAllocator = new CapitalAllocator(this.config);
    this.walletProvider = new WalletProvider(this.config, this.logger);
    this.execution = new ExecutionIntelligence({
      config: this.config,
      logger: this.logger,
      jupiterClient: this.jupiterClient,
      rpcManager: this.rpcManager,
      walletProvider: this.walletProvider,
    });
    this.positionManager = new PositionManager({
      config: this.config,
      storage: this.storage,
      logger: this.logger,
      execution: this.execution,
    });

    this.selfEvaluation = new SelfEvaluationLoop({
      config: this.config,
      storage: this.storage,
      logger: this.logger,
    });

    this.performanceGuard = new PerformanceGuard(this.config, this.storage, this.logger);
    this.healthMonitor = new HealthMonitor({ config: this.config, rpcManager: this.rpcManager, logger: this.logger });
    this.reportGenerator = new ReportGenerator({ config: this.config, storage: this.storage, logger: this.logger });

    this.telegram = new TelegramBotInterface({
      config: this.config,
      logger: this.logger,
      handlers: {
        getStatus: async () => this.formatStatusMessage(),
        onPause: () => this.controlPlane.pauseIndefinitely(),
        onResume: () => this.controlPlane.resume(),
        onShadowOn: () => this.governance.setGlobalShadow(true),
        onShadowOff: () => this.governance.setGlobalShadow(false),
        onEmergencyStop: () => this.controlPlane.setEmergencyStop(true),
        onClearEmergency: () => this.controlPlane.setEmergencyStop(false),
      },
    });

    this.running = false;
    this.lastStatusBroadcastAt = 0;
    this.lastReportedDate = null;
  }

  getPortfolioState() {
    const openPositions = this.storage.listOpenPositions();
    const exposureSol = this.storage.getOpenExposureSol();
    const totalPnlSol = this.storage.getTotalPnlSol();
    const dailyPnlSol = this.storage.getDailyPnlSol(utcDateKey());
    const equitySol = this.config.allocation.baseCapitalSol + totalPnlSol;

    return {
      openPositions: openPositions.length,
      exposureSol,
      totalPnlSol,
      dailyPnlSol,
      equitySol,
    };
  }

  async formatStatusMessage() {
    const controls = this.controlPlane.snapshot();
    const portfolio = this.getPortfolioState();
    const guard = this.performanceGuard.evaluate();
    const gov = this.governance.summary();

    return [
      `Bot: ${this.config.system.name}`,
      `Global shadow: ${gov.globalShadow}`,
      `Live trading enabled: ${this.config.system.liveTradingEnabled}`,
      `Emergency stop: ${controls.emergencyStop}`,
      `Paused: ${Date.now() < controls.pauseUntilMs}`,
      `Open positions: ${portfolio.openPositions}`,
      `Exposure (SOL): ${portfolio.exposureSol.toFixed(4)}`,
      `Daily PnL (SOL): ${portfolio.dailyPnlSol.toFixed(4)}`,
      `Total PnL (SOL): ${portfolio.totalPnlSol.toFixed(4)}`,
      `Drawdown: ${(guard.drawdownPct * 100).toFixed(2)}%`,
      `RPC endpoint: ${this.rpcManager.getActiveEndpoint()}`,
    ].join('\n');
  }

  isEntryBlocked(controls, guardState) {
    if (controls.emergencyStop) return true;
    if (Date.now() < controls.pauseUntilMs) return true;
    if (guardState.paused) return true;
    return false;
  }

  async maybeBroadcastStatus() {
    const now = Date.now();
    if (now - this.lastStatusBroadcastAt < this.config.system.statusBroadcastIntervalMs) return;
    this.lastStatusBroadcastAt = now;
    if (!this.config.telegram.enabled) return;
    await this.telegram.sendMessage(await this.formatStatusMessage());
  }

  maybeGenerateDailyReport() {
    const now = new Date();
    const date = utcDateKey();
    const hour = now.getUTCHours();

    if (hour < this.config.reports.dailyReportHourUtc) return;
    if (this.lastReportedDate === date) return;

    this.reportGenerator.generateDailyReport(date);
    this.lastReportedDate = date;
  }

  async processEntries({ controls, guardState, regime, tradableCandidates }) {
    if (this.isEntryBlocked(controls, guardState)) {
      return {
        blocked: true,
        reason: controls.emergencyStop ? 'emergency_stop' : 'paused',
        entries: [],
      };
    }

    const intents = this.portfolioEngine.buildIntents(tradableCandidates, regime, this.governance);
    const entries = [];

    for (const intent of intents) {
      const verification = this.verifier.verifyIntent(intent);
      if (!verification.approved) {
        this.storage.recordEvent({
          type: 'intent_rejected_verifier',
          severity: 'info',
          payload: {
            mint: intent.mint,
            reasons: verification.reasons,
          },
        });
        continue;
      }

      const portfolioState = this.getPortfolioState();
      this.performanceGuard.updateEquity(portfolioState.equitySol);

      const allocation = this.capitalAllocator.allocate(intent, portfolioState);
      if (allocation.amountSol <= 0) {
        continue;
      }

      let plan;
      try {
        plan = await this.execution.planEntry({ intent, allocation });
      } catch (error) {
        this.performanceGuard.registerOrderFailure();
        this.logger.warn('entry.plan_failed', {
          mint: intent.mint,
          error: error.message,
        });
        continue;
      }

      const riskDecision = this.riskGovernor.evaluate({
        nowMs: Date.now(),
        controls,
        intent,
        allocation,
        portfolio: {
          openPositions: portfolioState.openPositions,
          exposureSol: portfolioState.exposureSol,
          equitySol: portfolioState.equitySol,
        },
        performance: {
          dailyPnlSol: portfolioState.dailyPnlSol,
          drawdownPct: guardState.drawdownPct,
          consecutiveLosses: guardState.consecutiveLosses,
        },
        quoteMetrics: {
          priceImpactBps: plan.roundTrip.priceImpactBps,
          instantLossBps: plan.roundTrip.instantLossBps,
        },
      });

      if (!riskDecision.allowed) {
        this.storage.recordEvent({
          type: 'intent_blocked_risk',
          severity: 'warn',
          payload: {
            mint: intent.mint,
            reasons: riskDecision.reasons,
          },
        });
        continue;
      }

      const result = await this.execution.executeEntry(plan);
      this.performanceGuard.registerExecutionTelemetry({
        latencyMs: plan.roundTrip.quoteLatencyMs,
        eqs: plan.eqs,
      });

      if (!result.ok) {
        this.performanceGuard.registerOrderFailure();
        this.storage.recordTrade({
          mode: plan.mode,
          mint: intent.mint,
          symbol: intent.symbol,
          side: 'BUY',
          strategySet: intent.signals.map((s) => s.strategyId),
          confidence: intent.aggregateConfidence,
          amountSol: allocation.amountSol,
          qtyRaw: null,
          priceImpactBps: plan.roundTrip.priceImpactBps,
          instantLossBps: plan.roundTrip.instantLossBps,
          eqs: plan.eqs,
          status: result.status,
          reason: result.reason,
          txSig: null,
          metadata: {
            verification,
            riskDecision,
          },
        });

        continue;
      }

      this.positionManager.openPositionFromEntry(plan, result);
      entries.push({
        mint: intent.mint,
        symbol: intent.symbol,
        amountSol: allocation.amountSol,
        mode: result.mode,
        eqs: plan.eqs,
      });

      if (this.config.telegram.enabled && this.config.telegram.alerts.onTrade) {
        await this.telegram.sendMessage(
          `ENTRY ${intent.symbol} (${intent.mint})\nmode=${result.mode}\nsize=${allocation.amountSol.toFixed(4)} SOL\neqs=${plan.eqs}`,
        );
      }
    }

    return { blocked: false, entries };
  }

  async tick() {
    const controls = this.controlPlane.snapshot();
    const portfolio = this.getPortfolioState();
    this.performanceGuard.updateEquity(portfolio.equitySol);

    const guardState = this.performanceGuard.evaluate();
    if (guardState.paused && controls.pauseUntilMs < guardState.pauseUntilMs) {
      this.controlPlane.pauseUntil(guardState.pauseUntilMs);
    }

    const closed = await this.positionManager.evaluateOpenPositions({
      performanceGuard: this.performanceGuard,
      riskGovernor: this.riskGovernor,
    });

    if (closed.length > 0 && this.config.telegram.enabled && this.config.telegram.alerts.onTrade) {
      for (const close of closed) {
        await this.telegram.sendMessage(
          `EXIT ${close.symbol} (${close.mint})\nmode=${close.mode}\npnl=${close.pnlSol.toFixed(4)} SOL\nreason=${close.reason}`,
        );
      }
    }

    const scan = await this.watchlist.scanTradableCandidates();
    const regime = this.mrd.detect(scan.tradable);
    const entryResult = await this.processEntries({
      controls: this.controlPlane.snapshot(),
      guardState: this.performanceGuard.evaluate(),
      regime,
      tradableCandidates: scan.tradable,
    });

    const strategyStats = this.selfEvaluation.run();
    this.governance.applyEvaluation(strategyStats);

    const status = {
      controls: this.controlPlane.snapshot(),
      guard: this.performanceGuard.evaluate(),
      governance: this.governance.summary(),
      regime,
      portfolio: this.getPortfolioState(),
      scannedCandidates: scan.scanned.length,
      tradableCandidates: scan.tradable.length,
      entryBlocked: entryResult.blocked,
      entries: entryResult.entries?.length || 0,
      closes: closed.length,
      rpc: this.rpcManager.status(),
    };

    this.storage.recordEvent({
      type: 'tick_summary',
      severity: 'info',
      payload: status,
    });

    await this.healthMonitor.write(status);
    await this.maybeBroadcastStatus();
    this.maybeGenerateDailyReport();
  }

  async start() {
    if (this.running) return;
    this.running = true;

    this.logger.info('system.start', {
      config: {
        name: this.config.system.name,
        shadowMode: this.config.system.shadowMode,
        liveTradingEnabled: this.config.system.liveTradingEnabled,
        rpcEndpoints: this.config.network.rpcEndpoints.length,
      },
      reliabilityNotice: this.config.features.experimentalSignalFusionReason,
    });

    if (this.config.telegram.enabled) {
      this.telegram.start().catch((error) => {
        this.logger.error('telegram.start_failed', { error: error.message });
      });
    }

    while (this.running) {
      const startedAt = Date.now();
      try {
        await this.tick();
      } catch (error) {
        this.logger.error('system.tick_error', { error: error.message, stack: error.stack });
      }

      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(250, this.config.system.loopIntervalMs - elapsed);
      await sleep(waitMs);
    }
  }

  async stop() {
    this.running = false;
    this.telegram.stop();
    this.storage.close();
  }
}
