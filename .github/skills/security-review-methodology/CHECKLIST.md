<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Security Review Checklist

- [ ] Asset and trust boundary are documented.
- [ ] Authorization is checked at every client, API, backend, and local data boundary.
- [ ] Ownership, tenant, role, and soft-delete constraints are verified where applicable.
- [ ] Logs, telemetry, caches, and exports exclude credentials and sensitive product data.
- [ ] Crypto uses approved abstractions; no ad hoc primitives or hardcoded keys.
- [ ] Rate limit, replay, idempotency, origin/CORS, and webhook protections are considered.
- [ ] Finding includes exploit path, affected data, severity, confidence, and concrete fix.
