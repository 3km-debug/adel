import { median } from '../utils/math.js';
import { minutesToMs } from '../utils/time.js';

export class PerformanceGuard {
  constructor(config, storage, logger) {
    this.config = config;
    this.storage = storage;
    this.logger = logger;
    this.state = storage.getState('performanceGuardState', {
      equityPeakSol: 0,
      currentEquitySol: 0,
      drawdownPct: 0,
      consecutiveLosses: 0,
      orderFailureTimestamps: [],
      latencyMsWindow: [],
      eqsWindow: [],
      pauseUntilMs: 0,
      circuitBreakerReason: null,
      lastUpdateTs: null,
    });
  }

  persist() {
    this.storage.setState('performanceGuardState', this.state);
  }

  updateEquity(equitySol) {
    const equity = Number(equitySol || 0);
    this.state.currentEquitySol = equity;
    this.state.equityPeakSol = Math.max(this.state.equityPeakSol || equity, equity);

    if (this.state.equityPeakSol > 0) {
      this.state.drawdownPct = (this.state.equityPeakSol - equity) / this.state.equityPeakSol;
    }

    this.state.lastUpdateTs = new Date().toISOString();
    this.persist();
  }

  registerTradeResult(pnlSol) {
    const pnl = Number(pnlSol || 0);
    if (pnl < 0) {
      this.state.consecutiveLosses += 1;
    } else if (pnl > 0) {
      this.state.consecutiveLosses = 0;
    }
    this.persist();
  }

  registerOrderFailure() {
    const now = Date.now();
    this.state.orderFailureTimestamps.push(now);
    const windowStart = now - minutesToMs(this.config.performanceGuard.failureWindowMinutes);
    this.state.orderFailureTimestamps = this.state.orderFailureTimestamps.filter((t) => t >= windowStart);
    this.persist();
  }

  registerExecutionTelemetry({ latencyMs, eqs }) {
    if (Number.isFinite(latencyMs)) {
      this.state.latencyMsWindow.push(latencyMs);
      if (this.state.latencyMsWindow.length > 200) this.state.latencyMsWindow.shift();
    }
    if (Number.isFinite(eqs)) {
      this.state.eqsWindow.push(eqs);
      if (this.state.eqsWindow.length > 200) this.state.eqsWindow.shift();
    }
    this.persist();
  }

  triggerPause(reason, minutes) {
    const untilMs = Date.now() + minutesToMs(minutes);
    if (untilMs > this.state.pauseUntilMs) {
      this.state.pauseUntilMs = untilMs;
      this.state.circuitBreakerReason = reason;
      this.logger.error('guard.circuit_breaker_triggered', {
        reason,
        pauseUntil: new Date(untilMs).toISOString(),
      });
      this.persist();
    }
  }

  clearPause() {
    this.state.pauseUntilMs = 0;
    this.state.circuitBreakerReason = null;
    this.persist();
  }

  evaluate() {
    const warnings = [];

    if (!this.config.performanceGuard.enabled) {
      return {
        paused: false,
        pauseUntilMs: 0,
        reason: null,
        warnings,
      };
    }

    if (this.state.drawdownPct >= this.config.performanceGuard.maxDrawdownPct) {
      this.triggerPause('drawdown_breach', this.config.performanceGuard.pauseMinutesOnDrawdownBreach);
    }

    if (this.state.orderFailureTimestamps.length >= this.config.performanceGuard.maxOrderFailuresInWindow) {
      this.triggerPause('order_failures_breach', this.config.performanceGuard.pauseMinutesOnDrawdownBreach);
    }

    const medianLatency = median(this.state.latencyMsWindow);
    if (medianLatency > this.config.performanceGuard.maxMedianLatencyMs) {
      warnings.push('latency_above_threshold');
    }

    const rollingEqs = median(this.state.eqsWindow);
    if (rollingEqs > 0 && rollingEqs < this.config.performanceGuard.minRollingEqs) {
      warnings.push('rolling_eqs_below_threshold');
    }

    return {
      paused: Date.now() < this.state.pauseUntilMs,
      pauseUntilMs: this.state.pauseUntilMs,
      reason: this.state.circuitBreakerReason,
      warnings,
      drawdownPct: this.state.drawdownPct,
      consecutiveLosses: this.state.consecutiveLosses,
      medianLatency,
      rollingEqs,
    };
  }
}
