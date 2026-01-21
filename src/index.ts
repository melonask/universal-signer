// Provider exports
export { createAwsAccount, type AwsKmsConfig } from "./providers/aws";
export { createGcpAccount, type GcpKmsConfig } from "./providers/gcp";
export {
  createLedgerAccount,
  type LedgerAccount,
  type LedgerConfig,
} from "./providers/ledger";
export { createLocalAccount } from "./providers/local";
export { createTrezorAccount, type TrezorConfig } from "./providers/trezor";
export { createTurnkeyAccount } from "./providers/turnkey";

// Utility exports
export { normalizeKmsSignature } from "./utils/kms";

import {
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Transport,
  type WalletClient,
} from "viem";
import { mainnet } from "viem/chains";

export const createUniversalClient = (
  account: Account,
  chain: Chain = mainnet,
  transport: Transport = http(),
): WalletClient<Transport, Chain, Account> => {
  return createWalletClient({
    account,
    chain,
    transport,
  });
};
