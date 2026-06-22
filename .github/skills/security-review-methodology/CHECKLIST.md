# Security Review Checklist

- [ ] Asset and trust boundary are documented.
- [ ] AuthZ is checked at every backend and local data boundary.
- [ ] RLS / household isolation / `owner_id` constraints are verified for backend changes.
- [ ] Logs and telemetry exclude sensitive financial data and credentials.
- [ ] Crypto uses existing abstractions; no ad hoc primitives or hardcoded keys.
- [ ] Rate limit, replay, idempotency, and CORS/webhook protections are considered.
- [ ] Finding includes exploit path, affected data, severity, confidence, and concrete fix.
