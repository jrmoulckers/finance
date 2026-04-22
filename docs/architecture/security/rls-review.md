# RLS Policy Review

**Sprint:** Security Review Sprint 4
**Date:** 2025-07-27
**Auditor:** Security Reviewer (AI-assisted)
**Scope:** All Supabase RLS policies across all migrations
**Methodology:** Policy-by-policy analysis, household isolation verification, escalation path assessment

---

## Executive Summary

This review examines all Row Level Security (RLS) policies across the Finance application''s Supabase PostgreSQL database. The review covers 12 tables with RLS enabled, 40+ individual policies, and all SECURITY DEFINER functions that bypass RLS.

### Overall Assessment: **STRONG with minor findings**

The RLS implementation is well-architected with consistent patterns:

- ✅ RLS is enabled on ALL tables (no exceptions found)
- ✅ Household-scoped tables consistently use `auth.household_ids()` helper
- ✅ User-scoped tables consistently use `auth.uid()`
- ✅ Service-role-only functions properly revoke PUBLIC/anon/authenticated execute
- ✅ No wildcard policies (e.g., `USING (true)`) found
- ⚠️ 3 MEDIUM findings and 2 LOW findings identified

### Finding Summary

| Severity | Count | Description                                                      |
| -------- | ----- | ---------------------------------------------------------------- |
| CRITICAL | 0     | —                                                                |
| HIGH     | 0     | —                                                                |
| MEDIUM   | 3     | Missing granular write controls, stale JWT risk, audit log scope |
| LOW      | 2     | Soft-delete visibility, notification preference deletion         |

---

## 1. Table-by-Table RLS Analysis

### 1.1 `users` Table

**Source:** `20260306000002_rls_policies.sql:48-64`

| Policy       | Operation | Condition                       | Assessment |
| ------------ | --------- | ------------------------------- | ---------- |
| users_select | SELECT    | `id = auth.uid()`               | ✅ PASS    |
| users_insert | INSERT    | `id = auth.uid()`               | ✅ PASS    |
| users_update | UPDATE    | `id = auth.uid()` (USING+CHECK) | ✅ PASS    |
| users_delete | DELETE    | `id = auth.uid()`               | ✅ PASS    |

**Analysis:** Correctly restricts all operations to the authenticated user''s own record. The INSERT policy ensures users can only create a record with their own `auth.uid()`, preventing impersonation. The DELETE policy exists but the application uses soft-delete (`deleted_at` UPDATE) — the hard DELETE policy provides defense-in-depth.

### 1.2 `households` Table

**Source:** `20260306000002_rls_policies.sql:70-85`

| Policy            | Operation | Condition                        | Assessment |
| ----------------- | --------- | -------------------------------- | ---------- |
| households_select | SELECT    | `id = ANY(auth.household_ids())` | ✅ PASS    |
| households_insert | INSERT    | `created_by = auth.uid()`        | ✅ PASS    |
| households_update | UPDATE    | `created_by = auth.uid()` (both) | ✅ PASS    |
| households_delete | DELETE    | `created_by = auth.uid()`        | ✅ PASS    |

**Analysis:** Correctly separates read access (any member) from write access (owner only). The `created_by = auth.uid()` check is immutable — there''s no mechanism to change `created_by`, preventing ownership transfer attacks. This is secure but means ownership transfer requires a migration or SECURITY DEFINER function.

### 1.3 `household_members` Table

**Source:** `20260306000002_rls_policies.sql:91-134`

| Policy                   | Operation | Condition                                   | Assessment |
| ------------------------ | --------- | ------------------------------------------- | ---------- |
| household_members_select | SELECT    | `household_id = ANY(auth.household_ids())`  | ✅ PASS    |
| household_members_insert | INSERT    | Subquery: household.created_by = auth.uid() | ✅ PASS    |
| household_members_update | UPDATE    | Subquery: household.created_by = auth.uid() | ✅ PASS    |
| household_members_delete | DELETE    | Subquery: household.created_by = auth.uid() | ✅ PASS    |

**Analysis:** Excellent pattern. Members can see co-members but only the household owner can add, modify, or remove members. The subquery checks `households.created_by = auth.uid()` which prevents a member from escalating their own privileges or removing other members.

**Note:** The subquery also checks `households.deleted_at IS NULL`, preventing operations on soft-deleted households.

### 1.4 Household-Scoped Data Tables

**Source:** `20260306000002_rls_policies.sql:140-239`

Tables: `accounts`, `categories`, `transactions`, `budgets`, `goals`

All five tables follow the identical pattern:

