<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Passkey Authentication — Security Fix Specification

**Date:** 2026-07-18
**Author:** Security & Privacy Reviewer
**Status:** Fix specification — addresses A-5 and API-9 from Security Audit v1
**Audit References:** Security Audit v1 §MASVS-AUTH (A-5), §API Security (API-9)
**MASVS Controls:** MASVS-AUTH-1, MASVS-AUTH-2
**Finding Severity:** A-5 HIGH, API-9 HIGH

---

## Executive Summary

The passkey authentication Edge Function had two HIGH-severity vulnerabilities
identified in Security Audit v1:

1. **A-5**: After WebAuthn verification, the function returned a raw `user_id`
   without minting a proper session — the client then used this untrusted
   `user_id` to create a session, allowing session forgery.
2. **API-9**: Challenge lookup retrieved "the most recent valid authentication
   challenge" globally, making challenges reusable across users in usernameless
   flows.

**Current Status: Both findings have been fixed** in the current codebase at
`services/api/supabase/functions/passkey-authenticate/index.ts`. This document
records the vulnerable code paths, the applied fixes, residual risk, and the
required test cases to verify the fixes remain effective.

---

## 1. Vulnerability: A-5 — Passkey Login Fallback (Session Forgery)

### 1.1 Vulnerable Code Path (BEFORE Fix)

**File:** `services/api/supabase/functions/passkey-authenticate/index.ts`
**Lines:** 214-238 (original)

```typescript
// VULNERABLE — original code
if (verification.verified) {
  // ❌ Returns raw user_id to client — no signed session
  return jsonResponse(req, {
    verified: true,
    user_id: credential.user_id,
  });
}
```

**Client-side vulnerable code:**
**File:** `apps/web/src/auth/auth-context.tsx`, lines 263-274

```typescript
// VULNERABLE — client trusts server response and forges session
const { user_id } = await response.json();
// ❌ Client makes a SECOND request with just user_id to get session
// An attacker could supply any user_id to obtain their session
await supabase.auth.signInWithPassword({ ... });
```

### 1.2 Attack Scenario

1. Attacker calls `POST /passkey-authenticate?step=verify` with a valid
   WebAuthn assertion for their OWN credential.
2. Server returns `{ verified: true, user_id: "attacker-uuid" }`.
3. Attacker intercepts and replaces `user_id` with victim's UUID.
4. Client-side code uses the forged `user_id` to obtain a session token.
5. **Result**: Full account takeover — attacker has victim's session.

### 1.3 Applied Fix

**File:** `services/api/supabase/functions/passkey-authenticate/index.ts`
**Lines:** 271-330 (current)

The fix mints a proper Supabase session server-side using the admin API:

```typescript
// FIXED — server mints session, never trusts client user_id
const {
  data: { user: authUser },
} = await supabaseAdmin.auth.admin.getUserById(credential.user_id);

const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
  type: 'magiclink',
  email: authUser.email,
});

const {
  data: { session },
} = await supabaseAdmin.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'magiclink',
});

// Returns proper JWT session — client uses supabase.auth.setSession()
return jsonResponse(req, {
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: session.expires_in,
  expires_at: session.expires_at,
  token_type: 'bearer',
  user: { id: session.user.id, email: session.user.email },
});
```

**Security properties of the fix:**

1. Session is minted server-side — client never supplies `user_id`.
2. `credential.user_id` comes from the database after credential lookup, not
   from the client request.
3. The magic-link token is generated and consumed server-side (never sent to
   the user as an actual email link).
4. The returned JWT is signed by Supabase Auth — cannot be forged.

### 1.4 Residual Risk Assessment

| Risk                                                              | Severity | Mitigation                                                                         |
| ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| Magic-link generation creates a token entry in Supabase auth flow | LOW      | Token is consumed immediately server-side; TTL is short                            |
| `generateLink` sends email if SMTP is configured                  | MEDIUM   | Verify SMTP is disabled for this flow, or use `skipEmailConfirmation` if available |
| Race condition between link generation and OTP verification       | LOW      | Both operations are on the same server request; atomic in practice                 |
| Email enumeration via timing of credential lookup                 | LOW      | Rate limiting (10/min) and consistent error responses mitigate                     |

