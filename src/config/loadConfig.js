import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { DEFAULT_CONFIG } from './defaults.js';
import { deepMerge } from '../utils/deepMerge.js';
import { safeNumber } from '../utils/math.js';

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function envBool(key) {
  const raw = process.env[key];
  if (raw == null || raw === '') return undefined;
  return String(raw).toLowerCase() === 'true';
}

function envNum(key) {
  const raw = process.env[key];
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function envStr(key) {
  const raw = process.env[key];
  if (raw == null || raw === '') return undefined;
  return raw;
}

function envCsv(key) {
  const raw = envStr(key);
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function validateConfig(config) {
  if (!Array.isArray(config.network.rpcEndpoints) || config.network.rpcEndpoints.length === 0) {
    throw new Error('Config validation failed: network.rpcEndpoints must contain at least one URL');
  }

  if (config.system.liveTradingEnabled && config.system.shadowMode) {
    throw new Error('Config validation failed: liveTradingEnabled=true requires shadowMode=false');
  }

  if (config.system.liveTradingEnabled && !process.env[config.wallet.decryptionPasswordEnv]) {
    throw new Error(`Config validation failed: missing env var ${config.wallet.decryptionPasswordEnv} for key decryption`);
  }

  if (safeNumber(config.risk.maxTradeSol, 0) <= 0) {
    throw new Error('Config validation failed: risk.maxTradeSol must be > 0');
  }

  if (config.execution.maxSlippageBps > config.risk.maxSlippageBps) {
    config.execution.maxSlippageBps = config.risk.maxSlippageBps;
  }

  return config;
}

export function loadConfig(customPath) {
  const configPath = path.resolve(customPath || process.env.BOT_CONFIG_PATH || 'config.yaml');
  let merged = cloneDefaults();

  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const parsed = YAML.parse(fileContent) || {};
    merged = deepMerge(merged, parsed);
  }

  const envOverride = {
    system: {
      shadowMode: envBool('SHADOW_MODE'),
      liveTradingEnabled: envBool('LIVE_TRADING_ENABLED'),
      loopIntervalMs: envNum('LOOP_INTERVAL_MS'),
    },
    wallet: {
      encryptedKeyPath: envStr('ENCRYPTED_KEY_PATH'),
      expectedPublicKey: envStr('WALLET_PUBLIC_KEY'),
      devPrivateKey: envStr('DEV_PRIVATE_KEY'),
      allowUnencryptedDevKey: envBool('ALLOW_UNENCRYPTED_DEV_KEY'),
    },
    network: {
      rpcEndpoints: envCsv('RPC_ENDPOINTS'),
      jupiterApiKey: envStr('JUPITER_API_KEY'),
      jupiterBaseUrl: envStr('JUPITER_BASE_URL'),
    },
    telegram: {
      enabled: envBool('TELEGRAM_ENABLED'),
      botToken: envStr('TELEGRAM_BOT_TOKEN'),
      chatId: envStr('TELEGRAM_CHAT_ID'),
    },
    storage: {
      dbPath: envStr('DB_PATH'),
      backupsDir: envStr('BACKUPS_DIR'),
      reportsDir: envStr('REPORTS_DIR'),
      healthFile: envStr('HEALTH_FILE'),
    },
  };

  merged = deepMerge(merged, envOverride);

  function pruneUndefined(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(pruneUndefined);
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out;
  }

  merged = deepMerge(cloneDefaults(), pruneUndefined(merged));
  return validateConfig(merged);
}