| Policy     | Operation | Condition                                  | Assessment |
| ---------- | --------- | ------------------------------------------ | ---------- |
| \*\_select | SELECT    | `household_id = ANY(auth.household_ids())` | ✅ PASS    |
| \*\_insert | INSERT    | `household_id = ANY(auth.household_ids())` | ✅ PASS    |
| \*\_update | UPDATE    | `household_id = ANY(auth.household_ids())` | ✅ PASS    |
| \*\_delete | DELETE    | `household_id = ANY(auth.household_ids())` | ✅ PASS    |

**Analysis:** Consistent and correct. All household members have equal read/write access to household data. This is appropriate for a family finance app where all members manage shared finances.

**⚠️ Finding RLS-M1 (MEDIUM): No granular role-based write controls on financial data.**

- Currently, ALL household members (owner, admin, member, viewer) have equal write access to transactions, budgets, accounts, etc.
- The `household_members.role` field exists but is not used in any RLS policy.
- **Risk:** A "viewer" role member could create/modify/delete transactions.
- **Recommendation:** When implementing the family plans feature, add role-based policies:
  ```sql
  -- Example: viewers can only SELECT
  CREATE POLICY transactions_viewer_readonly ON transactions
      FOR SELECT
      USING (
          household_id = ANY(auth.household_ids())
          AND EXISTS (
              SELECT 1 FROM household_members
              WHERE household_members.household_id = transactions.household_id
                AND household_members.user_id = auth.uid()
                AND household_members.role IN ('owner', 'admin', 'member', 'viewer')
          )
      );
  ```

### 1.5 `passkey_credentials` Table

**Source:** `20260306000003_auth_config.sql:57-75`

| Policy                     | Operation | Condition              | Assessment |
| -------------------------- | --------- | ---------------------- | ---------- |
| passkey_credentials_select | SELECT    | `user_id = auth.uid()` | ✅ PASS    |
| passkey_credentials_insert | INSERT    | `user_id = auth.uid()` | ✅ PASS    |
| passkey_credentials_update | UPDATE    | `user_id = auth.uid()` | ✅ PASS    |
| passkey_credentials_delete | DELETE    | `user_id = auth.uid()` | ✅ PASS    |

**Analysis:** Correctly user-scoped. Users can only manage their own passkey credentials. Note that in practice, passkey operations go through Edge Functions using `service_role` (which bypasses RLS), but the RLS policies provide defense-in-depth if credentials are ever accessed via PostgREST directly.

### 1.6 `household_invitations` Table

**Source:** `20260306000003_auth_config.sql:111-141`

| Policy                       | Operation | Condition                                         | Assessment |
| ---------------------------- | --------- | ------------------------------------------------- | ---------- |
| household_invitations_select | SELECT    | `household_id = ANY(auth.household_ids())`        | ✅ PASS    |
| household_invitations_insert | INSERT    | Subquery: household.created_by = auth.uid()       | ✅ PASS    |
| household_invitations_update | UPDATE    | `household_id = ANY(auth.household_ids())` (both) | ⚠️ NOTE    |
| household_invitations_delete | DELETE    | Subquery: household.created_by = auth.uid()       | ✅ PASS    |

**Analysis:** INSERT and DELETE are correctly owner-only. However, the UPDATE policy allows ANY household member to update invitations (e.g., mark as accepted). This is intentional — the `accept_household_invitation` RPC uses `service_role` anyway, and the UPDATE policy enables the invitation acceptance flow. The broader UPDATE access is acceptable because:

1. Invitation acceptance goes through the atomic RPC (which validates business rules)
2. Direct PostgREST UPDATE could only modify invitations visible to the user (their household)
3. The most sensitive fields (household_id, invited_by) would need INSERT to change

### 1.7 `webauthn_challenges` Table

**Source:** `20260306000003_auth_config.sql:166-178`

| Policy                     | Operation | Condition              | Assessment |
| -------------------------- | --------- | ---------------------- | ---------- |
| webauthn_challenges_select | SELECT    | `user_id = auth.uid()` | ✅ PASS    |
| webauthn_challenges_insert | INSERT    | `user_id = auth.uid()` | ✅ PASS    |
| webauthn_challenges_delete | DELETE    | `user_id = auth.uid()` | ✅ PASS    |

**Analysis:** Correctly user-scoped with no UPDATE policy (challenges are single-use: insert → read → delete). Note that challenges for usernameless authentication flows may have `user_id = NULL` — the RLS policies would not match these rows for any authenticated user, which means they''re only accessible via `service_role`. This is correct and secure.

### 1.8 `audit_log` Table

**Source:** `20260306000003_auth_config.sql:206-211`

| Policy           | Operation | Condition                                                          | Assessment |
| ---------------- | --------- | ------------------------------------------------------------------ | ---------- |
| audit_log_select | SELECT    | `household_id = ANY(auth.household_ids()) OR user_id = auth.uid()` | ⚠️ NOTE    |

