# Encryption Explainer

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-27
> **Related Issues:** [#1692](https://github.com/jrmoulckers/finance/issues/1692)
> **Related Docs:** [Privacy & Security Guide](../guides/privacy-security.md), [Trust & Manual Entry](../guides/trust-and-manual-entry.md), [Data Inventory](./data-inventory.md)

---

## Table of Contents

- [How encryption protects your data — the simple version](#how-encryption-protects-your-data--the-simple-version)
- [Two layers of protection](#two-layers-of-protection)
- [Layer 1: Local encryption (data at rest)](#layer-1-local-encryption-data-at-rest)
- [Layer 2: Sync encryption (data in transit)](#layer-2-sync-encryption-data-in-transit)
- [Where your encryption keys live](#where-your-encryption-keys-live)
- [What the server can and cannot see](#what-the-server-can-and-cannot-see)
- [Encryption lifecycle diagrams](#encryption-lifecycle-diagrams)
- [Verification view — for advanced users](#verification-view--for-advanced-users)
- [Crypto-shredding: what happens when you delete your account](#crypto-shredding-what-happens-when-you-delete-your-account)
- [Frequently asked questions](#frequently-asked-questions)
- [Technical reference](#technical-reference)

---

## How encryption protects your data — the simple version

Imagine your financial data is a letter. Encryption puts that letter in a locked box. Only you have the key.

Finance uses encryption in **two places**:

1. **On your device** — Your local database is encrypted. Even if someone physically accessed your device's storage, they could not read your data.
2. **During sync** — If you enable cross-device sync, your data is encrypted _before_ it leaves your device. The sync server stores your encrypted data but cannot read it — it does not have the key.

The result: **your financial data is never readable by anyone but you** — not Finance, not the hosting provider, not anyone who might intercept network traffic.

---

## Two layers of protection

Finance uses two distinct encryption layers. Each protects your data in a different scenario:

`mermaid
graph TB
subgraph "Your Device"
A["Your financial data<br/>(transactions, accounts, budgets)"]
B["Local encrypted database<br/>🔒 SQLCipher — AES-256"]
C["Encryption key<br/>🔑 Stored in secure hardware"]
end

    subgraph "Network"
        D["Encrypted sync payload<br/>🔒 AES-256-GCM envelope"]
    end

    subgraph "Sync Server"
        E["Encrypted data stored<br/>🔒 Server cannot decrypt"]
    end

    A -->|"Encrypted before storage"| B
    C -->|"Unlocks"| B
    B -->|"Encrypted again for sync"| D
    D -->|"Stored as-is"| E

    style A fill:#e8f4f8,color:#000
    style B fill:#d4edda,color:#000
    style C fill:#fff3cd,color:#000
    style D fill:#f0e6ff,color:#000
    style E fill:#f8d7da,color:#000

`

| Layer                | What it protects               | When it matters                                                    |
| -------------------- | ------------------------------ | ------------------------------------------------------------------ |
| **Local encryption** | Data stored on your device     | If your device is lost, stolen, or physically accessed             |
| **Sync encryption**  | Data sent between your devices | If network traffic is intercepted, or if the server is compromised |

---

## Layer 1: Local encryption (data at rest)

Every Finance database on your device is encrypted using **SQLCipher** — an open-source extension to SQLite that provides transparent, page-level AES-256 encryption.

### How it works

`mermaid
sequenceDiagram
participant User as You
participant App as Finance App
participant HW as Secure Hardware
participant DB as Local Database

    User->>App: Open app
    App->>HW: Request encryption key
    HW-->>App: Key released (after biometric/PIN)
    App->>DB: Open database with key
    DB-->>App: Decrypted data available
    Note over DB: Data is encrypted on disk<br/>Decrypted only in memory<br/>while the app is open
    User->>App: Close app
    App->>DB: Close database
    Note over DB: Data is encrypted on disk again

`

### What this means in practice

- The database file on disk is **always encrypted** — it looks like random noise without the key
- The encryption key is stored in your device's **secure hardware**, not in the app
- The key is only released when you authenticate (biometrics, PIN, or device unlock)
- When the app is closed, the decrypted data exists only in memory and is cleared

### Platform-specific details

| Platform    | Database encryption                                            | Key storage                                 | Key protection                                             |
| ----------- | -------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| **iOS**     | SQLCipher (AES-256, 256-bit key, 64K PBKDF2-SHA512 iterations) | Apple Keychain backed by Secure Enclave     | Requires device unlock; optionally requires biometric      |
| **Android** | SQLCipher (AES-256, 256-bit key, 64K PBKDF2-SHA512 iterations) | Android Keystore (StrongBox when available) | Hardware-backed; requires device unlock                    |
| **Windows** | SQLCipher (AES-256, 256-bit key, 64K PBKDF2-SHA512 iterations) | DPAPI (per-user data protection)            | Tied to Windows user account; not cloud-synced             |
| **Web**     | Web Crypto API (planned)                                       | In-memory only                              | Key exists only for session duration; cleared on tab close |

> **Note for web users:** The web platform currently has a known encryption gap for local storage (IndexedDB/OPFS). This is tracked as a critical item in the [Privacy Compliance Review](./privacy-compliance-review.md) and is being addressed before public launch.

---

## Layer 2: Sync encryption (data in transit)

When you enable cross-device sync, Finance encrypts your data **before it leaves your device** using an envelope encryption system. This is separate from and in addition to the TLS encryption that protects the network connection.

### Envelope encryption — how it works

`mermaid
graph LR
subgraph "Your Device"
TX["Transaction:<br/>Coffee Shop — .50"]
DEK["🔑 Data Encryption Key<br/>(unique per record)"]
ETX["🔒 Encrypted Transaction:<br/>x8f2a...9c3b"]
KEK["🔑 Key Encryption Key<br/>(your master key)"]
EDEK["🔒 Encrypted DEK:<br/>a3d1...7e2f"]
end

    subgraph "Sent to Server"
        PKG["📦 Envelope:<br/>encrypted data + encrypted key"]
    end

    TX -->|"Encrypt with DEK"| ETX
    DEK -->|"Wrap with KEK"| EDEK
    ETX --> PKG
    EDEK --> PKG

    style TX fill:#e8f4f8,color:#000
    style DEK fill:#fff3cd,color:#000
    style ETX fill:#d4edda,color:#000
    style KEK fill:#fff3cd,color:#000
    style EDEK fill:#d4edda,color:#000
    style PKG fill:#f0e6ff,color:#000

`

### Step by step

1. **Generate a DEK** — For each record (transaction, account, etc.), a unique Data Encryption Key is generated
2. **Encrypt the record** — The record is encrypted with its DEK using AES-256-GCM (authenticated encryption)
3. **Wrap the DEK** — The DEK is encrypted ("wrapped") with your Key Encryption Key (KEK)
4. **Send the envelope** — The encrypted record and the wrapped DEK are sent together to the server
5. **Server stores it** — The server stores the envelope as-is. It never has the KEK, so it cannot unwrap the DEK or read the record

### Why envelope encryption?

| Property                               | Benefit                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Unique key per record**              | Compromising one record's key does not expose other records                                                  |
| **Key rotation without re-encryption** | To rotate keys, only the DEK wrappers need to be re-encrypted — not the data itself                          |
| **Household sharing**                  | The KEK can be shared with household members to enable collaborative access without exposing individual DEKs |
| **Performance**                        | Symmetric encryption (AES-256-GCM) is fast even on mobile devices                                            |

### Transport encryption (TLS)

In addition to envelope encryption, all network traffic uses **TLS 1.3** — the latest version of Transport Layer Security. This provides a second layer of protection for data in transit:

`mermaid
graph LR
subgraph "Your Device"
EP["🔒 Encrypted payload<br/>(envelope encryption)"]
end

    subgraph "TLS 1.3 Tunnel"
        TLS["🔒 Encrypted channel<br/>(transport encryption)"]
    end

    subgraph "Server"
        S["🔒 Receives encrypted payload<br/>Cannot decrypt contents"]
    end

    EP -->|"Wrapped in TLS"| TLS
    TLS -->|"TLS terminated"| S

    style EP fill:#d4edda,color:#000
    style TLS fill:#f0e6ff,color:#000
    style S fill:#f8d7da,color:#000

`

**Local encryption vs. transport encryption:**

| Aspect                | Local encryption (SQLCipher)  | Transport encryption (TLS)   | Sync encryption (envelope)        |
| --------------------- | ----------------------------- | ---------------------------- | --------------------------------- |
| **What it protects**  | Data on your device           | Data moving over the network | Data stored on the sync server    |
| **Who holds the key** | You (via secure hardware)     | Negotiated per connection    | You (KEK in secure hardware)      |
| **Protects against**  | Device theft, physical access | Network interception (MITM)  | Server compromise, insider access |
| **When it's active**  | Always                        | During network transfer      | When sync is enabled              |
| **Standard**          | AES-256 via SQLCipher         | TLS 1.3                      | AES-256-GCM                       |

---

## Where your encryption keys live

Your encryption keys never leave your device's secure hardware. Here is exactly where they are stored on each platform:

`mermaid
graph TB
subgraph "iOS"
IK["🔑 KEK + SQLCipher key"]
ISE["Apple Keychain<br/>Secure Enclave"]
IK --> ISE
end

    subgraph "Android"
        AK["🔑 KEK + SQLCipher key"]
        AKS["Android Keystore<br/>StrongBox / TEE"]
        AK --> AKS
    end

    subgraph "Windows"
        WK["�� KEK + SQLCipher key"]
        WDP["DPAPI<br/>Per-user protection"]
        WK --> WDP
    end

    subgraph "Web"
        WebK["🔑 Session key"]
        WebM["In-memory only<br/>Cleared on tab close"]
        WebK --> WebM
    end

    style ISE fill:#d4edda,color:#000
    style AKS fill:#d4edda,color:#000
    style WDP fill:#d4edda,color:#000
    style WebM fill:#fff3cd,color:#000

`

**Key facts:**

- Keys are generated on your device and never transmitted to the server
- On iOS and Android, keys are backed by dedicated security hardware (Secure Enclave, StrongBox)
- On Windows, DPAPI encrypts keys using your Windows login credentials — keys are not cloud-synced
- On Web, keys exist only in memory for the duration of your session
- Biometric authentication (Face ID, fingerprint, Windows Hello) can gate key access

---

## What the server can and cannot see

| Data                             | Server can see? | Notes                        |
| -------------------------------- | --------------- | ---------------------------- |
| **Your email address**           | ✅ Yes          | Required for authentication  |
| **When you last synced**         | ✅ Yes          | Sync coordination metadata   |
| **How many records you have**    | ✅ Yes          | Record counts (not contents) |
| **Your household memberships**   | ✅ Yes          | For access control           |
| **Transaction amounts**          | ❌ No           | Encrypted with your key      |
| **Payee names**                  | ❌ No           | Encrypted with your key      |
| **Account names or balances**    | ❌ No           | Encrypted with your key      |
| **Budget amounts or categories** | ❌ No           | Encrypted with your key      |
| **Goal names or targets**        | ❌ No           | Encrypted with your key      |
| **Notes or tags**                | ❌ No           | Encrypted with your key      |
| **Your encryption keys**         | ❌ No           | Never leave your device      |

---

## Encryption lifecycle diagrams

### Creating a transaction (local only — no sync)

`mermaid
sequenceDiagram
participant User as You
participant App as Finance App
participant KS as Secure Hardware
participant DB as Encrypted Database

    User->>App: Enter "Coffee Shop — .50"
    App->>KS: Request database key
    KS-->>App: Key released
    App->>App: Validate and format transaction
    App->>DB: Write encrypted record
    Note over DB: SQLCipher encrypts<br/>the page transparently
    DB-->>App: ✅ Stored
    App-->>User: Transaction saved

`

### Syncing a transaction to another device

`mermaid
sequenceDiagram
participant D1 as Device 1 (Phone)
participant KS1 as Secure Hardware
participant Server as Sync Server
participant KS2 as Secure Hardware
participant D2 as Device 2 (Laptop)

    D1->>KS1: Request KEK
    KS1-->>D1: KEK released
    D1->>D1: Generate DEK for record
    D1->>D1: Encrypt record with DEK (AES-256-GCM)
    D1->>D1: Wrap DEK with KEK
    D1->>Server: Send encrypted envelope (TLS 1.3)
    Note over Server: Stores envelope as-is<br/>Cannot read contents
    Server->>D2: Deliver encrypted envelope (TLS 1.3)
    D2->>KS2: Request KEK
    KS2-->>D2: KEK released
    D2->>D2: Unwrap DEK with KEK
    D2->>D2: Decrypt record with DEK
    D2->>D2: Store in local encrypted database
    Note over D2: Record is now available<br/>locally on Device 2

`

### Deleting your account (crypto-shredding)

`mermaid
sequenceDiagram
participant User as You
participant App as Finance App
participant KS as Secure Hardware
participant Server as Sync Server

    User->>App: Delete Account (confirm)
    App->>KS: Destroy KEK
    KS-->>App: KEK destroyed ✅
    App->>App: Clear local database
    App->>Server: Request account deletion
    Server->>Server: Delete encrypted data
    Note over Server: Even if fragments remain,<br/>they are permanently<br/>unreadable — the KEK<br/>that could decrypt them<br/>no longer exists
    Server-->>App: Deletion certificate
    App-->>User: Account deleted

`

---

## Verification view — for advanced users

Finance provides a verification view in **Settings → Security → Encryption Details** that lets advanced users inspect evidence of encryption. This view does not expose keys or sensitive data — it shows metadata that confirms encryption is active.

### What the verification view shows

| Item                           | Example                                                                        | What it proves                             |
| ------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| **Database encryption status** | Encrypted: Yes (SQLCipher 4.x, AES-256-CBC)                                    | Local database is encrypted                |
| **Key storage location**       | Key stored in: Android Keystore (StrongBox)                                    | Key is in secure hardware                  |
| **Sync encryption status**     | Sync encryption: Active (AES-256-GCM envelope)                                 | Sync payloads are encrypted                |
| **Sample ciphertext**          | Ciphertext preview: a8f2 c91b 3d7e ... (first 32 bytes of an encrypted record) | Data is not stored in plaintext            |
| **Key fingerprint**            | KEK fingerprint: SHA-256:e3b0c442... (hash of public component)                | Key identity without exposing the key      |
| **Last key rotation**          | Last rotated: 2025-07-15                                                       | Key management is active                   |
| **Encryption algorithm**       | Algorithm: AES-256-GCM (128-bit tag)                                           | Industry-standard authenticated encryption |

### Ciphertext sample explanation

The verification view can display a short sample of ciphertext from the local database to demonstrate that data is encrypted. This is safe because:

- Ciphertext without the key is meaningless random data
- The sample is truncated (first 32 bytes only)
- No key material is displayed
- The sample cannot be used to derive the key

**Example display:**

```
Record type: Transaction
Plaintext size: 142 bytes
Ciphertext size: 174 bytes (142 + 16 tag + 16 padding)
Ciphertext preview:
  a8 f2 c9 1b 3d 7e 00 42  b1 9c 73 2f 88 d4 e6 a0
  55 12 fd 8b c3 47 91 0e  2a 6d b8 f5 19 c0 33 77
```

This allows a technical user to confirm that what is stored is indeed encrypted, not plaintext.

### Implementation notes

The verification view should:

1. Be accessible from **Settings → Security → Encryption Details**
2. Require biometric or PIN authentication before displaying
3. Not display any decrypted financial data
4. Include a brief explanation of what each item means
5. Provide a "Copy details" button for sharing in support conversations (with a privacy warning)

---

## Crypto-shredding: what happens when you delete your account

When you delete your Finance account, the app performs **crypto-shredding** — it destroys the encryption keys rather than just deleting the encrypted data. This is the strongest form of data deletion because:

1. **No key = no data** — Without the KEK, the encrypted records on the server are permanently unreadable, even if data fragments persist in backups or storage
2. **Verifiable** — Finance generates a deletion certificate confirming that keys were destroyed
3. **Irreversible** — Key destruction is permanent; there is no "undo" after the 30-day grace period

For more on account deletion, see the [Privacy & Security Guide](../guides/privacy-security.md#delete-your-account).

---

## Frequently asked questions

**Q: Is Finance end-to-end encrypted?**
A: Yes, when sync is enabled. Your data is encrypted on your device before it is sent to the server, and the server never has the keys to decrypt it. This is true end-to-end encryption — your data is only readable on your devices.

**Q: Can Finance employees read my data?**
A: No. The sync server stores only encrypted data. Without your encryption keys (which never leave your devices), the data cannot be decrypted. This applies to Finance employees, hosting providers, and anyone else with server access.

**Q: What if I lose my device?**
A: Your data is encrypted on the device with a key stored in secure hardware. Without your biometric, PIN, or device unlock, the data cannot be decrypted. If you have sync enabled, your data is safe on your other devices and can be re-synced to a new device after signing in.

**Q: What encryption algorithm does Finance use?**
A: AES-256 — the same standard used by governments and financial institutions worldwide. Specifically:

- Local database: AES-256 via SQLCipher (page-level encryption)
- Sync payloads: AES-256-GCM (authenticated encryption with associated data)
- Key derivation: Argon2id (memory-hard, resistant to GPU/ASIC brute-force)

**Q: Is the encryption open source?**
A: Finance uses established, peer-reviewed, open-source encryption libraries:

- **SQLCipher** — open-source, audited SQLite encryption
- **Web Crypto API** — browser-native cryptographic primitives
- **Argon2id** — winner of the Password Hashing Competition

**Q: What's the difference between local encryption and sync encryption?**
A: Local encryption protects data stored on your device (defence against physical access). Sync encryption protects data sent to and stored on the sync server (defence against network interception and server compromise). Both use AES-256 but serve different purposes. See the comparison table in [Two layers of protection](#two-layers-of-protection).

---

## Technical reference

For developers and security auditors, here are the technical specifications:

### Algorithms and parameters

| Component                | Algorithm               | Key size       | Notes                                               |
| ------------------------ | ----------------------- | -------------- | --------------------------------------------------- |
| Local database           | AES-256-CBC (SQLCipher) | 256-bit        | Page-level encryption; 64K PBKDF2-SHA512 iterations |
| Sync payload encryption  | AES-256-GCM             | 256-bit        | 96-bit IV, 128-bit authentication tag               |
| Key wrapping (DEK → KEK) | AES-256-GCM             | 256-bit        | Authenticated encryption for key material           |
| Key derivation           | Argon2id                | 256-bit output | Memory-hard; parameters tuned per platform          |
| TLS                      | TLS 1.3                 | Varies         | AEAD cipher suites only                             |
| Timing-safe comparison   | HMAC-SHA-256            | 256-bit        | Used for secret comparison in Edge Functions        |

### Key hierarchy

```
KEK (Key Encryption Key)
├── Stored in platform secure hardware
├── Used to wrap/unwrap DEKs
├── One per user (shared within household if applicable)
└── Destroyed on account deletion (crypto-shredding)

DEK (Data Encryption Key)
├── Generated per record
├── Used to encrypt/decrypt individual data records
├── Wrapped (encrypted) by KEK before storage
└── Stored alongside encrypted data on sync server
```

### Related source files

- services/api/supabase/functions/\_shared/crypto.ts — Timing-safe string comparison for Edge Functions
- services/api/supabase/functions/bank-connection/index.ts — AES-256-GCM encryption for bank access tokens
- services/api/powersync/sync-rules.yaml — Column allowlisting and tenant isolation for sync
- packages/core/src/commonMain/kotlin/com/finance/core/monitoring/ — Consent-gated monitoring contracts

### Compliance references

- [Data Inventory](./data-inventory.md) — Full personal data map with encryption status per field
- [Privacy Compliance Review](./privacy-compliance-review.md) — GDPR/CCPA gap analysis including encryption
- [Web Storage Audit](./web-storage-audit.md) — Browser storage encryption status
- [Security Transparency Report](./security-transparency-report.md) — Recurring audit status

---

_For the user-facing privacy guide, see [Privacy & Security](../guides/privacy-security.md). For trust messaging, see [Trust & Manual Entry](../guides/trust-and-manual-entry.md)._
