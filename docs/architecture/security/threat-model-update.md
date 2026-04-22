# Updated Threat Model — STRIDE Analysis

**Sprint:** Security Review Sprint 1
**Date:** 2025-07-27
**Auditor:** Security Reviewer (AI-assisted)
**Methodology:** STRIDE threat modeling framework
**Scope:** All new features — gamification, premium/IAP, family plans, notifications, bank connections

---

## Executive Summary

This threat model applies STRIDE analysis to five new feature areas planned for the Finance application. Each feature introduces new attack surfaces, data flows, and trust boundaries that must be addressed before production deployment. The analysis identifies **8 CRITICAL**, **12 HIGH**, **15 MEDIUM**, and **10 LOW** severity threats across all features.

### Feature Risk Summary

| Feature          | CRITICAL | HIGH | MEDIUM | LOW | Overall Risk |
| ---------------- | -------- | ---- | ------ | --- | ------------ |
| Gamification     | 1        | 2    | 3      | 2   | MEDIUM       |
| Premium/IAP      | 3        | 3    | 3      | 2   | HIGH         |
| Family Plans     | 2        | 3    | 4      | 2   | HIGH         |
| Notifications    | 1        | 2    | 2      | 2   | MEDIUM       |
| Bank Connections | 1        | 2    | 3      | 2   | HIGH         |

---

## 1. Gamification Feature

### Assets

- User achievement data, streaks, points, leaderboard rankings
- Badge/reward metadata and unlock conditions
- User engagement metrics and behavioral patterns

### Entry Points

- Client-side API calls for recording achievements
- Leaderboard query endpoints
- Badge unlock triggers from financial activity

### Trust Boundaries

- Client app → Edge Function (untrusted → authenticated)
- Edge Function → PostgreSQL (authenticated → trusted)
- User's household scope → global leaderboard (household-isolated → shared)

### STRIDE Threats

| ID  | Threat                                           | STRIDE Category    | Severity | Mitigation                                                                                           |
| --- | ------------------------------------------------ | ------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| G-1 | Client spoofs achievement completion events      | Spoofing           | HIGH     | Server-side achievement validation only; never trust client claims of badge unlocks                  |
| G-2 | User manipulates streak data via sync conflicts  | Tampering          | HIGH     | Server-authoritative streak calculation; derive from transaction history, not client-submitted state |
| G-3 | Achievement unlock logic leaks financial details | Information Disc.  | MEDIUM   | Return only achievement metadata (name, icon, date); never include triggering transaction details    |
| G-4 | Leaderboard exposes household financial rankings | Information Disc.  | MEDIUM   | Opt-in only; use relative rankings (percentile) not absolute amounts; household-level consent        |
| G-5 | Denial of service via achievement flood          | Denial of Service  | MEDIUM   | Rate limit achievement recording (max 100/hour per user); batch processing for bulk triggers         |
| G-6 | User claims another user''s achievement          | Elevation of Priv. | CRITICAL | RLS policy: achievements scoped to user_id = auth.uid(); server-side ownership validation            |
| G-7 | Gamification data used without consent           | Repudiation        | LOW      | Audit log all gamification opt-in/opt-out; consent timestamp in user preferences                     |
| G-8 | Badge images/assets served from untrusted CDN    | Tampering          | LOW      | Subresource Integrity (SRI) on CDN assets; pin asset hashes in deployment config                     |

### Recommended Controls

1. **Server-authoritative achievement engine** — All badge/streak calculations MUST happen server-side based on actual financial data, never from client-submitted state.
2. **RLS on gamification tables** — `user_id = auth.uid()` for all personal achievements; `household_id = ANY(auth.household_ids())` for household challenges.
3. **Privacy-safe leaderboards** — Never expose absolute financial amounts; use percentile rankings or anonymized position numbers.
4. **Rate limiting** — Dedicated rate limit config for achievement recording endpoints.

---

## 2. Premium/IAP Feature

### Assets

- Subscription status, tier information, billing history
- Payment method tokens (Stripe/RevenueCat)
- Receipt validation data (App Store / Google Play)
- Feature gate configuration

### Entry Points

- iOS StoreKit 2 / Google Play Billing Library APIs
- Server-side receipt validation webhook
- Feature gate check endpoints
- Subscription management API

### Trust Boundaries

- App Store / Play Store → our webhook (external trusted → server)
- Client app → feature gate check (untrusted → server)
- Payment processor → our backend (external trusted → server)
- Server → client feature unlock (server → untrusted)

### STRIDE Threats