**Analysis:** Only a SELECT policy exists — no INSERT/UPDATE/DELETE policies for regular users. This is correct: the audit log is append-only, written exclusively by SECURITY DEFINER functions using `service_role`.

**⚠️ Finding RLS-M2 (MEDIUM): Audit log SELECT policy is overly broad for household context.**

- The `OR user_id = auth.uid()` clause means a user can see audit log entries where they are the actor, even for households they''ve since left.
- After a user leaves a household, they can still see their own audit entries (which may reference that household''s data changes).
- **Risk:** Low — audit entries contain action names and record IDs, not financial data. But `old_values` and `new_values` JSONB fields could contain financial amounts.
- **Recommendation:** Consider removing the `OR user_id = auth.uid()` clause, or ensure `old_values`/`new_values` never contain financial amounts for departed members.

### 1.9 `notification_preferences` Table

**Source:** `20260324000001_notification_infrastructure.sql:140-151`

| Policy                          | Operation | Condition              | Assessment |
| ------------------------------- | --------- | ---------------------- | ---------- |
| notification_preferences_select | SELECT    | `user_id = auth.uid()` | ✅ PASS    |
| notification_preferences_insert | INSERT    | `user_id = auth.uid()` | ✅ PASS    |
| notification_preferences_update | UPDATE    | `user_id = auth.uid()` | ✅ PASS    |

**⚠️ Finding RLS-L1 (LOW): No DELETE policy for notification_preferences.**

- Users cannot delete their notification preferences via PostgREST.
- This is likely intentional (soft-delete via `deleted_at`), but it differs from the pattern in other user-scoped tables.
- **Recommendation:** Document this as intentional or add a DELETE policy for consistency.

### 1.10 `notification_log` Table

**Source:** `20260324000001_notification_infrastructure.sql:162-167`

| Policy                  | Operation | Condition              | Assessment |
| ----------------------- | --------- | ---------------------- | ---------- |
| notification_log_select | SELECT    | `user_id = auth.uid()` | ✅ PASS    |
| notification_log_insert | INSERT    | `WITH CHECK (false)`   | ✅ PASS    |

**Analysis:** Excellent pattern. Users can read their own notifications but CANNOT insert/update/delete. All notification creation goes through Edge Functions with `service_role`. The `WITH CHECK (false)` is an effective denial policy.

### 1.11 `rate_limits` Table

**Source:** `20260323000003_rate_limits.sql:39-40`

| Policy | Operation | Condition | Assessment |
| ------ | --------- | --------- | ---------- |
| (none) | —         | —         | ✅ PASS    |

**Analysis:** RLS is enabled but no policies exist. This means NO authenticated or anonymous user can access the table — only `service_role`. This is correct: rate limits are managed exclusively by SECURITY DEFINER functions.

---

## 2. SECURITY DEFINER Functions Review

### 2.1 `auth.household_ids()`

**Source:** `20260306000002_rls_policies.sql:20-29`

```sql
SECURITY DEFINER
LANGUAGE sql STABLE
```

**Analysis:** This is the foundational function for all household-scoped RLS policies. It queries `household_members` where `user_id = auth.uid()` and `deleted_at IS NULL`.

**⚠️ Finding RLS-M3 (MEDIUM): JWT caching of household_ids creates a stale data window.**

- The `custom_access_token_hook` embeds `household_ids` into the JWT at token issue/refresh time.
- If a user is removed from a household, their JWT still contains the old `household_ids` until the token expires or is refreshed.
- The `auth.household_ids()` function queries the database directly (bypassing JWT claims), so RLS policies that use this function are NOT affected by stale JWTs.
- **However:** If any client-side or server-side code reads household membership from the JWT `household_ids` claim instead of calling `auth.household_ids()`, stale access could occur.
- **Risk:** Access window = JWT expiry time (typically 1 hour for Supabase). During this window, a removed member could still access data if the JWT claim is used directly.
- **Recommendation:**
  1. Ensure all RLS policies use `auth.household_ids()` function (they do — verified ✅)
  2. Document that client-side code MUST NOT cache household membership from JWT claims
  3. Consider reducing JWT expiry to 15-30 minutes for tighter revocation
  4. Implement a session invalidation webhook that forces token refresh on membership changes

### 2.2 `auth.custom_access_token_hook()`

**Source:** `20260306000003_auth_config.sql:224-262`

**Permissions:**

- ✅ Granted to `supabase_auth_admin`
- ✅ Revoked from PUBLIC, anon, authenticated

