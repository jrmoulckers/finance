<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Web OPFS/IndexedDB Encryption — Security Specification

**Date:** 2026-07-18
**Author:** Security & Privacy Reviewer
**Status:** Implementation specification — CRITICAL launch blocker
**Audit References:** Privacy Audit v1 §Web Storage Audit, Security Audit v1 §MASVS-STORAGE (S-6)
**MASVS Controls:** MASVS-STORAGE-1, MASVS-CRYPTO-1
**Finding Severity:** CRITICAL (Privacy Audit v1)

---

## Executive Summary

The web app persists a full SQLite database to OPFS (or IndexedDB fallback)
containing all financial data — accounts, transactions, budgets, goals,
categories — **without any encryption layer**
(`apps/web/src/db/sqlite-wasm.ts:271-352`).

Native platforms use SQLCipher for database encryption. The web platform has
no equivalent. This is a **CRITICAL launch blocker**: any user with access
to the browser profile (shared computer, malware, forensic extraction, or
another origin exploiting a browser vulnerability) can read all financial data
in cleartext.

This specification defines the encryption requirements, algorithm selection,
key management, and migration path for encrypting the web SQLite database.

---

## 1. Threat Model

### 1.1 Assets at Risk

- Full financial transaction history (amounts, payees, dates, notes)
- Account names and balances
- Budget and goal details
- Category taxonomy (reveals spending patterns)

### 1.2 Threat Scenarios

| Threat                                      | Likelihood | Impact   | Current Mitigation           |
| ------------------------------------------- | ---------- | -------- | ---------------------------- |
| Shared computer — next user reads OPFS      | HIGH       | CRITICAL | None                         |
| Malware/browser extension reads OPFS        | MEDIUM     | CRITICAL | None                         |
| Forensic extraction of browser profile      | MEDIUM     | HIGH     | None                         |
| Cross-origin attack exploiting browser bug  | LOW        | CRITICAL | Same-origin policy (browser) |
| Physical device theft with unlocked browser | MEDIUM     | HIGH     | None                         |
| XSS exfiltrating database file              | LOW        | CRITICAL | CSP (partial)                |

### 1.3 Trust Boundaries

```
┌──────────────────────────────────────┐
│           Browser Sandbox            │
│                                      │
│  ┌────────────┐   ┌──────────────┐  │
│  │ Finance App │   │ Other Origins │  │
│  │ (JS context)│   │              │  │
│  └──────┬─────┘   └──────────────┘  │
│         │                            │
│  ┌──────▼─────────────────────────┐  │
│  │   OPFS / IndexedDB             │  │
│  │   (same-origin isolated)       │  │
│  │   ⚠️ UNENCRYPTED TODAY         │  │
│  └────────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
         │
    ┌────▼────┐
    │ Disk    │  ← Readable by OS-level access, malware, forensics
    └─────────┘
```

---

## 2. Encryption Algorithm

### 2.1 Selected Algorithm: AES-256-GCM via Web Crypto API

| Property       | Value              | Rationale                                                        |
| -------------- | ------------------ | ---------------------------------------------------------------- |
| Algorithm      | AES-GCM            | Authenticated encryption; native Web Crypto support              |
| Key size       | 256 bits           | Maximum security; matches native SQLCipher config                |
| Nonce/IV       | 96 bits (12 bytes) | GCM standard; MUST be unique per encryption                      |
| Tag length     | 128 bits           | Full authentication tag                                          |
| Implementation | `crypto.subtle`    | Hardware-accelerated on modern browsers; no JS crypto lib needed |

### 2.2 Why AES-GCM (Not AES-CBC or ChaCha20)

- **AES-GCM** provides authenticated encryption (integrity + confidentiality)
  in a single operation. AES-CBC requires a separate HMAC.
- **Web Crypto API** natively supports AES-GCM with hardware acceleration.
  ChaCha20-Poly1305 is NOT available in Web Crypto API.
