# Cookie and Web Storage Audit

> **Issue:** #376
> **Last audited:** 2025-01-23
> **Scope:** `apps/web/` — all browser storage mechanisms used by the Finance PWA

This document inventories every browser storage mechanism used by the Finance web application, including cookies, localStorage, IndexedDB, Origin Private File System (OPFS), Service Worker cache, and sessionStorage. For each item, it documents what is stored, why, whether it is encrypted, and when it expires.

---

## Table of Contents

- [Storage Summary](#storage-summary)
- [Cookies](#cookies)
- [localStorage](#localstorage)
- [sessionStorage](#sessionstorage)
- [IndexedDB](#indexeddb)
- [Origin Private File System (OPFS)](#origin-private-file-system-opfs)
- [Service Worker Cache](#service-worker-cache)
- [In-Memory Storage](#in-memory-storage)
- [Browser Privacy Feature Impact](#browser-privacy-feature-impact)
  - [Safari ITP](#safari-itp)
  - [Firefox ETP](#firefox-etp)
  - [Chrome Privacy Sandbox](#chrome-privacy-sandbox)
- [Recommendations](#recommendations)

---

## Storage Summary

| Mechanism | Items | Contains PII? | Contains Financial Data? | Encrypted at Rest? |
| --- | --- | --- | --- | --- |
| **Cookies** | 1 (refresh token — set by backend) | No (opaque token) | No | N/A (HttpOnly, Secure, SameSite) |
| **localStorage** | 1 key | No | No | No |
| **sessionStorage** | 0 keys | — | — | — |
| **IndexedDB** | 2 databases | Yes (mutation payloads may contain payee names) | Yes (mutation payloads contain amounts) | No |
| **OPFS** | 1 database file | Yes (user email, payee names) | Yes (accounts, transactions, budgets, goals) | No (see note) |
| **Service Worker Cache** | 2 cache buckets | Possibly (cached API responses) | Possibly (cached API responses) | No |
| **In-memory** | 1 (access token) | No (opaque token) | No | N/A |

> **Note on OPFS encryption:** On native platforms, the SQLite database is encrypted with SQLCipher. On the web, the OPFS-backed SQLite-WASM database is **not** encrypted at the application layer. It relies on the browser's same-origin policy and the operating system's full-disk encryption for protection.

---

## Cookies

### Refresh token cookie

| Property | Value |
| --- | --- |
| **Name** | Set by backend (Supabase auth) |
| **Purpose** | Stores the refresh token for silent session renewal |
| **Set by** | Backend `Set-Cookie` response header on login and token refresh |
| **Read by client JS?** | ❌ No — HttpOnly flag prevents JavaScript access |
| **Flags** | `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`) |
| **Expiry** | Determined by backend; typically the refresh token lifetime |
| **Contains PII?** | No — opaque token value |
| **Contains financial data?** | No |

**Source:** `apps/web/src/auth/token-storage.ts` lines 9–10 explicitly state: *"The backend sets tokens via `Set-Cookie` headers. The client NEVER reads or writes token cookies directly."*

The client sends this cookie automatically via `credentials: 'include'` on refresh and logout requests.

**Security invariants** (from `token-storage.ts`):

- Tokens are NEVER stored in localStorage or sessionStorage.
- Tokens are NEVER written to IndexedDB or any web-accessible storage.
- The in-memory access token is cleared on logout.

---

## localStorage

### `finance-last-sync-time`

| Property | Value |
| --- | --- |
| **Key** | `finance-last-sync-time` |
| **Purpose** | Persists the ISO-8601 timestamp of the last successful mutation sync |
| **Written by** | `apps/web/src/db/sync/replayMutations.ts` (after successful replay); `apps/web/src/hooks/useSyncStatus.ts` (after main-thread sync) |
| **Read by** | `apps/web/src/hooks/useSyncStatus.ts` (on mount, to initialise `lastSyncTime` state) |
| **Value format** | ISO-8601 string, e.g. `"2025-01-23T14:30:00.000Z"` |
| **Contains PII?** | No |
| **Contains financial data?** | No |
| **Expiry** | None (persists until cleared) |
| **Encrypted?** | No |

This is the **only** localStorage key used by the application.

---

## sessionStorage

**No sessionStorage keys are used by the Finance web application.**

A full search of `apps/web/src/` confirms no calls to `sessionStorage.setItem`, `sessionStorage.getItem`, or `sessionStorage.removeItem`.

---

## IndexedDB

### Database 1: `finance-mutation-queue`

| Property | Value |
| --- | --- |
| **Database name** | `finance-mutation-queue` |
| **Version** | 1 |
| **Purpose** | Durable offline mutation queue — stores local writes that have not yet been pushed to the server |
| **Object store** | `mutations` (key path: `id`) |
| **Indexes** | `by_timestamp` (on `timestamp`), `by_table` (on `tableName`), `by_household` (on `householdId`) |
| **Record schema** | `{ id, tableName, recordId, operation, data, timestamp, retryCount, householdId }` |
| **Written by** | `apps/web/src/db/sync/MutationQueue.ts` via `apps/web/src/db/sync/idb.ts` |
| **Read by** | `MutationQueue.ts` (dequeue for replay), service worker (`apps/web/src/sw/service-worker.ts`) |
| **Contains PII?** | Potentially — `data` field may contain payee names or notes |
| **Contains financial data?** | Yes — `data` field contains transaction amounts, account balances, budget amounts |
| **Encrypted?** | ❌ No |
| **Expiry** | Records are removed after successful server sync (`acknowledge`) or after exceeding 5 retry attempts (dead-lettered) |

**Source files:**
- `apps/web/src/db/sync/types.ts` — constants (`MUTATION_QUEUE_DB_NAME`, `MUTATION_QUEUE_STORE_NAME`, `MUTATION_QUEUE_DB_VERSION`)
- `apps/web/src/db/sync/idb.ts` — low-level IndexedDB CRUD operations
- `apps/web/src/db/sync/MutationQueue.ts` — high-level queue API

> **Note:** A legacy version of the mutation queue also exists in `apps/web/src/db/mutation-queue.ts` using database name `finance-mutation-queue` with object store `mutations` and a `timestamp` index. The two implementations use the same database name and are compatible.

### Database 2: SQLite-WASM via IndexedDB VFS (fallback)

| Property | Value |
| --- | --- |
| **Database name** | Determined by wa-sqlite IndexedDB VFS (typically based on the filename `finance.db`) |
| **Purpose** | Fallback persistence for the SQLite-WASM database when OPFS is not available |
| **Contains PII?** | Yes — user email, display name, payee names |
| **Contains financial data?** | Yes — full financial dataset (accounts, transactions, budgets, goals, categories) |
| **Encrypted?** | ❌ No |
| **Expiry** | Persists until explicitly deleted |

This database is only created when the browser does not support the OPFS `createSyncAccessHandle` API. See `apps/web/src/db/sqlite-wasm.ts` lines 8–9.

**Tables stored** (mirroring KMP SQLDelight schema):
- `user` — email, display name, default currency
- `household` — name, owner
- `household_member` — membership and role
- `account` — name, type, balance, currency
- `category` — name, icon, colour
- `transaction` — amount, date, payee, note, tags
- `budget` — name, amount, period
- `goal` — name, target amount, current amount, target date

---

## Origin Private File System (OPFS)

### `finance.db`

| Property | Value |
| --- | --- |
| **Filename** | `finance.db` |
| **Purpose** | Primary persistence for the local SQLite-WASM database |
| **Technology** | wa-sqlite with OPFS SyncAccessHandle VFS |
| **Contains PII?** | Yes — user email, display name, payee names, notes |
| **Contains financial data?** | Yes — complete local financial dataset |
| **Encrypted?** | ❌ No (unlike native platforms which use SQLCipher) |
| **Expiry** | Persists until the user clears site data or deletes their account |
| **Accessible to JS?** | Only via the OPFS API — not accessible via regular file-system APIs or DevTools Storage panel |

**Source:** `apps/web/src/db/sqlite-wasm.ts` — `DB_NAME = 'finance.db'`

OPFS is the preferred backend. It provides better performance than IndexedDB because it supports synchronous access handles, which map well to SQLite's synchronous I/O model.

---

## Service Worker Cache

**Source:** `apps/web/src/sw/service-worker.ts`

### Cache bucket 1: `finance-static-v1`

| Property | Value |
| --- | --- |
| **Cache name** | `finance-static-v1` |
| **Strategy** | Cache-first |
| **Purpose** | Pre-caches app-shell resources and caches static assets for offline use |
| **Pre-cached resources** | `/`, `/index.html`, `/manifest.json` |
| **Auto-cached patterns** | Files matching `.js`, `.css`, `.woff2`, `.ttf`, `.otf`, `.eot`, `.png`, `.jpg`, `.gif`, `.svg`, `.ico`, `.webp`, `.avif`, `.wasm` |
| **Contains PII?** | No — static assets only |
| **Contains financial data?** | No |
| **Expiry** | Purged on activation when `CACHE_VERSION` changes (currently `v1`) |

### Cache bucket 2: `finance-api-v1`

| Property | Value |
| --- | --- |
| **Cache name** | `finance-api-v1` |
| **Strategy** | Network-first (cache is a fallback for offline) |
| **Purpose** | Caches API responses (`/api/*`) so the app can display data when offline |
| **Contains PII?** | Potentially — depends on API response content |
| **Contains financial data?** | Potentially — API responses may contain financial data |
| **Expiry** | Purged on activation when `CACHE_VERSION` changes; individual entries are overwritten on each successful network fetch |

### Cache versioning

Old caches are automatically deleted during the service worker `activate` event. Any cache key that does not match `finance-static-v1` or `finance-api-v1` is purged.

---

## In-Memory Storage

### Access token

| Property | Value |
| --- | --- |
| **Location** | Module-scoped variable in `apps/web/src/auth/token-storage.ts` |
| **Purpose** | Holds the current JWT access token for attaching to API requests |
| **Contains PII?** | The JWT payload contains `sub` (user ID) and `email` claims, but these are not extracted or persisted |
| **Persistence** | ❌ None — cleared when the JS context is destroyed (tab close, navigation away) |
| **Cleared on** | Logout (`clearTokens()`), session expiry, tab close (natural JS garbage collection) |
| **Exposed via React state?** | ❌ No — only `isAuthenticated` (boolean) and user metadata are shared via context |

**Security note:** The access token is deliberately kept out of any persistent storage. The proactive refresh mechanism (`REFRESH_THRESHOLD_MS = 2 minutes`) ensures a valid token is always available without persisting it.

---

## Browser Privacy Feature Impact

### Safari ITP

**Intelligent Tracking Prevention** (ITP) is Safari's anti-tracking system. It affects third-party cookies and caps storage for classified domains.

| ITP Behaviour | Impact on Finance | Risk Level |
| --- | --- | --- |
| **Third-party cookie blocking** | ✅ No impact — Finance uses only first-party cookies. Auth cookies are set by the same origin. | None |
| **7-day cap on script-writable storage** | ⚠️ **Potential impact** — if Safari classifies the domain as having cross-site tracking capabilities, `localStorage`, `IndexedDB`, and `Service Worker Cache` may be capped to 7 days without user interaction. OPFS persistence may also be affected. | Low (Finance is first-party only) |
| **First-party bounce tracking protection** | ✅ No impact — Finance does not redirect through tracking domains. | None |
| **CNAME cloaking detection** | ✅ No impact — no CNAME-based third-party resource loading. | None |

**Mitigations:**
- The mutation queue is transient by design — mutations are replayed and removed quickly, well within any 7-day window.
- The SQLite-WASM database stores the authoritative local copy. If ITP were to purge it, the app would re-sync from the server on next use.
- `localStorage` stores only a sync timestamp, which is non-critical.

### Firefox ETP

**Enhanced Tracking Protection** (ETP) blocks known trackers and partitions storage for third-party contexts.

| ETP Behaviour | Impact on Finance | Risk Level |
| --- | --- | --- |
| **Third-party cookie/storage partitioning** | ✅ No impact — Finance does not embed third-party content that accesses storage. | None |
| **Known tracker blocking** | ✅ No impact — Finance does not load resources from known tracker domains. Sentry (if enabled) uses a first-party tunnel or is loaded from the app's origin. | None |
| **Redirect tracking protection** | ✅ No impact — no redirect-based tracking. | None |
| **Total Cookie Protection (TCP)** | ✅ No impact — all cookies are first-party. | None |

**Note:** Firefox does not support the Background Sync API. The application handles this gracefully via a main-thread fallback: `useSyncStatus` listens for the `online` event and replays mutations directly, with a periodic polling interval of 30 seconds when online (`PERIODIC_SYNC_INTERVAL_MS`).

### Chrome Privacy Sandbox

Chrome is transitioning from third-party cookies to Privacy Sandbox APIs (Topics, Attribution Reporting, CHIPS, etc.).

| Privacy Sandbox Feature | Impact on Finance | Risk Level |
| --- | --- | --- |
| **Third-party cookie deprecation** | ✅ No impact — Finance uses only first-party cookies. | None |
| **Storage partitioning** | ✅ No impact — all storage is first-party. | None |
| **Topics API** | ✅ No impact — Finance does not participate in interest-based advertising. | None |
| **Attribution Reporting** | ✅ No impact — Finance does not perform ad attribution. | None |
| **CHIPS (Cookies Having Independent Partitioned State)** | ✅ No impact — no partitioned cookie use. | None |
| **Bounce Tracking Mitigations** | ✅ No impact — no bounce tracking patterns. | None |

**Summary:** Chrome Privacy Sandbox changes have no impact on Finance because the application does not engage in any cross-site tracking, advertising, or third-party cookie usage.

---

## Recommendations

### Short-term

1. **Encrypt the IndexedDB mutation queue payloads.** The `data` field in queued mutations contains unencrypted financial data (amounts, payee names). Consider encrypting payloads with the user's session-derived key before writing to IndexedDB.

2. **Consider encrypting the OPFS SQLite database.** Native platforms use SQLCipher; the web platform currently relies on same-origin isolation and OS-level disk encryption. Evaluate [SQLite3 Multiple Ciphers for WASM](https://nicolo-ribaudo.github.io/nicolo-nicolo-nicolo/) or the wa-sqlite encryption extension.

3. **Add a `Clear-Site-Data` header on logout.** Sending `Clear-Site-Data: "storage"` on the logout response would ensure all client-side data (IndexedDB, OPFS, localStorage, Service Worker Cache) is purged when the user signs out, providing defence-in-depth.

### Long-term

4. **Implement a storage consent banner** if analytics or non-essential storage is added in the future. Currently all storage is strictly necessary for app functionality.

5. **Monitor Safari ITP changes.** Apple periodically tightens ITP heuristics. If the 7-day cap begins affecting returning users, consider implementing a lightweight server-side session ping to reset the timer.

6. **Audit cached API responses.** The `finance-api-v1` cache may store API responses containing financial data. Consider excluding sensitive endpoints (e.g., account balances, transactions) from the cache, or implementing cache encryption.
