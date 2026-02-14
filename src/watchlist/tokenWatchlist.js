import fs from 'node:fs';
import path from 'node:path';
import { evaluateAntiScamGate } from './antiScamGate.js';

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function readManualWatchlist(filePath) {
  const target = path.resolve(filePath);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ tokens: [] }, null, 2));
  }

  const payload = JSON.parse(fs.readFileSync(target, 'utf8'));

  if (Array.isArray(payload)) {
    return payload.map((x) => (typeof x === 'string' ? x : x?.mint)).filter(Boolean);
  }

  if (Array.isArray(payload?.tokens)) {
    return payload.tokens
      .map((x) => (typeof x === 'string' ? x : x?.mint))
      .filter(Boolean);
  }

  return [];
}

export class TokenWatchlist {
  constructor({ config, logger, marketDataClient, tokenInspector }) {
    this.config = config;
    this.logger = logger;
    this.marketDataClient = marketDataClient;
    this.tokenInspector = tokenInspector;
  }

  async loadCandidateMints() {
    const manual = readManualWatchlist(this.config.watchlist.manualFile);
    const birdeye = await this.marketDataClient.fetchBirdeyeTrendingMints(this.config.watchlist.scanLimit);
    return uniq([...manual, ...birdeye]).slice(0, this.config.watchlist.scanLimit);
  }

  async enrichCandidate(mint) {
    const [mintInfo, market] = await Promise.all([
      this.tokenInspector.inspectMint(mint),
      this.marketDataClient.fetchTokenSnapshot(mint),
    ]);

    const now = Date.now();
    const pairCreatedAtMs = market?.pairCreatedAtMs || 0;
    const ageHours = pairCreatedAtMs > 0 ? (now - pairCreatedAtMs) / 3_600_000 : null;

    const spreadBps = market?.buyTx24h + market?.sellTx24h > 0
      ? Math.max(20, Math.round(80 + (1 / Math.max(1, market.buyTx24h + market.sellTx24h)) * 10_000))
      : null;

    return {
      mint,
      symbol: market?.symbol || 'UNKNOWN',
      name: market?.name || '',
      exists: mintInfo.exists,
      tokenProgram: mintInfo.tokenProgram,
      isToken2022: mintInfo.isToken2022,
      freezeAuthority: mintInfo.freezeAuthority,
      mintAuthority: mintInfo.mintAuthority,
      isVerified: Boolean(market?.dexId),
      liquidityUsd: market?.liquidityUsd,
      volume24hUsd: market?.volume24hUsd,
      holders: null,
      ageHours,
      spreadBps,
      priceUsd: market?.priceUsd,
      priceChangeM5: market?.priceChangeM5,
      priceChangeH1: market?.priceChangeH1,
      priceChangeH24: market?.priceChangeH24,
      buyTx24h: market?.buyTx24h,
      sellTx24h: market?.sellTx24h,
      pairAddress: market?.pairAddress,
      source: market ? 'dexscreener' : 'manual',
    };
  }

  async scanTradableCandidates() {
    const mints = await this.loadCandidateMints();
    const results = [];

    for (const mint of mints) {
      const enriched = await this.enrichCandidate(mint);
      const gate = evaluateAntiScamGate(enriched, this.config);

      results.push({
        ...enriched,
        gate,
      });

      if (!gate.allowed) {
        this.logger.info('watchlist.candidate_rejected', {
          mint,
          symbol: enriched.symbol,
          reasons: gate.reasons,
        });
      }
    }

    const tradable = results
      .filter((item) => item.gate.allowed)
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0))
      .slice(0, this.config.portfolio.maxCandidatesPerLoop);

    return {
      scanned: results,
      tradable,
    };
  }
}
