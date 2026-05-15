# ADR-0017: Web SQLite Database Encryption at Rest

**Status:** Proposed
**Date:** 2025-07-20
**Author:** Web Engineer (AI agent)
**Reviewers:** Pending human review
**Issue:** #1308

## Context

The Finance web app stores all financial data in a SQLite-WASM database
persisted to the Origin Private File System (OPFS) or IndexedDB fallback
(`apps/web/src/db/sqlite-wasm.ts`). Today this data is **unencrypted at
rest**. Native platforms (Android, iOS, Windows) use SQLCipher to encrypt
the local database transparently — the web platform has no equivalent.

The existing security specification
(`docs/architecture/security/web-encryption-spec.md`) identifies this as a
**CRITICAL launch blocker** (MASVS-STORAGE-1, MASVS-CRYPTO-1). The privacy
audit (v1 §Web Storage Audit) and security audit (v1 §MASVS-STORAGE S-6)
both flag unencrypted OPFS/IndexedDB storage.

### Threat scenarios

| Threat                                      | Likelihood | Impact   |
| ------------------------------------------- | ---------- | -------- |
| Shared computer — next user reads OPFS      | HIGH       | CRITICAL |
| Malware / browser extension reads storage   | MEDIUM     | CRITICAL |
| Forensic extraction of browser profile      | MEDIUM     | HIGH     |
| Physical device theft with unlocked browser | MEDIUM     | HIGH     |
| XSS exfiltrating database file              | LOW        | CRITICAL |

### Current state

The codebase already contains:

1. **`apps/web/src/db/encryption.ts`** — a complete Web Crypto envelope
   encryption module (AES-256-GCM, PBKDF2 key derivation, salt persistence,
   encrypted IndexedDB read/write). This is unused by `initDatabase()` today.
2. **`setEncryptionSecret()` in `sqlite-wasm.ts`** — a module-level
   encryption secret hook that is declared but never wired into the
   persistence path.
3. **`docs/architecture/security/web-encryption-spec.md`** — a detailed
   implementation specification covering algorithm choice, key hierarchy,
   migration, and performance targets.

The infrastructure to encrypt is partially built but not activated. This ADR
decides **which encryption strategy** to use for the production launch.

### Forces

- Native platforms use SQLCipher (AES-256-CBC, page-level encryption
  integrated into the SQLite engine) — we want parity.
- PowerSync JS SDK manages its own local SQLite database; any encryption
  strategy must be compatible with PowerSync's database access patterns.
- Web Crypto API (`crypto.subtle`) is available in all target browsers
  (Chrome 37+, Firefox 34+, Safari 11+, Edge 79+) and is hardware-
  accelerated.
- The app is offline-first — encryption/decryption must not introduce
  latency that degrades the user experience.
- OPFS persistence is handled by wa-sqlite's VFS layer; IndexedDB
  persistence is snapshot-based (`db.export()` / `new Database(buffer)`).

## Decision

**Use Web Crypto API envelope encryption (AES-256-GCM) of the full database
file, as already specified in `web-encryption-spec.md` and partially
implemented in `encryption.ts`.** Activate the existing encryption module
for the IndexedDB fallback path immediately, and extend it to cover OPFS
database export/import cycles.

This is **Alternative 2** below. SQLCipher-WASM (Alternative 1) is the
long-term ideal but is not viable for the initial launch due to PowerSync
compatibility and bundle size concerns. Application-level field encryption
(Alternative 3) is rejected due to information leakage.

### Key design points

1. **Algorithm**: AES-256-GCM via `crypto.subtle` (authenticated encryption).
2. **Key derivation**: PBKDF2-SHA256 with 600,000 iterations (OWASP 2024
   minimum). Argon2id via WASM is a future upgrade path.
3. **Key hierarchy**: Non-extractable `CryptoKey` master key stored in
   IndexedDB wraps a random 256-bit Data Encryption Key (DEK). The DEK
   encrypts/decrypts the database blob.
