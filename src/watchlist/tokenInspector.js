import { PublicKey } from '@solana/web3.js';

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export class TokenInspector {
  constructor(rpcManager, logger) {
    this.rpcManager = rpcManager;
    this.logger = logger;
  }

  async inspectMint(mint) {
    try {
      const mintPubkey = new PublicKey(mint);
      const accountInfo = await this.rpcManager.withConnection((conn) => conn.getParsedAccountInfo(mintPubkey));
      const account = accountInfo?.value;

      if (!account) {
        return {
          mint,
          exists: false,
          tokenProgram: 'unknown',
          isToken2022: false,
        };
      }

      const parsed = account?.data?.parsed?.info || {};
      const owner = account.owner?.toBase58?.() || String(account.owner || 'unknown');

      return {
        mint,
        exists: true,
        tokenProgram: owner,
        isToken2022: owner === TOKEN_2022_PROGRAM_ID,
        isLegacyTokenProgram: owner === TOKEN_PROGRAM_ID,
        freezeAuthority: parsed.freezeAuthority || null,
        mintAuthority: parsed.mintAuthority || null,
        decimals: Number(parsed.decimals || 0),
        supplyRaw: String(parsed.supply || '0'),
        isInitialized: Boolean(parsed.isInitialized),
      };
    } catch (error) {
      this.logger.warn('watchlist.inspect_failed', { mint, error: error.message });
      return {
        mint,
        exists: false,
        tokenProgram: 'unknown',
        isToken2022: false,
        inspectError: error.message,
      };
    }
  }
}