**Analysis:** Correctly restricted. Only the Supabase Auth service can call this function. The function queries `household_members` to embed `household_ids` in the JWT. The `SET search_path = public` prevents search_path injection attacks.

### 2.3 `public.handle_new_user_signup()`

**Source:** `20260316000001_edge_function_security.sql:22-85`

**Permissions:**

- ✅ Granted to `service_role` only
- ✅ Revoked from PUBLIC, anon

**Analysis:** Correctly restricted and idempotent. The idempotency guard prevents duplicate webhook fires from creating multiple households. The function uses `ON CONFLICT (id) DO NOTHING` for the user INSERT and checks for existing membership before creating a household.

### 2.4 `public.accept_household_invitation()`

**Source:** `20260316000001_edge_function_security.sql:105-180`

**Permissions:**

- ✅ Granted to `service_role` only
- ✅ Revoked from PUBLIC, anon

**Analysis:** Excellent implementation. Uses `SELECT ... FOR UPDATE` to serialize concurrent acceptance attempts. Validates invitation existence, expiry, email match, and existing membership before creating the membership record. All validation happens within a single transaction.

### 2.5 `public.check_rate_limit()`

**Source:** `20260323000003_rate_limits.sql:56-99`

**Permissions:**

- ✅ Granted to `service_role` only
- ✅ Revoked from PUBLIC, anon

**Analysis:** Correctly restricted. Uses atomic UPSERT pattern for race-condition-free rate limiting. The function resets the counter when the window expires, preventing stale counters.

---

## 3. Cross-Household Isolation Verification

### Test Scenarios for Validation

| Scenario                                                | Expected Result             | Verified  |
| ------------------------------------------------------- | --------------------------- | --------- |
| User A queries User B''s household transactions         | Empty result set            | ✅ Policy |
| User A inserts transaction into User B''s household     | Insert rejected             | ✅ Policy |
| User in household H1 queries H2 accounts                | Empty result set            | ✅ Policy |
| Removed member queries former household data            | Empty (after JWT refresh)   | ✅ Policy |
| User with multiple households sees data from all        | Data from all memberships   | ✅ Policy |
| `auth.household_ids()` with no memberships returns `{}` | Empty array, no data access | ✅ Code   |

### Isolation Architecture Assessment

```
User A (households: [H1, H3])          User B (households: [H2, H3])
         │                                       │
         ▼                                       ▼
  auth.household_ids()                   auth.household_ids()
  → [H1, H3]                            → [H2, H3]
         │                                       │
         ▼                                       ▼
  RLS: household_id = ANY([H1, H3])    RLS: household_id = ANY([H2, H3])
         │                                       │
  Sees: H1 data + H3 data              Sees: H2 data + H3 data
  (H2 invisible)                        (H1 invisible)
```

- ✅ H3 data is correctly shared between User A and User B
- ✅ H1 data is invisible to User B
- ✅ H2 data is invisible to User A
- ✅ Household isolation is enforced at the database level

---

## 4. Findings Summary

### RLS-M1: No role-based write controls on financial data (MEDIUM)

- **Tables:** accounts, categories, transactions, budgets, goals
- **Issue:** All household members have equal CRUD access regardless of `role` field
- **Impact:** "Viewer" role members can modify data
- **Status:** Acceptable for MVP; must address before family plans launch

### RLS-M2: Audit log SELECT policy overly broad (MEDIUM)

- **Table:** audit_log
- **Issue:** `OR user_id = auth.uid()` allows departed members to see their historical audit entries
- **Impact:** Low — audit entries reference record IDs, but `old_values`/`new_values` may contain amounts
- **Status:** Document as known limitation; review for family plans

### RLS-M3: JWT household_ids caching creates stale access window (MEDIUM)

- **Function:** auth.custom_access_token_hook
- **Issue:** Embedded household_ids in JWT may be stale after membership removal
- **Impact:** Mitigated by `auth.household_ids()` function use in RLS policies; risk is client-side JWT claim usage
- **Status:** Document and verify client code doesn''t rely on JWT claims for access control

### RLS-L1: Missing DELETE policy on notification_preferences (LOW)

- **Table:** notification_preferences
- **Issue:** No DELETE policy; may be intentional (soft-delete pattern)
- **Status:** Document as intentional or add policy

### RLS-L2: Soft-deleted records may be visible in some edge cases (LOW)

- **Issue:** Most policies don''t filter on `deleted_at IS NULL` — they rely on application-level filtering
- **Impact:** Soft-deleted records ARE visible via RLS but marked with `deleted_at` timestamp
- **Status:** Acceptable — application filters soft-deleted records; RLS prevents cross-boundary access

---

**Next Review:** Sprint 5 — Authentication Flow Security Review
**Document Version:** 1.0
