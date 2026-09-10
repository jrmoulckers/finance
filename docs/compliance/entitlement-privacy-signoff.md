# Entitlement privacy sign-off

| Field                        | Value                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Review status                | Complete; production privacy gate remains **blocked**                        |
| Review date                  | 2026-09-10                                                                   |
| Reviewed integrated baseline | `24ceef91c511e3e9c8f82da0d52ab420fa0d47d6`                                   |
| Tracking issue               | [#4406](https://github.com/jrmoulckers/finance/issues/4406)                  |
| Security evidence            | [Entitlement security sign-off](../security/entitlement-security-signoff.md) |

This is the independent privacy review of the server-authoritative entitlement
program merged through the security sign-off. The implementation is acceptable
to remain in the repository while RevenueCat and Stripe production
configuration is absent. It is **not approved for provider configuration,
production migration, deployment, or enablement** because the processor,
notice, retention, data-subject-rights, and erasure gates in this review remain
open.

This review is technical compliance evidence, not legal advice. Qualified legal
review is required where noted. No provider dashboard, secret, production data,
production configuration, deployment, or production operation was accessed.
All reviewed tests use synthetic data.

> **Satisfies:** This review is local evidence for `PROD-COMP-001` through
> `PROD-COMP-005`, `PROD-COMP-007`, and `PROD-COMP-009`. Product obligations
> are defined in
> [jrmoulckers/product](https://github.com/jrmoulckers/product), pinned to
> [`3a752c1`](https://github.com/jrmoulckers/product/blob/3a752c11856515a74eb204675d5d5198cac1e48e/principles/compliance.md).

## Scope and decision

The review traced the integrated RevenueCat and Stripe adapters, normalized
billing ledger, derived projections, four client cache implementations,
bank-connection revocation outbox, self-service export, and account deletion.
It independently inspected the implementation and tests rather than relying on
prior PR summaries.

The privacy decision is:

- **Pass for disabled code at rest:** provider configuration is fail-closed
  when required configuration is absent, raw provider payloads and payment
  instruments are not persisted, client responses are minimized, and
  bank-provider erasure survives an outage without retaining identity links.
- **Block for production processing:** the repository does not contain approved
  RevenueCat or Stripe DPA/subprocessor/transfer evidence, the public notice
  does not identify either billing processor, subscription evidence has no
  approved or enforced retention period, self-service export omits billing
  records, and account deletion does not request RevenueCat or Stripe
  customer-metadata erasure.
- **No residual privacy risk is accepted for production.** Every open item is a
  release gate with an owner and review deadline below.

## Data-flow inventory

### RevenueCat

| Stage                       | Personal data processed                                                                                                                                                                                                           | Purpose                                                                                                    | Storage and disclosure                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native purchase and restore | Finance user UUID used as the RevenueCat customer/app-user identifier; app, store, environment, and reviewed product identifiers                                                                                                  | Associate App Store or Google Play evidence with the authenticated purchaser and confirm or restore access | The native flow asks the Finance API to perform the lookup. Finance does not accept a client-submitted tier, price, receipt, or provider customer ID.                                             |
| Webhook ingress             | Customer aliases; app/project/store/environment; RevenueCat event and subscription IDs; original/current store transaction IDs; product ID; lifecycle, cancellation, refund, chargeback, grace, purchase, and expiry timestamps   | Authenticate provider evidence and update the authoritative ledger                                         | Exact raw request bytes exist only for request verification and parsing. Raw bodies, receipts, signatures, and customer attributes are not persisted or logged.                                   |
| Reconciliation              | RevenueCat customer ID, subscription snapshots, store transaction history, product and lifecycle fields, period timestamps; response fields such as country, entitlement IDs, management URL, and pending changes may be received | Recover missed provider events and converge current state                                                  | Only the normalized subset described under [Finance ledger](#finance-ledger) is persisted. Country, management URL, entitlement arrays, auto-renewal detail, and raw snapshots are not persisted. |
| Provider-side record        | Finance user UUID plus RevenueCat/store purchase and subscription records                                                                                                                                                         | Subscription administration and purchase evidence                                                          | Controlled by RevenueCat and the Apple/Google store chain. Provider retention, region, transfer, and erasure behavior are not evidenced in this repository and remain a production gate.          |

RevenueCat processing is necessary to perform the paid-service contract under
GDPR Art. 6(1)(b). Fraud, dispute, and security evidence may rely on Art.
6(1)(f), and legally mandated transaction retention may rely on Art. 6(1)(c),
but the exact records and period require jurisdiction-specific legal approval.
Consent is not the proposed basis for necessary subscription processing.

### Stripe

| Stage                      | Personal data processed                                                                                                                                                                                                    | Purpose                                                                                            | Storage and disclosure                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer creation          | Finance user UUID in `finance_owner_id` metadata                                                                                                                                                                           | Create a stable billing customer without sending an email or profile name                          | Sent to Stripe and stored as `provider_customer_id` in Finance.                                                                                                                                                     |
| Hosted checkout            | Stripe customer ID; Finance billing-account UUID; Finance user UUID; optional household UUID; catalog choice; reviewed price ID and quantity; success/cancel URLs                                                          | Start a Web or direct-distributed Windows subscription for the authenticated purchaser             | Identifiers are sent as Checkout Session and subscription metadata. Stripe, not Finance, receives payment instruments and billing details.                                                                          |
| Portal                     | Stripe customer ID and return URL                                                                                                                                                                                          | Let the purchaser manage billing with Stripe                                                       | Finance receives only a short-lived redirect URL.                                                                                                                                                                   |
| Webhook and reconciliation | Event, customer, subscription, subscription-item, invoice, charge, refund, and dispute identifiers; status, live/test mode, product/price, quantity, period, cancellation, payment-failure, refund, and dispute timestamps | Authenticate provider evidence, recover missed events, and derive access                           | Invoice, charge, refund, and dispute objects are transient. Finance persists only normalized identifiers and lifecycle evidence; it does not persist card, bank-payment, address, tax, amount, or raw payload data. |
| Provider-side record       | Finance UUID metadata, Stripe billing identifiers, hosted-checkout billing and payment data                                                                                                                                | Payment processing, subscription administration, fraud prevention, tax/accounting where configured | Controlled by Stripe and its subprocessors. Provider retention, region, transfer, and erasure behavior are not evidenced in this repository and remain a production gate.                                           |

Stripe processing is necessary to perform the paid-service contract under GDPR
Art. 6(1)(b). Fraud, dispute, and security processing may rely on Art. 6(1)(f),
and legally mandated payment records may rely on Art. 6(1)(c), subject to legal
approval of the exact purpose and retention period. Necessary payment
processing is not made conditional on optional analytics consent.

### Finance ledger

All tables below are in Supabase PostgreSQL, are service-role only, have row
level security enabled, are excluded from PowerSync, and do not expose direct
authenticated policies.

| Store                                | Personal data                                                                                                                                                                       | Purpose                                                                    | Minimization                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `billing_accounts`                   | Stable billing-account UUID, Finance owner UUID, optional sponsored-household UUID, timestamps, pseudonymization marker                                                             | Bind one purchaser to benefits without using email                         | Owner linkage is nulled on Finance-user deletion; sponsorship is removed.                     |
| `billing_provider_identities`        | Provider, environment, provider customer ID, primary marker, timestamps                                                                                                             | Resolve authenticated provider evidence to a billing account               | No email, name, address, payment instrument, or receipt.                                      |
| `billing_provider_purchase_bindings` | Provider/environment and immutable provider subscription and optional item IDs                                                                                                      | Make renewal, webhook, and reconciliation aliases converge on one purchase | Only identifiers needed for idempotency and non-resurrection are retained.                    |
| `billing_subscriptions`              | Provider identifiers; logical product, tier, quantity, lifecycle; optional household binding; period, terminal, ordering, and event references                                      | Maintain normalized current subscription state and deterministic replay    | No amount, currency, tax, invoice line, card, billing address, or raw payload.                |
| `billing_provider_events`            | Provider event/subscription/item IDs; received/effective/terminal timestamps; normalized event, lifecycle, product, tier, quantity, household binding, processing status and reason | Append-oriented authorization, reconciliation, dispute, and audit evidence | Raw event bodies and receipts are not stored. Processing reason is bounded to 500 characters. |
| `entitlement_grants`                 | Billing account/subscription/event references; beneficiary user or household; tier/quantity; validity and revocation timestamps                                                     | Convert trusted evidence into scoped benefits                              | Contains no provider identifier directly and exactly one beneficiary scope.                   |

The ledger contains pseudonymous personal data and subscription/transaction
evidence. Removing the direct owner foreign key reduces linkability but does
not anonymize provider customer, subscription, item, event, or store
transaction IDs. Those values can remain linkable through a provider and must
not be described as anonymous.

### Projection

| Store                            | Personal data                                                                                                                        | Purpose                                                     | Terminal disposition                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `current_user_entitlements`      | Finance user UUID, display tier, source-grant reference, effective/expiry times, projection version                                  | Fast authoritative user capability lookup                   | Cascades when the Finance user is deleted; otherwise replaced by deterministic rebuild.                                              |
| `current_household_entitlements` | Household UUID, display tier, sponsorship flag, bank allowance, source-grant reference, effective/expiry times, projection version   | Fast authoritative household capability and bank-cap lookup | Cascades when the household is deleted; remains for a shared household after one member leaves and is rebuilt from surviving grants. |
| `entitlements-v1` response       | Scope, minimized tier state, sponsor/family booleans, bank allowance, refresh/downgrade bounds, catalog/contract/projection versions | Display paid status and schedule refreshes                  | `Cache-Control: no-store`; no provider, purchase, receipt, payment, ledger-row, or other-member identifier.                          |

The projection is derived data used to perform the service contract under Art.
6(1)(b). It is not an independent long-term record and is rebuildable from the
ledger.

### Client caches

| Platform | Stored data and protection                                                                                                   | Current retention and disposition                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web      | Minimized entitlement envelope in `sessionStorage`; SHA-256-derived principal/scope key                                      | Tab/session lifetime. Removed on malformed or non-cacheable responses. A signed-out transition stops reading it but does not proactively remove every prior hashed entry.  |
| Android  | Finance user UUID, optional household UUID, and minimized envelope in Android Keystore encrypted preferences                 | Cleared when the subject is disproven by an unauthenticated/forbidden response or scope change. No independently verified account-deletion callback clears it immediately. |
| iOS      | Finance user UUID, optional household UUID, and minimized envelope in app-sandboxed `UserDefaults` under iOS data protection | Cleared when the subject is disproven by an unauthenticated/forbidden response or scope change. No independently verified account-deletion callback clears it immediately. |
| Windows  | Minimized envelope encrypted with DPAPI; filename is a SHA-256 digest of user/scope                                          | Removed after a non-cacheable response for the active subject. No independently verified account-deletion callback enumerates and removes prior subject files.             |

All caches are display-only, revalidated before use, bounded by server-issued
refresh or downgrade times, and never authorize a server action. Their contents
are still personal account state. The existing privacy notice says local data
is removed on sign-out or account deletion, so proactive cross-platform cache
cleanup is a notice-conformance gate.

### Bank-revocation outbox

`bank_connection_orphaned_items` is the server-only revocation outbox for Plaid
or MX bank Items; it is not a RevenueCat or Stripe cancellation queue.

| Data                                                                                              | Purpose                                                                                  | Minimization and disposition                                                                                                            |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Provider enum and AES-256-GCM encrypted access token                                              | Preserve the sole capability needed to revoke provider access during an outage           | Token is never client-readable, synced, exported, or logged. It is set to `NULL` atomically on `revoked`, `reconciled`, or `abandoned`. |
| Temporary owner, household, and connection UUIDs                                                  | Serialize finalization, enforce account/household scope, and correlate pre-deletion work | Account deletion sets all three to `NULL` before local rows are erased.                                                                 |
| Status, reason, attempts, bounded recovery count, safe error code, lease and lifecycle timestamps | Retry, prevent duplicate work, and expose aggregate operator state                       | Safe codes only; no provider body or raw error. Account-deletion jobs have at most seven days of credential retention.                  |
| Terminal tombstone                                                                                | Prove terminal handling and suppress unsafe replay                                       | Purgeable 90 days after `revoked_at`; terminal rows contain no credential.                                                              |

## Retention and terminal disposition

| Data                                              | Implemented retention                                                                                                                                                                                       | Required disposition                                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw RevenueCat/Stripe request and response bodies | Request lifetime only; not persisted                                                                                                                                                                        | Discard after authentication, normalization, and response completion.                                                                                                              |
| RevenueCat/Stripe records held by the provider    | Not defined or evidenced in this repository                                                                                                                                                                 | Approve provider retention and deletion terms before enablement; configure the shortest purpose-bound period available.                                                            |
| Finance billing ledger and provider identifiers   | No purge period is implemented. On user deletion, `billing_accounts.owner_id` becomes `NULL` and `pseudonymized_at` is set, while provider identities, purchase bindings, subscriptions, and events remain. | Legal must approve a jurisdiction-specific period and exception model. Database/backend owners must enforce terminal deletion or irreversible de-identification after that period. |
| User and household projections                    | Account/household lifetime                                                                                                                                                                                  | Cascade on subject deletion or replace during deterministic rebuild.                                                                                                               |
| Client display caches                             | Session-bound on Web; validity-bound but persistent on native/Windows                                                                                                                                       | Clear for sign-out, account deletion, subject change, and app-data reset; never extend authorization beyond the server bound.                                                      |
| Revocation outbox, ordinary finalization failure  | Credential-bearing states retain for at most 30 days                                                                                                                                                        | Revoke/reconcile sooner; otherwise mark `abandoned`, erase the credential, and escalate unresolved provider access.                                                                |
| Revocation outbox, account deletion               | Identity links are severed immediately and credential retention is shortened to at most 7 days                                                                                                              | Continue retrying without the deleted identity. On success erase the credential; at seven days erase it even if unresolved and record `abandoned`.                                 |
| Revocation terminal tombstones                    | 90 days after `revoked_at` by the maintenance function                                                                                                                                                      | Purge after the terminal audit window.                                                                                                                                             |

The repository's general
[Data Retention Schedule](data-retention-schedule.md) does not yet contain the
billing ledger, provider records, client entitlement caches, or revocation
outbox. Until it is updated after legal review and the ledger purge is
implemented, no production retention claim is approved.

## Regions, transfers, subprocessors, and DPAs

| Processor or recipient        | Data categories                                                                                                                                                     | Region and transfer finding                                                                                                                                                       | DPA/subprocessor status                                                                                                                       | Gate                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| RevenueCat                    | Finance user UUID, store/app/product identifiers, purchase/subscription/transaction state and timestamps                                                            | Code uses the public RevenueCat v2 HTTPS API. No processing region, data-residency selection, transfer impact assessment, or supplementary measure is recorded in the repository. | DPA execution and the dated RevenueCat subprocessor list are not evidenced. Apple and Google store processing also requires notice alignment. | **Blocked**                                               |
| Stripe                        | Finance user, billing-account, and optional household UUID metadata; hosted-checkout billing/payment data; subscription, invoice, charge, refund, and dispute state | Code uses `https://api.stripe.com/v1`; no account data-region setting, transfer impact assessment, or supplementary measure is recorded in the repository.                        | DPA execution and the dated Stripe subprocessor list are not evidenced.                                                                       | **Blocked**                                               |
| Supabase / Edge runtime       | Finance ledger, projections, outbox, API processing                                                                                                                 | Existing inventory says deployment region must be selected and documented; this review did not inspect production configuration.                                                  | Existing repository status remains “required before launch.”                                                                                  | **Blocked**                                               |
| Apple App Store / Google Play | Store purchaser and transaction data feeding RevenueCat                                                                                                             | Store-controlled regions and transfers are not inventoried for this feature.                                                                                                      | Controller/independent-controller roles and downstream terms need legal confirmation.                                                         | **Blocked**                                               |
| Plaid / MX                    | Bank Item credential used only for revocation plus provider-side connection record                                                                                  | Existing aggregator review applies; account-deletion outbox can continue cross-border provider calls for up to seven days after identity severance.                               | Existing aggregator procurement gates remain; this review did not reapprove either provider.                                                  | **Blocked unless already approved for the launch region** |

Before enablement, compliance must retain the DPA or contractual reference,
version/date of each subprocessor list, selected service regions, transfer
mechanism, transfer impact assessment outcome, and accountable approver. A
generic statement that a provider offers SCCs is not evidence that Finance has
executed or incorporated them.

## Data-subject rights

| Right                   | Integrated behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Decision                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access / portability    | The self-service export omits `billing_accounts`, provider identities and bindings, subscriptions, provider events, grants, and projections. This is consistent with the architecture's credential-minimization rule but not a complete Art. 15 response. Provider identifiers need not be placed in a broad financial export, but an authenticated assisted DSAR must disclose the person's subscription data, purposes, recipients, source, retention, and a safe copy where required. | **Blocked:** implement a safe entitlement export or a tested assisted-DSAR retrieval procedure before processing real billing data. Remove the inaccurate `gdpr_compliant: true` claim from the export response as part of that implementation. |
| Erasure                 | Deleting the Finance user cascades user grants/projection and nulls the ledger owner link. Immutable provider identifiers and normalized evidence remain. No RevenueCat or Stripe erasure request is made, and Finance UUID metadata may remain provider-side.                                                                                                                                                                                                                           | **Blocked:** define legal-retention exceptions, erase or irreversibly de-identify non-required identifiers, and add a durable RevenueCat/Stripe erasure or suppression workflow.                                                                |
| Correction              | Current entitlement state is corrected by authenticated provider evidence and deterministic reconciliation; immutable evidence is not overwritten. Profile and household intent can be corrected through normal product flows.                                                                                                                                                                                                                                                           | **Pass with procedure:** document how support records a disputed provider identity or household binding without mutating evidence, and how a corrected event/rebuild is verified.                                                               |
| Restriction / objection | No direct restriction marker exists for retained billing evidence. Necessary contract processing and legal retention are distinct from optional processing.                                                                                                                                                                                                                                                                                                                              | **Blocked:** define a case-management path for disputed or legally restricted retained evidence before launch.                                                                                                                                  |
| Consent withdrawal      | RevenueCat/Stripe billing is proposed as necessary contract processing, not optional consent processing. Optional analytics consent must remain separate and must not receive raw billing values or provider identifiers.                                                                                                                                                                                                                                                                | **Pass for design:** no bundled analytics consent was found.                                                                                                                                                                                    |

## Notice and consent impact

The current [Privacy Policy](../legal/privacy-policy.md) does not list
RevenueCat or Stripe, does not enumerate subscription and billing metadata, and
does not explain retained pseudonymized billing evidence or post-deletion
provider work. Before the first production collection, a reviewed notice must:

1. Name RevenueCat and Stripe, their roles, data categories, purposes, lawful
   bases, regions/transfers, and applicable store/payment recipients.
2. Explain that Finance sends pseudonymous account and optional household
   identifiers, while Stripe directly handles payment instruments and billing
   details.
3. State the approved ledger/provider retention periods and legal-retention
   exceptions without describing linkable provider IDs as anonymous.
4. Explain access, correction, deletion, and restriction routes for billing
   records, including records retained after account closure.
5. Explain that bank-provider deauthorization may continue after local account
   deletion during an outage, with identity links severed and retry credentials
   bounded to seven days.
6. Present purchase terms before checkout. Do not seek consent for processing
   that is necessary to perform the subscription contract, and do not bundle
   optional analytics or marketing consent with purchase.

The updated notice and purchase disclosure require qualified legal review and
must be published before data collection begins. This review does not approve
marketing claims or store privacy-label answers.

## Account deletion during provider outage

The integrated bank-provider deletion path is fail-safe for local erasure:

1. `account-delete` calls
   `sever_bank_revocation_identities_for_account` before deleting any
   credential-bearing row.
2. The database atomically moves every live bank credential into the
   server-only outbox, marks the Finance user deleted to reject delayed
   finalization, consumes reservations, changes the reason to
   `account_deletion`, makes eligible work immediately due, shortens
   `retain_until` to no more than seven days, and nulls owner, household, and
   connection identifiers.
3. Account deletion then continues without calling Plaid or MX. A provider
   outage therefore does not preserve the Finance account or its direct
   identity links.
4. The worker retries idempotently with bounded backoff and recovery. Success
   or an already-invalid response erases the credential.
5. If erasure is still unresolved at `retain_until`, maintenance marks the row
   `abandoned` and erases the only credential. Aggregate operator visibility
   remains, but automated provider erasure can no longer continue.

This is a defensible minimization trade-off only if operations treat every
account-deletion `abandoned` result as a privacy incident requiring manual
processor follow-up and retain non-identifying correlation evidence sufficient
for that follow-up. That operational evidence is not yet present and remains a
provider-enablement gate.

RevenueCat and Stripe are different: the account-deletion path does not call
either provider and has no durable subscription-processor erasure outbox.
Finance-user deletion pseudonymizes the local billing owner link but does not
remove Finance UUID metadata or customer records held by those processors.

## Findings and residual-risk register

No production residual risk is accepted by this review.

| ID            | Severity | Finding / required outcome                                                                                                                                                                                                                                          | Accountable owner                                        | Review or expiry                                                         |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `PRI-ENT-001` | High     | RevenueCat and Stripe DPA, subprocessor, region, transfer-mechanism, and transfer-impact evidence is absent. Obtain and approve the evidence.                                                                                                                       | Compliance owner with qualified legal/procurement review | Before any provider configuration; review by 2026-10-10                  |
| `PRI-ENT-002` | High     | The public notice omits billing data and processors. Publish legally reviewed notice and purchase disclosures before collection.                                                                                                                                    | Compliance and product owners                            | Before enablement; draft review by 2026-10-10                            |
| `PRI-ENT-003` | High     | Billing/entitlement records are absent from self-service export and the response overclaims `gdpr_compliant: true`. Implement a minimized entitlement export or tested assisted DSAR, and remove the claim.                                                         | Backend owner with compliance review                     | Before enablement; implementation review by 2026-10-10                   |
| `PRI-ENT-004` | High     | Ledger/provider identifiers have no approved or enforced retention period, and account deletion retains linkable provider IDs after owner pseudonymization. Approve the legal basis and period, then implement terminal deletion or irreversible de-identification. | Compliance/legal and database owners                     | Before enablement; legal decision by 2026-10-10                          |
| `PRI-ENT-005` | High     | Account deletion has no durable RevenueCat/Stripe erasure or metadata-suppression handoff. Implement idempotent, outage-safe processor handling with legal-retention exceptions.                                                                                    | Backend owner with compliance and security review        | Before enablement; design review by 2026-10-10                           |
| `PRI-ENT-006` | Medium   | Native and Windows entitlement caches, and prior Web session entries, are not proven to clear proactively on sign-out/account deletion despite the notice claim. Wire and test cross-platform cleanup.                                                              | Native and Web owners                                    | Before enablement; implementation review by 2026-10-10                   |
| `PRI-ENT-007` | High     | An account-deletion bank revocation unresolved after seven days becomes `abandoned` and loses automated erasure capability. Define paging, manual processor follow-up, DSAR evidence, and closure criteria.                                                         | Backend and SRE owners with compliance review            | Before bank-provider production processing; runbook review by 2026-10-10 |

The review expires on **2026-12-09**, or immediately upon a change to provider
data fields, provider SDK/API behavior, ledger schema, projection contract,
cache persistence, export/deletion behavior, retention, regions, subprocessors,
or privacy notice, whichever occurs first.

## Evidence inspected

The review inspected:

- RevenueCat webhook, confirmation, reconciliation, normalization, store, and
  client implementations and their synthetic tests.
- Stripe checkout, portal, webhook, reconciliation, normalization, store, and
  REST client implementations and their synthetic tests.
- The complete entitlement migration and billing integration/concurrency tests.
- The minimized entitlement contract and Web, Android, iOS, and Windows cache
  implementations and tests.
- The durable bank-revocation migration, worker helpers, account-deletion
  handoff, and outage/idempotency/terminal-retention tests.
- The self-service data-export table allowlist and redaction tests.
- Existing data inventory, retention schedule, access/erasure audits, privacy
  policy, entitlement ADR, provider adapter documentation, and security
  sign-off.

### Local synthetic verification

| Command                                                                                                                                         | Result                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Targeted Deno RevenueCat, Stripe, entitlement API, data-export, account-delete, and revocation-outbox suites                                    | 167 passed, 0 failed        |
| `npm run test -w apps/web -- --run src/entitlements/entitlements.test.ts src/billing/productBilling.test.ts src/components/DataExport.test.tsx` | 3 files and 32 tests passed |
| `.\gradlew.bat :packages:core:jvmTest :apps:windows:test --no-daemon`                                                                           | Build successful            |

The SQL billing and revocation suites were inspected for deletion,
pseudonymization, identity severance, outage retry, and terminal credential
disposition. This review did not use a production or staging database.

## Production gate

RevenueCat and Stripe remain disabled by the absence of approved production
configuration and secrets; their configuration readers fail closed when
required values are absent. This is an operational gate, not a dedicated
runtime privacy feature flag.

Do not add production provider values, create provider products, register
webhooks, run production migrations, deploy adapters, or enable paid
entitlements until:

1. `PRI-ENT-001` through `PRI-ENT-007` are closed with linked evidence.
2. Qualified legal review approves the lawful-basis, retention, notice,
   processor, subprocessor, and transfer decisions.
3. Targeted rights, account-deletion, cache-cleanup, provider-erasure, and
   revocation-outage tests pass on the exact release candidate.
4. The independent security and reliability sign-offs remain current.
5. The #4406 coordinator records approval of the exact release head.

Merging this document records completion of the independent privacy review. It
does not clear the production privacy gate.
