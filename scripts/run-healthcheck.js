#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config/loadConfig.js';

const config = loadConfig(process.argv[2]);
const healthPath = path.resolve(config.storage.healthFile);

if (!fs.existsSync(healthPath)) {
  console.error(`Health file not found: ${healthPath}`);
  process.exit(1);
}

const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
const ageMs = Date.now() - new Date(health.ts).getTime();
const maxAgeMs = Math.max(60_000, config.system.loopIntervalMs * 4);

if (!health.ok) {
  console.error('Health check failed: RPC not healthy');
  process.exit(1);
}

if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
  console.error(`Health check failed: stale heartbeat (${ageMs}ms)`);
  process.exit(1);
}

console.log('ok');
