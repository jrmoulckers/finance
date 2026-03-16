# API Security Audit v2 — Supabase RLS & Edge Functions

## Date: 2026-03-15

## Scope: `services/api/`

## Auditor: Security & Privacy Review Agent

## Reference: Issue #375

---

## Executive Summary

The Supabase backend for Finance demonstrates a **strong security foundation**. RLS is
enabled on every table without exception, Edge Functions consistently authenticate
users via JWT verification against the Supabase Auth service (never from request
bodies), and the CORS configuration uses an explicit origin allowlist with no wildcards.
The data-export endpoint includes application-level rate limiting and audit logging,
and the account-deletion flow properly implements GDPR Art. 17 with crypto-shredding
semantics and a deletion certificate.

However, the audit identified **2 High**, **6 Medium**, and **5 Low/Informational**
findings that should be addressed before the next production release. The most
significant issues are:

1. **PowerSync sync rules do not filter soft-deleted records**, meaning a user whose
   household membership has been revoked (soft-deleted) can continue syncing that
   household's financial data until their JWT expires and the PowerSync connection
   is reset.
2. **The `household_invitations` UPDATE RLS policy is overly permissive**, allowing
   any household member — not just the owner — to modify pending invitations via
   direct PostgREST access, potentially escalating the invited user's role.

No critical (actively exploitable data exposure) findings were identified. All database
queries use the Supabase client library with parameterized inputs, eliminating SQL
injection vectors. No hardcoded secrets, credentials, or sensitive data appear in
source code or logs.

---

## Findings

### Critical

**None identified.**

All tables have RLS enabled. No unparameterized queries exist. No secrets are
hardcoded. No endpoint exposes another user's financial data.

---

### High

#### H-1: PowerSync sync rules do not filter `deleted_at` — revoked members can still sync data

| Attribute   | Value                                        |
| ----------- | -------------------------------------------- |
| **File**    | `services/api/powersync/sync-rules.yaml`     |
| **Lines**   | 4, 13                                        |
| **OWASP**   | A01:2021 – Broken Access Control             |
| **Affects** | All household-scoped financial data via sync |

**Description:**
The `by_household` bucket parameter query is:

```sql
SELECT household_id FROM household_members WHERE user_id = token_parameters.user_id
```

This query does **not** include `AND deleted_at IS NULL`. When a user is removed from
a household (their `household_members.deleted_at` is set), the PowerSync sync pipeline
will continue to include that household's data in the user's sync bucket until:

- Their JWT expires and is refreshed (at which point `auth.household_ids()` no longer
  includes the household), **and**
- The PowerSync connection is re-established.

Since PowerSync caches data on the client device and the sync rules are evaluated
server-side, the window of exposure depends on token lifetime and sync reconnection
intervals.

The same issue applies to the `user_profile` bucket's `household_members` data query
(line 16) and the `users` parameter query (line 13).

**Recommendation:**
Add `deleted_at IS NULL` filters to all sync rule queries:

```yaml
bucket_definitions:
  by_household:
    parameters:
      - SELECT household_id FROM household_members
        WHERE user_id = token_parameters.user_id AND deleted_at IS NULL
    data:
      - SELECT * FROM accounts WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM transactions WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM categories WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM budgets WHERE household_id = bucket.household_id AND deleted_at IS NULL
      - SELECT * FROM goals WHERE household_id = bucket.household_id AND deleted_at IS NULL
  user_profile:
    parameters:
      - SELECT id AS user_id FROM users
        WHERE id = token_parameters.user_id AND deleted_at IS NULL
    data:
      - SELECT * FROM users WHERE id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM household_members
        WHERE user_id = bucket.user_id AND deleted_at IS NULL
```

---

#### H-2: `household_invitations` UPDATE RLS policy allows any member to modify invitations

| Attribute   | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| **File**    | `services/api/supabase/migrations/20260306000003_auth_config.sql` |
| **Lines**   | 127–131                                                           |
| **OWASP**   | A01:2021 – Broken Access Control                                  |
| **Affects** | Household invitation integrity, potential role escalation         |

**Description:**
The UPDATE policy on `household_invitations` checks only household membership:

```sql
CREATE POLICY household_invitations_update ON household_invitations
    FOR UPDATE
    USING (household_id = ANY(auth.household_ids()))
    WITH CHECK (household_id = ANY(auth.household_ids()));
```

