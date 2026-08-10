# Security Policy

> **This policy extends the JRM Studio canonical security policy:**
> <https://github.com/jrmoulckers/.github/blob/main/SECURITY.md>
>
> Finance handles sensitive personal and financial data, so this file adds
> product-specific scope, architecture, and response commitments on top of the
> shared studio baseline. **Where this file is silent, the canonical policy
> governs.** Where the two genuinely conflict, the conflict is listed explicitly
> under [Deliberate deviations from the canonical policy](#deliberate-deviations-from-the-canonical-policy)
> rather than being resolved silently.

Finance is a multi-platform financial tracking application. We take security
seriously and appreciate the community's help in keeping this project and its
users safe.

## Supported Versions

Finance is currently in **pre-release development** (`0.x`). All code on the
`main` branch receives security updates. Finance is continuously developed and
deployed from `main`, so it has no maintained release line to backport to.

| Version                     | Supported                      |
| --------------------------- | ------------------------------ |
| `main` branch (development) | :white_check_mark: Active      |
| Pre-release tags (`0.x.x`)  | :white_check_mark: Latest only |
| Older pre-release tags      | :x: Upgrade to latest          |

Once Finance reaches `1.0`, this table will be replaced with a formal support
window aligned to the canonical policy's default-branch-plus-release-line model.

## Reporting a Vulnerability

> **:warning: Do NOT open a public GitHub issue, pull request, or discussion for
> security vulnerabilities.**
>
> Public disclosure before a fix is available puts all users at risk.

### Preferred: GitHub Private Vulnerability Reporting

Use GitHub's built-in **Private Vulnerability Reporting** feature:

1. Go to the [Security Advisories page](https://github.com/jrmoulckers/finance/security/advisories)
2. Click **"Report a vulnerability"**
3. Fill out the form with the details described below

This is the fastest way to reach us and keeps the report confidential within
GitHub's security infrastructure.

### Alternative: Private Contact

If you are unable to use GitHub's private reporting, contact the maintainer
directly:

**Jeffrey Moulckers** — [@jrmoulckers](https://github.com/jrmoulckers)
Email: `jrmoulckers` (at) `gmail` (dot) `com`

Use the subject line:

```text
[SECURITY] Finance — <brief description>
```

If possible, encrypt sensitive details using the maintainer's GPG key (available
on their GitHub profile) or request a secure channel in your initial message.

Do not send secrets, exploit code targeting third-party systems, or real user
data in an initial message.

## What to Include

A good vulnerability report helps us understand and fix the issue quickly.
Please include:

- **Summary** — A clear, concise description of the vulnerability
- **Affected component** — Which app, package, service, or API endpoint is affected (e.g., `packages/sync`, `services/api`, `apps/web`), including the Edge Function name, table, or endpoint where relevant
- **Reproduction steps** — Step-by-step instructions to reproduce the issue
- **Proof of concept** — Code snippets, screenshots, or logs that demonstrate the vulnerability (redact any real user data)
- **Impact assessment** — What could an attacker achieve? (e.g., data exposure, privilege escalation, authentication bypass)
- **Severity estimate** — Your assessment: Critical, High, Medium, or Low
- **Environment** — Platform (iOS, Android, Web, Windows), OS version, browser, or device where the issue was observed
- **Suggested fix** — Optional, but always appreciated

## Severity Guide

We assess severity using CVSS bands, with Finance-specific examples:

| Severity                  | Examples                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical** (CVSS 9.0+)  | Remote code execution, authentication bypass, secret extraction, Row-Level Security bypass granting broad unauthorized access to financial data     |
| **High** (CVSS 7.0–8.9)   | Privilege escalation, cross-household data access, stored cross-site scripting, exploitable injection, exposure of account balances or transactions |
| **Medium** (CVSS 4.0–6.9) | Limited data exposure, cross-site request forgery requiring user interaction, rate-limiting bypass, insecure defaults with a realistic exploit path |
| **Low** (CVSS 0.1–3.9)    | Minor information disclosure, hardening gaps, security-relevant misconfiguration with limited impact                                                |

## What Not to Do

- **Do not** open public issues, pull requests, or discussions about security vulnerabilities
- **Do not** publicly disclose details before a fix or advisory is available
- **Do not** exploit the vulnerability beyond the minimum necessary to demonstrate it
- **Do not** access, modify, delete, or exfiltrate data that is not yours
- **Do not** perform destructive actions of any kind
- **Do not** attack third-party services, production systems, CI infrastructure, or other users
- **Do not** perform denial-of-service testing against any environment
- **Do not** share vulnerability details with third parties before coordination is complete

Test against your own local or staging environment wherever it is possible to
demonstrate the issue there.

## Response Timeline

We are committed to addressing security issues promptly. As a bootstrapped
open-source project with a sole maintainer, these are our target SLAs, not
guarantees:

| Stage                         | Target Timeline                         |
| ----------------------------- | --------------------------------------- |
| **Acknowledgment**            | Within **48 hours** of report           |
| **Initial assessment**        | Within **1 week** of report             |
| **Critical severity fix**     | Within **72 hours** of confirmation     |
| **High severity fix**         | Within **2 weeks** of confirmation      |
| **Medium / Low severity fix** | Addressed in the **next release cycle** |
| **Status updates**            | At least every **7 days** while open    |

You will be kept informed throughout the process. If we need more information,
we will reach out through the same private channel you used to report.

## Coordinated Disclosure

We follow a **coordinated disclosure** model:

1. We validate the report and confirm its scope
2. We develop and test a fix
3. We publish a security advisory and release the patch
4. The reporter is credited unless they prefer anonymity

We ask that reporters allow up to **90 days** from the initial report before any
public disclosure, to give us adequate time to develop and deploy a fix.

## Scope

### In Scope

The following are considered valid security concerns for this project:

| Category                                    | Examples                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Authentication & authorization bypasses** | Accessing another user's data, skipping auth flows, token manipulation                     |
| **Row-Level Security (RLS) bypasses**       | Circumventing Supabase RLS policies to access unauthorized rows                            |
| **Cross-household data access**             | Reading or writing data belonging to a household the account does not belong to            |
| **Financial data exposure**                 | Unencrypted PII or financial data, leaking account balances or transaction details         |
| **Injection vulnerabilities**               | SQL injection via Edge Functions or PostgREST, cross-site scripting, command injection     |
| **Cryptographic weaknesses**                | Weak encryption algorithms, improper key management, insufficient entropy                  |
| **Sync protocol vulnerabilities**           | Data corruption during sync, unauthorized data access via PowerSync, replay attacks        |
| **Rate-limiting bypass**                    | Circumventing rate limits on Edge Function endpoints                                       |
| **Insecure data storage**                   | Sensitive data stored in plain text, credentials outside of platform-native secure storage |
| **Sensitive data in logs**                  | Financial data, PII, or credentials appearing in application logs or error messages        |
| **Dependency vulnerabilities**              | Known CVEs in direct dependencies that are exploitable in our usage context                |
| **CI/CD and release workflows**             | Vulnerabilities that could alter trusted build outputs or leak repository secrets          |

### Out of Scope

The following are **not** considered security vulnerabilities for this project:

- **Supabase platform infrastructure** — Report these to Supabase directly; let us know if our _configuration_ of the platform is insecure
- **Social engineering** — Phishing, pretexting, or other attacks targeting users or maintainers directly
- **Denial-of-service (DoS)** — Resource exhaustion on local development setups, CI, or hosted services
- **Issues in upstream dependencies** — Report these to the relevant upstream project (e.g., Supabase, PowerSync, SQLCipher); let us know if our _usage_ of the dependency is insecure
- **Issues affecting only unsupported versions** — See [Supported Versions](#supported-versions)
- **UI/UX issues** — Cosmetic bugs or usability concerns without security impact
- **Best-practice suggestions** — General hardening recommendations without a demonstrated exploit path (welcome as regular issues)
- **Attacks requiring physical access** — To a user's unlocked, authenticated device
- **Self-XSS** — Vulnerabilities that require the user to execute code in their own browser console

## Safe Harbor

Finance supports responsible security research. We will not pursue legal action
against individuals who:

- Make a **good-faith effort** to comply with this security policy
- Report vulnerabilities through the private channels described above
- Avoid actions that could harm users, disrupt services, or destroy data
- Do not access or modify data belonging to other users
- Allow reasonable time for the vulnerability to be fixed before any disclosure

We consider security research conducted in accordance with this policy to be:

- **Authorized** under applicable computer fraud and abuse laws
- **Exempt** from DMCA restrictions on circumvention, to the extent the research is limited to the security of this application
- **Lawful** and conducted in the public interest

If at any point you are uncertain whether your research complies with this
policy, please reach out _before_ proceeding. We are happy to clarify.

---

The sections below are **Finance-specific extensions** to the canonical policy.

## Finance Security Architecture

Finance follows a **privacy-by-design, edge-first** architecture. This is a
brief overview of the security measures in place.

### Data Processing

- **Edge-first design** — Financial data is processed and stored on-device. The backend serves as a coordination and sync layer, not the primary data store.
- **Data minimization** — We collect and sync only the data necessary for the application to function.
- **Integer money** — Monetary values are stored as `BIGINT` minor units and never as floating point, so rounding cannot silently corrupt balances.

### Encryption

- **At rest** — Local databases are encrypted using [SQLCipher](https://www.zetetic.net/sqlcipher/) (AES-256-CBC with HMAC-SHA512 page-level authentication).
- **In transit** — All network communication uses TLS 1.2+ with certificate validation, and native clients additionally pin certificates.
- **Credentials** — Stored in platform-native secure enclaves: iOS/macOS Keychain, Android Keystore, Windows Credential Manager.

### Access Control

- **Row-Level Security (RLS)** — Enabled and enforced on all Supabase PostgreSQL tables. Every query is scoped to the authenticated user.
- **Household isolation** — Household-level tenant isolation is enforced through RLS policies.
- **Authentication** — Handled by Supabase Auth, including passkey (WebAuthn) support.
- **Authorization** — Checked at both the API layer and the database layer (defense in depth).
- **Rate limiting** — Applied to all Edge Function endpoints.

### Logging & Monitoring

- **No plain-text logging of financial data** — Monetary amounts, account numbers, and PII are never written to application logs in plain text.
- **Secret scanning** — GitHub secret scanning is enabled to prevent accidental credential commits (see `.github/secret_scanning.yml`), and a secret scan also runs in the local pre-push hook.
- **Dependency monitoring** — Dependabot is configured for all ecosystems (npm, Gradle, GitHub Actions) with weekly update checks.

### Supply Chain

- **Dependabot** — Automated dependency updates across all package ecosystems.
- **Pinned CI actions** — GitHub Actions workflows use pinned versions to prevent supply-chain attacks.
- **Minimal dependency footprint** — We prefer platform-native APIs over third-party libraries where feasible.

### Privacy Commitments

- **GDPR / CCPA compliant** data export and deletion flows.
- **No financial-data monetization** — Financial data is never sold, shared, or used to build advertising profiles.

## Acknowledgments

We believe in recognizing the security researchers and community members who
help keep Finance secure.

### Credit Policy

- Confirmed vulnerabilities will be credited in the **security advisory** and **release notes** unless the reporter requests anonymity.
- We will credit you by your preferred name, GitHub handle, or organization.
- Acknowledged contributors are listed in the [Security Hall of Fame](#security-hall-of-fame) below.

### Bug Bounty

Finance is a **bootstrapped, open-source project** and does not currently offer
monetary rewards for vulnerability reports. Regardless of severity, we offer:

- Public credit and acknowledgment
- A mention in release notes
- Priority remediation for Critical and High findings
- Our sincere gratitude

If the project grows to a point where a formal bug bounty program is feasible,
this policy will be updated.

### Security Hall of Fame

_No entries yet. Be the first to help secure Finance!_

## Deliberate deviations from the canonical policy

Canon explicitly permits stricter product-specific guidance, so none of these
are violations — they are recorded here so they are visible rather than silent,
and so the owner can decide whether canon should change instead.

| Area                      | Canonical policy                                | Finance                                                             | Rationale                                                                                                                          |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Supported Versions        | Default branch **plus the latest release line** | Deployed `main` only, pre-release `0.x`                             | Finance is continuously developed and deployed from `main`. There is no maintained release line to backport a fix to before `1.0`. |
| Critical fix target       | "As soon as practical after confirmation"       | Within **72 hours** of confirmation                                 | Stricter than canon. A financial application's Critical findings warrant a hard, stated target rather than a best-effort one.      |
| Security contact          | Placeholder `security@example.com`              | Named maintainer, GitHub profile, and GPG-capable channel           | Finance has a real, reachable maintainer contact, so no placeholder is used.                                                       |
| Reward structure          | Silent                                          | Recognition-only, no monetary bounty                                | Bootstrapped project; canon does not address bounties, so this is an extension rather than a conflict.                             |
| Safe Harbor legal framing | Four good-faith conditions                      | Same conditions plus explicit CFAA / DMCA / public-interest framing | Extends canon with the legal assurances researchers typically look for. No condition from canon is relaxed.                        |

---

_This security policy extends the JRM Studio canonical policy and is reviewed periodically._
