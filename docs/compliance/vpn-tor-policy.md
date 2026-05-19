# VPN and Tor Compatibility Policy

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-27
> **Related Issues:** [#1711](https://github.com/jrmoulckers/finance/issues/1711)
> **Related Docs:** [Privacy & Security Guide](../guides/privacy-security.md), [Trust & Manual Entry](../guides/trust-and-manual-entry.md)

---

## Table of Contents

- [Policy statement](#policy-statement)
- [Design principles](#design-principles)
- [Supported configurations](#supported-configurations)
- [Known limitations](#known-limitations)
- [QA test matrix](#qa-test-matrix)
- [Rate limiting considerations](#rate-limiting-considerations)
- [User-facing help content](#user-facing-help-content)
- [Implementation guidance](#implementation-guidance)

---

## Policy statement

**Finance does not block, restrict, or degrade service for users connecting through VPNs, Tor, or other privacy-preserving network paths.** This is a deliberate product policy, not an oversight.

Users who choose to protect their network privacy should not be penalised for doing so. A personal finance app that claims to respect privacy must also respect the network-level privacy choices its users make.

### Exceptions

The only circumstances under which privacy-preserving network paths may be restricted are:

1. **Automated abuse** — If a specific IP or exit node is used for credential stuffing, brute-force attacks, or API abuse, rate limiting applies equally regardless of network type (see [Rate limiting considerations](#rate-limiting-considerations))
2. **Regulatory requirement** — If a jurisdiction legally requires IP-based restrictions (e.g., sanctions compliance), those restrictions are applied at the narrowest possible scope and documented in the [Security Transparency Report](./security-transparency-report.md)

Neither exception targets VPN or Tor users specifically — they apply equally to all traffic sources.

---

## Design principles

### 1. No IP-based identity verification

Finance uses token-based authentication (Supabase Auth with JWTs). Authentication does not depend on IP address, geographic location, or network path. This means:

- No IP address is stored as part of the user identity
- No "suspicious login from new location" alerts that would penalise VPN users
- No IP-based session binding that would break when VPN endpoints change

### 2. No geographic restrictions on core functionality

All core functionality (manual entry, budgeting, goals, reports) works regardless of the user's apparent geographic location. Currency and locale are user-configured, not IP-derived.

### 3. No TLS fingerprinting or network inspection

Finance does not perform TLS fingerprinting, browser fingerprinting, or network path analysis to detect or flag VPN/Tor usage.

### 4. Minimal metadata collection

The backend does not log source IP addresses for operational telemetry. Rate limiting uses authenticated user IDs, not IP addresses (see the
ate-limit.ts shared module in services/api/supabase/functions/\_shared/).

---

## Supported configurations

### Fully supported

| Configuration                                          | Notes                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Commercial VPN** (NordVPN, Mullvad, ProtonVPN, etc.) | No restrictions. All features work normally.                                           |
| **Corporate VPN**                                      | No restrictions. May have employer-side content filtering that Finance cannot control. |
| **WireGuard / OpenVPN self-hosted**                    | No restrictions.                                                                       |
| **Tor Browser** (web app)                              | Supported with known limitations (see below).                                          |
| **Tor via Orbot** (Android)                            | Supported with known limitations (see below).                                          |
| **iCloud Private Relay** (iOS/macOS)                   | No restrictions. Fully compatible.                                                     |
| **DNS-over-HTTPS / DNS-over-TLS**                      | No restrictions. Fully compatible.                                                     |

### Supported with known limitations

| Configuration                            | Limitation                       | Reason                                                                                                    |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Tor Browser**                          | WebSocket sync may be unreliable | Tor's circuit rotation can interrupt long-lived WebSocket connections used by PowerSync                   |
| **Tor Browser**                          | Service Worker may be disabled   | Tor Browser disables Service Workers by default for privacy; offline PWA features require Service Workers |
| **Tor hidden services (.onion)**         | Not available                    | Finance does not host a .onion mirror; access is via the public domain over Tor exit nodes                |
| **Highly restrictive corporate proxies** | Sync may fail                    | Deep packet inspection or WebSocket blocking by the proxy is outside Finance's control                    |

---

## Known limitations

### 1. WebSocket connections through Tor

**What happens:** PowerSync uses WebSocket connections for real-time sync. Tor rotates circuits periodically (typically every 10 minutes), which can terminate WebSocket connections mid-sync.

**User impact:** Sync may disconnect and reconnect more frequently than on a direct connection. No data is lost — the sync engine handles reconnection and conflict resolution automatically.

**Mitigation:** The PowerSync sync engine includes automatic reconnection with exponential backoff. Partial syncs resume from the last checkpoint, not from the beginning.

**User-facing explanation:** "Sync may reconnect more frequently when using Tor. This is normal — your data syncs fully each time, and nothing is lost."

### 2. Service Workers in Tor Browser

**What happens:** Tor Browser's default security level disables Service Workers, which Finance uses for offline PWA functionality and background sync.

**User impact:** The web app works but without offline support. Users must be online to access their data in Tor Browser.

**Mitigation:** Finance works as a standard web app without Service Workers. All core features function; only offline caching is affected.

**User-facing explanation:** "Tor Browser's security settings disable offline mode. Your data is still encrypted and synced normally, but the app requires an internet connection in Tor Browser."

### 3. Connection latency

**What happens:** VPN and especially Tor add network latency. Initial sync of large datasets may take noticeably longer.

**User impact:** First sync after account creation may be slower. Subsequent syncs are incremental (delta-only) and typically unaffected.

**Mitigation:** The sync engine uses delta sync — only changed records are transmitted. After initial sync, payloads are small regardless of network latency.

**User-facing explanation:** "Initial sync may take longer over Tor or VPN. After the first sync, updates are small and fast."

---

## QA test matrix

### Test environments

| #   | Configuration                         | Platform         | Test focus                                   |
| --- | ------------------------------------- | ---------------- | -------------------------------------------- |
| 1   | No VPN (baseline)                     | All              | Baseline performance and functionality       |
| 2   | Commercial VPN (Mullvad or ProtonVPN) | All              | Full functionality, sync performance         |
| 3   | WireGuard self-hosted                 | Android, Windows | Sync reliability                             |
| 4   | Tor Browser (default security)        | Web              | Service Worker limitations, sync reliability |
| 5   | Tor Browser (safest security)         | Web              | JavaScript-heavy feature degradation         |
| 6   | Orbot (Tor on Android)                | Android          | App-wide Tor routing, sync reliability       |
| 7   | iCloud Private Relay                  | iOS              | Sync, authentication, no IP leakage          |
| 8   | Corporate proxy with SSL inspection   | Web, Windows     | Certificate pinning behaviour, sync          |

### Test cases

| #   | Test case                                      | Expected result                   | Configurations |
| --- | ---------------------------------------------- | --------------------------------- | -------------- |
| T1  | User can create account and sign in            | ✅ Success                        | All            |
| T2  | User can create and edit transactions          | ✅ Success                        | All            |
| T3  | Sync completes successfully                    | ✅ Success (may reconnect on Tor) | All            |
| T4  | App works offline after initial sync           | ✅ Success (except Tor Browser)   | 1–3, 6–8       |
| T5  | Rate limiting does not trigger on normal usage | ✅ No rate limit                  | All            |
| T6  | WebSocket reconnects after circuit rotation    | ✅ Auto-reconnects                | 4, 5, 6        |
| T7  | No IP address logged in server telemetry       | ✅ No IP in logs                  | All            |
| T8  | Authentication works after VPN endpoint change | ✅ Session persists               | 2, 3           |
| T9  | Passkey/WebAuthn works over VPN                | ✅ Success                        | 2, 3, 7        |
| T10 | Data export works over Tor                     | ✅ Success                        | 4, 5, 6        |

### Performance benchmarks

| Metric                              | Baseline (no VPN) | VPN  | Tor   |
| ----------------------------------- | ----------------- | ---- | ----- |
| **Auth round-trip**                 | < 500ms           | < 1s | < 5s  |
| **Initial sync (100 transactions)** | < 3s              | < 5s | < 15s |
| **Delta sync (single transaction)** | < 500ms           | < 1s | < 5s  |
| **Data export (1000 transactions)** | < 5s              | < 8s | < 30s |

---

## Rate limiting considerations

Finance's rate limiting is designed to be VPN/Tor-friendly:

### Current implementation

Rate limiting in services/api/supabase/functions/\_shared/rate-limit.ts is keyed on **authenticated user ID**, not IP address. This means:

- Multiple VPN users sharing an exit node IP are rate-limited independently
- A user switching VPN endpoints retains their rate limit state (tied to their account, not their IP)
- Tor exit nodes are not penalised for serving multiple Finance users

### Anti-abuse without IP blocking

| Abuse type            | Detection method                    | Response                                                        |
| --------------------- | ----------------------------------- | --------------------------------------------------------------- |
| Credential stuffing   | Failed auth rate per account        | Account lockout with email recovery                             |
| API flooding          | Request rate per authenticated user | HTTP 429 with retry-after header                                |
| Unauthenticated abuse | Request rate per function endpoint  | Global rate limit (affects all unauthenticated traffic equally) |

**Policy:** If a global rate limit must be applied to unauthenticated traffic (e.g., sign-up endpoint), it should use a sliding window, not a blanket IP block. Tor exit nodes must not be added to any deny list.

---

## User-facing help content

### FAQ entry

**Q: Can I use Finance with a VPN or Tor?**

A: Yes. Finance works normally with VPNs, Tor, and other privacy-preserving networks. We don't block, restrict, or degrade service based on your network choice.

A few things to know:

- **Sync may reconnect more often on Tor** — Tor rotates circuits periodically, which can briefly interrupt sync. Your data is never lost; it picks up where it left off.
- **Offline mode requires Service Workers** — Tor Browser disables these by default. The app works online but won't cache data for offline use in Tor Browser.
- **First sync may be slower** — VPN and Tor add latency. After the first sync, updates are small and fast.

Everything else — transactions, budgets, goals, reports, encryption — works identically regardless of your network.

### In-app help text (Settings → Network)

> Finance respects your network privacy choices. VPNs, Tor, and private relays are fully supported. We do not block or restrict access based on your network path, and we do not log IP addresses.

---

## Implementation guidance

### For developers

1. **Never use IP addresses for authentication or session management.** All auth is token-based via Supabase Auth JWTs.
2. **Never add IP-based deny lists.** If abuse mitigation requires IP-level action, escalate to a human decision (see [Security Transparency Report](./security-transparency-report.md) for disclosure requirements).
3. **Rate limiting must use user IDs, not IPs**, for authenticated endpoints. Unauthenticated endpoints may use sliding-window IP rate limiting but must not maintain persistent deny lists.
4. **WebSocket reconnection must be automatic.** The sync engine must handle connection drops gracefully — this benefits all users, not just Tor users.
5. **Never perform TLS fingerprinting** or user-agent analysis to detect VPN/Tor usage.
6. **Test with Tor** — include Tor Browser in the web QA matrix for every release.

### For infrastructure

1. **Supabase Edge Functions** do not receive client IP addresses by default — this is correct and should not be changed.
2. **CORS allowlist** is origin-based, not IP-based — compatible with all network paths.
3. **Certificate pinning** (if implemented) must account for corporate proxy SSL inspection — provide a user-accessible setting to disable pinning if needed, with appropriate security warnings.

---

_For the full privacy and security guide, see [Privacy & Security](../guides/privacy-security.md). For transparency reporting, see the [Security Transparency Report](./security-transparency-report.md)._