The INSERT and DELETE policies correctly restrict to the household owner
(`households.created_by = auth.uid()`), but the UPDATE policy does not. This means
any household member can update invitation records via direct PostgREST access
(bypassing the Edge Function's ownership check).

**Attack scenario:**

1. Household owner Alice creates an invitation with `role = 'member'` for an external
   user.
2. Existing member Bob (who has `role = 'member'`) directly calls the PostgREST API
   to UPDATE the invitation, changing `role` to `'owner'`.
3. The external user accepts the invitation via the Edge Function and is granted
   `owner` role in the household.

**Recommendation:**
Restrict the UPDATE policy to household owners, consistent with INSERT and DELETE:

```sql
CREATE POLICY household_invitations_update ON household_invitations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_invitations.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM households
            WHERE households.id = household_invitations.household_id
              AND households.created_by = auth.uid()
              AND households.deleted_at IS NULL
        )
    );
```

---

### Medium

#### M-1: No rate limiting on authentication endpoints

| Attribute   | Value                                                        |
| ----------- | ------------------------------------------------------------ |
| **Files**   | `passkey-register/index.ts`, `passkey-authenticate/index.ts` |
| **OWASP**   | A07:2021 – Identification and Authentication Failures        |
| **Affects** | Auth availability, brute-force resistance                    |

**Description:**
The passkey registration and authentication Edge Functions have no rate limiting.
The data-export endpoint correctly implements rate limiting via the
`data_export_audit_log` table, but auth endpoints — which are the most
security-sensitive — lack equivalent protection.

An attacker could:

- Flood `passkey-register?step=options` to fill the `webauthn_challenges` table
  with garbage entries.
- Flood `passkey-authenticate?step=options` to generate unlimited challenges,
  potentially displacing legitimate users' challenges (see M-2).
- Attempt rapid `passkey-authenticate?step=verify` requests to probe credential IDs.

**Recommendation (see also Rate Limiting Recommendations section below):**
Implement per-IP and per-user rate limiting for auth endpoints. Since Supabase Edge
Functions lack built-in middleware, use the same database-backed pattern as data-export
or consider an upstream rate limiter (e.g., Cloudflare, Supabase's built-in rate
limiting if available).

| Endpoint               | Recommended Limit         |
| ---------------------- | ------------------------- |
| `passkey-register`     | 5 requests / user / hour  |
| `passkey-authenticate` | 10 requests / IP / minute |
| `household-invite`     | 20 requests / user / hour |
| `account-deletion`     | 3 requests / user / day   |

---

#### M-2: Passkey authentication challenge lookup is globally scoped — DoS and confusion risk

| Attribute | Value                                                           |
| --------- | --------------------------------------------------------------- |
| **File**  | `services/api/supabase/functions/passkey-authenticate/index.ts` |
| **Lines** | 157–163                                                         |
| **OWASP** | A07:2021 – Identification and Authentication Failures           |

**Description:**
During the verification step of passkey authentication, the challenge is looked up
with:

```ts
const { data: challenges } = await supabaseAdmin
  .from('webauthn_challenges')
  .select('*')
  .eq('type', 'authentication')
  .gt('expires_at', new Date().toISOString())
  .order('created_at', { ascending: false })
  .limit(1);
```

This retrieves the **most recent** unexpired authentication challenge **globally**
(across all users/sessions), because `user_id` is `null` for usernameless flows.

**Issues:**

1. **DoS vector:** An attacker can flood `?step=options` to continuously generate
   new challenges. Legitimate users' challenges become stale because the verify step
   always picks the newest global challenge, causing their authentication to fail.
2. **Race condition:** If two users authenticate concurrently, the second user's
   challenge overwrites the first's lookup.

While `verifyAuthenticationResponse` will reject a challenge mismatch (the client
sends the original challenge in `clientDataJSON`), the server uses the wrong
`expectedChallenge`, causing a guaranteed verification failure under concurrent load.

**Recommendation:**
Tie the challenge to the session. During the options step, return the challenge ID
(or the challenge value itself) to the client. During the verify step, require the
client to send the challenge value back, and look up by challenge value:

```ts
// In options step: return challenge_id or the challenge string
// In verify step:
const clientChallenge = body.response?.clientDataJSON
  ? extractChallengeFromClientData(body) // decode from clientDataJSON
  : body.challenge; // or accept it explicitly

const { data: challenges } = await supabaseAdmin
  .from('webauthn_challenges')
  .select('*')
  .eq('challenge', clientChallenge)
  .eq('type', 'authentication')
  .gt('expires_at', new Date().toISOString())
  .limit(1);
```

---

#### M-3: Invitation `role` parameter not validated against allowed values

| Attribute | Value                                                       |
| --------- | ----------------------------------------------------------- |
| **File**  | `services/api/supabase/functions/household-invite/index.ts` |
| **Lines** | 66, 119–125                                                 |
| **OWASP** | A03:2021 – Injection / A04:2021 – Insecure Design           |

**Description:**
The POST handler destructures `role` from the request body with a default of
`'member'`, but never validates it against the set of allowed values:

```ts
const { household_id, invited_email, role = 'member', expires_in_hours = 72 } = body;
```

A household owner could send `role: 'superadmin'` or any arbitrary string. While the
application may only check for `'owner'` and `'member'`, storing arbitrary role values
pollutes the data and could cause authorization bypasses if role checks are added later
using an allowlist approach (e.g., `role !== 'member'` being treated as elevated).

Additionally, `expires_in_hours` has no upper bound. Setting it to `Number.MAX_VALUE`
would create effectively permanent invitations.

**Recommendation:**
Validate inputs before use:

```ts
const ALLOWED_ROLES = ['member', 'owner'] as const;
const MAX_EXPIRY_HOURS = 168; // 1 week

if (!ALLOWED_ROLES.includes(role)) {
  return errorResponse(req, `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}`);
}
if (expires_in_hours < 1 || expires_in_hours > MAX_EXPIRY_HOURS) {
  return errorResponse(req, `expires_in_hours must be between 1 and ${MAX_EXPIRY_HOURS}`);
}
```

