<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Rate Limiting Security Assessment — Finance App

**Issue:** #332
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Findings and Recommendations
**MASVS Control:** MASVS-AUTH, MASVS-NETWORK

---

## Executive Summary

The Finance app implements **comprehensive, database-backed rate limiting** across all
12 Edge Functions via a shared `checkRateLimit()` module backed by an atomic PostgreSQL
RPC (`check_rate_limit`). This is complemented by a separate **abuse detection** layer
that tracks error frequency to identify credential stuffing, API fuzzing, and endpoint
probing.

**Overall Assessment: STRONG — with 2 HIGH and 3 MEDIUM findings requiring attention.**

### Architecture Overview

```
Client Request
    │
    ▼
Edge Function Handler
    │
    ├─► checkAbuseStatus()    ← Read-only block check (errors threshold)
    │       │
    │       └─► get_rate_limit_status RPC (SELECT only, no counter increment)
    │
    ├─► checkRateLimit()      ← Sliding-window rate limit (request volume)
    │       │
    │       └─► check_rate_limit RPC (atomic UPSERT — increment + check)
    │
    ├─► [Business Logic]
    │
    └─► recordAbuseSignal()   ← On 4xx error responses (increment error counter)
            │
            └─► check_rate_limit RPC (with abuse-errors: key prefix)
```

---

## Current Rate Limit Configuration

### Per-Function Limits

| Function               | Max Requests | Window   | Key Type   | Auth Required | Assessment  |
| ---------------------- | ------------ | -------- | ---------- | ------------- | ----------- |
| `health-check`         | 60           | 60s      | IP-based   | No            | ✅ Appropriate |
| `auth-webhook`         | 30           | 60s      | IP-based   | Secret-based  | ✅ Appropriate |
| `passkey-register`     | 10           | 60s      | IP-based   | Yes (JWT)     | ✅ Strict — good for auth |
| `passkey-authenticate` | 20           | 60s      | IP-based   | No (pre-auth) | ⚠️ See Finding RL-3 |
| `household-invite`     | 30           | 60s      | User-based | Yes           | ✅ Appropriate |
| `data-export`          | 10           | 3600s    | User-based | Yes           | ✅ Strict — GDPR compliant |
| `account-deletion`     | 3            | 3600s    | User-based | Yes           | ✅ Very strict — good |
| `sync-health-report`   | 60           | 3600s    | User-based | Yes           | ✅ Appropriate |
| `process-recurring`    | 10           | 60s      | IP-based   | Secret-based  | ✅ Appropriate |
| `manage-webhooks`      | 30           | 60s      | User-based | Yes           | ✅ Appropriate |
| `admin-dashboard`      | 60           | 60s      | User-based | Yes + Admin   | ✅ Appropriate |
| `send-notification`    | 30           | 60s      | User-based | Yes           | ✅ Appropriate |

### Abuse Detection Thresholds

| Function               | Max Errors | Window   | Assessment  |
| ---------------------- | ---------- | -------- | ----------- |
| `passkey-register`     | 5          | 60s      | ✅ Strict |
| `passkey-authenticate` | 5          | 60s      | ✅ Strict |
| `account-deletion`     | 3          | 600s     | ✅ Very strict |
| `data-export`          | 5          | 600s     | ✅ Strict |
| `household-invite`     | 10         | 300s     | ✅ Appropriate |
| `auth-webhook`         | 10         | 300s     | ✅ Appropriate |
| Others                 | 10-20      | 300s     | ✅ Appropriate |

---

## Security Findings

### RL-1: Fail-Open Policy Creates Bypass Opportunity — Severity: HIGH

**Files:**
- `services/api/supabase/functions/_shared/rate-limit.ts` lines 119-121, 142-145
- `services/api/supabase/functions/_shared/abuse-detection.ts` lines 175-177, 197-199

**Description:**
Both the rate limiter and abuse detection module implement a **fail-open** policy: if the
`check_rate_limit` PostgreSQL RPC fails for any reason (DB connection error, RPC timeout,
missing function), the request is **allowed through**.

While fail-open prevents legitimate users from being blocked by infrastructure issues,
it creates a deliberate bypass opportunity for attackers who can cause the RPC to fail:

1. **Database overload:** A sustained flood of requests could overwhelm the PostgreSQL
   connection pool, causing RPC failures, which ironically disables rate limiting
   exactly when it's needed most.
2. **Connection exhaustion:** If an attacker can consume all available DB connections
   (e.g., via long-running queries on other endpoints), rate limit RPCs will timeout.
