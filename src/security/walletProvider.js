import { Keypair } from '@solana/web3.js';
import { decryptPrivateKeyFile } from './keyVault.js';

export class WalletProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.keypair = null;
  }

  get publicKey() {
    return this.keypair?.publicKey || null;
  }

  loadForRuntime() {
    if (this.keypair) return this.keypair;

    const { wallet } = this.config;

    if (wallet.allowUnencryptedDevKey && wallet.devPrivateKey) {
      this.logger.warn('wallet.dev_key_in_use', {
        message: 'Using unencrypted dev key. This must remain disabled in production.',
      });
      const secret = Uint8Array.from(JSON.parse(wallet.devPrivateKey));
      this.keypair = Keypair.fromSecretKey(secret);
      return this.keypair;
    }

    const passwordEnvKey = wallet.decryptionPasswordEnv;
    const password = process.env[passwordEnvKey];

    if (!password) {
      throw new Error(`Missing decryption password env var: ${passwordEnvKey}`);
    }

    const secret = decryptPrivateKeyFile({
      encryptedPath: wallet.encryptedKeyPath,
      password,
    });

    this.keypair = Keypair.fromSecretKey(secret);

    if (wallet.expectedPublicKey && this.keypair.publicKey.toBase58() !== wallet.expectedPublicKey) {
      throw new Error('Decrypted keypair does not match wallet.expectedPublicKey');
    }

    return this.keypair;
  }
}