| ID   | Threat                                                 | STRIDE Category    | Severity | Mitigation                                                                                                            |
| ---- | ------------------------------------------------------ | ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| P-1  | Forged purchase receipt grants premium access          | Spoofing           | CRITICAL | Server-side receipt verification with Apple/Google APIs; never trust client-side receipt claims                       |
| P-2  | Replay of old valid receipt to re-enable premium       | Tampering          | CRITICAL | Store receipt transaction_id; reject duplicates; validate receipt expiry date server-side                             |
| P-3  | Man-in-the-middle on receipt validation webhook        | Tampering          | HIGH     | Webhook signature verification (Apple App Store Server Notifications V2 signed JWS; Google RTDN with service account) |
| P-4  | Feature gate bypass via client-side check manipulation | Elevation of Priv. | CRITICAL | Feature gates enforced server-side (RLS policies + Edge Function checks); client gates are UX-only, not security      |
| P-5  | Subscription status leaks via API response timing      | Information Disc.  | MEDIUM   | Constant-time subscription status check; cache subscription status in JWT claims                                      |
| P-6  | Billing history exposed to household co-members        | Information Disc.  | HIGH     | Billing data scoped to `user_id = auth.uid()` ONLY; never household-scoped                                            |
| P-7  | Denial of service via subscription check flooding      | Denial of Service  | MEDIUM   | Cache subscription status in session/JWT; rate limit validation endpoint (10 req/min)                                 |
| P-8  | Trial abuse via account recreation                     | Elevation of Priv. | HIGH     | Track device fingerprint + email for trial eligibility; server-side trial history check                               |
| P-9  | Refund fraud — keep premium features after refund      | Repudiation        | MEDIUM   | Real-time Apple/Google server notification processing; revoke features within 5 minutes of refund notification        |
| P-10 | Price manipulation via locale/currency spoofing        | Tampering          | LOW      | Prices defined server-side in App Store Connect / Play Console; never accept client-submitted prices                  |
| P-11 | Subscription webhook replay attack                     | Tampering          | LOW      | Idempotency key on webhook processing; transaction log with deduplication                                             |

### Recommended Controls

1. **Server-side receipt verification** — ALL purchase validation MUST go through Apple/Google server APIs; NEVER trust client receipts alone.
2. **Webhook signature verification** — Verify JWS signatures (Apple) and service account authentication (Google) on all server notifications.
3. **Feature gate dual enforcement** — Client-side gates for UX responsiveness; server-side gates (RLS + Edge Function) for actual access control.
4. **Billing data isolation** — Subscription and payment data MUST be user-scoped (`user_id`), never household-scoped.
5. **Anti-fraud measures** — Device fingerprinting for trial abuse; transaction deduplication for replay prevention.

---

## 3. Family Plans (Household Sharing Enhancements)

### Assets

- Household membership roles and permissions
- Shared financial data (transactions, budgets, goals)
- Invitation tokens and email addresses
- Role-based access control (owner, admin, member, viewer)

### Entry Points

- Household invitation creation/acceptance endpoints
- Role management API
- Shared data access via RLS policies
- Member removal/leave endpoints

### Trust Boundaries

- Household owner → member (elevated trust → standard trust)
- Member → shared household data (authenticated → RLS-gated)
- Invitation link → accepting user (untrusted channel → authenticated)
- One household → another household (strict isolation boundary)

### STRIDE Threats

| ID   | Threat                                                   | STRIDE Category    | Severity | Mitigation                                                                                              |
| ---- | -------------------------------------------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------- |
| F-1  | Invitation code brute-force to join arbitrary households | Spoofing           | HIGH     | 128-bit entropy invite codes; rate limit validation (10/min per IP); abuse detection on failed attempts |
| F-2  | Privilege escalation from member to owner role           | Elevation of Priv. | CRITICAL | Role changes restricted to current owner only; enforced via RLS + Edge Function; immutable created_by   |
| F-3  | Cross-household data leakage via sync manipulation       | Information Disc.  | CRITICAL | `household_id = ANY(auth.household_ids())` on ALL queries; sync engine validates household scope        |
| F-4  | Removed member retains cached data on device             | Information Disc.  | HIGH     | Force local database wipe on membership revocation; push notification to trigger client-side cleanup    |
| F-5  | Owner deletes household, orphaning co-members'' data     | Denial of Service  | HIGH     | Ownership transfer required before deletion if other members exist; 30-day grace period                 |
| F-6  | Invitation link forwarded to unintended recipient        | Spoofing           | MEDIUM   | Email-restricted invitations when email provided; single-use codes; expiry (72h default)                |
| F-7  | Member modifies transactions they didn''t create         | Tampering          | MEDIUM   | Audit trail on all mutations; optional "created_by" field for attribution; role-based write permissions |
| F-8  | Race condition in concurrent invitation acceptance       | Tampering          | MEDIUM   | Atomic `accept_household_invitation` RPC with `SELECT ... FOR UPDATE` lock (already implemented)        |
| F-9  | Household member enumeration via timing attacks          | Information Disc.  | LOW      | Constant-time member lookup; generic error messages for non-existent households                         |
| F-10 | Stale invitation tokens remain valid after owner change  | Repudiation        | MEDIUM   | Invalidate all pending invitations on ownership transfer; audit log ownership changes                   |
| F-11 | Member leaves household but audit log retains their data | Information Disc.  | LOW      | Audit log entries are household-scoped; departed member loses SELECT access via RLS                     |

