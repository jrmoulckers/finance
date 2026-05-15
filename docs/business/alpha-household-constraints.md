# Household Model Constraints for Single-User Alpha

> **Issue:** [#1377](https://github.com/jrmoulckers/finance/issues/1377)
> **Priority:** P2 — Medium
> **Date:** 2025-07-29
> **Owner:** Product Management
> **Status:** Draft — awaiting human review

---

## Executive Summary

The Finance app's data model is built around the **household** as the primary
tenant and data-isolation boundary (see
[ADR-0013](../architecture/0013-multi-tenancy-architecture.md) and the
[RLS review](../architecture/security/rls-review.md)). For the single-user
alpha, multi-user household features are **not yet validated** and must be
constrained so testers interact only with a predictable, single-owner
experience. This document defines what "single-user alpha" means, which
features are enabled or disabled, how data isolation works, and the migration
path to multi-user households in a later release.

### Design Principles

1. **Do not remove the household model** — it is foundational to RLS and sync.
   Constrain it; don't bypass it.
2. **One user = one household** — every alpha signup creates exactly one
   household with the signing-up user as the sole owner.
3. **Hide, don't break** — multi-user UI is hidden, but the underlying data
   structures remain valid so migration to multi-user is seamless.
4. **Test what ships** — alpha testers exercise the same code paths that will
   run in production; constraints are enforced at the application and policy
   layer, not by deleting code.

---

## 1. What "Single-User Alpha" Means

| Dimension               | Alpha Constraint                                               |
| ----------------------- | -------------------------------------------------------------- |
| **Users per household** | Exactly 1 (the owner)                                          |
| **Households per user** | Exactly 1                                                      |
| **Household creation**  | Automatic on signup — no manual household creation UI          |
| **Invitations**         | Disabled — invite endpoints return `403` / UI hidden           |
| **Roles**               | Only `owner` role exists; `member`, `viewer` roles are dormant |
| **Sharing**             | No shared accounts, budgets, or goals between users            |
| **Organization layer**  | Fully disabled — no advisor/enterprise access                  |

### Signup Flow (Alpha)

```
User signs up (email + password / passkey)
  → Supabase Auth creates auth.users row
  → Database trigger: create_household_for_new_user()
      → INSERT INTO households (name, created_by) VALUES ('Personal', auth.uid())
      → INSERT INTO household_members (household_id, user_id, role) VALUES (..., 'owner')
  → Client receives JWT with household_memberships: [{ household_id, role: "owner" }]
  → Onboarding flow begins (no household setup step)
```

The trigger already exists in the current schema. For alpha, no changes are
needed to the signup backend — only the client onboarding flow is simplified
(the "Create or join a household" step is removed).

---

## 2. Feature Enable / Disable Matrix

| Feature                        | Alpha Status | Notes                                          |
| ------------------------------ | ------------ | ---------------------------------------------- |
| Accounts CRUD                  | ✅ Enabled   | Scoped to user's single household              |
| Transactions CRUD              | ✅ Enabled   | Scoped to user's single household              |
| Budgets CRUD                   | ✅ Enabled   | Scoped to user's single household              |
| Goals CRUD                     | ✅ Enabled   | Scoped to user's single household              |
| Recurring transactions         | ✅ Enabled   | Scoped to user's single household              |
| Categories management          | ✅ Enabled   | Default + custom categories, household-scoped  |
| Sync (PowerSync)               | ✅ Enabled   | Single-household sync rules already sufficient |
| Offline mode                   | ✅ Enabled   | No multi-user conflict concerns in alpha       |
| Data export                    | ✅ Enabled   | Exports user's full household data             |
| Household settings page        | 🔒 Hidden    | No settings to configure for a solo household  |
| Invite / add member            | 🔒 Hidden    | UI hidden; API returns `403 Forbidden`         |
| Member list / roles management | 🔒 Hidden    | Only one member; nothing to manage             |
| Shared account indicators      | 🔒 Hidden    | No sharing in alpha                            |
| Household switching            | 🔒 Hidden    | Only one household; switcher is unnecessary    |
| Transfer between households    | 🔒 Hidden    | Single household only                          |
| Organization / advisor access  | �� Hidden    | Enterprise features not in alpha scope         |

**Implementation approach:** Use the existing feature-flag system (PostgreSQL +
PowerSync sync rules) to gate multi-user features behind
`feature.household_multi_user = false`. Client code checks this flag and hides
the corresponding UI. No code deletion required.

---

## 3. Data Isolation in Single-User Context

### 3.1 RLS Policies — No Changes Required

The current RLS policies already enforce correct isolation for a single-user
household:

```sql
-- Existing policy pattern (from rls_policies migration)
CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (
    household_id = ANY(auth.household_ids())
  );
```

In the single-user alpha, `auth.household_ids()` returns an array with exactly
one element. The policies work identically whether the household has one member
or many. **No RLS changes are needed for alpha.**

### 3.2 owner_id vs household_id

All sync-enabled tables carry both `owner_id` and `household_id`:

| Column         | Purpose                                       | Alpha Behavior                     |
| -------------- | --------------------------------------------- | ---------------------------------- |
| `household_id` | Tenant isolation boundary (RLS)               | Always the user's single household |
| `owner_id`     | Row-level creator tracking within a household | Always equals `auth.uid()`         |

In the single-user alpha, `owner_id` and `household_id` are effectively
redundant — every row's `owner_id` maps to the sole member of the
`household_id`. This is by design: when multi-user is enabled, `owner_id`
allows distinguishing "who created this transaction" within a shared household.

### 3.3 Sync Rules (PowerSync)

Current sync rules already filter by `household_id` from the JWT:

```yaml
# Existing sync-rules.yaml pattern
- SELECT * FROM transactions WHERE household_id = token_parameters.household_id
```

No sync-rule changes are required. Alpha users receive only their own
household's data, which is all of their data.

---

## 4. UI Simplifications

### 4.1 Onboarding

| Standard Flow (Post-Alpha)                                         | Alpha Flow                                   |
| ------------------------------------------------------------------ | -------------------------------------------- |
| Welcome → Create Account → **Household Setup** → Add First Account | Welcome → Create Account → Add First Account |

The "Household Setup" step (name your household, invite partner) is skipped
entirely. The household is named "Personal" by default.

### 4.2 Settings Screen

| Element                         | Alpha Behavior                              |
| ------------------------------- | ------------------------------------------- |
| "Household" section in settings | Hidden via feature flag                     |
| "Members" menu item             | Hidden via feature flag                     |
| "Invite" button                 | Hidden via feature flag                     |
| "Leave household" option        | Hidden via feature flag                     |
| Account/profile settings        | ✅ Visible — edit display name, email, etc. |

### 4.3 Sharing Prompts and Copy

Any UX copy referencing "household," "family," "partner," or "shared" is
replaced with neutral single-user language during alpha:

| Post-Alpha Copy                      | Alpha Copy            |
| ------------------------------------ | --------------------- |
| "Your household's monthly budget"    | "Your monthly budget" |
| "Shared with 2 members"              | _(not shown)_         |
| "Invite your partner to collaborate" | _(not shown)_         |
| "Household spending breakdown"       | "Spending breakdown"  |

**Implementation:** Use the i18n framework in `packages/core` with an
`alpha_single_user` string variant, or conditionally select strings based on the
`feature.household_multi_user` flag.

---

## 5. Backend Constraints

### 5.1 API Guardrails

During alpha, the following API endpoints enforce single-user constraints
server-side (defense in depth, independent of UI hiding):

| Endpoint                              | Alpha Behavior                                   |
| ------------------------------------- | ------------------------------------------------ |
| `POST /households`                    | Returns `403` — households are auto-created only |
| `POST /households/:id/invitations`    | Returns `403` — invitations disabled             |
| `POST /households/:id/members`        | Returns `403` — member addition disabled         |
| `DELETE /households/:id/members/:uid` | Returns `403` — cannot leave sole household      |
| `PATCH /households/:id`               | Returns `403` — household settings locked        |
| `GET /households`                     | Returns single household — no switcher needed    |

These are enforced via a middleware check on the `feature.household_multi_user`
flag, or a simple guard in the Edge Function handler.

### 5.2 Database Constraints

An optional advisory constraint can be added for alpha (removable for
multi-user launch):

```sql
-- Advisory: alert if a household gains a second member during alpha
CREATE OR REPLACE FUNCTION check_single_member_alpha()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT count(*) FROM household_members
      WHERE household_id = NEW.household_id) >= 1 THEN
    RAISE EXCEPTION 'Alpha mode: households are limited to one member';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Activate during alpha only
CREATE TRIGGER enforce_single_member_alpha
  BEFORE INSERT ON household_members
  FOR EACH ROW EXECUTE FUNCTION check_single_member_alpha();
```

This trigger is dropped when multi-user launches.

---

## 6. Migration Path: Single-User → Multi-User

When multi-user households are enabled (post-alpha), the transition must be
seamless. No data migration is needed because the data model is already
multi-user-ready.

### 6.1 What Changes

| Layer            | Change Required                                             |
| ---------------- | ----------------------------------------------------------- |
| Feature flag     | Set `feature.household_multi_user = true`                   |
| API guardrails   | Remove `403` guards on household management endpoints       |
| Database trigger | Drop `enforce_single_member_alpha` trigger                  |
| Client UI        | Feature flag gates reveal household settings, invite flows  |
| Onboarding       | Add optional "Household Setup" step back into the flow      |
| Sync rules       | No change — already support multi-member households         |
| RLS policies     | No change — already support multi-member households         |
| UX copy          | Switch from `alpha_single_user` strings to standard strings |

### 6.2 Data Continuity

- Existing single-user households remain valid — they simply gain the ability
  to add members.
- The auto-created "Personal" household can be renamed by the user.
- All existing transactions, budgets, goals, and accounts remain associated
  with the same `household_id`.
- `owner_id` on existing rows correctly reflects the original creator.
- No data backfill or migration script is required.

### 6.3 Upgrade Flow (User Experience)

```
User opens app after multi-user is enabled
  → Feature flag syncs via PowerSync
  → "Household" section appears in Settings
  → Optional prompt: "You can now invite a partner or family member"
  → User can rename household, send invitations
  → Invited member joins → sees shared data scoped by household_id
```

---

## 7. Testing Guidelines

### 7.1 Automated Tests

All test suites must verify single-user assumptions hold:

| Test Category          | Assertion                                                    |
| ---------------------- | ------------------------------------------------------------ |
| Signup flow            | New user has exactly 1 household and is its sole `owner`     |
| Household API (alpha)  | `POST /households` returns `403`                             |
| Invitation API (alpha) | `POST /households/:id/invitations` returns `403`             |
| Data scoping           | All queries return only data from the user's household       |
| RLS bypass attempt     | Inserting data with a different `household_id` is rejected   |
| Sync filtering         | PowerSync delivers only the user's household data            |
| Feature flag gating    | Multi-user UI elements are not rendered when flag is `false` |
| owner_id consistency   | Every row's `owner_id` matches the authenticated user        |

### 7.2 Manual Test Scenarios

| Scenario                                 | Expected Result                                   |
| ---------------------------------------- | ------------------------------------------------- |
| Sign up as new user                      | Household auto-created; onboarding skips HH setup |
| Search for "invite" or "household" in UI | No results — all entry points are hidden          |
| Attempt API call to invite a member      | `403 Forbidden`                                   |
| Create accounts, transactions, budgets   | All scoped to single household; no sharing UI     |
| Export data                              | Contains all user data; `household_id` is present |
| Log out and log in again                 | Same household, same data, no household picker    |

### 7.3 Edge Cases

- **Account deletion during alpha:** User deletes account → household and all
  associated data are soft-deleted. No orphaned household members.
- **Re-signup with same email:** New household is created. Old soft-deleted
  data is not accessible (GDPR compliance).
- **Clock skew / timezone:** Timestamps use UTC; household creation timestamp
  is server-side.

---

## 8. Open Questions

| #   | Question                                                         | Owner            | Status |
| --- | ---------------------------------------------------------------- | ---------------- | ------ |
| 1   | Should the "Personal" default household name be localizable?     | @product-manager | Open   |
| 2   | Should we allow household renaming during alpha (cosmetic only)? | @product-manager | Open   |
| 3   | When is the target date for enabling multi-user households?      | @product-manager | Open   |

---

## References

- [ADR-0013: Multi-Tenancy Architecture](../architecture/0013-multi-tenancy-architecture.md)
- [RLS Policy Review](../architecture/security/rls-review.md)
- [ADR-0004: Auth & Security Architecture](../architecture/0004-auth-security-architecture.md)
- [Rollout Strategy](../architecture/rollout-strategy.md)
- [Feature Flags Implementation](../architecture/implementation/885-feature-flags.md)