- **Consistency** with native platforms (SQLCipher uses AES-256 in CBC mode,
  but the envelope encryption layer uses AES-256-GCM).

### 2.3 Encryption Scope

**Full-database encryption**: Encrypt the entire SQLite database file as a
single blob before writing to OPFS/IndexedDB. This is simpler and more secure
than column-level encryption within SQLite.

Rationale:

- SQLite WAL files, indexes, and metadata would leak information with
  column-level encryption.
- Web Crypto operates on `ArrayBuffer` — encrypting the full export is a
  natural fit.
- Native platforms encrypt the full database file via SQLCipher.

---

## 3. Key Derivation

### 3.1 Key Derivation Function: PBKDF2 (Web Crypto) or Argon2id (WASM)

**Preferred**: Argon2id via WASM module (matches native platform KDF).
**Fallback**: PBKDF2-SHA256 via Web Crypto API (universally available).

| Parameter   | Argon2id (preferred) | PBKDF2 (fallback)   |
| ----------- | -------------------- | ------------------- |
| Memory      | 64 MiB               | N/A                 |
| Iterations  | 3                    | 600,000             |
| Parallelism | 1                    | N/A                 |
| Hash length | 32 bytes (256 bits)  | 32 bytes (256 bits) |
| Salt length | 16 bytes (128 bits)  | 16 bytes (128 bits) |

### 3.2 Key Derivation Input

The database encryption key (DEK) is derived from a **master key** that is
stored in a secure browser API. The derivation chain:

```
CryptoKey (in non-extractable Web Crypto key store)
    │
    ├──► Export raw key material (if extractable) OR
    │    use CryptoKey directly for wrap/unwrap
    │
    ├──► Generate random DEK (256 bits) via crypto.getRandomValues()
    │
    ├──► Wrap DEK with master CryptoKey using AES-KW or AES-GCM
    │
    └──► Store wrapped DEK alongside encrypted database
```

---

## 4. Key Storage

### 4.1 Primary: Non-Extractable CryptoKey in IndexedDB

The Web Crypto API allows creating **non-extractable** `CryptoKey` objects.
These keys:

- Cannot be read by JavaScript (`extractable: false`)
- Are stored in the browser's internal key store
- Are origin-bound (same-origin policy)
- Survive page reloads when stored in IndexedDB

```typescript
// Generate a non-extractable master key
const masterKey = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false, // ← non-extractable: JS cannot read the raw key bytes
  ['wrapKey', 'unwrapKey'],
);

// Store in IndexedDB (serialized as opaque handle, not raw bytes)
await idb.put('crypto-keys', masterKey, 'master-key');
```

### 4.2 Key Hierarchy

```
Master Key (non-extractable CryptoKey in IndexedDB)
    │
    ├──► Wraps: Database Encryption Key (DEK)
    │         └── Used to encrypt/decrypt the SQLite database file
    │
    └──► Wraps: Future keys (e.g., offline mutation queue encryption)
```

### 4.3 Key Rotation

| Trigger                   | Action                                                         |
| ------------------------- | -------------------------------------------------------------- |
| User-initiated (settings) | Generate new DEK, re-encrypt database, re-wrap with master key |
| Policy-mandated (annual)  | Same as above                                                  |
| Suspected compromise      | Generate new master key AND new DEK; re-encrypt everything     |
| Browser profile migration | Keys do not transfer (by design); user re-syncs from server    |

### 4.4 Key Loss / Browser Reset

If the master key is lost (browser data cleared, profile deleted):

1. The local encrypted database is unreadable → discard it.
2. On next login, sync from the server to rebuild the local database.
3. Generate a new master key and DEK.
4. This is the expected behavior — the server is the system of record.

---

## 5. Encryption / Decryption Flow

### 5.1 Database Write (Persist to OPFS/IndexedDB)

