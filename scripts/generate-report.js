#!/usr/bin/env node
import { loadConfig } from '../src/config/loadConfig.js';
import { Logger } from '../src/utils/logger.js';
import { Storage } from '../src/storage/database.js';
import { ReportGenerator } from '../src/reports/reportGenerator.js';

const config = loadConfig(process.argv[2]);
const date = process.argv[3];

const logger = new Logger({
  logDir: 'storage/logs',
  level: process.env.LOG_LEVEL || 'info',
  consoleEnabled: true,
});

const storage = new Storage(config, logger);
const reportGenerator = new ReportGenerator({ config, storage, logger });
const result = reportGenerator.generateDailyReport(date);

console.log(JSON.stringify({
  date: result.report.date,
  totalPnlSol: result.report.pnl.totalSol,
  pathJson: result.jsonPath,
  pathMd: result.mdPath,
}, null, 2));

storage.close();