### Recommended Controls

1. **Strict role enforcement** — Owner-only operations (invite, role change, delete) enforced at database level via RLS policies referencing `households.created_by`.
2. **Household isolation verification** — Automated tests confirming cross-household data leakage is impossible through any API path.
3. **Invitation security** — Cryptographic random codes (128-bit), single-use, time-limited, optionally email-restricted.
4. **Client-side cleanup** — Push notification mechanism to force local data purge when membership is revoked.
5. **Atomic operations** — All multi-step household mutations wrapped in database transactions with appropriate locking.

---

## 4. Notifications Feature

### Assets

- User email addresses and notification preferences
- Notification content (may reference financial events)
- Push notification tokens (FCM/APNs)
- SMTP credentials and delivery metadata

### Entry Points

- send-notification Edge Function
- Notification preference management API
- Push notification registration endpoint
- Email delivery webhook (bounce/complaint handling)

### Trust Boundaries

- Edge Function → SMTP relay (server → external)
- Edge Function → FCM/APNs (server → external)
- User preference check → notification dispatch (consent gate)
- Notification content → user device (server → untrusted)

### STRIDE Threats

| ID  | Threat                                            | STRIDE Category   | Severity | Mitigation                                                                                              |
| --- | ------------------------------------------------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| N-1 | Notification spoofing — fake security alerts      | Spoofing          | CRITICAL | Notification inserts restricted to service_role only (RLS WITH CHECK(false)); cryptographic signing     |
| N-2 | Financial data leaked in notification content     | Information Disc. | HIGH     | Notification templates NEVER include amounts, account names, or transaction details; generic references |
| N-3 | Push token theft enables notification injection   | Spoofing          | HIGH     | Push tokens stored server-side only; device attestation before token registration                       |
| N-4 | Email enumeration via notification preference API | Information Disc. | MEDIUM   | Preference API scoped to authenticated user only (`user_id = auth.uid()`); generic error responses      |
| N-5 | Notification flood / spam via API abuse           | Denial of Service | MEDIUM   | Rate limit: 30 notifications/min per user; abuse detection on error patterns                            |
| N-6 | SMTP credentials leaked in error responses        | Information Disc. | LOW      | SMTP errors logged server-side only; generic "delivery failed" to client; never expose SMTP config      |
| N-7 | Unsubscribe link manipulation                     | Tampering         | LOW      | HMAC-signed unsubscribe tokens with user_id + notification_type; validate before processing             |

### Recommended Controls

1. **Service-role-only inserts** — notification_log INSERT policy `WITH CHECK(false)` prevents user-level spoofing (already implemented).
2. **Content sanitization** — Notification templates MUST NOT include PII or financial amounts; use generic references ("a transaction was added").
3. **Consent enforcement** — Check `notification_preferences` before every dispatch; respect `email_enabled` global kill switch.
4. **Push token security** — Validate device attestation (App Attest / Play Integrity) before accepting push token registration.

---

## 5. Bank Connections (Plaid Integration)

### Assets

- Plaid access tokens and item IDs
- Bank account numbers and routing numbers (transient)
- Transaction history from connected banks
- User''s linked institution metadata

### Entry Points

- Plaid Link initialization endpoint
- Plaid webhook for transaction updates
- Account connection management API
- Token exchange endpoint (public_token → access_token)

### Trust Boundaries

- Client app → Plaid Link SDK (untrusted → external trusted)
- Plaid servers → our webhook (external → server)
- Our server → Plaid API (server → external)
- Plaid access token → encrypted storage (sensitive → at-rest encrypted)

### STRIDE Threats

