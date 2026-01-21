import {
  KeyManagementServiceClient,
  type protos,
} from "@google-cloud/kms";
import type { ClientOptions } from "google-gax";
import {
  hashMessage,
  hashTypedData,
  keccak256,
  serializeSignature,
  serializeTransaction,
  type Hash,
  type LocalAccount,
} from "viem";
import { toAccount } from "viem/accounts";
import { publicKeyToAddress } from "viem/utils";
import { normalizeKmsSignature } from "../utils/kms";

export interface GcpKmsConfig {
  /** Full resource name of the CryptoKeyVersion */
  name: string;
  /** GCP client configuration options */
  clientOptions?: ClientOptions;
}

export const createGcpAccount = async (
  config: GcpKmsConfig,
): Promise<LocalAccount> => {
  const client = new KeyManagementServiceClient(config.clientOptions);

  const [publicKey] = await client.getPublicKey({ name: config.name });
  if (!publicKey?.pem) {
    throw new Error("GCP KMS: Public Key not found");
  }

  const pem = publicKey.pem.toString();
  const base64 = pem.replace(
    /-----BEGIN PUBLIC KEY-----|\n|-----END PUBLIC KEY-----/g,
    "",
  );
  const der = Buffer.from(base64, "base64");
  const rawKey = der.subarray(der.length - 64);
  const address = publicKeyToAddress(`0x04${rawKey.toString("hex")}`);

  const signDigest = async (digest: Hash) => {
    const [response] = await client.asymmetricSign({
      name: config.name,
      digest: { sha256: Buffer.from(digest.slice(2), "hex") },
    });

    if (!response.signature) {
      throw new Error("GCP KMS: Signing failed");
    }

    return normalizeKmsSignature(
      Buffer.from(response.signature as Uint8Array),
      digest,
      address,
    );
  };

  return toAccount({
    address,
    async signTransaction(
      transaction,
      { serializer = serializeTransaction } = {},
    ) {
      const serializedTx = await serializer(transaction);
      const hash = keccak256(serializedTx);
      const { r, s, v } = await signDigest(hash);
      return serializer(transaction, { r, s, v });
    },
    async signMessage({ message }) {
      const digest = hashMessage(message);
      const { r, s, v } = await signDigest(digest);
      return serializeSignature({ r, s, v });
    },
    async signTypedData(typedData) {
      const digest = hashTypedData(typedData);
      const { r, s, v } = await signDigest(digest);
      return serializeSignature({ r, s, v });
    },
  });
};
