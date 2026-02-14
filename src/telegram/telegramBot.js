import { fetchJson } from '../data/http.js';
import { sleep } from '../utils/time.js';

export class TelegramBotInterface {
  constructor({ config, logger, handlers }) {
    this.config = config;
    this.logger = logger;
    this.handlers = handlers;
    this.running = false;
    this.offset = 0;
  }

  enabled() {
    return Boolean(this.config.telegram.enabled && this.config.telegram.botToken);
  }

  apiUrl(method) {
    return `https://api.telegram.org/bot${this.config.telegram.botToken}/${method}`;
  }

  async sendMessage(text) {
    if (!this.enabled() || !this.config.telegram.chatId) return;

    try {
      await fetchJson(this.apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.telegram.chatId,
          text,
          disable_web_page_preview: true,
        }),
        timeoutMs: 8_000,
      });
    } catch (error) {
      this.logger.warn('telegram.send_failed', { error: error.message });
    }
  }

  async pollOnce() {
    if (!this.enabled()) return;

    const url = new URL(this.apiUrl('getUpdates'));
    url.searchParams.set('timeout', '10');
    url.searchParams.set('offset', String(this.offset));

    const payload = await fetchJson(url.toString(), {
      timeoutMs: 15_000,
    });

    const updates = payload.result || [];
    for (const update of updates) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      await this.handleUpdate(update);
    }
  }

  async handleUpdate(update) {
    const message = update?.message;
    if (!message?.text) return;

    const chatId = String(message.chat?.id || '');
    if (this.config.telegram.chatId && chatId !== String(this.config.telegram.chatId)) {
      return;
    }

    const text = message.text.trim();

    if (!this.config.telegram.commandWhitelist.includes(text.split(' ')[0])) {
      return;
    }

    switch (text) {
      case '/status': {
        const status = await this.handlers.getStatus();
        await this.sendMessage(status);
        break;
      }
      case '/pause': {
        this.handlers.onPause();
        await this.sendMessage('Bot paused.');
        break;
      }
      case '/resume': {
        this.handlers.onResume();
        await this.sendMessage('Bot resumed.');
        break;
      }
      case '/shadow_on': {
        this.handlers.onShadowOn();
        await this.sendMessage('Global shadow mode enabled.');
        break;
      }
      case '/shadow_off': {
        this.handlers.onShadowOff();
        await this.sendMessage('Global shadow mode disabled (live mode may execute if enabled).');
        break;
      }
      case '/emergency_stop': {
        this.handlers.onEmergencyStop();
        await this.sendMessage('Emergency stop enabled. No new entries will execute.');
        break;
      }
      case '/clear_emergency': {
        this.handlers.onClearEmergency();
        await this.sendMessage('Emergency stop cleared.');
        break;
      }
      default:
        break;
    }
  }

  async start() {
    if (!this.enabled()) return;

    this.running = true;
    this.logger.info('telegram.started', {});

    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.logger.warn('telegram.poll_error', { error: error.message });
      }

      await sleep(this.config.telegram.pollIntervalMs);
    }
  }

  stop() {
    this.running = false;
  }
}
