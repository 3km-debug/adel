import fs from 'node:fs';
import path from 'node:path';
import { nowIso, utcDateKey } from './time.js';

const SECRET_KEYS = ['password', 'privateKey', 'secret', 'token', 'apiKey', 'authorization'];

function maskSecrets(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const low = k.toLowerCase();
      if (SECRET_KEYS.some((needle) => low.includes(needle.toLowerCase()))) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = maskSecrets(v);
      }
    }
    return out;
  }
  return value;
}

export class Logger {
  constructor({ logDir = 'storage/logs', level = 'info', consoleEnabled = true } = {}) {
    this.logDir = path.resolve(logDir);
    this.level = level;
    this.consoleEnabled = consoleEnabled;
    this.levelOrder = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
    };

    fs.mkdirSync(this.logDir, { recursive: true });
  }

  shouldLog(level) {
    return this.levelOrder[level] >= this.levelOrder[this.level];
  }

  filePath() {
    return path.join(this.logDir, `${utcDateKey()}.log`);
  }

  write(level, event, payload = {}) {
    if (!this.shouldLog(level)) return;

    const entry = {
      ts: nowIso(),
      level,
      event,
      payload: maskSecrets(payload),
    };

    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(this.filePath(), line, 'utf8');

    if (this.consoleEnabled) {
      // Console output is structured to support downstream ingestion.
      process.stdout.write(line);
    }
  }

  debug(event, payload) {
    this.write('debug', event, payload);
  }

  info(event, payload) {
    this.write('info', event, payload);
  }

  warn(event, payload) {
    this.write('warn', event, payload);
  }

  error(event, payload) {
    this.write('error', event, payload);
  }
}
