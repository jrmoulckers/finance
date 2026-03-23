# MASVS-NETWORK Audit Report

**Audit ID:** MASVS-NETWORK-364
**Date:** 2025-07-22
**Auditor:** Security & Privacy Review Agent
**Scope:** All network communication across Edge Functions, KMP sync client, Web app, and mobile clients
**Standard:** OWASP MASVS v2.0 — MASVS-NETWORK
**Related ADRs:** ADR-0004 (Auth Security Architecture), ADR-0002 (Backend Sync Architecture)

---

## Executive Summary

The Finance application's network security is **well-architected** with several strong controls: origin-validated CORS (no wildcards), JWT-based authentication on all sensitive endpoints, PKCE for OAuth flows, WebAuthn challenges with 5-minute TTL and one-time use, and constant-time secret comparison for webhook authentication.

Key findings requiring attention: the `health-check` edge function references a non-existent `corsHeaders` export (suggesting a stale import), the `SyncConfig` does not enforce HTTPS-only endpoints, and the web app lacks explicit security headers configuration (CSP, HSTS, X-Frame-Options).

---

## Findings

### CRITICAL — None

No critical network vulnerabilities were identified. All sensitive endpoints require authentication, tokens are transmitted only over TLS, and CORS is properly origin-validated.

---

### HIGH

#### H-1: `health-check` function imports `corsHeaders` — not exported by `cors.ts`

**File:** `services/api/supabase/functions/health-check/index.ts` (line 22)
**Severity:** HIGH
**MASVS Control:** MASVS-NETWORK-1 (Secure network communication)

**Description:**
The health-check function imports `corsHeaders` from `../_shared/cors.ts` (line 22), but `cors.ts` only exports `getCorsHeaders(request)` (a function requiring a `Request` parameter) and `handleCorsPreflightRequest(request)`. There is no exported `corsHeaders` constant.

This means either: (1) the import fails at runtime (Deno `TypeError`), causing the health-check to crash, or (2) `corsHeaders` resolves to `undefined`, and `...corsHeaders` silently produces no CORS headers.

Additionally, `handleCorsPreflightRequest()` on line 117 is called without the required `request` argument, so the preflight response would have empty CORS headers.

**Recommendation:**

1. Update import to use `getCorsHeaders`.
2. Replace all `...corsHeaders` with `...getCorsHeaders(req)`.
3. Pass `req` to `handleCorsPreflightRequest(req)` on line 117.

**Status:** FAIL

---

### MEDIUM

#### M-1: `SyncConfig.endpoint` does not enforce HTTPS scheme

**File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/SyncConfig.kt`
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-1 (TLS enforcement)

**Description:**
The `SyncConfig` validates that `endpoint` is not blank but does not verify it uses `https://`. A misconfiguration could cause the sync engine to transmit tokens and financial data over an unencrypted connection.

**Recommendation:**
Add scheme validation: `require(endpoint.startsWith("https://") || endpoint.startsWith("http://localhost"))`

**Status:** PARTIAL

---

#### M-2: Web app lacks explicit security headers (CSP, HSTS, X-Frame-Options)

**Files:** `apps/web/index.html`, `apps/web/vercel.json`
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-2

**Description:**
The web application does not configure Content Security Policy (CSP), HSTS, X-Frame-Options, or X-Content-Type-Options. The `vercel.json` only sets build configuration — no `headers` section.

Without these: no CSP makes XSS more exploitable; no HSTS allows HTTP on first visit; no X-Frame-Options enables clickjacking; no X-Content-Type-Options allows MIME sniffing.

**Recommendation:**
Add a `headers` section to `vercel.json` with Strict-Transport-Security, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, and Content-Security-Policy.

**Status:** FAIL

---

#### M-3: Sync push endpoint (`/api/sync/push`) lacks authentication header

**File:** `apps/web/src/db/sync/replayMutations.ts` (lines 40–63)
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-3

