import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { TurnkeyClient } from "@turnkey/http";
import { createAccount } from "@turnkey/viem";
import type { LocalAccount } from "viem";

export const createTurnkeyAccount = async (config: {
  apiPublicKey: string;
  apiPrivateKey: string;
  baseUrl: string;
  organizationId: string;
  privateKeyId: string;
}): Promise<LocalAccount> => {
  const stamper = new ApiKeyStamper({
    apiPublicKey: config.apiPublicKey,
    apiPrivateKey: config.apiPrivateKey,
  });

  const client = new TurnkeyClient({ baseUrl: config.baseUrl }, stamper);

  return createAccount({
    client,
    organizationId: config.organizationId,
    signWith: config.privateKeyId,
  });
};
