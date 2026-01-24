# @universal-signer/core

[![npm version](https://img.shields.io/npm/v/@universal-signer/core.svg)](https://www.npmjs.com/package/@universal-signer/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Viem](https://img.shields.io/badge/Viem-v2.44-blue)](https://viem.sh)

A unified, type-safe library that provides a single interface for **AWS KMS**, **Google Cloud KMS**, **Ledger**, **Trezor**, **Turnkey**, and **Local Keys** — all compatible with [Viem v2](https://viem.sh).

Write your blockchain signing logic once. Switch providers through configuration.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Providers](#providers)
  - [AWS KMS](#aws-kms)
  - [Google Cloud KMS](#google-cloud-kms)
  - [Ledger](#ledger)
  - [Trezor](#trezor)
  - [Turnkey](#turnkey)
  - [Local](#local)
- [API Reference](#api-reference)
- [Technical Details](#technical-details)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- **Unified API** — All providers return a Viem-compatible `LocalAccount`
- **Full Signing Support** — Transactions, messages (`signMessage`), and typed data (`signTypedData` / EIP-712)
- **Cloud KMS Ready** — Automatic ASN.1 DER decoding and EIP-2 signature normalization
- **Hardware Wallet Support** — Ledger (USB HID) and Trezor (Connect) with proper resource management
- **Type-Safe** — Full TypeScript support with exported interfaces for all configurations
- **Modern Runtime** — Built for Bun and Node.js

## Installation

```bash
npm install @universal-signer/core viem
```

Then install only the provider(s) you need:

| Provider    | Dependencies                                                       |
| ----------- | ------------------------------------------------------------------ |
| **AWS KMS** | `npm install @aws-sdk/client-kms`                                  |
| **GCP KMS** | `npm install @google-cloud/kms`                                    |
| **Ledger**  | `npm install @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid` |
| **Trezor**  | `npm install @trezor/connect`                                      |
| **Turnkey** | `npm install @turnkey/viem @turnkey/http @turnkey/api-key-stamper` |
| **Local**   | No additional dependencies                                         |

<details>
<summary>Example: AWS KMS setup</summary>

```bash
npm install @universal-signer/core viem @aws-sdk/client-kms
```

</details>

<details>
<summary>Example: Install all providers</summary>

```bash
npm install @universal-signer/core viem \
  @aws-sdk/client-kms \
  @google-cloud/kms \
  @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid \
  @trezor/connect \
  @turnkey/viem @turnkey/http @turnkey/api-key-stamper
```

</details>

## Quick Start

```typescript
import {
  createUniversalClient,
  createAwsAccount,
} from "@universal-signer/core";
import { mainnet } from "viem/chains";
import { http } from "viem";

// 1. Create an account (using AWS KMS as example)
const account = await createAwsAccount({
  keyId: "alias/my-eth-key",
  region: "us-east-1",
});

// 2. Create a wallet client
const client = createUniversalClient(account, mainnet, http());

// 3. Use standard Viem methods
const hash = await client.sendTransaction({
  to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  value: 1_000_000_000_000_000n, // 0.001 ETH
});

// Sign a message
const signature = await account.signMessage({
  message: "Hello, Ethereum!",
});

// Sign typed data (EIP-712)
const typedSignature = await account.signTypedData({
  domain: {
    name: "My App",
    version: "1",
    chainId: 1,
  },
  types: {
    Message: [{ name: "content", type: "string" }],
  },
  primaryType: "Message",
  message: { content: "Hello" },
});
```

## Providers

### AWS KMS

Uses `@aws-sdk/client-kms` for signing with AWS Key Management Service.

```bash
npm install @aws-sdk/client-kms
```

#### Prerequisites

- **Key Spec**: `ECC_SECG_P256K1`
- **Key Usage**: `SIGN_VERIFY`
- **IAM Permissions**: `kms:GetPublicKey`, `kms:Sign`

#### Usage

```typescript
import { createAwsAccount, type AwsKmsConfig } from "@universal-signer/core";

const config: AwsKmsConfig = {
  // Key ID, ARN, or alias
  keyId:
    "arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012",
  // AWS region (default: "us-east-1")
  region: "us-east-1",
  // Optional: explicit credentials (defaults to AWS SDK credential chain)
  credentials: {
    accessKeyId: "AKIA...",
    secretAccessKey: "...",
  },
};

const account = await createAwsAccount(config);
console.log("Address:", account.address);
```

#### Configuration

| Property      | Type     | Required | Default       | Description               |
| ------------- | -------- | -------- | ------------- | ------------------------- |
| `keyId`       | `string` | Yes      | —             | KMS key ID, ARN, or alias |
| `region`      | `string` | No       | `"us-east-1"` | AWS region                |
| `credentials` | `object` | No       | SDK default   | AWS credentials           |

---

### Google Cloud KMS

Uses `@google-cloud/kms` for signing with Google Cloud Key Management Service.

```bash
npm install @google-cloud/kms
```

#### Prerequisites

- **Algorithm**: `EC_SIGN_SECP256K1_SHA256`
- **Purpose**: `ASYMMETRIC_SIGN`
- **IAM Role**: `roles/cloudkms.signerVerifier`

#### Usage

```typescript
import { createGcpAccount, type GcpKmsConfig } from "@universal-signer/core";

const config: GcpKmsConfig = {
  // Full resource name of the CryptoKeyVersion
  name: "projects/my-project/locations/us-central1/keyRings/my-ring/cryptoKeys/eth-key/cryptoKeyVersions/1",
  // Optional: GCP client options
  clientOptions: {
    projectId: "my-project",
    // credentials: require("./service-account.json"),
  },
};

const account = await createGcpAccount(config);
console.log("Address:", account.address);
```

#### Configuration

| Property        | Type            | Required | Description                                  |
| --------------- | --------------- | -------- | -------------------------------------------- |
| `name`          | `string`        | Yes      | Full CryptoKeyVersion resource name          |
| `clientOptions` | `ClientOptions` | No       | GCP client configuration (from `google-gax`) |

---

### Ledger

Uses `@ledgerhq/hw-app-eth` over USB HID for hardware wallet signing.

```bash
npm install @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid
```

#### Prerequisites

- Ledger device connected via USB
- Ethereum app installed and open
- **Blind signing** enabled (Settings > Blind signing)
- **Linux**: Configure udev rules for USB access

#### Usage

```typescript
import {
  createLedgerAccount,
  type LedgerConfig,
  type LedgerAccount,
} from "@universal-signer/core";

const config: LedgerConfig = {
  // BIP-44 derivation path (default: "44'/60'/0'/0/0")
  derivationPath: "44'/60'/0'/0/0",
};

const account: LedgerAccount = await createLedgerAccount(config);
console.log("Address:", account.address);

// Sign transactions, messages, or typed data
const signature = await account.signMessage({ message: "Hello" });

// Important: Close the transport when done
await account.close();
```

#### Configuration

| Property         | Type        | Required | Default            | Description                   |
| ---------------- | ----------- | -------- | ------------------ | ----------------------------- |
| `derivationPath` | `string`    | No       | `"44'/60'/0'/0/0"` | BIP-44 derivation path        |
| `transport`      | `Transport` | No       | Auto-created       | Custom HID transport instance |

#### Extended Account

`LedgerAccount` extends `LocalAccount` with:

| Method    | Description                             |
| --------- | --------------------------------------- |
| `close()` | Closes the USB HID transport connection |

---

### Trezor

Uses `@trezor/connect` for hardware wallet signing via Trezor Connect.

```bash
npm install @trezor/connect
```

#### Prerequisites

- Trezor device connected
- Trezor Bridge installed (or using WebUSB)
- Valid manifest configuration (required by Trezor)

#### Usage

```typescript
import { createTrezorAccount, type TrezorConfig } from "@universal-signer/core";

const config: TrezorConfig = {
  // Required: Trezor Connect manifest
  email: "developer@myapp.com",
  appUrl: "https://myapp.com",
  appName: "My Application",
  // Optional: BIP-44 derivation path
  derivationPath: "m/44'/60'/0'/0/0",
};

const account = await createTrezorAccount(config);
console.log("Address:", account.address);
```

#### Configuration

| Property         | Type     | Required | Default              | Description                   |
| ---------------- | -------- | -------- | -------------------- | ----------------------------- |
| `email`          | `string` | Yes      | —                    | Contact email for manifest    |
| `appUrl`         | `string` | Yes      | —                    | Application URL for manifest  |
| `appName`        | `string` | Yes      | —                    | Application name for manifest |
| `derivationPath` | `string` | No       | `"m/44'/60'/0'/0/0"` | BIP-44 derivation path        |

---

### Turnkey

Uses `@turnkey/viem` for signing with Turnkey's key management infrastructure.

```bash
npm install @turnkey/viem @turnkey/http @turnkey/api-key-stamper
```

#### Usage

```typescript
import { createTurnkeyAccount } from "@universal-signer/core";

const account = await createTurnkeyAccount({
  baseUrl: "https://api.turnkey.com",
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
  organizationId: process.env.TURNKEY_ORG_ID!,
  privateKeyId: process.env.TURNKEY_PRIVATE_KEY_ID!,
});

console.log("Address:", account.address);
```

#### Configuration

| Property         | Type     | Required | Description                         |
| ---------------- | -------- | -------- | ----------------------------------- |
| `baseUrl`        | `string` | Yes      | Turnkey API base URL                |
| `apiPublicKey`   | `string` | Yes      | Turnkey API public key              |
| `apiPrivateKey`  | `string` | Yes      | Turnkey API private key             |
| `organizationId` | `string` | Yes      | Turnkey organization ID             |
| `privateKeyId`   | `string` | Yes      | Private key or wallet ID in Turnkey |

---

### Local

Wraps Viem's native account functions for development and testing.

> **Warning**: Never use local accounts with real private keys in production.

#### Usage

```typescript
import { createLocalAccount } from "@universal-signer/core";

// From private key
const account = createLocalAccount({
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
});

// Or from mnemonic
const accountFromMnemonic = createLocalAccount({
  mnemonic: "test test test test test test test test test test test junk",
});

console.log("Address:", account.address);
```

#### Configuration

| Property     | Type     | Required | Description                        |
| ------------ | -------- | -------- | ---------------------------------- |
| `privateKey` | `Hex`    | One of   | 32-byte private key with 0x prefix |
| `mnemonic`   | `string` | One of   | BIP-39 mnemonic phrase             |

---

## API Reference

### Exports

```typescript
// Provider functions
export { createAwsAccount } from "./providers/aws";
export { createGcpAccount } from "./providers/gcp";
export { createLedgerAccount } from "./providers/ledger";
export { createLocalAccount } from "./providers/local";
export { createTrezorAccount } from "./providers/trezor";
export { createTurnkeyAccount } from "./providers/turnkey";

// Configuration types
export type { AwsKmsConfig } from "./providers/aws";
export type { GcpKmsConfig } from "./providers/gcp";
export type { LedgerConfig, LedgerAccount } from "./providers/ledger";
export type { TrezorConfig } from "./providers/trezor";

// Utilities
export { normalizeKmsSignature } from "./utils/kms";
export { createUniversalClient } from "./index";
```

### `createUniversalClient`

Helper function to create a Viem `WalletClient` from any account.

```typescript
function createUniversalClient(
  account: Account,
  chain?: Chain, // Default: mainnet
  transport?: Transport, // Default: http()
): WalletClient;
```

### `normalizeKmsSignature`

Low-level utility for converting KMS DER signatures to Ethereum format.

```typescript
function normalizeKmsSignature(
  derSignature: Uint8Array | Buffer,
  digest: Hash,
  expectedAddress: string,
): Promise<{ r: Hex; s: Hex; v: bigint }>;
```

---

## Technical Details

### KMS Signature Normalization

Cloud KMS providers return ECDSA signatures in ASN.1 DER format. Ethereum requires raw `(r, s, v)` signatures. This library handles the conversion:

1. **DER Parsing** — Extracts `r` and `s` integers from the ASN.1 structure
2. **EIP-2 Normalization** — Ensures `s <= secp256k1.n / 2` to prevent signature malleability
3. **Recovery ID** — Determines `v` (27 or 28) by trial recovery against the known public key

### Supported Operations

| Provider | `signTransaction` | `signMessage` | `signTypedData` |
| -------- | :---------------: | :-----------: | :-------------: |
| AWS KMS  |        Yes        |      Yes      |       Yes       |
| GCP KMS  |        Yes        |      Yes      |       Yes       |
| Ledger   |        Yes        |      Yes      |       Yes       |
| Trezor   |        Yes        |      Yes      |       Yes       |
| Turnkey  |        Yes        |      Yes      |       Yes       |
| Local    |        Yes        |      Yes      |       Yes       |

### Transaction Types

All providers support:

- Legacy transactions
- EIP-2930 (Type 1)
- EIP-1559 (Type 2)
- Contract deployments (no `to` address)

---

## Troubleshooting

### "Invalid DER: Unexpected end of data"

The KMS returned a malformed signature. This can happen due to:

- Network issues truncating the response
- Incorrect key configuration

**Solution**: Retry the operation. If persistent, verify your KMS key configuration.

### "AWS KMS: Unable to retrieve Public Key"

**Causes**:

- Incorrect key ID or ARN
- Missing IAM permissions
- Key is disabled or pending deletion

**Solution**: Verify the key exists and your credentials have `kms:GetPublicKey` permission.

### "GCP KMS: Public Key not found"

**Causes**:

- Incorrect resource name format
- Missing IAM permissions
- Key version is disabled

**Solution**: Verify the full resource path and `cloudkms.cryptoKeyVersions.viewPublicKey` permission.

### Ledger Connection Issues

**Causes**:

- Another application has the device open (Ledger Live, browser wallet)
- Ethereum app not open on device
- USB permissions (Linux)

**Solutions**:

1. Close Ledger Live and any browser wallets
2. Open the Ethereum app on your Ledger
3. On Linux, add udev rules:
   ```bash
   # /etc/udev/rules.d/20-hw1.rules
   SUBSYSTEM=="usb", ATTR{idVendor}=="2c97", MODE="0666"
   ```

### Trezor "Manifest not set"

Trezor Connect requires a valid manifest with `email`, `appUrl`, and `appName`.

**Solution**: Ensure all three manifest fields are provided in your configuration.

### "Trezor: chainId is required"

Trezor requires an explicit `chainId` for transaction signing.

**Solution**: Include `chainId` in your transaction object.

---

## License

MIT
