# Finance Monorepo Architecture Overview

_Last updated: 2025-07-27_

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. Architecture Diagram](#2-architecture-diagram)
- [3. System Boundaries](#3-system-boundaries)
- [4. Data Flow](#4-data-flow)
- [5. Key Components](#5-key-components)
- [6. Security & Privacy](#6-security--privacy)
- [7. Open Questions](#7-open-questions)

---

## 1. System Overview

Finance is a multi-platform, edge-first financial management application. The monorepo contains:

- Native apps for Android, iOS, Web (PWA), and Windows
- Shared business logic and data models via Kotlin Multiplatform (KMP)
- A thin backend (Supabase + PowerSync) for sync, authentication, and multi-device coordination
- End-to-end encryption for sensitive data, with platform-native security on all devices

**Principles:**

- Native-first UX on every platform
- Edge-first: most operations and storage are local
- Privacy by design: encryption at rest and in transit
- Multi-user: household/partner sharing with RBAC

## 2. Architecture Diagram

```mermaid
graph TD
  subgraph Clients
    A1(Android)
    A2(iOS)
    A3(Web PWA)
    A4(Windows)
  end
  subgraph SharedLogic[Shared KMP Logic]
    B1(Core Logic)
    B2(Data Models)
    B3(Sync Engine)
  end
  subgraph LocalStorage[Local Storage]
    C1(SQLDelight+SQLCipher)
    C2(MMKV/Keychain)
  end
  subgraph Backend
    D1(Supabase[PostgreSQL+Auth])
    D2(PowerSync)
    D3(Edge Functions)
  end
  A1-->|KMP|B1
  A2-->|KMP|B1
  A3-->|KMP|B1
  A4-->|KMP|B1
  B1-->|Data|C1
  B1-->|Prefs|C2
  B1-->|Sync|D2
  D2-->|Delta Sync|D1
  D1-->|RLS|D1
  D1-->|Auth|D1
  D1-->|EdgeFn|D3
  D3-->|API|A1
  D3-->|API|A2
  D3-->|API|A3
  D3-->|API|A4
```

## 3. System Boundaries

- **Client boundary:** Each app (Android, iOS, Web, Windows) runs most logic and storage locally. Shared logic is in KMP packages (`core`, `models`, `sync`).
- **Backend boundary:** The backend (Supabase + PowerSync) is responsible for authentication, sync coordination, and enforcing tenant isolation (RLS). No business logic is on the server.
- **Data boundary:** Sensitive data is encrypted end-to-end. Only metadata and sync primitives are visible to the backend.

## 4. Data Flow

1. **User action** (e.g., add transaction) triggers local update via shared KMP logic.
2. **Local storage**: Data is written to encrypted SQLite (SQLDelight + SQLCipher).
3. **Sync engine**: Changes are queued for sync (PowerSync delta protocol).
4. **Background sync**: When online, the sync engine pushes/pulls deltas to/from PowerSync.
5. **Backend**: Supabase receives encrypted payloads, authenticates user, enforces RLS, and relays changes to other devices.
6. **Multi-device**: Other devices pull deltas and update their local state.

**Authentication:**

- Passkeys (WebAuthn/FIDO2) are primary; OAuth 2.0 + PKCE is fallback.
- Biometric gating for local unlock; tokens stored in platform Keychain/Keystore.

## 5. Key Components

- **Shared KMP Packages:**
  - `core`: Business logic, validation, calculations, feature flags, i18n, monitoring interfaces, data export, prediction/recommendation engines
  - `models`: Data classes, serialization
  - `sync`: Delta sync, conflict resolution
- **Local Storage:**
  - SQLDelight + SQLCipher for relational data
  - MMKV (Android), Keychain (iOS), DPAPI (Windows), IndexedDB (Web) for key-value
- **Backend:**
  - Supabase (PostgreSQL, Auth, 16 Edge Functions including health-check, launch-readiness, data-export, account-deletion, device-attestation, rate-limiting)
  - PowerSync for delta sync protocol
  - Row-Level Security (RLS) for tenant isolation, with automated RLS verification and schema integrity checks
  - 23 database migrations with production health summary functions
- **Infrastructure:**
  - Self-hosted Docker Compose stack (Supabase + PowerSync + Caddy) on VPS
  - Uptime Kuma for uptime monitoring
  - Automated daily backups with off-site encrypted storage
  - Deploy configuration in `deploy/` with staging and production profiles
- **Security:**
  - End-to-end encryption for sensitive fields
  - Key management per platform (Secure Enclave, TEE, TPM)
  - Hybrid E2E: server can only see metadata, not financial details

## 6. Security & Privacy

- **Authentication:** Passkeys (WebAuthn/FIDO2), OAuth 2.0 + PKCE fallback, social login
- **Authorization:** Household RBAC, enforced at API, service, and DB (RLS) layers
- **Encryption:**
  - SQLCipher for local DB
  - Envelope encryption for sensitive fields
  - All tokens/keys in platform Keychain/Keystore
- **Compliance:** GDPR, CCPA, crypto-shredding for account deletion

## 7. Open Questions

- **Key recovery:** What is the final UX for lost device/key recovery?
- **Household sharing:** Is the key exchange protocol for household E2E fully implemented on all platforms?

### Resolved Questions

- **Web PWA:** ✅ TypeScript + React PWA with KMP logic via JS bindings (Compose for Web deferred). See [ADR-0001](0001-cross-platform-framework.md).
- **Windows app:** ✅ Compose Desktop (JVM) confirmed as long-term solution. See [ADR-0001](0001-cross-platform-framework.md).

---

For detailed ADRs and platform-specific diagrams, see the [architecture directory](./) and the [Architecture Diagrams](diagrams.md) document for comprehensive Mermaid diagrams of all system components.

### Architecture Decision Records (ADR) Index

| ADR  | Title                                  | Status   |
| ---- | -------------------------------------- | -------- |
| 0001 | Cross-Platform Framework               | Accepted |
| 0002 | Backend & Sync Architecture            | Accepted |
| 0003 | Local Storage Strategy                 | Accepted |
| 0004 | Auth & Security Architecture           | Accepted |
| 0005 | Design System Approach                 | Accepted |
| 0006 | CI/CD Strategy                         | Accepted |
| 0007 | Hosting Strategy                       | Accepted |
| 0008 | _(reserved — number not yet assigned)_ | —        |
| 0009 | Legal & Monetization Analysis          | Accepted |
| 0010 | V2 Architecture Vision                 | Proposed |
| 0011 | Scaling Architecture                   | Proposed |
| 0012 | API Versioning Strategy                | Proposed |
| 0013 | Multi-Tenancy Architecture             | Proposed |
| 0014 | AI/ML Pipeline Architecture            | Proposed |

> **Note:** ADR-0008 is unassigned (numbering gap). The next new ADR should use number 0008 before proceeding to 0015+.
