#!/usr/bin/env node
import { Keypair } from '@solana/web3.js';
import { decryptPrivateKeyFile } from '../src/security/keyVault.js';

const encryptedPath = process.argv[2] || 'storage/secrets/key.enc';
const password = process.env.KEY_ENCRYPTION_PASSWORD;

if (!password) {
  console.error('Missing KEY_ENCRYPTION_PASSWORD env var');
  process.exit(1);
}

const secret = decryptPrivateKeyFile({ encryptedPath, password });
const kp = Keypair.fromSecretKey(secret);
console.log(kp.publicKey.toBase58());
