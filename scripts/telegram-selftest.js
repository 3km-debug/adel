#!/usr/bin/env node
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chatId = process.env.TELEGRAM_CHAT_ID || '';
const text = process.argv.slice(2).join(' ') || 'Solana bot Telegram self-test: connection OK';

if (!token || !chatId) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/sendMessage`;
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: chatId, text }),
});

const payload = await response.json();
if (!response.ok || !payload?.ok) {
  console.error('Telegram self-test failed.');
  console.error(JSON.stringify(payload));
  process.exit(1);
}

console.log('Telegram self-test sent successfully.');
