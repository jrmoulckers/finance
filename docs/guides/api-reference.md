# API Reference — Supabase Edge Functions

> **Base URL:** `https://<project-ref>.supabase.co/functions/v1`
>
> All endpoints require the `apikey` header set to the project's anon key
> unless otherwise noted. CORS preflight (`OPTIONS`) is handled automatically.

---

## Authentication

### `POST /functions/v1/auth-webhook`

Handles Supabase Auth webhook events. On new user signup, provisions a
`users` row, a default household, and an owner membership via the
`handle_new_user_signup` database function.

| Detail | Value |
|---|---|
| **Auth** | Bearer `AUTH_WEBHOOK_SECRET` (shared secret, **not** a user JWT) |
| **Trigger** | Supabase Auth — database webhook on `auth.users` INSERT |

#### Request Body

```json
{
  "type": "INSERT",
  "table": "users",
  "record": {
    "id": "d0d8c7e2-3f4a-4b5c-8d9e-1a2b3c4d5e6f",
    "email": "user@example.com",
    "raw_user_meta_data": {
      "full_name": "Jane Doe",
      "avatar_url": "https://example.com/avatar.png"
    },
    "created_at": "2025-01-15T10:30:00Z"
  },
  "old_record": null
}
```

#### Responses

| Status | Body | Condition |
|---|---|---|
| `201` | `{ "message": "User provisioned", "user_id": "<uuid>" }` | User created successfully |
| `200` | `{ "message": "Event ignored" }` | Non-INSERT event (UPDATE, DELETE) |
| `401` | `{ "error": "Unauthorized" }` | Missing or invalid webhook secret |
| `405` | `{ "error": "Method not allowed" }` | Non-POST request |
| `500` | `{ "error": "Failed to provision user" }` | Database error during provisioning |
| `500` | `{ "error": "Server configuration error" }` | Missing env vars |

#### Rate Limiting

This endpoint is called by Supabase Auth infrastructure only. No
client-side rate limiting applies; throughput is bounded by the Auth
webhook invocation rate.

---

### `POST /functions/v1/passkey-register`

WebAuthn registration ceremony (two-step). Registers a new passkey
credential for the authenticated user.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |
| **Library** | `@simplewebauthn/server@9.0.3` |

#### Step 1 — Generate Options

`POST /functions/v1/passkey-register?step=options`

**Request Body:** _(empty or omitted)_

**Response (`200`):**

```json
{
  "rp": { "name": "Finance App", "id": "finance.example.com" },
  "user": { "id": "<base64>", "name": "user@example.com", "displayName": "user@example.com" },
  "challenge": "<base64url>",
  "pubKeyCredParams": [
    { "alg": -7, "type": "public-key" },
    { "alg": -257, "type": "public-key" }
  ],
  "excludeCredentials": [],
  "authenticatorSelection": {
    "residentKey": "preferred",
    "userVerification": "preferred",
    "authenticatorAttachment": "platform"
  },
  "attestation": "none"
}
```

The challenge expires after **5 minutes**.

#### Step 2 — Verify Attestation

`POST /functions/v1/passkey-register?step=verify`

**Request Body:** The `PublicKeyCredential` response from the browser
WebAuthn API (JSON-serialized via `@simplewebauthn/browser`).

**Response (`201`):**

```json
{
  "verified": true,
  "credential_id": "<base64url>",
  "device_type": "singleDevice"
}
```

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "No valid challenge found" }` | Challenge expired or missing |
| `400` | `{ "error": "Registration verification failed" }` | Attestation invalid |
| `400` | `{ "error": "Invalid step. Use ?step=options or ?step=verify" }` | Missing/invalid `step` param |
| `401` | `{ "error": "Unauthorized" }` | Missing or invalid JWT |
| `405` | `{ "error": "Method not allowed" }` | Non-POST request |
| `500` | `{ "error": "Failed to store credential" }` | Database insert error |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

#### Rate Limiting

Registration is a low-frequency operation. Supabase default Edge Function
rate limits apply (typically 30 req/s per user).

---

### `POST /functions/v1/passkey-authenticate`

WebAuthn authentication ceremony (two-step). Verifies a passkey
assertion and returns a verification result.

| Detail | Value |
|---|---|
| **Auth** | None required (usernameless flow supported) |
| **Library** | `@simplewebauthn/server@9.0.3` |

#### Step 1 — Generate Options

`POST /functions/v1/passkey-authenticate?step=options`

**Request Body** _(optional — email narrows allowed credentials)_:

```json
{
  "email": "user@example.com"
}
```

**Response (`200`):**

```json
{
  "rpId": "finance.example.com",
  "challenge": "<base64url>",
  "allowCredentials": [
    {
      "id": "<credential-id>",
      "type": "public-key",
      "transports": ["internal"]
    }
  ],
  "userVerification": "preferred"
}
```

The challenge expires after **5 minutes**.

#### Step 2 — Verify Assertion

`POST /functions/v1/passkey-authenticate?step=verify`

**Request Body:** The `PublicKeyCredential` assertion response from the
browser WebAuthn API (JSON-serialized).

**Response (`200`):**

```json
{
  "verified": true,
  "user_id": "d0d8c7e2-3f4a-4b5c-8d9e-1a2b3c4d5e6f",
  "message": "Passkey authentication successful. Exchange for session."
}
```

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Missing credential ID" }` | No `id` in assertion body |
| `400` | `{ "error": "Credential not found" }` | Credential ID not in database |
| `400` | `{ "error": "No valid challenge found" }` | Challenge expired or missing |
| `400` | `{ "error": "Invalid step. Use ?step=options or ?step=verify" }` | Missing/invalid `step` param |
| `401` | `{ "error": "Authentication verification failed" }` | Assertion signature invalid |
| `405` | `{ "error": "Method not allowed" }` | Non-POST request |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

