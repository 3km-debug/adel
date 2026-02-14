import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { nowIso } from '../utils/time.js';

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export class Storage {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    ensureParentDir(config.storage.dbPath);
    this.db = new Database(path.resolve(config.storage.dbPath));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        mode TEXT NOT NULL,
        mint TEXT NOT NULL,
        symbol TEXT,
        side TEXT NOT NULL,
        strategy_set TEXT,
        confidence REAL,
        amount_sol REAL,
        qty_raw TEXT,
        price_impact_bps INTEGER,
        instant_loss_bps INTEGER,
        eqs REAL,
        status TEXT NOT NULL,
        reason TEXT,
        tx_sig TEXT,
        pnl_sol REAL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades(ts);
      CREATE INDEX IF NOT EXISTS idx_trades_mint ON trades(mint);

      CREATE TABLE IF NOT EXISTS positions (
        mint TEXT PRIMARY KEY,
        symbol TEXT,
        qty_raw TEXT NOT NULL,
        qty_decimals INTEGER NOT NULL,
        cost_basis_sol REAL NOT NULL,
        amount_sol REAL NOT NULL,
        strategy_set TEXT,
        opened_at TEXT NOT NULL,
        highest_value_sol REAL NOT NULL,
        stop_loss_sol REAL,
        take_profit_sol REAL,
        trailing_stop_sol REAL,
        mode TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        payload TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

      CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS strategy_stats (
        strategy_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        total_trades INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        pnl_sol REAL NOT NULL DEFAULT 0,
        max_drawdown_pct REAL NOT NULL DEFAULT 0,
        shadow_trades INTEGER NOT NULL DEFAULT 0,
        live_trades INTEGER NOT NULL DEFAULT 0,
        first_trade_ts TEXT,
        last_trade_ts TEXT
      );

      CREATE TABLE IF NOT EXISTS equity_snapshots (
        ts TEXT PRIMARY KEY,
        equity_sol REAL NOT NULL,
        exposure_sol REAL NOT NULL,
        drawdown_pct REAL NOT NULL
      );
    `);
  }

  close() {
    this.db.close();
  }

  recordEvent({ type, severity = 'info', payload = {} }) {
    const stmt = this.db.prepare(`
      INSERT INTO events (ts, type, severity, payload)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(nowIso(), type, severity, JSON.stringify(payload || {}));
  }

  recordTrade(trade) {
    const stmt = this.db.prepare(`
      INSERT INTO trades (
        ts, mode, mint, symbol, side, strategy_set, confidence, amount_sol, qty_raw,
        price_impact_bps, instant_loss_bps, eqs, status, reason, tx_sig, pnl_sol, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trade.ts || nowIso(),
      trade.mode,
      trade.mint,
      trade.symbol || null,
      trade.side,
      JSON.stringify(trade.strategySet || []),
      trade.confidence ?? null,
      trade.amountSol ?? null,
      trade.qtyRaw != null ? String(trade.qtyRaw) : null,
      trade.priceImpactBps ?? null,
      trade.instantLossBps ?? null,
      trade.eqs ?? null,
      trade.status,
      trade.reason || null,
      trade.txSig || null,
      trade.pnlSol ?? null,
      JSON.stringify(trade.metadata || {}),
    );
  }

  listOpenPositions() {
    const rows = this.db.prepare('SELECT * FROM positions ORDER BY opened_at ASC').all();
    return rows.map((row) => ({
      ...row,
      qtyRaw: row.qty_raw,
      qtyDecimals: row.qty_decimals,
      costBasisSol: row.cost_basis_sol,
      amountSol: row.amount_sol,
      strategySet: parseJson(row.strategy_set, []),
      highestValueSol: row.highest_value_sol,
      stopLossSol: row.stop_loss_sol,
      takeProfitSol: row.take_profit_sol,
      trailingStopSol: row.trailing_stop_sol,
      metadata: parseJson(row.metadata, {}),
    }));
  }

  upsertPosition(position) {
    const stmt = this.db.prepare(`
      INSERT INTO positions (
        mint, symbol, qty_raw, qty_decimals, cost_basis_sol, amount_sol, strategy_set,
        opened_at, highest_value_sol, stop_loss_sol, take_profit_sol, trailing_stop_sol, mode, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mint) DO UPDATE SET
        symbol = excluded.symbol,
        qty_raw = excluded.qty_raw,
        qty_decimals = excluded.qty_decimals,
        cost_basis_sol = excluded.cost_basis_sol,
        amount_sol = excluded.amount_sol,
        strategy_set = excluded.strategy_set,
        opened_at = excluded.opened_at,
        highest_value_sol = excluded.highest_value_sol,
        stop_loss_sol = excluded.stop_loss_sol,
        take_profit_sol = excluded.take_profit_sol,
        trailing_stop_sol = excluded.trailing_stop_sol,
        mode = excluded.mode,
        metadata = excluded.metadata
    `);

    stmt.run(
      position.mint,
      position.symbol || null,
      String(position.qtyRaw),
      Number(position.qtyDecimals || 0),
      Number(position.costBasisSol || 0),
      Number(position.amountSol || 0),
      JSON.stringify(position.strategySet || []),
      position.openedAt || nowIso(),
      Number(position.highestValueSol || position.amountSol || 0),
      Number(position.stopLossSol || 0),
      Number(position.takeProfitSol || 0),
      Number(position.trailingStopSol || 0),
      position.mode || 'shadow',
      JSON.stringify(position.metadata || {}),
    );
  }

  removePosition(mint) {
    this.db.prepare('DELETE FROM positions WHERE mint = ?').run(mint);
  }

  getOpenExposureSol() {
    const row = this.db.prepare('SELECT COALESCE(SUM(amount_sol), 0) AS total FROM positions').get();
    return Number(row?.total || 0);
  }

  getDailyPnlSol(dayIsoDate) {
    const start = `${dayIsoDate}T00:00:00.000Z`;
    const end = `${dayIsoDate}T23:59:59.999Z`;
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(pnl_sol), 0) AS total
      FROM trades
      WHERE ts BETWEEN ? AND ? AND pnl_sol IS NOT NULL
    `).get(start, end);

    return Number(row?.total || 0);
  }

  getTotalPnlSol() {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(pnl_sol), 0) AS total
      FROM trades
      WHERE pnl_sol IS NOT NULL
    `).get();

    return Number(row?.total || 0);
  }

  setState(key, value) {
    this.db.prepare(`
      INSERT INTO bot_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, JSON.stringify(value ?? null), nowIso());
  }

  getState(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key);
    if (!row) return fallback;
    return parseJson(row.value, fallback);
  }

  upsertStrategyStat({ strategyId, mode, totalTrades, wins, losses, pnlSol, maxDrawdownPct, shadowTrades, liveTrades, firstTradeTs, lastTradeTs }) {
    this.db.prepare(`
      INSERT INTO strategy_stats (
        strategy_id, mode, total_trades, wins, losses, pnl_sol,
        max_drawdown_pct, shadow_trades, live_trades, first_trade_ts, last_trade_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(strategy_id) DO UPDATE SET
        mode = excluded.mode,
        total_trades = excluded.total_trades,
        wins = excluded.wins,
        losses = excluded.losses,
        pnl_sol = excluded.pnl_sol,
        max_drawdown_pct = excluded.max_drawdown_pct,
        shadow_trades = excluded.shadow_trades,
        live_trades = excluded.live_trades,
        first_trade_ts = excluded.first_trade_ts,
        last_trade_ts = excluded.last_trade_ts
    `).run(
      strategyId,
      mode,
      totalTrades,
      wins,
      losses,
      pnlSol,
      maxDrawdownPct,
      shadowTrades,
      liveTrades,
      firstTradeTs,
      lastTradeTs,
    );
  }

  getStrategyStats() {
    const rows = this.db.prepare('SELECT * FROM strategy_stats').all();
    const map = new Map();
    for (const row of rows) {
      map.set(row.strategy_id, {
        strategyId: row.strategy_id,
        mode: row.mode,
        totalTrades: row.total_trades,
        wins: row.wins,
        losses: row.losses,
        pnlSol: row.pnl_sol,
        maxDrawdownPct: row.max_drawdown_pct,
        shadowTrades: row.shadow_trades,
        liveTrades: row.live_trades,
        firstTradeTs: row.first_trade_ts,
        lastTradeTs: row.last_trade_ts,
      });
    }
    return map;
  }

  snapshotEquity({ equitySol, exposureSol, drawdownPct }) {
    this.db.prepare(`
      INSERT INTO equity_snapshots (ts, equity_sol, exposure_sol, drawdown_pct)
      VALUES (?, ?, ?, ?)
    `).run(nowIso(), equitySol, exposureSol, drawdownPct);
  }

  getRecentTrades(limit = 100) {
    return this.db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT ?').all(limit);
  }

  getTradesSince(tsIso) {
    return this.db.prepare('SELECT * FROM trades WHERE ts >= ? ORDER BY ts ASC').all(tsIso);
  }
}
