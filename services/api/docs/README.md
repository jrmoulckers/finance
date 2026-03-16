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
npm run docs:api:lint
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

| Tag             | Method   | Path                    | Auth           | Description                        |
| --------------- | -------- | ----------------------- | -------------- | ---------------------------------- |
| System          | `GET`    | `/health-check`         | None           | Uptime / service health            |
| Auth            | `POST`   | `/auth-webhook`         | Webhook secret | Internal user-creation webhook     |
| Auth            | `POST`   | `/passkey-register`     | Bearer JWT     | WebAuthn registration ceremony     |
| Auth            | `POST`   | `/passkey-authenticate` | None           | WebAuthn authentication ceremony   |
| Households      | `POST`   | `/household-invite`     | Bearer JWT     | Create a household invitation      |
| Households      | `GET`    | `/household-invite`     | Bearer JWT     | Validate an invite code            |
| Households      | `PUT`    | `/household-invite`     | Bearer JWT     | Accept an invitation               |
| Data Management | `DELETE` | `/account-deletion`     | Bearer JWT     | GDPR Article 17 — account erasure  |
| Data Management | `GET`    | `/data-export`          | Bearer JWT     | GDPR Article 20 — data portability |

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
