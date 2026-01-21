import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from "@aws-sdk/client-kms";
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

export interface AwsKmsConfig {
  keyId: string;
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export const createAwsAccount = async (
  config: AwsKmsConfig,
): Promise<LocalAccount> => {
  const client = new KMSClient({
    region: config.region ?? "us-east-1",
    credentials: config.credentials,
  });

  const pubKeyRes = await client.send(
    new GetPublicKeyCommand({ KeyId: config.keyId }),
  );
  if (!pubKeyRes.PublicKey) {
    throw new Error("AWS KMS: Unable to retrieve Public Key");
  }

  const derBuffer = Buffer.from(pubKeyRes.PublicKey);
  const rawKey = derBuffer.subarray(derBuffer.length - 64);
  const address = publicKeyToAddress(`0x04${rawKey.toString("hex")}`);

  const signDigest = async (digest: Hash) => {
    const { Signature } = await client.send(
      new SignCommand({
        KeyId: config.keyId,
        Message: Buffer.from(digest.slice(2), "hex"),
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256",
      }),
    );

    if (!Signature) {
      throw new Error("AWS KMS: Signing failed");
    }

    return normalizeKmsSignature(Buffer.from(Signature), digest, address);
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
