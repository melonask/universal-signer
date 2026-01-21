import { numberToHex, pad, recoverAddress, type Hash, type Hex } from "viem";

// SECP256k1 Curve Order (N)
const CURVE_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * Parses a DER-encoded ECDSA signature (standard for AWS/GCP KMS).
 */
function parseDerSignature(der: Uint8Array | Buffer): { r: bigint; s: bigint } {
  let offset = 0;

  // Helper: Read byte safely
  const readByte = (): number => {
    if (offset >= der.length)
      throw new Error("Invalid DER: Unexpected end of data");
    const byte = der[offset];
    offset++;
    return byte!;
  };

  // 1. Check Sequence (0x30)
  if (readByte() !== 0x30) throw new Error("Invalid DER: Missing Sequence");

  // 2. Read Sequence Length
  const lenByte = readByte();
  if (lenByte & 0x80) {
    const lenLen = lenByte & 0x7f;
    // Advance offset by length bytes
    offset += lenLen;
    if (offset > der.length)
      throw new Error("Invalid DER: Length out of bounds");
  }

  // Helper: Read Arbitrary Length Integer
  const readInt = (): bigint => {
    if (readByte() !== 0x02) throw new Error("Invalid DER: Missing Integer");

    let len = readByte();

    // Handle multibyte length indicator
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) {
        len = (len << 8) | readByte();
      }
    }

    const start = offset;
    offset += len;

    if (offset > der.length)
      throw new Error("Invalid DER: Integer out of bounds");

    // Create hex from buffer slice
    return BigInt(
      "0x" + Buffer.from(der.subarray(start, offset)).toString("hex"),
    );
  };

  const r = readInt();
  const s = readInt();

  return { r, s };
}

/**
 * Decodes a DER signature, normalizes S (EIP-2), and recovers V.
 */
export async function normalizeKmsSignature(
  derSignature: Uint8Array | Buffer,
  digest: Hash,
  expectedAddress: string,
): Promise<{ r: Hex; s: Hex; v: bigint }> {
  // 1. Parse DER
  let { r: rBig, s: sBig } = parseDerSignature(derSignature);

  // 2. Normalize S (EIP-2 Malleability check)
  const halfN = CURVE_N / 2n;
  if (sBig > halfN) {
    sBig = CURVE_N - sBig;
  }

  const r = pad(numberToHex(rBig), { size: 32 });
  const s = pad(numberToHex(sBig), { size: 32 });

  // 3. Recover V (Trial & Error: 27 vs 28)

  // Try v=27
  const recoveredV27 = await recoverAddress({
    hash: digest,
    signature: { r, s, v: 27n },
  });
  if (recoveredV27.toLowerCase() === expectedAddress.toLowerCase()) {
    return { r, s, v: 27n };
  }

  // Try v=28
  const recoveredV28 = await recoverAddress({
    hash: digest,
    signature: { r, s, v: 28n },
  });
  if (recoveredV28.toLowerCase() === expectedAddress.toLowerCase()) {
    return { r, s, v: 28n };
  }

  throw new Error(
    `KMS Signature Recovery Failed. Expected: ${expectedAddress}, Got: ${recoveredV27} / ${recoveredV28}`,
  );
}