```
SQLite in-memory database
    │
    ├──► Export to ArrayBuffer (sqlite3.export() or equivalent)
    │
    ├──► Generate random 12-byte IV via crypto.getRandomValues()
    │
    ├──► Encrypt: AES-256-GCM(DEK, IV, database_bytes) → ciphertext + tag
    │
    ├──► Serialize: version_byte ‖ IV (12) ‖ ciphertext ‖ tag (16)
    │
    └──► Write serialized blob to OPFS file or IndexedDB entry
```

### 5.2 Database Read (Load from OPFS/IndexedDB)

```
Read serialized blob from OPFS/IndexedDB
    │
    ├──► Parse: version_byte, IV (12 bytes), ciphertext, tag
    │
    ├──► Unwrap DEK using master key
    │
    ├──► Decrypt: AES-256-GCM(DEK, IV, ciphertext) → database_bytes
    │         └── GCM tag verification provides integrity check
    │
    ├──► Load ArrayBuffer into SQLite (sqlite3.open() or equivalent)
    │
    └──► Ready for queries
```

### 5.3 Serialization Format

```
Byte layout:
┌───────┬──────────┬─────────────────────────────┬──────────┐
│ Ver   │ IV       │ Ciphertext                  │ Auth Tag │
│ 1 byte│ 12 bytes │ variable length             │ 16 bytes │
└───────┴──────────┴─────────────────────────────┴──────────┘

Version byte:
  0x01 = AES-256-GCM with 96-bit IV and 128-bit tag
```

The version byte allows future algorithm changes without breaking existing
encrypted databases.

---

## 6. Migration: Unencrypted → Encrypted

### 6.1 Migration Strategy

Existing users have unencrypted OPFS/IndexedDB databases. The migration MUST
be seamless and automatic on the next app load.

```
App starts
    │
    ├──► Check: Is master key in IndexedDB?
    │
    ├── NO (first time or migration needed):
    │   ├──► Generate master key (non-extractable)
    │   ├──► Generate DEK (random 256 bits)
    │   ├──► Wrap DEK with master key
    │   ├──► Store wrapped DEK in IndexedDB
    │   ├──► Read existing UNENCRYPTED database from OPFS/IndexedDB
    │   ├──► Encrypt database with DEK
    │   ├──► Write ENCRYPTED database back to OPFS/IndexedDB
    │   ├──► Verify decryption works (read back and check)
    │   ├──► Delete old unencrypted database file
    │   └──► Store migration flag in IndexedDB
    │
    └── YES (already encrypted):
        ├──► Load wrapped DEK from IndexedDB
        ├──► Unwrap DEK with master key
        ├──► Read encrypted database
        ├──► Decrypt and load into SQLite
        └──► Ready
```

### 6.2 Migration Safety

1. **Verify before delete**: After encrypting, decrypt and verify the database
   is readable before deleting the unencrypted copy.
2. **Atomic replacement**: On OPFS, write to a new file, verify, then rename.
   On IndexedDB, use a transaction to swap entries.
3. **Rollback**: If encryption fails, keep the unencrypted database and retry
   on next app load. Log the failure (no PII in logs).
4. **Version detection**: Check the first byte of the stored blob — if it's
   a SQLite header (`SQLite format 3\0`), it's unencrypted and needs migration.

---

## 7. Performance Considerations

### 7.1 Benchmarks to Target

| Operation                   | Target | Notes                              |
| --------------------------- | ------ | ---------------------------------- |
| Encryption (1 MB database)  | <50ms  | Web Crypto is hardware-accelerated |
| Decryption (1 MB database)  | <50ms  | Same as encryption                 |
| Encryption (10 MB database) | <200ms | Acceptable for background persist  |
| Key unwrap                  | <5ms   | AES-KW or AES-GCM unwrap is fast   |

### 7.2 Optimization: Incremental Persistence

Instead of encrypting the entire database on every write:

1. Use a dirty flag — only re-encrypt when data has changed.
2. Consider WAL-mode export timing — batch writes before persist.
3. Use `requestIdleCallback` or Web Worker for encryption to avoid
   blocking the main thread.

### 7.3 Web Worker Consideration

