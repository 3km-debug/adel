#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from '../src/config/loadConfig.js';

const config = loadConfig(process.argv[2]);
const dbPath = path.resolve(process.env.DB_PATH || config.storage.dbPath);
const backupsDir = path.resolve(process.env.BACKUPS_DIR || config.storage.backupsDir);
const retentionDays = Number(process.env.RETENTION_DAYS || config.storage.retentionDays || 14);

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const targetPath = path.join(backupsDir, `trading-${stamp}.sqlite`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
await db.backup(targetPath);
db.close();

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const file of fs.readdirSync(backupsDir)) {
  if (!file.startsWith('trading-') || !file.endsWith('.sqlite')) continue;
  const full = path.join(backupsDir, file);
  const stat = fs.statSync(full);
  if (stat.mtimeMs < cutoff) {
    fs.unlinkSync(full);
  }
}

console.log(`Backup created: ${targetPath}`);