4. **Key input**: Derived from the user's authentication credential (Supabase
   JWT or passphrase). On key loss (browser data cleared), the local
   database is discarded and re-synced from the server.
5. **Scope**: Full-database encryption — the entire SQLite file is encrypted
   as one blob before writing to OPFS/IndexedDB.
6. **Migration**: Detect unencrypted databases by checking for the SQLite
   header magic bytes (`SQLite format 3\0`); encrypt in-place with
   verify-before-delete safety.

## Alternatives Considered

### Alternative 1: SQLCipher-WASM (page-level transparent encryption)

Compile SQLCipher (or use a pre-built distribution like `@aspect-build/sqlcipher-wasm`)
as the WASM SQLite driver, replacing wa-sqlite / sql.js with a build that
includes SQLCipher's page-level AES-256-CBC encryption.

**How it works**: SQLCipher encrypts each SQLite page independently. The
database file is always encrypted on disk. The application supplies a key
via `PRAGMA key = '...'` and all reads/writes are transparently
encrypted/decrypted at the page level.

- **Pros:**
  - Exact parity with native platforms (Android, iOS, Windows all use
    SQLCipher).
  - Transparent — no changes to repository SQL queries, hooks, or
    components.
  - Individual page encryption means only modified pages are re-encrypted
    on write (better incremental performance).
  - Battle-tested in production financial apps (Cash App, Signal, 1Password).
  - WAL mode, indexes, and metadata are all encrypted.

- **Cons:**
  - **PowerSync compatibility is unverified.** PowerSync JS SDK bundles its
    own SQLite WASM module and manages database access internally. Replacing
    it with SQLCipher-WASM requires either (a) PowerSync to support
    SQLCipher as a pluggable backend, or (b) maintaining two separate
    databases (one for PowerSync sync, one for app data). Neither is
    currently supported. This is a **blocking issue**.
  - **Bundle size increase**: SQLCipher-WASM is ~1.5–2 MB larger than
    standard SQLite-WASM due to the OpenSSL/libcrypto dependency. This
    exceeds the performance budget for initial load.
  - **Build complexity**: SQLCipher requires compiling SQLite with
    `-DSQLITE_HAS_CODEC` and linking against OpenSSL or libtomcrypt. The
    existing wa-sqlite build pipeline would need significant modification.
  - **No official wa-sqlite + SQLCipher integration.** The wa-sqlite project
    does not ship a SQLCipher variant. Community forks exist but are
    unmaintained.
  - **OPFS VFS interaction**: SQLCipher's page-level encryption must
    integrate with wa-sqlite's `OriginPrivateFileSystemVFS`. This is
    untested territory.

- **Verdict:** Best long-term solution but **not viable for launch.** Revisit
  when PowerSync publishes SQLCipher support or when we migrate away from
  PowerSync's bundled SQLite.

### Alternative 2: Web Crypto API envelope encryption ✅ SELECTED

Encrypt the entire SQLite database file as a single AES-256-GCM blob using
the Web Crypto API before persisting to OPFS/IndexedDB. Decrypt on load.

**How it works**: On database save, export the in-memory SQLite database to
a `Uint8Array`, encrypt it with AES-256-GCM, and write the ciphertext. On
load, read the ciphertext, decrypt, and import the plaintext into SQLite.

- **Pros:**
  - **Already partially implemented** — `encryption.ts` provides the full
    encrypt/decrypt/key-derivation stack. `web-encryption-spec.md` documents
    the complete design.
  - **No dependency changes** — uses the browser's native `crypto.subtle`
    (hardware-accelerated, CSP-safe, zero bundle cost).
  - **PowerSync compatible** — PowerSync manages its own database
    independently; our app database is encrypted separately. No conflict.
  - **Simple integration** — wire `encryptDatabase()` / `decryptDatabase()`
    into the existing `persistToIndexedDB()` / `loadFromIndexedDB()` and
    OPFS export/import paths.
  - **Proven performance** — Web Crypto AES-256-GCM benchmarks at <50ms for
    1 MB, <200ms for 10 MB (hardware-accelerated).
  - **Key hierarchy** with non-extractable `CryptoKey` provides defense in
    depth — even XSS cannot extract the raw key bytes.

