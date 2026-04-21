# ADR-0012: API Versioning Strategy

**Status:** Superseded by [ADR-0017](./0017-api-versioning-strategy.md)
**Date:** 2025-07-27
**Author:** System Architect (AI agent)
**Reviewers:** Pending human review
**Sprint:** S10

## Context

Finance has **four independently-updated clients** with different update latencies (iOS 1–14d, Android 1–7d, Web minutes, Windows 1–7d). At any time, 2–3 client versions are active simultaneously. The API versioning strategy must keep older clients functional while enabling new features.

We control: Custom Edge Functions (`/functions/v1/*`) and sync-rules.yaml column allowlists.

## Decision

**URL-prefix versioning for Edge Functions** with **sync protocol version headers** and a **formal deprecation policy**.

### 1. URL Versioning

```
POST /functions/v1/banking/link-token   ← current
POST /functions/v2/banking/link-token   ← breaking change → new version
GET  /functions/v1/rates/latest         ← unchanged, stays at v1
```

### 2. Breaking Change Definition

| Change                      | Breaking? | Action          |
| --------------------------- | --------- | --------------- |
| Add optional response field | No        | Current version |
| Add optional request param  | No        | Current version |
| Remove/rename field         | **Yes**   | New version     |
| Change field type           | **Yes**   | New version     |
| Add required param          | **Yes**   | New version     |

### 3. Client Version Headers

```http
X-Finance-Client-Version: 2.1.0
X-Finance-Platform: ios
X-Finance-Sync-Version: 2
```

### 4. Deprecation Policy

```
T+0:    V(N+1) released. V(N) gets Sunset header.
T+90d:  V(N) returns Warning: 299.
T+180d: Traffic review. < 5% → proceed. ≥ 5% → extend 90d.
T+270d: V(N) returns 410 Gone.

Minimum support: 180 days. Max concurrent: 2 versions.
```

### 5. Backward Compatibility Patterns

- Additive-only responses (new optional fields)
- Parameter defaults for new params
- KMP data classes with null defaults for new sync columns

```kotlin
data class Transaction(
    val id: String,
    val amountCents: Long,
    val recurringRuleId: String? = null, // V2 — null for V1
)
```

## Alternatives Considered

### Alternative 1: Header-Based Versioning

- **Pros:** Cleaner URLs.
- **Cons:** Harder CDN/LB routing; poor Edge Function support.

### Alternative 2: No Versioning

- **Pros:** Simplest.
- **Cons:** Eventually impossible; multi-platform latency makes it untenable.

### Alternative 3: GraphQL

- **Pros:** Per-field deprecation.
- **Cons:** Overkill for 6–10 endpoints; not aligned with PowerSync.

## Consequences

### Positive

- Multi-platform safety — 6+ months covers all app stores
- CDN-friendly — cacheable by URL prefix
- Analytics-driven — never deprecate without traffic data

### Negative

- Code duplication for concurrent versions
- Testing matrix: 2 versions × 4 platforms
- Sync versioning adds complexity

### Risks

| Risk                  | Likelihood | Impact   | Mitigation                       |
| --------------------- | ---------- | -------- | -------------------------------- |
| Users refuse update   | Medium     | Medium   | In-app banners; force after 270d |
| Sync version mismatch | Low        | Critical | Integration tests; null defaults |

## Implementation Notes

```kotlin
object ApiConfig {
    const val CURRENT_API_VERSION = 1
    const val CURRENT_SYNC_VERSION = 2
    fun endpointUrl(path: String, v: Int = CURRENT_API_VERSION) =
        "${baseUrl}/functions/v${v}/${path}"
}
```

## References

- [ADR-0002: Backend & Sync Architecture](./0002-backend-sync-architecture.md)
- [RFC 8594 — Sunset Header](https://www.rfc-editor.org/rfc/rfc8594)
- [Stripe API Versioning](https://stripe.com/docs/api/versioning)
