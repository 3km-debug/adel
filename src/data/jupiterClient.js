import { fetchJson } from './http.js';
import { sleep } from '../utils/time.js';

export class JupiterClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.baseUrl = config.network.jupiterBaseUrl.replace(/\/+$/, '');
    this.apiKey = config.network.jupiterApiKey;
    this.lastQuoteAt = 0;
  }

  headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    return headers;
  }

  async rateLimitDelay() {
    const minInterval = this.config.execution.quoteRateLimitMinIntervalMs;
    const now = Date.now();
    const waitMs = Math.max(0, minInterval - (now - this.lastQuoteAt));
    if (waitMs > 0) await sleep(waitMs);
    this.lastQuoteAt = Date.now();
  }

  async quote({ inputMint, outputMint, amountRaw, slippageBps }) {
    await this.rateLimitDelay();

    const url = new URL(`${this.baseUrl}/swap/v1/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', String(amountRaw));
    url.searchParams.set('slippageBps', String(slippageBps));
    url.searchParams.set('swapMode', 'ExactIn');

    const startedAt = Date.now();
    const quote = await fetchJson(url.toString(), {
      headers: this.headers(),
      timeoutMs: this.config.network.requestTimeoutMs,
    });
    const latencyMs = Date.now() - startedAt;

    return {
      ...quote,
      _meta: {
        fetchedAt: Date.now(),
        latencyMs,
      },
    };
  }

  async buildSwapTx({ quoteResponse, userPublicKey, slippageBps, priorityFeeMicrolamports }) {
    const payload = {
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: priorityFeeMicrolamports,
          priorityLevel: 'high',
        },
      },
      dynamicSlippage: {
        maxBps: slippageBps,
      },
    };

    return fetchJson(`${this.baseUrl}/swap/v1/swap`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
      timeoutMs: this.config.network.requestTimeoutMs,
    });
  }
}
