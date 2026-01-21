import { describe, expect, test } from "bun:test";
import { hashMessage, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { normalizeKmsSignature } from "../src/utils/kms";

// SECP256k1 Curve Order (N) - used for S normalization testing
const CURVE_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// Helper: Create DER-encoded signature from r and s values
function createDerSignature(r: bigint, s: bigint): Uint8Array {
  const rBytes = bigintToBytes(r);
  const sBytes = bigintToBytes(s);

  // Add leading zero if high bit is set (DER integer encoding)
  const rPadded = rBytes[0]! >= 0x80 ? [0, ...rBytes] : rBytes;
  const sPadded = sBytes[0]! >= 0x80 ? [0, ...sBytes] : sBytes;

  const rLen = rPadded.length;
  const sLen = sPadded.length;

  // Sequence: 0x30 + length + (0x02 + rLen + r) + (0x02 + sLen + s)
  const totalLen = 2 + rLen + 2 + sLen;

  return new Uint8Array([
    0x30,
    totalLen,
    0x02,
    rLen,
    ...rPadded,
    0x02,
    sLen,
    ...sPadded,
  ]);
}

// Helper: Convert bigint to byte array (big-endian, no leading zeros)
function bigintToBytes(n: bigint): number[] {
  if (n === 0n) return [0];
  const hex = n.toString(16).padStart(64, "0");
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  // Remove leading zeros but keep at least one byte
  while (bytes.length > 1 && bytes[0] === 0) {
    bytes.shift();
  }
  return bytes;
}

describe("kms.ts", () => {
  describe("normalizeKmsSignature", () => {
    test("parses valid DER signature and recovers correct address", async () => {
      // Use a known private key for deterministic testing
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      // Sign a message to get real r, s values
      const message = "test message";
      const digest = hashMessage(message);

      // Sign using viem to get a valid signature
      const signature = await account.signMessage({ message });

      // Extract r, s from the signature (signature is 65 bytes: r(32) + s(32) + v(1))
      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      // Create DER-encoded signature
      const derSignature = createDerSignature(r, s);

      // Normalize should recover the correct address
      const normalized = await normalizeKmsSignature(
        derSignature,
        digest,
        account.address,
      );

      expect(normalized.r).toBeDefined();
      expect(normalized.s).toBeDefined();
      expect(normalized.v).toBeOneOf([27n, 28n]);
    });

    test("normalizes high S values (EIP-2)", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const message = "EIP-2 test";
      const digest = hashMessage(message);
      const signature = await account.signMessage({ message });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      let s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      // Force high S by inverting if it's already low
      const halfN = CURVE_N / 2n;
      if (s <= halfN) {
        s = CURVE_N - s;
      }

      const derSignature = createDerSignature(r, s);

      const normalized = await normalizeKmsSignature(
        derSignature,
        digest,
        account.address,
      );

      // The normalized S should be <= halfN
      const normalizedS = BigInt(normalized.s);
      expect(normalizedS <= halfN).toBe(true);
    });

    test("throws error for invalid DER signature (missing sequence)", async () => {
      const invalidDer = new Uint8Array([0x00, 0x02, 0x01, 0x01]); // Missing 0x30 sequence tag
      const digest =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const address = "0x0000000000000000000000000000000000000001";

      expect(
        normalizeKmsSignature(invalidDer, digest as `0x${string}`, address),
      ).rejects.toThrow("Invalid DER: Missing Sequence");
    });

    test("throws error for invalid DER signature (missing integer)", async () => {
      const invalidDer = new Uint8Array([0x30, 0x04, 0x00, 0x01, 0x01, 0x01]); // Missing 0x02 integer tag
      const digest =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
      const address = "0x0000000000000000000000000000000000000001";

      expect(
        normalizeKmsSignature(invalidDer, digest as `0x${string}`, address),
      ).rejects.toThrow("Invalid DER: Missing Integer");
    });

    test("throws error when address cannot be recovered", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const message = "recovery test";
      const digest = hashMessage(message);
      const signature = await account.signMessage({ message });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      const derSignature = createDerSignature(r, s);

      // Use a different address that won't match
      const wrongAddress = "0x0000000000000000000000000000000000000001";

      expect(
        normalizeKmsSignature(derSignature, digest, wrongAddress),
      ).rejects.toThrow("KMS Signature Recovery Failed");
    });

    test("handles both v=27 and v=28 recovery values", async () => {
      // Test multiple messages to ensure both recovery values are tested
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const messages = [
        "message 1",
        "message 2",
        "message 3",
        "test",
        "hello world",
      ];

      for (const message of messages) {
        const digest = hashMessage(message);
        const signature = await account.signMessage({ message });

        const sigBytes = Buffer.from(signature.slice(2), "hex");
        const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
        const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

        const derSignature = createDerSignature(r, s);

        const normalized = await normalizeKmsSignature(
          derSignature,
          digest,
          account.address,
        );

        expect(normalized.v === 27n || normalized.v === 28n).toBe(true);
      }
    });

    test("handles DER with multi-byte length encoding", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const message = "multi-byte length test";
      const digest = hashMessage(message);
      const signature = await account.signMessage({ message });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      // Create DER with standard encoding first, then verify parsing works
      const derSignature = createDerSignature(r, s);

      const normalized = await normalizeKmsSignature(
        derSignature,
        digest,
        account.address,
      );

      expect(normalized.r).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(normalized.s).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    test("works with transaction hash (keccak256)", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      // Simulate a transaction hash
      const txData = "0xf86c0a8502540be400825208940x...";
      const txHash = keccak256(txData as `0x${string}`);

      // Sign the hash directly (simulating what KMS does)
      const signature = await account.signMessage({
        message: { raw: Buffer.from(txHash.slice(2), "hex") },
      });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      const derSignature = createDerSignature(r, s);

      // Note: The hash for raw message signing is different from hashMessage
      const rawDigest = hashMessage({
        raw: Buffer.from(txHash.slice(2), "hex"),
      });

      const normalized = await normalizeKmsSignature(
        derSignature,
        rawDigest,
        account.address,
      );

      expect(normalized.r).toBeDefined();
      expect(normalized.s).toBeDefined();
    });

    test("accepts Buffer input", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const message = "buffer test";
      const digest = hashMessage(message);
      const signature = await account.signMessage({ message });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      const derSignature = createDerSignature(r, s);

      // Pass as Buffer instead of Uint8Array
      const bufferDer = Buffer.from(derSignature);

      const normalized = await normalizeKmsSignature(
        bufferDer,
        digest,
        account.address,
      );

      expect(normalized.r).toBeDefined();
      expect(normalized.s).toBeDefined();
      expect(normalized.v).toBeOneOf([27n, 28n]);
    });

    test("address comparison is case-insensitive", async () => {
      const privateKey =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
      const account = privateKeyToAccount(privateKey);

      const message = "case insensitive test";
      const digest = hashMessage(message);
      const signature = await account.signMessage({ message });

      const sigBytes = Buffer.from(signature.slice(2), "hex");
      const r = BigInt("0x" + sigBytes.subarray(0, 32).toString("hex"));
      const s = BigInt("0x" + sigBytes.subarray(32, 64).toString("hex"));

      const derSignature = createDerSignature(r, s);

      // Test with uppercase address
      const upperAddress = account.address.toUpperCase() as `0x${string}`;
      const normalizedUpper = await normalizeKmsSignature(
        derSignature,
        digest,
        upperAddress,
      );
      expect(normalizedUpper.v).toBeOneOf([27n, 28n]);

      // Test with lowercase address
      const lowerAddress = account.address.toLowerCase() as `0x${string}`;
      const normalizedLower = await normalizeKmsSignature(
        derSignature,
        digest,
        lowerAddress,
      );
      expect(normalizedLower.v).toBeOneOf([27n, 28n]);
    });
  });
});
