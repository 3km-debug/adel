export class ControlPlane {
  constructor(storage) {
    this.storage = storage;
    this.state = storage.getState('controlPlane', {
      emergencyStop: false,
      pauseUntilMs: 0,
      pausedByUser: false,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  persist() {
    this.state.lastUpdatedAt = new Date().toISOString();
    this.storage.setState('controlPlane', this.state);
  }

  setEmergencyStop(enabled) {
    this.state.emergencyStop = Boolean(enabled);
    this.persist();
  }

  pauseIndefinitely() {
    this.state.pauseUntilMs = Date.now() + (365 * 24 * 60 * 60 * 1000);
    this.state.pausedByUser = true;
    this.persist();
  }

  pauseUntil(tsMs) {
    this.state.pauseUntilMs = Number(tsMs || 0);
    this.state.pausedByUser = false;
    this.persist();
  }

  resume() {
    this.state.pauseUntilMs = 0;
    this.state.pausedByUser = false;
    this.persist();
  }

  snapshot() {
    return {
      emergencyStop: Boolean(this.state.emergencyStop),
      pauseUntilMs: Number(this.state.pauseUntilMs || 0),
      pausedByUser: Boolean(this.state.pausedByUser),
    };
  }
}