**Description:**
The `pushToServer` function sends mutation data to `/api/sync/push` without an `Authorization` header. This is currently a stub (the TODO comment states "Replace this stub with a real fetch()"), but the pattern sets a template that could be copied without adding authentication.

**Recommendation:**
When the real endpoint is implemented, include `Authorization: Bearer <token>` from `token-storage.ts`.

**Status:** PARTIAL (stub)

---

#### M-4: Edge Functions do not set security response headers consistently

**Files:** `services/api/supabase/functions/_shared/response.ts`, individual handlers
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-2

**Description:**
Edge Function responses include CORS headers but not other security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, or `Cache-Control: no-store` for sensitive endpoints. The health-check sets `Cache-Control` but other sensitive endpoints (data-export, passkey-authenticate) do not.

**Recommendation:**
Add default security headers to `jsonResponse` and `errorResponse` helpers in `response.ts`.

**Status:** PARTIAL

---

#### M-5: `SupabaseAuthManager` constructs JSON request bodies via string interpolation

**File:** `apps/android/src/main/kotlin/com/finance/android/auth/SupabaseAuthManager.kt` (lines 239–241, 265–268)
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-3

**Description:**
JSON request bodies are built using string templates (e.g., `"""{"email":"${credentials.email}","password":"${credentials.password}"}"""`). If email or password contain `"` or `\`, the JSON will be malformed or could allow JSON injection.

**Recommendation:**
Use `kotlinx.serialization` to build request bodies safely. This applies to all `setBody("""...""")` calls.

**Status:** PARTIAL

---

#### M-6: `extractSupabaseApiKey()` returns empty string

**File:** `apps/android/src/main/kotlin/com/finance/android/auth/SupabaseAuthManager.kt` (line 389)
**Severity:** MEDIUM | **MASVS Control:** MASVS-NETWORK-3

**Description:**
The companion function always returns `""`, meaning the `apikey` header on sign-out and account deletion requests is empty, causing these calls to fail silently.

**Recommendation:**
Inject the Supabase anon key via constructor or DI, similar to how `supabaseUrl` is already injected.

**Status:** FAIL

---

### LOW

#### L-1: CORS `Access-Control-Allow-Methods` includes unused methods

**File:** `services/api/supabase/functions/_shared/cors.ts` (line 32)
**Severity:** LOW

**Description:** The CORS config allows GET, POST, PUT, DELETE, OPTIONS globally, but most functions only handle POST. Not a vulnerability, but unnecessarily broad.

**Status:** PASS (minor)

---

#### L-2: WebAuthn challenge TTL (5 min) — acceptable

**Files:** `passkey-register/index.ts`, `passkey-authenticate/index.ts`
**Severity:** LOW

**Description:** Challenges expire after 5 minutes and are correctly consumed on use (one-time) regardless of verification outcome. Could be tightened to 2–3 minutes but 5 minutes is within acceptable bounds.

**Status:** PASS

---

#### L-3: OAuth redirect URI is hardcoded

**File:** `SupabaseAuthManager.kt` (line 190)
**Severity:** LOW

**Description:** Hardcoded to `https://finance.app/auth/callback`. Correct for production but prevents staging/dev environments. Should be configurable via BuildConfig.

**Status:** PASS (minor)

---

#### L-4: Certificate pinning not implemented

**Severity:** LOW–MEDIUM

**Description:** No certificate pinning on any platform. For a financial app, this is a notable gap. Android should use `network_security_config.xml`, iOS should use `NSPinnedDomains` in `Info.plist`. Web relies on Certificate Transparency. Pinning introduces operational risk (rotation failures) so implement with backup pins.

**Status:** NOT IMPLEMENTED

---

## Compliance Summary