- **Cons:**
  - **All-or-nothing encryption** — the entire database must be
    encrypted/decrypted on every save/load cycle. No incremental page-level
    encryption.
  - **Performance at scale** — for very large databases (50+ MB), full-file
    encryption may take 500ms+. Mitigated by using Web Workers and dirty
    flags to avoid unnecessary re-encryption.
  - **In-memory exposure** — the decrypted database exists in memory during
    the session. A sophisticated memory-scraping attack could read it.
    (This is also true of SQLCipher — the decrypted pages are in memory
    during use.)
  - **WAL mode interaction** — OPFS with wa-sqlite's VFS uses WAL mode.
    Encryption must handle the WAL checkpoint lifecycle (encrypt after
    checkpoint, not during incremental WAL writes). This adds complexity.

- **Verdict:** Best balance of security, compatibility, and time-to-ship.
  The existing implementation covers ~80% of the work.

### Alternative 3: Application-level field encryption

Encrypt sensitive columns (amounts, payee names, notes) individually using
Web Crypto, storing ciphertext in the SQLite columns.

**How it works**: Before writing a transaction, encrypt `amount`, `payee`,
and `note` fields. On read, decrypt them. Non-sensitive columns (IDs,
timestamps, sync metadata) remain in plaintext.

- **Pros:**
  - Incremental — only changed fields are re-encrypted.
  - Queries on non-sensitive columns still work (e.g., date range filters).
  - Smallest performance overhead per write.

- **Cons:**
  - **Information leakage** — table structure, row counts, column names,
    timestamps, category IDs, account IDs, and relational structure are all
    visible in plaintext. An attacker can infer spending patterns,
    transaction frequency, and financial relationships without decrypting
    a single field.
  - **Query limitations** — cannot use SQL aggregation (`SUM`, `AVG`,
    `GROUP BY`) on encrypted columns. Budget calculations, net worth
    summaries, and spending analysis would need to decrypt all rows into
    memory first, negating any performance benefit.
  - **No parity with native** — SQLCipher encrypts the full file; field-level
    encryption is a fundamentally different model.
  - **High implementation cost** — every repository function must
    encrypt/decrypt individual fields. Error-prone and hard to audit.
  - **Index leakage** — SQLite indexes on encrypted columns are useless
    (ciphertext is not sortable/searchable), but indexes on plaintext
    columns leak access patterns.

- **Verdict:** Rejected. Information leakage makes this unsuitable for a
  financial application.

## Consequences

### Positive

- All financial data stored in OPFS/IndexedDB will be encrypted at rest,
  closing the CRITICAL security finding.
- No new dependencies — uses existing browser APIs and existing code.
- Compatible with PowerSync sync layer — no conflict with PowerSync's own
  database management.
- Key hierarchy with non-extractable CryptoKey provides defense against
  XSS key extraction.
- Migration from unencrypted is seamless and automatic.

### Negative

- Full-file encryption adds latency to database load/save (estimated
  <200ms for typical databases under 10 MB).
- In-memory database is unencrypted during the session — same exposure as
  SQLCipher (decrypted pages in memory).
- Key loss (browser data cleared) requires full re-sync from server.
- OPFS + WAL mode integration requires careful handling of checkpoint
  timing.

### Risks

| Risk                                       | Mitigation                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Performance regression on large databases  | Web Worker encryption; dirty flag to skip redundant saves; benchmark in CI        |
| Key derivation too slow on low-end devices | PBKDF2 600K iterations benchmarks at ~300ms on mobile Chrome; acceptable          |
| PowerSync future changes conflict          | PowerSync uses its own database; our encryption is independent                    |
| Browser clears IndexedDB (master key lost) | Expected behavior — re-sync from server on next login                             |
| Memory-scraping attack reads decrypted DB  | Out of scope — if attacker has code execution in the page, they can read anything |