Heavy encryption operations SHOULD run in a Web Worker to avoid janking the
UI. The SQLite WASM module already runs in a worker for OPFS; encryption can
be added to the same worker pipeline.

---

## 8. Service Worker Cache Encryption

### 8.1 Related Finding

The service worker caches API responses in `CacheStorage`
(`apps/web/src/sw/service-worker.ts:84-113,188-210`). If these responses
contain financial data, they are stored unencrypted in the browser cache.

### 8.2 Requirements

1. **Exclude sensitive API responses from CacheStorage**: Do not cache
   responses from `/api/` endpoints that return financial data (transactions,
   accounts, budgets, goals).
2. **Cache only static assets and non-sensitive resources**.
3. **Add `Cache-Control: no-store` header** to sensitive API responses
   server-side to prevent any intermediate caching.
4. **Clear CacheStorage on logout** via `caches.delete()` for all app caches.

---

## 9. Security Requirements Checklist

- [ ] Database file is encrypted before writing to OPFS/IndexedDB
- [ ] AES-256-GCM with 96-bit IV and 128-bit authentication tag
- [ ] IV is unique per encryption operation (crypto.getRandomValues)
- [ ] Master key is non-extractable CryptoKey
- [ ] DEK is wrapped with master key (never stored in plaintext)
- [ ] Version byte in serialization format for future algorithm changes
- [ ] Migration from unencrypted: verify-before-delete
- [ ] Migration from unencrypted: detect via SQLite header check
- [ ] Key loss = database loss (re-sync from server expected)
- [ ] No encryption keys in localStorage, sessionStorage, or cookies
- [ ] No encryption keys logged to console or error reporting
- [ ] Sensitive API responses excluded from CacheStorage
- [ ] CacheStorage cleared on logout
- [ ] Encryption runs in Web Worker (not main thread)
- [ ] Performance: <200ms for 10 MB database encryption

---

## 10. Test Cases

### 10.1 Encryption/Decryption

| #   | Test                                     | Expected                                          |
| --- | ---------------------------------------- | ------------------------------------------------- |
| 1   | Encrypt and decrypt a database roundtrip | Decrypted database matches original byte-for-byte |
| 2   | Tamper with ciphertext, attempt decrypt  | GCM tag verification fails; decryption rejected   |
| 3   | Tamper with IV, attempt decrypt          | Decryption fails or produces garbage              |
| 4   | Use wrong DEK for decryption             | Decryption fails cleanly                          |
| 5   | Use wrong master key for DEK unwrap      | Unwrap fails cleanly                              |

### 10.2 Migration

| #   | Test                                      | Expected                                     |
| --- | ----------------------------------------- | -------------------------------------------- |
| 6   | First load with existing unencrypted DB   | DB encrypted, old file deleted, queries work |
| 7   | First load with no existing DB            | New encrypted DB created from scratch        |
| 8   | Load with already-encrypted DB            | Decrypts and loads normally                  |
| 9   | Simulate encryption failure mid-migration | Unencrypted DB preserved; retry on next load |
| 10  | Browser data cleared, re-login            | New keys generated, DB re-synced from server |

### 10.3 Key Management

| #   | Test                              | Expected                                 |
| --- | --------------------------------- | ---------------------------------------- |
| 11  | Master key is non-extractable     | `crypto.subtle.exportKey()` throws       |
| 12  | DEK is not stored in plaintext    | Only wrapped DEK in IndexedDB            |
| 13  | Key rotation: new DEK, re-encrypt | Old encrypted DB unreadable with old DEK |

---

## References

- Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- Privacy Audit v1 (`docs/architecture/privacy-audit-v1.md` §Web Storage Audit)
- Security Audit v1 (`docs/architecture/security-audit-v1.md` §MASVS-STORAGE S-6)
- `apps/web/src/db/sqlite-wasm.ts` — current unencrypted implementation
- `apps/web/src/sw/service-worker.ts` — CacheStorage usage