| ID  | Threat                                                 | STRIDE Category    | Severity | Mitigation                                                                                                |
| --- | ------------------------------------------------------ | ------------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| B-1 | Plaid access token theft from database                 | Information Disc.  | CRITICAL | Encrypt access tokens at rest with envelope encryption (DEK/KEK); separate key per household              |
| B-2 | Forged Plaid webhook injects fake transactions         | Spoofing           | HIGH     | Verify Plaid webhook signatures (JWT verification with Plaid public key); validate webhook_id uniqueness  |
| B-3 | IDOR on bank connection management — disconnect others | Elevation of Priv. | HIGH     | RLS: bank_connections scoped to `household_id = ANY(auth.household_ids())`; ownership check on disconnect |
| B-4 | Account number exposure in API responses or logs       | Information Disc.  | MEDIUM   | Never return full account numbers; mask to last 4 digits; exclude from all log output and error messages  |
| B-5 | Plaid Link public_token intercepted in transit         | Tampering          | MEDIUM   | Public tokens are single-use and expire in 30 minutes; enforce HTTPS; exchange immediately server-side    |
| B-6 | Connected bank data mixed across households            | Information Disc.  | MEDIUM   | Bank connections table MUST have household_id FK with RLS; imported transactions inherit household_id     |
| B-7 | Webhook replay attack duplicates transactions          | Tampering          | LOW      | Idempotency key on webhook processing; transaction deduplication by external_id                           |
| B-8 | Plaid API rate limiting causes sync failures           | Denial of Service  | LOW      | Exponential backoff with jitter; queue-based webhook processing; graceful degradation                     |

### Recommended Controls

1. **Plaid access token encryption** — Encrypt with envelope encryption pattern (DEK per household, KEK in platform secure storage); NEVER store plaintext.
2. **Webhook verification** — Cryptographic verification of ALL Plaid webhooks; reject unsigned or replay attempts.
3. **Data minimization** — Request only necessary Plaid products; never store full account numbers; mask in all outputs.
4. **Household isolation** — Bank connections and imported transactions MUST be household-scoped with RLS enforcement.
5. **Audit trail** — Log all bank connection lifecycle events (connect, disconnect, sync) in audit_log; never log financial data.

---

## Cross-Feature Threat Summary

### Critical Mitigations Required Before Launch

| Priority | Threat                          | Features Affected | Mitigation                                                               |
| -------- | ------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| P0       | Server-side validation          | All features      | Never trust client claims for achievements, receipts, or feature unlocks |
| P0       | RLS on new tables               | All features      | Every new table MUST have RLS enabled with household/user scoping        |
| P0       | Receipt/webhook verification    | Premium, Bank     | Cryptographic verification of all external webhooks                      |
| P0       | Feature gate server enforcement | Premium           | Client-side gates are UX only; server enforces access                    |
| P1       | Data isolation                  | Family, Bank      | Cross-household data leakage prevention verified by tests                |
| P1       | Content sanitization            | Notifications     | No PII or financial amounts in notification content                      |
| P1       | Token encryption at rest        | Bank Connections  | Plaid access tokens encrypted with envelope encryption                   |
| P2       | Rate limiting                   | All features      | Dedicated rate limit configs for all new endpoints                       |
| P2       | Audit trail                     | All features      | All security-relevant operations logged to audit_log                     |

---

## Appendix: Trust Boundary Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT DEVICE                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │ Native App │  │  Web PWA     │  │ Plaid Link SDK         │    │
│  │ (iOS/And)  │  │ (React)      │  │ (Embedded iframe)      │    │
│  └─────┬──────┘  └──────┬───────┘  └───────────┬────────────┘    │
│        │                │                       │                 │
└────────┼────────────────┼───────────────────────┼─────────────────┘
         │                │                       │
    ═════╪════════════════╪═══════════════════════╪═══ TRUST BOUNDARY
         │   TLS 1.3      │                       │
         ▼                ▼                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                     SUPABASE EDGE FUNCTIONS                        │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │ Auth     │ │ Gamification │ │ Premium     │ │ Notification │  │
│  │ Webhook  │ │ Endpoints    │ │ Validation  │ │ Dispatch     │  │
│  └────┬─────┘ └──────┬───────┘ └──────┬──────┘ └──────┬───────┘  │
│       │              │                │                │           │
│  ═════╪══════════════╪════════════════╪════════════════╪═══ RLS   │
│       │              │                │                │   BOUNDARY│
│       ▼              ▼                ▼                ▼           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   POSTGRESQL + RLS                           │  │
│  │  users │ households │ transactions │ achievements │ subs    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │                                │
    ═════╪════════════════════════════════╪═══ EXTERNAL TRUST BOUNDARY
         │                                │
         ▼                                ▼
┌─────────────────┐           ┌──────────────────────┐
│ Apple/Google    │           │ Plaid API            │
│ Store APIs      │           │ + Webhooks           │
└─────────────────┘           └──────────────────────┘
```

---

**Next Review:** Sprint 2 — Penetration Test Plan
**Document Version:** 1.0