#### Rate Limiting

Authentication attempts should be monitored for brute-force patterns.
Supabase default Edge Function rate limits apply.

---

## Household Management

### `POST /functions/v1/household-invite`

Create a new household invitation. Only the household **owner**
(`households.created_by`) may create invites.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |
| **Authorization** | Caller must be the household owner |

#### Request Body

```json
{
  "household_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "invited_email": "friend@example.com",
  "role": "member",
  "expires_in_hours": 72
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `household_id` | UUID | ✅ | — | Target household |
| `invited_email` | string | ❌ | `null` | Restrict invite to this email |
| `role` | string | ❌ | `"member"` | Role for the invitee (`member` or `owner`) |
| `expires_in_hours` | number | ❌ | `72` | Hours until invite expires |

#### Response (`201`)

```json
{
  "id": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
  "invite_code": "0A1B2C3D4E5F6G7H8I9J0K1L",
  "expires_at": "2025-01-18T10:30:00Z",
  "role": "member",
  "household_name": "Jane's Household"
}
```

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "household_id is required" }` | Missing household_id |
| `401` | `{ "error": "Authentication required" }` | Missing or invalid JWT |
| `403` | `{ "error": "Only the household owner can create invitations" }` | Caller is not the owner |
| `404` | `{ "error": "Household not found" }` | Invalid or deleted household |
| `409` | `{ "error": "User is already a member of this household" }` | Invitee already a member |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

---

### `GET /functions/v1/household-invite?code=XXX`

Validate an invite code and return household information.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |

#### Query Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `code` | string | ✅ | The 24-character invite code |

#### Response (`200`)

```json
{
  "valid": true,
  "household_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "household_name": "Jane's Household",
  "role": "member",
  "expires_at": "2025-01-18T10:30:00Z"
}
```

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "code query parameter is required" }` | Missing `code` |
| `401` | `{ "error": "Authentication required" }` | Missing or invalid JWT |
| `403` | `{ "error": "This invitation is for a different email address" }` | Email-restricted invite mismatch |
| `404` | `{ "error": "Invalid invitation code" }` | Code not found |
| `410` | `{ "error": "This invitation has already been accepted" }` | Already used |
| `410` | `{ "error": "This invitation has expired" }` | Past `expires_at` |

---

### `PUT /functions/v1/household-invite`

Accept a household invitation. Adds the authenticated user to the
household as a member with the role specified in the invitation.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |

#### Request Body

```json
{
  "invite_code": "0A1B2C3D4E5F6G7H8I9J0K1L"
}
```

#### Response (`200`)

```json
{
  "message": "Invitation accepted",
  "household_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "household_name": "Jane's Household",
  "role": "member"
}
```

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "invite_code is required" }` | Missing invite_code |
| `401` | `{ "error": "Authentication required" }` | Missing or invalid JWT |
| `403` | `{ "error": "This invitation is for a different email address" }` | Email mismatch |
| `404` | `{ "error": "Invalid invitation code" }` | Code not found |
| `409` | `{ "error": "You are already a member of this household" }` | Duplicate membership |
| `410` | `{ "error": "This invitation has already been accepted" }` | Already used |
| `410` | `{ "error": "This invitation has expired" }` | Past `expires_at` |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

#### Rate Limiting

Household invite operations use Supabase default Edge Function rate
limits. Invite codes are 24-character cryptographically random strings,
making brute-force infeasible.

---

## Data & Compliance

### `GET /functions/v1/data-export`

Export all of the authenticated user's data across all their households.
Implements **GDPR Article 20 — Right to Data Portability**.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |
| **Format** | Controlled by `Accept` header |

#### Request Headers

| Header | Value | Result |
|---|---|---|
| `Accept` | `application/json` (default) | JSON export |
| `Accept` | `text/csv` | CSV export |