| MASVS-NETWORK Control                    | Component                      | Status             | Notes                                                 |
| ---------------------------------------- | ------------------------------ | ------------------ | ----------------------------------------------------- |
| **NETWORK-1: TLS enforcement**           | Edge Functions                 | ✅ PASS            | Supabase enforces TLS at infrastructure level         |
|                                          | KMP Sync Client                | ⚠️ PARTIAL         | `SyncConfig` does not validate HTTPS (M-1)            |
|                                          | Web App                        | ✅ PASS            | Served over HTTPS (Vercel); no mixed content          |
|                                          | Android                        | ✅ PASS            | App Links use `https://`; INTERNET permission only    |
|                                          | iOS                            | ✅ PASS            | ATS enforces TLS by default                           |
| **NETWORK-2: Security headers**          | Web App                        | ❌ FAIL            | No CSP, HSTS, X-Frame-Options (M-2)                   |
|                                          | Edge Functions                 | ⚠️ PARTIAL         | CORS present; missing other headers (M-4)             |
| **NETWORK-3: Authenticated connections** | Edge Functions (auth-required) | ✅ PASS            | `requireAuth()` validates JWT                         |
|                                          | Edge Functions (webhook)       | ✅ PASS            | Constant-time secret comparison                       |
|                                          | Edge Functions (health-check)  | ✅ PASS            | Intentionally public; no sensitive data               |
|                                          | Web Sync Push                  | ⚠️ PARTIAL         | Stub lacks auth header (M-3)                          |
|                                          | Android Auth                   | ⚠️ PARTIAL         | API key returns empty string (M-6)                    |
| **NETWORK-4: CORS policy**               | Edge Functions                 | ⚠️ PARTIAL         | Origin-validated; health-check has stale import (H-1) |
| **NETWORK-5: Certificate pinning**       | All platforms                  | ⚠️ NOT IMPLEMENTED | Recommend with backup pins (L-4)                      |
| **NETWORK-6: No sensitive data in URLs** | All                            | ✅ PASS            | Sensitive data in request bodies/headers only         |
| **NETWORK-7: OAuth security**            | All                            | ✅ PASS            | PKCE (S256); nonce for Apple Sign-In                  |

---

## Positive Findings

1. **Origin-validated CORS** — `cors.ts` reads `ALLOWED_ORIGINS` from env; never uses wildcard `'*'`.
2. **WebAuthn security** — Challenges scoped by exact value, 5-min TTL, one-time use, user verification required.
3. **PKCE implementation** — RFC 7636 S256 method, 64-char verifiers (384 bits), proper base64url encoding.
4. **Constant-time comparison** — Auth-webhook uses XOR accumulation to prevent timing attacks.
5. **Token lifecycle** — Proactive refresh before expiry, deduplication of concurrent refreshes, session cleanup on failure.
6. **Credential redaction** — `SyncCredentials.toString()` masks `authToken`, preventing accidental logging.
7. **Webhook idempotency** — `handle_new_user_signup` returns `already_provisioned: true` on duplicates.
8. **Account deletion flow** — Authenticated, requires explicit confirmation, audit-logged, crypto-shredding, deletion certificate.

---

## Recommendations Summary

| Priority   | Finding                                              | Action                                                  |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **HIGH**   | H-1: health-check imports non-existent `corsHeaders` | Fix import to use `getCorsHeaders(req)`                 |
| **MEDIUM** | M-1: `SyncConfig` allows HTTP endpoints              | Add HTTPS scheme validation                             |
| **MEDIUM** | M-2: Web app lacks security headers                  | Add CSP, HSTS, X-Frame-Options to `vercel.json`         |
| **MEDIUM** | M-3: Sync push stub lacks auth header                | Add `Authorization` header when implemented             |
| **MEDIUM** | M-4: Edge Functions lack security headers            | Add `X-Content-Type-Options`, `Cache-Control: no-store` |
| **MEDIUM** | M-5: JSON via string interpolation                   | Use `kotlinx.serialization` for request bodies          |
| **MEDIUM** | M-6: `extractSupabaseApiKey()` returns empty         | Inject API key via DI / BuildConfig                     |
| **LOW**    | L-4: Certificate pinning not implemented             | Implement with backup pins on Android and iOS           |
