import { Connection } from '@solana/web3.js';

export class RpcManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.endpoints = config.network.rpcEndpoints;
    this.failureThreshold = config.network.failoverFailureThreshold;
    this.cooldownMs = config.network.failoverCooldownMs;
    this.activeIndex = 0;
    this.failures = new Array(this.endpoints.length).fill(0);
    this.lastFailoverAt = 0;

    this.connections = this.endpoints.map((endpoint) => new Connection(endpoint, {
      commitment: config.network.confirmCommitment,
    }));
  }

  getActiveEndpoint() {
    return this.endpoints[this.activeIndex];
  }

  getConnection() {
    return this.connections[this.activeIndex];
  }

  markSuccess() {
    this.failures[this.activeIndex] = 0;
  }

  markFailure(error) {
    this.failures[this.activeIndex] += 1;
    const failCount = this.failures[this.activeIndex];

    this.logger.warn('rpc.failure', {
      endpoint: this.getActiveEndpoint(),
      failCount,
      error: error?.message || 'unknown',
    });

    if (failCount < this.failureThreshold) return;

    const now = Date.now();
    if (now - this.lastFailoverAt < this.cooldownMs) return;

    const previous = this.activeIndex;
    this.activeIndex = (this.activeIndex + 1) % this.endpoints.length;
    this.lastFailoverAt = now;

    this.logger.warn('rpc.failover', {
      from: this.endpoints[previous],
      to: this.endpoints[this.activeIndex],
    });
  }

  async withConnection(fn) {
    const tried = new Set();

    for (let attempt = 0; attempt < this.connections.length; attempt += 1) {
      const index = this.activeIndex;
      if (tried.has(index)) break;
      tried.add(index);

      try {
        const result = await fn(this.connections[index]);
        this.markSuccess();
        return result;
      } catch (error) {
        this.markFailure(error);
      }
    }

    throw new Error('RPC failover exhausted across all providers');
  }

  async healthCheck() {
    try {
      const slot = await this.getConnection().getSlot();
      this.markSuccess();
      return {
        ok: true,
        endpoint: this.getActiveEndpoint(),
        slot,
      };
    } catch (error) {
      this.markFailure(error);
      return {
        ok: false,
        endpoint: this.getActiveEndpoint(),
        error: error.message,
      };
    }
  }

  status() {
    return {
      activeEndpoint: this.getActiveEndpoint(),
      failCounts: this.failures.slice(),
      lastFailoverAt: this.lastFailoverAt,
    };
  }
}
