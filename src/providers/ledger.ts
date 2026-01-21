import type Transport from "@ledgerhq/hw-transport";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import {
  hashTypedData,
  serializeSignature,
  serializeTransaction,
  type Hex,
  type LocalAccount,
  type SignableMessage,
} from "viem";
import { toAccount } from "viem/accounts";

export interface LedgerConfig {
  /** BIP-44 derivation path (default: "44'/60'/0'/0/0") */
  derivationPath?: string;
  /** Optional existing transport instance */
  transport?: Transport;
}

export interface LedgerAccount extends LocalAccount {
  /** Close the HID transport connection */
  close: () => Promise<void>;
}

/**
 * Convert a viem SignableMessage to hex string for Ledger signing
 */
function messageToHex(message: SignableMessage): string {
  if (typeof message === "string") {
    return Buffer.from(message).toString("hex");
  }

  if ("raw" in message) {
    const raw = message.raw;
    if (typeof raw === "string") {
      // Remove 0x prefix if present
      return raw.startsWith("0x") ? raw.slice(2) : raw;
    }
    if (raw instanceof Uint8Array) {
      return Buffer.from(raw).toString("hex");
    }
  }

  throw new Error("Ledger: Unsupported message format");
}

export const createLedgerAccount = async (
  config: LedgerConfig = {},
): Promise<LedgerAccount> => {
  const path = config.derivationPath ?? "44'/60'/0'/0/0";

  const transport = config.transport ?? (await TransportNodeHid.create());

  // Dynamic import to handle ESM/CJS interop
  const AppEthModule = await import("@ledgerhq/hw-app-eth");
  const AppEth = AppEthModule.default;
  const appEth = new AppEth(transport);

  const { address } = await appEth.getAddress(path);

  const account = toAccount({
    address: address as Hex,

    async signTransaction(
      transaction,
      { serializer = serializeTransaction } = {},
    ) {
      const serializedTx = await serializer(transaction);
      const rawTx = serializedTx.slice(2);

      const sig = await appEth.signTransaction(path, rawTx, null);

      return serializer(transaction, {
        r: `0x${sig.r}` as Hex,
        s: `0x${sig.s}` as Hex,
        v: BigInt(`0x${sig.v}`),
      });
    },

    async signMessage({ message }) {
      const msgHex = messageToHex(message);
      const sig = await appEth.signPersonalMessage(path, msgHex);
      const v = BigInt(sig.v);
      return serializeSignature({
        r: `0x${sig.r}` as Hex,
        s: `0x${sig.s}` as Hex,
        v,
      });
    },

    async signTypedData(typedData) {
      // Use hashTypedData to compute the full EIP-712 hash
      const fullHash = hashTypedData(typedData);

      // For Ledger, we use signEIP712HashedMessage which requires:
      // - domainSeparatorHash: hash of the domain
      // - messageHash: the full typed data hash
      // Since we have the full hash, we pass it as the message hash
      // and compute a minimal domain separator
      const domainHash = hashTypedData({
        ...typedData,
        primaryType: "EIP712Domain" as const,
        message: typedData.domain as Record<string, unknown>,
      } as Parameters<typeof hashTypedData>[0]);

      const sig = await appEth.signEIP712HashedMessage(
        path,
        domainHash.slice(2),
        fullHash.slice(2),
      );

      const v = BigInt(sig.v);
      return serializeSignature({
        r: `0x${sig.r}` as Hex,
        s: `0x${sig.s}` as Hex,
        v,
      });
    },
  });

  return {
    ...account,
    async close() {
      await transport.close();
    },
  };
};
