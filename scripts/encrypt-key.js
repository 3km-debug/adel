#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { encryptPrivateKeyToFile } from '../src/security/keyVault.js';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

const keyInline = argValue('--key');
const keyFile = argValue('--key-file');
const outputPath = argValue('--out') || 'storage/secrets/key.enc';
const password = process.env.KEY_ENCRYPTION_PASSWORD;

if (!password) {
  console.error('Missing KEY_ENCRYPTION_PASSWORD env var');
  process.exit(1);
}

if (!keyInline && !keyFile) {
  console.error('Usage: node scripts/encrypt-key.js --key <base58-or-json-array> [--out path]');
  console.error('   or: node scripts/encrypt-key.js --key-file /path/to/private_key.txt [--out path]');
  process.exit(1);
}

let rawPrivateKey = keyInline;
if (!rawPrivateKey && keyFile) {
  rawPrivateKey = fs.readFileSync(path.resolve(keyFile), 'utf8').trim();
}

const out = encryptPrivateKeyToFile({
  rawPrivateKey,
  password,
  outputPath,
});

try {
  const secret = rawPrivateKey.startsWith('[')
    ? Uint8Array.from(JSON.parse(rawPrivateKey))
    : Uint8Array.from((await import('bs58')).default.decode(rawPrivateKey));
  const kp = Keypair.fromSecretKey(secret);
  console.log(`Encrypted key written to: ${out}`);
  console.log(`Wallet public key: ${kp.publicKey.toBase58()}`);
} catch {
  console.log(`Encrypted key written to: ${out}`);
}