Also add a CHECK constraint on the `household_invitations.role` column:

```sql
ALTER TABLE household_invitations
  ADD CONSTRAINT chk_invitation_role CHECK (role IN ('owner', 'member'));
```

---

#### M-4: Health-check endpoint imports non-existent CORS exports

| Attribute   | Value                                                   |
| ----------- | ------------------------------------------------------- |
| **File**    | `services/api/supabase/functions/health-check/index.ts` |
| **Line**    | 21                                                      |
| **Affects** | Health-check CORS validation, runtime stability         |

**Description:**
The health-check endpoint imports `corsHeaders` and `handleCorsPreflightRequest`
from `_shared/cors.ts`:

```ts
import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
```

However, `_shared/cors.ts` exports `getCorsHeaders` (a function taking a `Request`)
and `handleCorsPreflightRequest` (also takes a `Request`). There is no `corsHeaders`
named export. Throughout the health-check handler:

- `corsHeaders` is used as a static object (`...corsHeaders`) — line 126, 146, etc.
- `handleCorsPreflightRequest()` is called without arguments — line 116.

This means either:

1. The health-check will fail at import time (named export not found), making the
   endpoint non-functional.
2. If Deno resolves `corsHeaders` as `undefined`, all responses will lack CORS
   headers entirely — the origin validation is bypassed.

**Recommendation:**
Update health-check to use the correct CORS imports:

```ts
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
// ...
if (req.method === 'OPTIONS') {
  return handleCorsPreflightRequest(req);
}
// ...
headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
```

---

#### M-5: RLS policies on data tables do not filter soft-deleted records

| Attribute   | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| **File**    | `services/api/supabase/migrations/20260306000002_rls_policies.sql` |
| **Affects** | accounts, categories, transactions, budgets, goals                 |
| **OWASP**   | A01:2021 – Broken Access Control                                   |

**Description:**
All household-scoped RLS SELECT policies use the pattern:

```sql
USING (household_id = ANY(auth.household_ids()))
```

None of them include `AND deleted_at IS NULL`. While `auth.household_ids()` itself
correctly filters `deleted_at IS NULL` on the _membership_ check, the _data_ tables
do not filter soft-deleted records. This means:

- Soft-deleted accounts, transactions, budgets, goals, and categories remain visible
  via RLS to all household members.
- If the application intends soft-deleted records to be invisible, this is a gap.
- If the application intentionally shows soft-deleted records (e.g., "recently deleted"
  feature), this is acceptable — but it should be documented.

This also interacts with the data-export endpoint: soft-deleted financial records are
included in GDPR data exports, which may or may not be desired.

