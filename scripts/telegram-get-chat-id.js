#!/usr/bin/env node
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN || '';
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in environment.');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/getUpdates`;
const response = await fetch(url);
const payload = await response.json();

if (!response.ok || !payload?.ok) {
  console.error('Failed to fetch updates.');
  console.error(JSON.stringify(payload));
  process.exit(1);
}

const updates = payload.result || [];
if (updates.length === 0) {
  console.log('No updates yet. Send any message to your bot, then run this again.');
  process.exit(0);
}

const last = updates[updates.length - 1];
const chatId = last?.message?.chat?.id || last?.channel_post?.chat?.id;
if (!chatId) {
  console.log('No chat id found in latest update.');
  process.exit(0);
}

console.log(String(chatId));