### 1.5 Recommended Additional Hardening

1. **Suppress email delivery**: Ensure `generateLink` with `type: 'magiclink'`
   does NOT trigger SMTP delivery when used server-side. If Supabase sends the
   email, add a flag or use an alternative admin session creation method.
2. **Audit logging**: Log successful passkey authentications with user_id and
   credential_id (already done at line 314-315).
3. **Counter verification**: The current code updates the credential counter
   (line 262-269). Verify that `verifyAuthenticationResponse` rejects
   counters <= stored counter (replay prevention).

---

## 2. Vulnerability: API-9 — Unscoped WebAuthn Challenge Lookup

### 2.1 Vulnerable Code Path (BEFORE Fix)

**File:** `services/api/supabase/functions/passkey-authenticate/index.ts`
**Lines:** 162-168 (original)

```typescript
// VULNERABLE — retrieves most recent challenge globally
const { data: challengeRow } = await supabaseAdmin
  .from('webauthn_challenges')
  .select('*')
  .eq('type', 'authentication')
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
```

### 2.2 Attack Scenario

1. Attacker initiates authentication options (gets a challenge).
2. Legitimate user also initiates authentication options (gets a different challenge).
3. Attacker's verify step could match the legitimate user's challenge
   (whichever was most recent) since lookup was global.
4. With usernameless flow (`user_id = null`), challenges were interchangeable.

### 2.3 Applied Fix

**File:** `services/api/supabase/functions/passkey-authenticate/index.ts`
**Lines:** 207-237 (current)

The fix extracts the challenge value from `clientDataJSON` and looks it up
by exact value:

```typescript
// FIXED — extract challenge from clientDataJSON for scoped lookup
const clientDataBytes = base64urlToBytes(body.response.clientDataJSON);
const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
const submittedChallenge = clientData.challenge;

// Look up by EXACT challenge value + type + not-expired
const { data: challengeRow } = await supabaseAdmin
  .from('webauthn_challenges')
  .select('*')
  .eq('challenge', submittedChallenge)
  .eq('type', 'authentication')
  .gt('expires_at', new Date().toISOString())
  .single();

// IMMEDIATELY delete — one-time use
await supabaseAdmin.from('webauthn_challenges').delete().eq('id', challengeRow.id);
```

**Security properties of the fix:**

1. Challenge is looked up by exact value, not by recency.
2. Challenge is deleted immediately after retrieval (one-time use).
3. Expired challenges are excluded from lookup.
4. The `challenge` column value in `webauthn_challenges` is unique per ceremony.

### 2.4 Residual Risk Assessment

| Risk                                                                 | Severity   | Mitigation                                                    |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| Challenge not deleted if verification later fails                    | NONE       | Challenge is deleted BEFORE verification (line 237) — correct |
| Stale challenges accumulate if options step is called without verify | LOW        | 5-min TTL; add periodic cleanup job                           |
| Challenge collision (two users get same challenge value)             | NEGLIGIBLE | 32-byte random = 256 bits entropy                             |
| Timing gap between select and delete                                 | LOW        | Row-level lock or unique constraint prevents double-use       |

---

## 3. Required Test Cases

### 3.1 A-5 Fix Verification

| #   | Test Case                                                                        | Method      | Expected Result                                                                                                                                                |
| --- | -------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Happy path**: Register passkey, authenticate, verify session                   | E2E         | Returns valid `access_token` and `refresh_token`; `supabase.auth.setSession()` succeeds                                                                        |
| 2   | **Session is server-minted**: Inspect response payload                           | Unit        | Response contains `access_token`, `refresh_token`, `expires_in`, `expires_at`; does NOT contain raw `user_id` at top level or `verified: true` without session |
| 3   | **No client user_id in request**: Send verify with extra `user_id` field in body | Integration | Extra field is ignored; session is for credential's actual owner                                                                                               |
| 4   | **Forged credential_id**: Submit non-existent credential_id                      | Integration | Returns 400 "Credential not found"                                                                                                                             |
| 5   | **Credential for deleted user**: Mark user as deleted, attempt auth              | Integration | Returns 500 (user resolution fails) or appropriate error                                                                                                       |
| 6   | **Counter replay**: Submit assertion with counter <= stored counter              | Integration | `verifyAuthenticationResponse` rejects; returns 401                                                                                                            |
| 7   | **Email not leaked**: Verify error responses for invalid credentials             | Integration | Error messages are generic; no email/user_id in error body                                                                                                     |