**Recommendation:**
If soft-deleted records should be hidden from normal access, add `AND deleted_at IS
NULL` to all SELECT policies. If the "recently deleted" pattern is intentional,
document this decision and consider adding a time-boxed window (e.g., records with
`deleted_at` older than 30 days are filtered out).

---

#### M-6: `handle_new_user_signup` can create duplicate households on webhook replay

| Attribute | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| **File**  | `services/api/supabase/migrations/20260306000003_auth_config.sql` |
| **Lines** | 279–316                                                           |

**Description:**
The `handle_new_user_signup` function uses `ON CONFLICT (id) DO NOTHING` for the
user INSERT, correctly handling duplicate user creation. However, the subsequent
household and membership INSERTs have **no idempotency protection**:

```sql
INSERT INTO households (name, created_by)
VALUES (display || '''s Household', p_user_id)
RETURNING id INTO hh_id;

INSERT INTO household_members (household_id, user_id, role)
VALUES (hh_id, p_user_id, 'owner');
```

If the auth webhook fires twice for the same user signup (which can happen due to
network retries, at-least-once delivery), the user will end up with multiple default
households.

**Recommendation:**
Add an idempotency check:

```sql
-- Only create household if user doesn't already have one
IF NOT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = p_user_id AND deleted_at IS NULL
) THEN
    INSERT INTO households (name, created_by) ...
    INSERT INTO household_members (household_id, user_id, role) ...
END IF;
```

---

### Low / Informational

#### L-1: No scheduled cleanup of expired WebAuthn challenges

| Attribute | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| **File**  | `services/api/supabase/migrations/20260306000003_auth_config.sql` |
| **Table** | `webauthn_challenges`                                             |

**Description:**
Expired challenges are cleaned up only when a specific challenge is consumed during
verification (passkey-register line 199, passkey-authenticate line 207). If a
challenge is generated but never consumed (user abandons the ceremony), it remains
in the table indefinitely.

Over time, the `webauthn_challenges` table will accumulate expired records. While
the index on `expires_at` helps query performance, storage will grow unbounded.

**Recommendation:**
Create a scheduled job (pg_cron or Supabase cron) to purge expired challenges:

```sql
-- Run daily
DELETE FROM webauthn_challenges WHERE expires_at < now() - interval '1 day';
```

---

#### L-2: Data export includes other household members' UUIDs

| Attribute      | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **File**       | `services/api/supabase/functions/data-export/index.ts` |
| **Lines**      | 54                                                     |
| **Regulation** | GDPR Art. 20 — Data Portability                        |

**Description:**
The `household_members` table is exported with `filterBy: 'household_id'`,
meaning a user's export includes `user_id` values of other household members.
While UUIDs are pseudonymous identifiers, they could potentially be correlated
with other data. This is not a violation per se — household membership is shared
data — but is worth noting for GDPR data minimization principles.

**Recommendation:**
Consider filtering the `household_members` export to only include the requesting
user's own rows, or document the rationale for including shared membership data
in the export (e.g., "data portability includes the user's relationship context").

---

#### L-3: Constant-time comparison in auth-webhook is best-effort

| Attribute | Value                                                   |
| --------- | ------------------------------------------------------- |
| **File**  | `services/api/supabase/functions/auth-webhook/index.ts` |
| **Lines** | 55–63                                                   |

**Description:**
The `verifyWebhookSecret` function implements a manual XOR-based comparison loop:

```ts
let mismatch = 0;
for (let i = 0; i < token.length; i++) {
  mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
}
```

While this is the correct algorithm, JavaScript JIT compilers may optimize the loop
in ways that break constant-time guarantees. The Web Crypto API's
`crypto.subtle.timingSafeEqual` (available in Deno) provides a more robust
implementation.

**Recommendation:**
Use the platform's timing-safe comparison if available:

```ts
const encoder = new TextEncoder();
const a = encoder.encode(token);
const b = encoder.encode(secret);
if (a.byteLength !== b.byteLength) return false;
return crypto.subtle.timingSafeEqual(a, b);
```

---

#### L-4: `households` table not synced via PowerSync

| Attribute | Value                                    |
| --------- | ---------------------------------------- |
| **File**  | `services/api/powersync/sync-rules.yaml` |

**Description:**
The `by_household` bucket syncs accounts, transactions, categories, budgets, and
goals — but not the `households` table itself. Clients will not receive household
metadata (name, creation date, owner) through the sync pipeline. The `user_profile`
bucket syncs `household_members` but not `households`.

