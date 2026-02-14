import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bs58 from 'bs58';

const SCHEMA_VERSION = 1;
const ALGO = 'aes-256-gcm';
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function parsePrivateKey(raw) {
  if (!raw) {
    throw new Error('No private key value provided');
  }

  const trimmed = String(raw).trim();

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const arr = JSON.parse(trimmed);
    return Uint8Array.from(arr);
  }

  return bs58.decode(trimmed);
}

function deriveKey(password, saltBuffer) {
  return crypto.scryptSync(password, saltBuffer, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

export function encryptPrivateKeyToFile({ rawPrivateKey, password, outputPath }) {
  if (!password) {
    throw new Error('Key encryption password is required');
  }

  const secretKey = parsePrivateKey(rawPrivateKey);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    version: SCHEMA_VERSION,
    algo: ALGO,
    scrypt: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };

  const finalPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(payload, null, 2));
  fs.chmodSync(finalPath, 0o600);

  return finalPath;
}

export function decryptPrivateKeyFile({ encryptedPath, password }) {
  if (!password) {
    throw new Error('Key decryption password is required');
  }

  const finalPath = path.resolve(encryptedPath);
  const payload = JSON.parse(fs.readFileSync(finalPath, 'utf8'));

  if (payload.version !== SCHEMA_VERSION || payload.algo !== ALGO) {
    throw new Error('Unsupported encrypted key schema');
  }

  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return Uint8Array.from(plain);
}

export function detectSecretFormat(rawPrivateKey) {
  const trimmed = String(rawPrivateKey || '').trim();
  if (trimmed.startsWith('[')) return 'json-array';
  return 'base58';
}
