---
name: security-review-methodology
description: >
  Security and privacy review methodology. Use for topics related to threat
  modeling, OWASP, security review, vulnerability assessment, auth, crypto,
  authorization, data exposure, secure logging, abuse prevention, or privacy risk.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Security Review Methodology Skill

**Trigger:** threat model, auth/authorization review, sensitive data handling, crypto, logging,
abuse controls, exploitability triage.
**Inputs:** diff or surface, assets at risk, trust boundaries, user roles, data stores, external calls.
**Related:** `privacy-compliance` (legal/privacy obligations), `mcp-agent-tooling` (tool trust boundary),
`issue-management` (filing scoped findings), `accessibility-testing` (non-security audits).

## Out of scope

- Legal/regulatory interpretation, consent, retention, erasure/export → use `privacy-compliance`.
- General code quality review without security impact → use the relevant engineering skill.
- UX/accessibility defects without exploitable security impact → use `ux-testing` or `accessibility-testing`.

## Method

1. **Define assets** — user data, credentials, sessions, files, permissions, audit logs, and operational controls.
2. **Map trust boundaries** — client, local storage, network, APIs, workers, third-party services, and admin paths.
3. **Check authorization first** — every read/write must bind to the authenticated user, tenant, role, or ownership rule.
4. **Check minimization** — logs, telemetry, caches, and exports must exclude secrets and unnecessary sensitive data.
5. **Check crypto use** — use vetted platform or product abstractions; no ad hoc primitives or hardcoded keys.
6. **Check abuse controls** — rate limits, replay prevention, idempotency, CORS/origin rules, and webhook verification.
7. **Classify findings** — report high-confidence issues with exploit path, affected data, severity, and concrete fix.

## Finding template

```markdown
## Finding

[One-sentence vulnerability statement]

## Impact

[Affected users/data and realistic harm]

## Evidence

- `path/to/file:line` — vulnerable code path
- Preconditions required to exploit

## Fix

[Minimal secure change and tests to add]

## Confidence / Severity

[Low/Medium/High/Critical] — [why exploitable or why limited]
```

## Red flags

- Privileged server or admin path lacks an explicit user/tenant/role authorization check.
- Access policy omits ownership, tenant isolation, soft-delete, or status constraints.
- Logs include request bodies, credentials, tokens, personal data, or export payloads.
- Client stores sensitive material outside approved secure storage or encrypted layers.
- Retry/replay paths can duplicate actions, bypass validation, or resurrect deleted data.

## Checklist

Apply [`CHECKLIST.md`](./CHECKLIST.md) as the sign-off gate for every security review.

## Safety

Do not exploit live systems, access real secrets, or publish vulnerability details broadly. Keep reports
minimal, factual, and routed through the product's security process.

## Output

A security review with assets, trust boundaries, high-confidence findings, severity/confidence, evidence,
fixes, and tests or mitigations.
