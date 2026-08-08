---
name: privacy-compliance
description: >
  Privacy regulation and data protection compliance methodology. Use for topics
  related to GDPR, CCPA/CPRA, privacy, data protection, consent, data deletion,
  data export, retention, encryption, PII, third-party processors, or compliance
  review.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Privacy Compliance Skill

**Trigger:** new personal-data flow, consent/export/delete changes, retention policy, privacy claim, processor review, compliance audit.
**Inputs:** data inventory, feature description, storage/processor list, user rights flows, platforms in scope.
**Related:** `compliance-specialist` (promoted agent), `security-review-methodology` (threat modeling),
`go-to-market` (privacy claims), `monetization` (data-safe revenue), `i18n-localization` (legal copy localization).

## Out of scope

- Security vulnerability testing and exploit analysis → use `security-review-methodology`.
- Pricing or premium privacy positioning → use `monetization` and review claims here.
- Implementation mechanics for a specific backend or platform → use the relevant domain skill.
- Legal advice or final regulatory sign-off → qualified human/legal review.

## Method

1. **Map data** — identify personal data, sensitive data, source, purpose, storage, retention, processors, and access controls.
2. **Confirm lawful basis** — document consent, contract, legitimate interest, legal obligation, or other basis per purpose.
3. **Minimize** — collect the least data needed; prefer local processing, aggregation, anonymization, or pseudonymization where feasible.
4. **Design rights flows** — export/access, correction, deletion/erasure, opt-out, and consent withdrawal must be usable and logged.
5. **Protect data** — require encryption in transit and at rest, least-privilege access, audit logs, and secret-safe operations.
6. **Review processors** — document third-party SDKs/services, data sent, region, retention, subprocessors, and DPA/status.
7. **Verify notices** — privacy policy, in-product copy, and settings match actual behavior.

## Regulation baseline

| Area | Generic requirement |
| --- | --- |
| GDPR | Lawful basis, data minimization, purpose limitation, transparency, access/export, erasure, retention, processor controls |
| CCPA/CPRA | Notice at collection, right to know/delete/correct, opt-out where applicable, non-discrimination |
| Consent | Granular, informed, opt-in where required, easy withdrawal, logged state |
| Retention | Purpose-bound periods, deletion schedule, backup handling, audit exceptions |
| Security | Encryption in transit/at rest, access controls, auditability, breach-response path |

## Review triggers

- Adding a personal-data field, event, table, file, log, model input, or export surface.
- Adding analytics, ads, crash reporting, AI processing, or a third-party SDK/processor.
- Changing consent, notification, deletion, retention, backup, or audit-log behavior.
- Changing data regions, subprocessors, cross-border transfer assumptions, or privacy claims.
- Launching a new platform, market, age group, team/family sharing model, or monetization feature.

## Checklist

- [ ] Data inventory updated with purpose, lawful basis, sensitivity, storage, retention, and processor.
- [ ] Export/access output is complete, portable, authenticated, rate-limited, and excludes internal-only fields unless required.
- [ ] Deletion covers primary stores, derived data, backups strategy, shared records, and audit exceptions.
- [ ] Consent is granular, revocable, and enforced before optional processing starts.
- [ ] Encryption, access controls, and audit logs match sensitivity.
- [ ] Privacy notices and product behavior agree.
- [ ] Issues use the `compliance-specialist` agent where deeper review is needed.

## Safety

Report-only unless explicitly implementing a scoped fix. Do not provide final legal advice, weaken privacy controls for monetization, log personal data, or use real user data in tests/screenshots.

## Output

A privacy review with data inventory changes, risks, required user-rights behavior, processor notes, and issue-ready remediation tasks.