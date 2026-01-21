import type { Hex, LocalAccount } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

export const createLocalAccount = (config: {
  privateKey?: Hex;
  mnemonic?: string;
}): LocalAccount => {
  if (config.privateKey) return privateKeyToAccount(config.privateKey);
  if (config.mnemonic) return mnemonicToAccount(config.mnemonic);
  throw new Error("Local Provider: Must provide privateKey or mnemonic");
};
