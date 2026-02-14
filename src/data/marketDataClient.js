import { fetchJson } from './http.js';
import { safeNumber } from '../utils/math.js';

function pickBestSolanaPair(pairs) {
  if (!Array.isArray(pairs)) return null;
  return pairs
    .filter((pair) => pair.chainId === 'solana')
    .sort((a, b) => safeNumber(b?.liquidity?.usd, 0) - safeNumber(a?.liquidity?.usd, 0))[0] || null;
}

function normalizeDexSnapshot(mint, pair) {
  return {
    mint,
    symbol: pair?.baseToken?.symbol || 'UNKNOWN',
    name: pair?.baseToken?.name || '',
    dexId: pair?.dexId || 'unknown',
    pairAddress: pair?.pairAddress || '',
    priceUsd: safeNumber(pair?.priceUsd, 0),
    liquidityUsd: safeNumber(pair?.liquidity?.usd, 0),
    volume24hUsd: safeNumber(pair?.volume?.h24, 0),
    buyTx24h: safeNumber(pair?.txns?.h24?.buys, 0),
    sellTx24h: safeNumber(pair?.txns?.h24?.sells, 0),
    fdvUsd: safeNumber(pair?.fdv, 0),
    pairCreatedAtMs: safeNumber(pair?.pairCreatedAt, 0),
    priceChangeM5: safeNumber(pair?.priceChange?.m5, 0) / 100,
    priceChangeH1: safeNumber(pair?.priceChange?.h1, 0) / 100,
    priceChangeH6: safeNumber(pair?.priceChange?.h6, 0) / 100,
    priceChangeH24: safeNumber(pair?.priceChange?.h24, 0) / 100,
  };
}

export class MarketDataClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async fetchTokenSnapshot(mint) {
    if (!this.config.watchlist.enableDexScreener) {
      return null;
    }

    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
      const payload = await fetchJson(url, {
        timeoutMs: this.config.network.requestTimeoutMs,
      });
      const pair = pickBestSolanaPair(payload?.pairs);
      if (!pair) return null;
      return normalizeDexSnapshot(mint, pair);
    } catch (error) {
      this.logger.warn('market.dexscreener_error', {
        mint,
        error: error.message,
      });
      return null;
    }
  }

  async fetchBirdeyeTrendingMints(limit = 20) {
    if (!this.config.watchlist.enableBirdeye || !this.config.watchlist.birdeyeApiKey) {
      return [];
    }

    try {
      const url = new URL('https://public-api.birdeye.so/defi/token_trending');
      url.searchParams.set('sort_by', 'rank');
      url.searchParams.set('sort_type', 'asc');
      url.searchParams.set('offset', '0');
      url.searchParams.set('limit', String(limit));

      const payload = await fetchJson(url.toString(), {
        timeoutMs: this.config.network.requestTimeoutMs,
        headers: {
          'X-API-KEY': this.config.watchlist.birdeyeApiKey,
          'x-chain': 'solana',
        },
      });

      const tokens = payload?.data?.tokens || payload?.data || [];
      if (!Array.isArray(tokens)) return [];

      return tokens
        .map((token) => token.address || token.mint || token.tokenAddress)
        .filter(Boolean);
    } catch (error) {
      this.logger.warn('market.birdeye_error', { error: error.message });
      return [];
    }
  }
}
