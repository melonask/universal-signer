import TrezorConnect, {
  type EthereumTransaction,
  type EthereumTransactionEIP1559,
} from "@trezor/connect";
import {
  serializeTransaction,
  type Hex,
  type LocalAccount,
  type SignableMessage,
} from "viem";
import { toAccount } from "viem/accounts";

export interface TrezorConfig {
  /** Contact email for Trezor manifest */
  email: string;
  /** Application URL for Trezor manifest */
  appUrl: string;
  /** Application name for Trezor manifest */
  appName: string;
  /** BIP-44 derivation path (default: "m/44'/60'/0'/0/0") */
  derivationPath?: string;
}

/** Track initialization state per manifest to avoid re-init with different configs */
const initializationPromises = new Map<string, Promise<void>>();

function getManifestKey(config: TrezorConfig): string {
  return `${config.email}:${config.appUrl}:${config.appName}`;
}

async function ensureInitialized(config: TrezorConfig): Promise<void> {
  const key = getManifestKey(config);

  if (!initializationPromises.has(key)) {
    const promise = TrezorConnect.init({
      manifest: {
        email: config.email,
        appUrl: config.appUrl,
        appName: config.appName,
      },
    });
    initializationPromises.set(key, promise);
  }

  await initializationPromises.get(key);
}

/**
 * Convert a viem SignableMessage to string for Trezor signing
 */
function messageToString(message: SignableMessage): string {
  if (typeof message === "string") {
    return message;
  }

  if ("raw" in message) {
    const raw = message.raw;
    if (typeof raw === "string") {
      return raw;
    }
    if (raw instanceof Uint8Array) {
      return Buffer.from(raw).toString("utf8");
    }
  }

  throw new Error("Trezor: Unsupported message format");
}

/**
 * Convert bigint to hex string with 0x prefix
 */
function toHexString(value: bigint | number | undefined): string {
  if (value === undefined) return "0x0";
  return `0x${value.toString(16)}`;
}

export const createTrezorAccount = async (
  config: TrezorConfig,
): Promise<LocalAccount> => {
  await ensureInitialized(config);

  const path = config.derivationPath ?? "m/44'/60'/0'/0/0";

  const res = await TrezorConnect.ethereumGetAddress({
    path,
    showOnTrezor: false,
  });

  if (!res.success) {
    throw new Error(`Trezor Error: ${res.payload.error}`);
  }

  const address = res.payload.address as Hex;

  return toAccount({
    address,

    async signTransaction(
      transaction,
      { serializer = serializeTransaction } = {},
    ) {
      if (transaction.chainId === undefined) {
        throw new Error("Trezor: chainId is required for transaction signing");
      }

      const isEIP1559 =
        transaction.maxFeePerGas !== undefined ||
        transaction.maxPriorityFeePerGas !== undefined;

      const baseTransaction = {
        // `to` can be null/undefined for contract deployments
        to: transaction.to ?? null,
        value: toHexString(transaction.value),
        nonce: toHexString(transaction.nonce),
        gasLimit: toHexString(transaction.gas),
        data: transaction.data ?? "0x",
        chainId: transaction.chainId,
      };

      let trezorTransaction: EthereumTransaction | EthereumTransactionEIP1559;

      if (isEIP1559) {
        trezorTransaction = {
          ...baseTransaction,
          maxFeePerGas: toHexString(transaction.maxFeePerGas),
          maxPriorityFeePerGas: toHexString(transaction.maxPriorityFeePerGas),
        } as EthereumTransactionEIP1559;
      } else {
        trezorTransaction = {
          ...baseTransaction,
          gasPrice: toHexString(transaction.gasPrice),
        } as EthereumTransaction;
      }

      const response = await TrezorConnect.ethereumSignTransaction({
        path,
        transaction: trezorTransaction,
      });

      if (!response.success) {
        throw new Error(`Trezor Sign Error: ${response.payload.error}`);
      }

      return serializer(transaction, {
        r: response.payload.r as Hex,
        s: response.payload.s as Hex,
        v: BigInt(response.payload.v),
      });
    },

    async signMessage({ message }) {
      const msgStr = messageToString(message);

      const response = await TrezorConnect.ethereumSignMessage({
        path,
        message: msgStr,
      });

      if (!response.success) {
        throw new Error(`Trezor Sign Error: ${response.payload.error}`);
      }

      return `0x${response.payload.signature}` as Hex;
    },

    async signTypedData(typedData) {
      // Extract typed data properties with safe type handling
      const td = typedData as {
        domain?: {
          name?: string;
          version?: string;
          chainId?: number | bigint;
          verifyingContract?: string;
          salt?: string;
        };
        types?: Record<string, Array<{ name: string; type: string }>>;
        primaryType?: string;
        message?: Record<string, unknown>;
      };

      const domain = td.domain ?? {};
      const types = td.types ?? {};
      const primaryType = td.primaryType ?? "";
      const message = td.message ?? {};

      // Build EIP712Domain type array based on which domain fields are present
      const domainTypes: Array<{ name: string; type: string }> = [];
      if (domain.name !== undefined) domainTypes.push({ name: "name", type: "string" });
      if (domain.version !== undefined) domainTypes.push({ name: "version", type: "string" });
      if (domain.chainId !== undefined) domainTypes.push({ name: "chainId", type: "uint256" });
      if (domain.verifyingContract !== undefined) domainTypes.push({ name: "verifyingContract", type: "address" });
      if (domain.salt !== undefined) domainTypes.push({ name: "salt", type: "bytes32" });

      const trezorData = {
        types: {
          EIP712Domain: domainTypes,
          ...types,
        },
        primaryType,
        domain: {
          name: domain.name,
          version: domain.version,
          chainId: domain.chainId !== undefined ? Number(domain.chainId) : undefined,
          verifyingContract: domain.verifyingContract,
          salt: domain.salt,
        },
        message,
      };

      const response = await TrezorConnect.ethereumSignTypedData({
        path,
        // Type assertion needed due to Trezor's strict generic constraints
        data: trezorData as Parameters<typeof TrezorConnect.ethereumSignTypedData>[0]["data"],
        metamask_v4_compat: true,
      });

      if (!response.success) {
        throw new Error(`Trezor SignTypedData Error: ${response.payload.error}`);
      }

      return `0x${response.payload.signature}` as Hex;
    },
  });
};