3. **DNS manipulation:** If the attacker can interfere with internal DNS resolution
   (less likely in Supabase's infrastructure), the RPC client cannot connect.

**Impact:** Under sustained attack, the rate limiting and abuse detection systems could
become ineffective precisely when they're needed most — a feedback loop where attack
volume causes the defence to collapse.

**Recommendation:**
- **Short-term:** Add a secondary, in-memory rate limiter (e.g., simple Map with TTL)
  as a fallback when the DB-backed limiter fails. This provides a degraded but still
  functional rate limit even during DB outages.
- **Long-term:** Consider using an external rate limiting service (e.g., Upstash Redis
  or Cloudflare Rate Limiting) as the primary limiter, with the DB-backed approach as
  secondary. External services are designed to remain available under attack.
- **Monitoring:** Alert when fail-open events exceed a threshold (e.g., >10 fail-opens
  per minute). This indicates the DB is stressed and rate limiting is degraded.

```typescript
// Example: In-memory fallback rate limiter
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>();

function inMemoryRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = inMemoryCounters.get(key);
  if (!entry || entry.resetAt < now) {
    inMemoryCounters.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  entry.count++;
  return entry.count <= max;
}
```

> **Note:** In-memory state is per-isolate in Deno Deploy / Supabase Edge Functions.
> This means the fallback is not globally consistent, but it provides per-isolate
> protection which is still valuable.

---

### RL-2: IP Spoofing via X-Forwarded-For — Severity: HIGH

**File:** `services/api/supabase/functions/_shared/rate-limit.ts` lines 195-201

**Description:**
The `getClientIp()` function extracts the client IP from the `X-Forwarded-For` header:

```typescript
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim() || null;
  }
  return req.headers.get('x-real-ip') || null;
}
```

The function takes the **first** entry in `X-Forwarded-For`, which is the
**client-supplied** value. An attacker can trivially spoof their IP address:

```
X-Forwarded-For: 1.2.3.4, <actual-ip>
```

The rate limiter would see `1.2.3.4` instead of the attacker's real IP. By
rotating the spoofed IP on every request, an attacker bypasses IP-based rate
limits entirely.

**Affected endpoints (IP-based rate limiting):**
- `passkey-authenticate` (pre-auth, most critical)
- `health-check`
- `auth-webhook`
- `process-recurring`

**Impact:** Complete bypass of IP-based rate limiting on all pre-auth endpoints,
including the passkey authentication flow (credential stuffing vector).

**Recommendation:**
- **Immediate:** Use the **last** entry in `X-Forwarded-For` (the one added by the
  Supabase/Deno Deploy edge proxy), or better yet, use Supabase's own
  `x-real-ip` / `cf-connecting-ip` header which is set by the infrastructure:

```typescript
export function getClientIp(req: Request): string | null {
  // Prefer infrastructure-set headers (cannot be spoofed by client)
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;

  // Supabase edge sets x-real-ip from the actual connection
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Fallback: last entry in X-Forwarded-For (added by edge proxy)
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim());
    return parts[parts.length - 1] || null;
  }

  return null;
}
```

- **Verify:** Confirm which headers Supabase Edge Functions receive from the
  infrastructure and which cannot be spoofed by clients. Document the trusted
  header in the rate-limit module's JSDoc.

---

### RL-3: `passkey-authenticate` Rate Limit May Be Too Permissive — Severity: MEDIUM

**File:** `services/api/supabase/functions/_shared/rate-limit.ts` line 74

**Description:**
The `passkey-authenticate` endpoint allows **20 requests per 60 seconds per IP**.
Combined with the IP spoofing issue (RL-2), this endpoint has effectively no rate
limit for a determined attacker.

Even with IP spoofing fixed, 20/min per IP is generous for an authentication endpoint.
WebAuthn authentication requires a prior `?step=options` call (consuming 2 requests
per attempt), but 10 authentication attempts per minute from a single IP is still high.

**Recommendation:**
- Reduce to **10 requests per 60 seconds per IP** (5 full auth attempts)
- Add a **per-credential rate limit**: max 5 authentication attempts per credential_id
  per 5 minutes. This prevents targeted brute-force against a specific user's passkey.
- The abuse detection threshold (5 errors/60s) is appropriate — ensure it is enforced
  in the handler.

---

### RL-4: No Global Rate Limit / DDoS Protection — Severity: MEDIUM

**Description:**
The current rate limiting is per-function and per-identifier (user ID or IP). There is
no **global** rate limit across all functions combined. An attacker could distribute
requests across multiple endpoints to stay under each individual limit while still
overwhelming the backend.

**Example attack:**
- 60 req/min to `health-check`
- 30 req/min to `auth-webhook`
- 20 req/min to `passkey-authenticate`
- 30 req/min to `household-invite`
- Total: 140 req/min from a single IP without triggering any individual limit

**Recommendation:**
- Add a **global per-IP rate limit** (e.g., 120 requests/minute across all endpoints)
  checked before the function-specific limit.
- Consider deploying Supabase's built-in rate limiting or a CDN-level rate limiter
  (Cloudflare, Vercel) as the first line of defense.
- The global limit should also fail-open but with monitoring alerts.

---

### RL-5: Rate Limit Headers Leak Internal Configuration — Severity: MEDIUM

**File:** `services/api/supabase/functions/_shared/rate-limit.ts` lines 174-179

**Description:**
The 429 response includes detailed rate limit headers:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2025-07-27T10:00:00.000Z
Retry-After: 45
```

While these headers are helpful for legitimate clients, they also tell an attacker
exactly how many requests they can make, when the window resets, and how to time
their attacks optimally.

**Recommendation:**
- **Keep `Retry-After`** — this is standard HTTP and useful for clients.
- **Consider removing `X-RateLimit-Limit`** on security-sensitive endpoints
  (passkey-authenticate, account-deletion). Legitimate clients don't need to know
  the exact limit — they should never hit it.
- **At minimum:** Do not include `X-RateLimit-Reset` precise timestamp, which allows
  attackers to calculate exact window boundaries.

---

## Positive Findings

### ✅ Atomic Counter Implementation
The `check_rate_limit` PostgreSQL RPC uses `INSERT ... ON CONFLICT DO UPDATE` (atomic
UPSERT), preventing race conditions where concurrent requests could bypass the limit.

### ✅ Sliding Window Design
The window resets based on the first request's timestamp, not a fixed clock boundary.
This prevents burst attacks at window boundaries.

### ✅ Abuse Detection Separation
Error-based abuse detection is separate from volume-based rate limiting. This means
a user who makes many successful requests (high volume, low errors) is not confused
with an attacker who makes fewer requests but most fail (low volume, high errors).

### ✅ Read-Only Abuse Status Check
The `checkAbuseStatus()` function now uses a `get_rate_limit_status` RPC that performs
a SELECT without incrementing the counter (fixing pre-launch finding H-2).

### ✅ Generic Abuse Block Response
The `abuseBlockedResponse()` returns a generic 403 without revealing that abuse detection
triggered the block (line 277: `"Request blocked"`), preventing attackers from adapting.

### ✅ Rate Limit Key Privacy
Both modules explicitly document that rate limit keys must never be logged or returned
(they contain user IDs or IP addresses).

### ✅ Consistent Integration
All 12 Edge Functions import and use the shared rate limiting module. No endpoint was
found without rate limiting.

---

## Compliance Assessment

| Requirement | Status | Notes |
| --- | --- | --- |
| OWASP API4:2023 — Unrestricted Resource Consumption | ✅ PASS | All endpoints rate-limited |
| OWASP API2:2023 — Broken Authentication (rate limit) | ⚠️ PARTIAL | IP spoofing weakens pre-auth limits (RL-2) |
| PCI DSS 6.5.10 — Broken Authentication | ⚠️ PARTIAL | Credential stuffing possible via RL-2 |
| NIST 800-53 SC-5 — Denial of Service Protection | ⚠️ PARTIAL | No global rate limit (RL-4) |
| GDPR Art. 32 — Security of Processing | ✅ PASS | Sensitive endpoints strictly limited |

---

## Recommendations Summary

| Priority | Finding | Action | Effort |
| --- | --- | --- | --- |
| **P0** | RL-2: IP spoofing | Fix `getClientIp()` to use infrastructure headers | 2 hours |
| **P1** | RL-1: Fail-open bypass | Add in-memory fallback rate limiter | 4 hours |
| **P1** | RL-3: passkey-authenticate permissive | Reduce to 10/min + per-credential limit | 2 hours |
| **P2** | RL-4: No global rate limit | Add cross-endpoint global IP limit | 4 hours |
| **P2** | RL-5: Rate limit header leakage | Remove X-RateLimit-Limit on auth endpoints | 1 hour |

---

## References

- OWASP API Security Top 10 2023: API4 — Unrestricted Resource Consumption
- OWASP Testing Guide: Testing for Rate Limiting (OTG-BUSLOGIC-001)
- RFC 6585: Additional HTTP Status Codes (429 Too Many Requests)
- RFC 7231: Retry-After header semantics
- Supabase Edge Functions: Deno Deploy isolate model
- NIST SP 800-53 Rev. 5: SC-5 Denial of Service Protection
