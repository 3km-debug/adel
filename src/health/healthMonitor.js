import fs from 'node:fs';
import path from 'node:path';

export class HealthMonitor {
  constructor({ config, rpcManager, logger }) {
    this.config = config;
    this.rpcManager = rpcManager;
    this.logger = logger;

    const file = path.resolve(config.storage.healthFile);
    this.healthFile = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  async write(snapshot) {
    const rpc = await this.rpcManager.healthCheck();

    const payload = {
      ts: new Date().toISOString(),
      ok: rpc.ok,
      rpc,
      ...snapshot,
    };

    const tmp = `${this.healthFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, this.healthFile);

    return payload;
  }
}