## Implementation Notes

### What exists today

| File                                                | Status          | Notes                                                              |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `apps/web/src/db/encryption.ts`                     | ✅ Complete     | AES-256-GCM, PBKDF2, salt persistence, encrypted IDB read/write    |
| `apps/web/src/db/sqlite-wasm.ts`                    | 🔧 Needs wiring | `setEncryptionSecret()` declared but not connected to persist/load |
| `docs/architecture/security/web-encryption-spec.md` | ✅ Complete     | Full specification with test cases                                 |

### What needs to be built (follow-up issue)

1. **Wire encryption into `initDatabase()`** — when `_encryptionSecret` is
   set, use `loadEncryptedDatabase()` / `saveEncryptedDatabase()` instead of
   the plaintext `loadFromIndexedDB()` / `persistToIndexedDB()`.
2. **OPFS encryption path** — implement periodic encrypted snapshots of the
   OPFS database (checkpoint → export → encrypt → store encrypted backup).
3. **Key derivation from auth** — derive the encryption secret from the
   Supabase auth token in the auth flow (`apps/web/src/auth/`).
4. **Migration detector** — check for SQLite header magic bytes to detect
   unencrypted databases and trigger automatic encryption migration.
5. **`clearEncryptedData()` on logout** — call the existing function from
   `encryption.ts` when the user signs out.
6. **Web Worker offload** — move encryption/decryption to the SQLite Web
   Worker to avoid main-thread jank.
7. **Vitest tests** — test encrypt/decrypt round-trip, tamper detection,
   wrong-key rejection, migration from unencrypted.

### Browser support

| Browser     | Web Crypto | OPFS       | Status       |
| ----------- | ---------- | ---------- | ------------ |
| Chrome 37+  | ✅         | ✅ (86+)   | Full support |
| Firefox 34+ | ✅         | ✅ (111+)  | Full support |
| Safari 11+  | ✅         | ✅ (15.2+) | Full support |
| Edge 79+    | ✅         | ✅ (86+)   | Full support |

### What this protects against

- ✅ Shared computer — encrypted database is unreadable without the key
- ✅ Browser profile forensic extraction — ciphertext only
- ✅ Malware reading OPFS/IndexedDB files — ciphertext only
- ✅ Data integrity — GCM authentication tag detects tampering

### What this does NOT protect against

- ❌ Active XSS with code execution — attacker can call `crypto.subtle`
  with the in-memory key, or read decrypted data from React state
- ❌ Memory-scraping attacks — decrypted database is in memory during use
- ❌ Browser zero-days — if the browser sandbox is compromised, all bets
  are off
- ❌ User choosing a weak passphrase — mitigated by using auth tokens
  (not user-chosen passwords) as key input
- ❌ Physical access to an unlocked, authenticated session — the database
  is decrypted while the user is logged in

### Long-term roadmap

1. **Phase 1 (this ADR)**: Web Crypto envelope encryption — closes the
   CRITICAL finding for launch.
2. **Phase 2**: Evaluate SQLCipher-WASM when PowerSync publishes pluggable
   SQLite backend support. Page-level encryption would eliminate the
   full-file encrypt/decrypt cycle.
3. **Phase 3**: Argon2id key derivation via WASM module to replace PBKDF2
   for stronger memory-hard key stretching.

## References

- [Web Crypto API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [OPFS — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [SQLCipher](https://www.zetetic.net/sqlcipher/)
- [OWASP Key Derivation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- `docs/architecture/security/web-encryption-spec.md` — detailed implementation spec
- `docs/architecture/0003-local-storage-strategy.md` — local storage ADR (SQLDelight + SQLCipher for native)
- `apps/web/src/db/encryption.ts` — existing Web Crypto encryption module
- `apps/web/src/db/sqlite-wasm.ts` — current SQLite-WASM setup
- Issue #1308 — alpha: protect web offline database at rest
- Issue #443 — original security review flagging unencrypted OPFS/IndexedDB