This means clients must fetch household details through a separate API call, which
could lead to stale data on the client if the household name is changed by another
member.

**Recommendation:**
If household metadata is needed on the client, add it to the sync rules:

```yaml
by_household:
  data:
    - SELECT * FROM households WHERE id = bucket.household_id AND deleted_at IS NULL
    # ... existing data queries
```

---

#### L-5: `audit_log` old_values/new_values JSONB columns could store sensitive financial data

| Attribute | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| **File**  | `services/api/supabase/migrations/20260306000003_auth_config.sql` |
| **Lines** | 184–196                                                           |

**Description:**
The `audit_log` table has `old_values JSONB` and `new_values JSONB` columns. If
audit logging is extended to capture financial mutations (transaction
create/update/delete), these columns could store monetary amounts, payees, and notes
in plain text within the audit log.

Currently, only the account-deletion and data-export Edge Functions write to this
table, and they store only metadata (certificate IDs, record counts) — not financial
data. However, the schema allows unrestricted JSONB content, and future developers
might log full record snapshots.

**Recommendation:**
Document a policy that `old_values` and `new_values` must never contain raw financial
data (amounts, payee names, notes). If full record snapshots are needed for audit
compliance, encrypt the JSONB content or store only non-sensitive metadata (record ID,
changed column names, timestamp).

---

## Recommendations

### Priority 1 — Fix Before Next Release

| ID  | Finding                                                   | Effort |
| --- | --------------------------------------------------------- | ------ |
| H-1 | Add `deleted_at IS NULL` to PowerSync sync rules          | Small  |
| H-2 | Restrict `household_invitations` UPDATE RLS to owner      | Small  |
| M-2 | Scope passkey auth challenge lookup by challenge value    | Medium |
| M-3 | Validate `role` and `expires_in_hours` in invite endpoint | Small  |

### Priority 2 — Fix Within Sprint

| ID  | Finding                                            | Effort |
| --- | -------------------------------------------------- | ------ |
| M-1 | Implement rate limiting on auth endpoints          | Medium |
| M-4 | Fix health-check CORS imports                      | Small  |
| M-5 | Decide on soft-delete visibility in RLS & document | Small  |
| M-6 | Add idempotency to `handle_new_user_signup`        | Small  |

### Priority 3 — Address When Convenient

| ID  | Finding                                         | Effort |
| --- | ----------------------------------------------- | ------ |
| L-1 | Schedule cleanup of expired WebAuthn challenges | Small  |
| L-2 | Review data export household_members scope      | Small  |
| L-3 | Use `crypto.subtle.timingSafeEqual` in webhook  | Small  |
| L-4 | Add `households` to PowerSync sync rules        | Small  |
| L-5 | Document audit_log JSONB content policy         | Small  |

---

## Rate Limiting Recommendations

Rate limiting is the most significant architectural gap identified in this audit.
The data-export endpoint's database-backed approach (counting rows in an audit table
within a time window) is effective and can be generalized to other endpoints.

### Recommended Configuration

| Endpoint               | Method | Limit  | Window   | Key     | Notes                       |
| ---------------------- | ------ | ------ | -------- | ------- | --------------------------- |
| `health-check`         | GET    | 60 req | 1 min    | IP      | Prevent monitoring abuse    |
| `auth-webhook`         | POST   | N/A    | N/A      | N/A     | Already secret-gated        |
| `passkey-register`     | POST   | 5 req  | 1 hour   | User ID | Prevent challenge flooding  |
| `passkey-authenticate` | POST   | 10 req | 1 min    | IP      | Prevent brute-force probing |
| `household-invite`     | POST   | 20 req | 1 hour   | User ID | Prevent invite spam         |
| `household-invite`     | PUT    | 30 req | 1 hour   | User ID | Prevent accept flooding     |
| `account-deletion`     | DELETE | 3 req  | 24 hours | User ID | Prevent accidental repeats  |
| `data-export`          | GET    | 10 req | 1 hour   | User ID | Already implemented ✓       |

### Implementation Approach

**Option A: Database-backed (like data-export)**

- Create a `rate_limit_log` table or reuse `audit_log`.
- Check row count within window before processing.
- Pros: No external dependencies, works with Supabase Edge Functions.
- Cons: Adds a DB query per request.