#### Response (`200`)

The response streams as a file download with `Content-Disposition`.

**JSON format:**

```json
{
  "export_date": "2025-01-15T10:30:00Z",
  "user_id": "d0d8c7e2-3f4a-4b5c-8d9e-1a2b3c4d5e6f",
  "format_version": "1.0",
  "data": {
    "users": [{ "id": "...", "email": "...", "display_name": "..." }],
    "households": [{ "id": "...", "name": "..." }],
    "accounts": [{ "id": "...", "name": "...", "balance_cents": 150000 }],
    "transactions": [{ "id": "...", "amount_cents": -4599, "payee": "..." }]
  }
}
```

**Exported tables:** `users`, `households`, `household_members`,
`accounts`, `categories`, `transactions`, `budgets`, `goals`,
`passkey_credentials`.

**Security notes:**
- Sensitive columns (e.g. `public_key`) are redacted as `"[REDACTED]"`
- Only data from the user's own households is included
- The export is audit-logged

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `401` | `{ "error": "Authentication required" }` | Missing or invalid JWT |
| `405` | `{ "error": "Method not allowed" }` | Non-GET request |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

#### Rate Limiting

Data exports are computationally expensive. Consider limiting to
**1 request per hour per user** in production via a custom rate-limit
check or Supabase Edge Function configuration.

---

### `DELETE /functions/v1/account-deletion`

Permanently delete the authenticated user's account. Implements
**GDPR Article 17 — Right to Erasure** with crypto-shredding.

| Detail | Value |
|---|---|
| **Auth** | Bearer JWT (required) |
| **Irreversible** | Yes — encryption keys are destroyed |

#### Request Body

```json
{
  "confirm": "DELETE_MY_ACCOUNT"
}
```

The `confirm` field must be exactly `"DELETE_MY_ACCOUNT"` or boolean
`true` to proceed.

#### Response (`200`)

```json
{
  "deletion_certificate": {
    "certificate_id": "cert-m1abc-0a1b2c3d4e5f6g7h",
    "subject_type": "USER",
    "subject_id": "d0d8c7e2-3f4a-4b5c-8d9e-1a2b3c4d5e6f",
    "deleted_at": "2025-01-15T10:30:00Z",
    "households_affected": 1,
    "keys_shredded": 2,
    "key_fingerprints": [
      "shredded:household:<uuid>:<timestamp>",
      "shredded:user:<uuid>:<timestamp>"
    ],
    "verified": true,
    "message": "Your account and associated data have been permanently deleted..."
  }
}
```

#### Deletion Process

1. Audit-log the deletion request
2. Fetch all household memberships
3. Crypto-shred encryption keys per household
4. Soft-delete all data in sole-member households (transactions, budgets,
   goals, accounts, categories, invitations, the household itself)
5. Revoke key access in shared households
6. Soft-delete household memberships
7. Soft-delete passkey credentials
8. Soft-delete the user record
9. Audit-log the completed deletion
10. Delete the Supabase Auth user (invalidates all sessions)

#### Error Responses

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "Account deletion requires confirmation..." }` | Missing or wrong `confirm` value |
| `401` | `{ "error": "Authentication required" }` | Missing or invalid JWT |
| `405` | `{ "error": "Method not allowed" }` | Non-DELETE request |
| `500` | `{ "error": "Internal server error" }` | Unexpected failure |

#### Rate Limiting

Account deletion is a one-time irreversible operation. No special rate
limiting is needed beyond standard authentication.

---

## Shared Utilities

All Edge Functions in the `household-invite`, `data-export`, and
`account-deletion` modules use shared helpers from `_shared/`:

| Module | Exports | Purpose |
|---|---|---|
| `_shared/auth.ts` | `createAdminClient()`, `getAuthenticatedUser()`, `requireAuth()` | JWT verification and Supabase admin client |
| `_shared/cors.ts` | `corsHeaders`, `handleCorsPreflightRequest()` | Consistent CORS headers |
| `_shared/response.ts` | `jsonResponse()`, `errorResponse()`, `createdResponse()`, `methodNotAllowedResponse()`, `internalErrorResponse()`, `streamingResponse()` | Standard response formatting |

---

## Environment Variables

All Edge Functions require these environment variables (set in the
Supabase Dashboard under Edge Functions → Secrets):

| Variable | Used By | Description |
|---|---|---|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Service role key (bypasses RLS) |
| `AUTH_WEBHOOK_SECRET` | `auth-webhook` | Shared secret for webhook verification |
| `WEBAUTHN_RP_NAME` | `passkey-register` | Relying Party display name |
| `WEBAUTHN_RP_ID` | `passkey-register`, `passkey-authenticate` | Relying Party ID (domain) |
| `WEBAUTHN_ORIGIN` | `passkey-register`, `passkey-authenticate` | Expected browser origin |
