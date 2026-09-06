<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Finance — API Documentation

Interactive reference documentation for the Finance app's Supabase Edge Functions API.

## Quick Start

### View the API docs locally

```bash
cd services/api
npm install
npm run docs:api
```

This starts a local [Redoc](https://redocly.com/redoc) preview server (default: `http://localhost:8080`) that renders the OpenAPI 3.0 specification with an interactive explorer.

### Lint the OpenAPI spec

```bash
npm run docs:api:lint -w services/api
```

Validates the `openapi.yaml` file against the OpenAPI 3.0 specification and Redocly's recommended rules.

### Bundle for distribution

```bash
npm run docs:api:bundle
```

Produces a self-contained `docs/openapi-bundled.yaml` with all `$ref`s resolved — useful for importing into Postman, Insomnia, or CI pipelines.

## OpenAPI Specification

The canonical spec lives at [`services/api/openapi.yaml`](../openapi.yaml).

### Endpoints

| Tag             | Method   | Path                    | Auth           | Description                                                  |
| --------------- | -------- | ----------------------- | -------------- | ------------------------------------------------------------ |
| System          | `GET`    | `/health-check`         | None           | Uptime / service health                                      |
| Auth            | `POST`   | `/auth-webhook`         | Webhook secret | Internal user-creation webhook                               |
| Auth            | `POST`   | `/passkey-register`     | Bearer JWT     | WebAuthn registration ceremony                               |
| Auth            | `POST`   | `/passkey-authenticate` | None           | WebAuthn authentication ceremony                             |
| Households      | `POST`   | `/household-invite`     | Bearer JWT     | Create a household invitation                                |
| Households      | `GET`    | `/household-invite`     | Bearer JWT     | Validate an invite code                                      |
| Households      | `PUT`    | `/household-invite`     | Bearer JWT     | Accept an invitation                                         |
| Data Management | `DELETE` | `/account-delete`       | Bearer JWT     | GDPR Article 17 — account erasure (web route `/api/account`) |
| Data Management | `GET`    | `/data-export`          | Bearer JWT     | GDPR Article 20 — data portability                           |

| Tag     | Method | Path                    | Auth           | Description                                       |
| ------- | ------ | ----------------------- | -------------- | ------------------------------------------------- |
| Billing | `POST` | `/revenuecat-webhook`   | Provider proof | Ingest signed Apple/Google subscription evidence  |
| Billing | `POST` | `/revenuecat-confirm`   | Bearer JWT     | Confirm or restore against RevenueCat state       |
| Billing | `GET`  | `/revenuecat-confirm`   | Bearer JWT     | Read the minimized Finance entitlement projection |
| Billing | `POST` | `/revenuecat-reconcile` | Server secret  | Reconcile provider state through the ledger       |

| Billing | `POST` | `/stripe-checkout` | Bearer JWT | Start Checkout from a reviewed logical choice |
| Billing | `POST` | `/stripe-portal` | Bearer JWT | Open the purchaser's Stripe billing portal |
| Billing | `POST` | `/stripe-reconcile` | Bearer JWT | Reconcile purchaser evidence through the ledger |
| Billing | `GET` | `/stripe-status` | Bearer JWT | Read the minimized Finance entitlement projection |
| Billing | `POST` | `/stripe-webhook` | Stripe proof | Ingest signed Stripe subscription evidence |

| Tag     | Method | Path               | Auth       | Description                                            |
| ------- | ------ | ------------------ | ---------- | ------------------------------------------------------ |
| Billing | `GET`  | `/entitlements-v1` | Bearer JWT | Read the versioned minimized entitlement contract (v1) |

`/entitlements-v1` is the contract all four platforms consume. It is backed
solely by `public.get_my_entitlements` and server-resolved identity and
household membership, and it discloses only the logical tier, the
lifecycle-derived access state, the entitlement scope, the server-issued
validity bound, the bank-connection allowance, and the pending downgrade.
Provider names and identifiers, raw evidence, internal ledger identifiers, and
other household members' billing data never appear in it. Shared client types
live in `packages/core` under `com.finance.core.entitlement`.

RevenueCat request/response, privacy, and human-gated setup details are in
[`revenuecat-entitlements.md`](./revenuecat-entitlements.md).
RevenueCat webhooks and reconciliation use separate bearer credentials, and
webhooks additionally require the timestamped raw-body signature.
Stripe request, privacy, test, and human-gated setup details are in
[`../supabase/functions/stripe-common/README.md`](../supabase/functions/stripe-common/README.md).

### Security Schemes

| Scheme          | Type        | Used By                        |
| --------------- | ----------- | ------------------------------ |
| `BearerJWT`     | HTTP Bearer | Most endpoints                 |
| `WebhookSecret` | HTTP Bearer | `auth-webhook` only (internal) |

### Conventions

- **Monetary values** are stored as `BIGINT` (cents). For example, `$12.34` → `1234`.
- **Currency** is an ISO 4217 code (e.g. `"USD"`) alongside every monetary column.
- **Timestamps** are ISO 8601 in UTC.
- **UUIDs** are v4 random.
- **Soft deletes**: a `deleted_at` timestamp marks deleted records; they are never physically removed.

## Updating the Docs

1. Make your changes to the Edge Function source in `supabase/functions/`.
2. Update `openapi.yaml` to reflect the new or modified endpoints.
3. Run `npm run docs:api:lint` to validate.
4. Preview with `npm run docs:api` to verify rendering.
5. Commit both the function changes and the spec update together.

> **Tip:** Keep request/response examples realistic. Use integer cents for monetary values and placeholder tokens (`YOUR_JWT_TOKEN_HERE`) — never real secrets.