### 3.2 API-9 Fix Verification

| #   | Test Case                                                                                   | Method      | Expected Result                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 8   | **Challenge scoping**: Start two concurrent auth ceremonies, verify each with own challenge | Integration | Both succeed with their own challenges                                                                                |
| 9   | **Challenge swap**: Start ceremony A, start ceremony B, use B's challenge in A's verify     | Integration | Verification succeeds (challenge is matched by value, credential is separate) but the CORRECT credential must be used |
| 10  | **Expired challenge**: Wait >5 min after options, then verify                               | Integration | Returns 400 "Challenge not found, expired, or already used"                                                           |
| 11  | **Replay challenge**: Use same challenge value twice                                        | Integration | Second attempt returns 400 (challenge deleted on first use)                                                           |
| 12  | **Missing clientDataJSON**: Submit verify without `response.clientDataJSON`                 | Integration | Returns 400 "Missing clientDataJSON in response"                                                                      |
| 13  | **Malformed clientDataJSON**: Submit non-base64url clientDataJSON                           | Integration | Returns 400 or 500 with generic error (no stack trace)                                                                |
| 14  | **Challenge cleanup**: Verify stale challenges are excluded                                 | Integration | Challenges older than 5 min do not match                                                                              |

### 3.3 Regression Tests

| #   | Test Case                                                                    | Method      | Expected Result                            |
| --- | ---------------------------------------------------------------------------- | ----------- | ------------------------------------------ |
| 15  | **Rate limiting**: Exceed 10 requests/min to passkey-authenticate            | Integration | 429 response after limit                   |
| 16  | **CORS validation**: Request from non-allowed origin                         | Integration | Empty `Access-Control-Allow-Origin` header |
| 17  | **OPTIONS preflight**: Send OPTIONS request                                  | Integration | 204 with CORS headers                      |
| 18  | **Invalid step parameter**: `?step=invalid`                                  | Integration | 400 with helpful error                     |
| 19  | **Credential counter update**: After successful auth, counter is incremented | Integration | Database counter > previous counter        |

---

## 4. Monitoring & Alerting

### 4.1 Security Signals to Monitor

| Signal                                               | Threshold        | Action                                                 |
| ---------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| Failed WebAuthn verifications per IP                 | >5/min           | Log anomaly, trigger abuse detection                   |
| Challenge lookup misses (valid format but not found) | >10/min globally | Alert — possible replay attack                         |
| Credential not found errors                          | >3/min per IP    | Rate limit tightening                                  |
| Session minting failures                             | Any              | Alert — infrastructure issue                           |
| Counter mismatch rejections                          | Any              | Log with credential_id — possible cloned authenticator |

---

## 5. Code Review Checklist

- [x] `user_id` is NEVER taken from client request body
- [x] Session is minted server-side via admin API
- [x] Challenge is looked up by exact value (not recency)
- [x] Challenge is deleted immediately (one-time use)
- [x] Challenge has 5-minute TTL enforced in query
- [x] Credential counter is updated after successful verification
- [x] Error responses are generic (no internal details)
- [x] Rate limiting is applied pre-authentication
- [x] CORS headers use origin validation (not wildcard)
- [x] `requireUserVerification: true` is set in verification options
- [ ] Verify `generateLink` does not trigger SMTP email delivery
- [ ] Add periodic cleanup job for expired/orphaned challenges
- [ ] Add integration tests for all cases in Section 3

---

## References

- Security Audit v1 (`docs/architecture/security-audit-v1.md`) — A-5, API-9
- Security Posture Report — A-5 resolved, API-9 resolved
- WebAuthn Level 3 specification (W3C)
- SimpleWebAuthn server library documentation
- `services/api/supabase/functions/passkey-authenticate/index.ts` (current)
- `services/api/supabase/functions/passkey-authenticate/index.test.ts`
