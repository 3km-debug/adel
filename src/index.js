import { TradingSystem } from './app/tradingSystem.js';

const configPath = process.argv[2];
const system = new TradingSystem(configPath);

async function shutdown(signal) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event: 'shutdown', signal })}\n`);
  await system.stop();
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});

system.start().catch(async (error) => {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event: 'fatal', error: error.message })}\n`);
  await system.stop();
  process.exit(1);
});