**Option B: Upstream proxy**

- Configure rate limiting at the CDN/proxy layer (Cloudflare, AWS ALB, etc.).
- Pros: No application code changes, handles IP-based limiting well.
- Cons: Cannot rate-limit by User ID without header inspection.

**Recommended:** Use Option A for user-scoped limits (auth endpoints) and Option B
for IP-scoped limits (health-check, pre-auth endpoints). This provides defense in
depth.

---

## Positive Observations

The following security practices are well-implemented and deserve recognition:

1. **RLS coverage is complete** — all 14 tables have RLS enabled, including audit
   and monitoring tables.
2. **`auth.household_ids()` is SECURITY DEFINER** with correct privilege separation —
   grants are scoped to `supabase_auth_admin`, revoked from `public`, `anon`, and
   `authenticated`.
3. **CORS uses explicit origin validation** — no wildcards, origins read from env var.
4. **Edge Functions extract identity from JWT** — never from request bodies.
5. **Error responses are generic** — `internalErrorResponse` never leaks stack traces,
   SQL errors, or schema details.
6. **Data export redacts sensitive columns** (e.g., `public_key`).
7. **Account deletion is well-designed** — audit-before-delete, confirmation required,
   crypto-shredding semantics, deletion certificate, auth session invalidation.
8. **Seed data uses `example.com`** (RFC 2606 reserved domain) and contains no real
   credentials.
9. **WebAuthn implementation uses `@simplewebauthn/server`** — a well-maintained,
   FIDO2-compliant library, with `requireUserVerification: true`.
10. **Monetary values are stored as BIGINT cents** — no floating-point precision issues.

---

## Appendix A: RLS Coverage Matrix

| Table                   | RLS Enabled | SELECT | INSERT | UPDATE | DELETE | Notes                          |
| ----------------------- | ----------- | ------ | ------ | ------ | ------ | ------------------------------ |
| `users`                 | ✅          | ✅     | ✅     | ✅     | ✅     | Self-only                      |
| `households`            | ✅          | ✅     | ✅     | ✅     | ✅     | Member read, owner write       |
| `household_members`     | ✅          | ✅     | ✅     | ✅     | ✅     | Member read, owner write       |
| `accounts`              | ✅          | ✅     | ✅     | ✅     | ✅     | Household-scoped               |
| `categories`            | ✅          | ✅     | ✅     | ✅     | ✅     | Household-scoped               |
| `transactions`          | ✅          | ✅     | ✅     | ✅     | ✅     | Household-scoped               |
| `budgets`               | ✅          | ✅     | ✅     | ✅     | ✅     | Household-scoped               |
| `goals`                 | ✅          | ✅     | ✅     | ✅     | ✅     | Household-scoped               |
| `passkey_credentials`   | ✅          | ✅     | ✅     | ✅     | ✅     | Self-only                      |
| `household_invitations` | ✅          | ✅     | ✅     | ⚠️     | ✅     | UPDATE too permissive (H-2)    |
| `webauthn_challenges`   | ✅          | ✅     | ✅     | —      | ✅     | Self-only, no UPDATE policy    |
| `audit_log`             | ✅          | ✅     | —      | —      | —      | Read-only, service-role insert |
| `sync_health_logs`      | ✅          | ✅     | ✅\*   | —      | —      | \*Insert: service_role only    |
| `data_export_audit_log` | ✅          | ✅     | —      | —      | —      | Read-only user, service insert |

## Appendix B: Edge Function Auth Matrix

| Endpoint               | Auth Required | Auth Method   | RBAC Check               | CORS Validated |
| ---------------------- | ------------- | ------------- | ------------------------ | -------------- |
| `health-check`         | No            | —             | —                        | ⚠️ (M-4)       |
| `auth-webhook`         | Yes           | Shared secret | Webhook secret match     | N/A (no CORS)  |
| `passkey-register`     | Yes           | JWT           | Self-only                | ✅             |
| `passkey-authenticate` | No\*          | —             | Credential ownership     | ✅             |
| `household-invite`     | Yes           | JWT           | Owner for POST           | ✅             |
| `account-deletion`     | Yes           | JWT           | Self-only + confirmation | ✅             |
| `data-export`          | Yes           | JWT           | Self-only                | ✅             |

\*Passkey authentication is a pre-auth flow — the user is not yet authenticated.
Authentication is established by proving possession of the passkey credential.
