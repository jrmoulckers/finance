# Security Policy

Finance is a financial tracking application that handles sensitive personal and financial data. We take security seriously and appreciate the community's help in keeping this project and its users safe.

## Supported Versions

Finance is currently in **pre-release development** (`0.x`). All code on the `main` branch receives security updates.

| Version                     | Supported                      |
| --------------------------- | ------------------------------ |
| `main` branch (development) | :white_check_mark: Active      |
| Pre-release tags (`0.x.x`)  | :white_check_mark: Latest only |
| Older pre-release tags      | :x: Upgrade to latest          |

Once Finance reaches `1.0`, this table will be updated with a formal support window.

## Reporting a Vulnerability

> **:warning: Do NOT open a public GitHub issue for security vulnerabilities.**
>
> Public disclosure before a fix is available puts all users at risk.

### Preferred: GitHub Private Vulnerability Reporting

Use GitHub's built-in **Private Vulnerability Reporting** feature:

1. Go to the [Security Advisories page](https://github.com/jrmoulckers/finance/security/advisories)
2. Click **"Report a vulnerability"**
3. Fill out the form with the details described below

This is the fastest way to reach us and keeps the report confidential within GitHub's security infrastructure.

### Alternative: Email

If you are unable to use GitHub's private reporting, email the maintainer directly:

**Jeffrey Moulckers** — [@jrmoulckers](https://github.com/jrmoulckers)
Email: `jrmoulckers` (at) `gmail` (dot) `com`

Use the subject line: **`[SECURITY] Finance — <brief description>`**

If possible, encrypt sensitive details using the maintainer's GPG key (available on their GitHub profile) or request a secure channel in your initial email.

### What to Include in Your Report

A good vulnerability report helps us understand and fix the issue quickly. Please include:

- **Summary** — A clear, concise description of the vulnerability
- **Affected component** — Which app, package, service, or API endpoint is affected (e.g., `packages/sync`, `services/api`, `apps/web`)
- **Reproduction steps** — Step-by-step instructions to reproduce the issue
- **Proof of concept** — Code snippets, screenshots, or logs that demonstrate the vulnerability (redact any real user data)
- **Impact assessment** — What could an attacker achieve? (e.g., data exposure, privilege escalation, authentication bypass)
- **Severity estimate** — Your assessment: Critical, High, Medium, or Low
- **Environment** — Platform, OS version, browser, or device where the issue was observed
- **Suggested fix** — Optional, but always appreciated

### What NOT to Do

- **Do not** open public issues, pull requests, or discussions about security vulnerabilities
- **Do not** exploit the vulnerability beyond the minimum necessary to demonstrate it
- **Do not** access, modify, or delete other users' data
- **Do not** perform denial-of-service attacks against any environment
- **Do not** share vulnerability details with third parties before the issue is resolved

## Response Timeline

We are committed to addressing security issues promptly. As a bootstrapped open-source project with a sole maintainer, these are our target SLAs:

| Stage                         | Target Timeline                         |
| ----------------------------- | --------------------------------------- |
| **Acknowledgment**            | Within **48 hours** of report           |
| **Initial assessment**        | Within **1 week** of report             |
| **Critical severity fix**     | Within **72 hours** of confirmation     |
| **High severity fix**         | Within **2 weeks** of confirmation      |
| **Medium / Low severity fix** | Addressed in the **next release cycle** |

You will be kept informed throughout the process. If we need more information, we will reach out through the same channel you used to report.

### Disclosure Timeline

We follow a **coordinated disclosure** model:

1. We will work with the reporter to understand and validate the issue
2. We will develop and test a fix
3. We will publish a security advisory and release the patch
4. The reporter will be credited (unless they prefer anonymity)

We ask that reporters allow up to **90 days** from the initial report before any public disclosure, to give us adequate time to develop and deploy a fix.

## Scope

### In Scope

The following are considered valid security concerns for this project:

| Category                                    | Examples                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Authentication & authorization bypasses** | Accessing another user's data, skipping auth flows, token manipulation                     |
| **Financial data exposure**                 | Unencrypted PII or financial data, leaking account balances or transaction details         |
| **Injection vulnerabilities**               | SQL injection, cross-site scripting (XSS), command injection, template injection           |
| **Cryptographic weaknesses**                | Weak encryption algorithms, improper key management, insufficient entropy                  |
| **Sync protocol vulnerabilities**           | Data corruption during sync, unauthorized data access via PowerSync, replay attacks        |
| **Row-Level Security (RLS) bypasses**       | Circumventing Supabase RLS policies to access unauthorized rows                            |
| **Insecure data storage**                   | Sensitive data stored in plain text, credentials outside of platform-native secure storage |
| **Sensitive data in logs**                  | Financial data, PII, or credentials appearing in application logs or error messages        |
| **Dependency vulnerabilities**              | Known CVEs in direct dependencies that are exploitable in our usage context                |

### Out of Scope

The following are **not** considered security vulnerabilities for this project:

- **Social engineering** — Phishing, pretexting, or other attacks targeting users or maintainers directly
- **Denial-of-service (DoS)** — Resource exhaustion on local development setups or CI infrastructure
- **Issues in upstream dependencies** — Report these to the relevant upstream project (e.g., Supabase, PowerSync, SQLCipher); let us know if our _usage_ of the dependency is insecure
- **UI/UX issues** — Cosmetic bugs or usability concerns without security impact
- **Best-practice suggestions** — General hardening recommendations without a demonstrated exploit (welcome as regular issues)
- **Attacks requiring physical access** — To a user's unlocked, authenticated device
- **Self-XSS** — Vulnerabilities that require the user to execute code in their own browser console

## Security Architecture

Finance follows a **privacy-by-design, edge-first** architecture. Here is a brief overview of the security measures in place:

### Data Processing

- **Edge-first design** — Financial data is processed and stored on-device. The backend serves as a coordination and sync layer, not the primary data store.
- **Data minimization** — We collect and sync only the data necessary for the application to function.

### Encryption

- **At rest** — Local databases are encrypted using [SQLCipher](https://www.zetetic.net/sqlcipher/) (AES-256-CBC with HMAC-SHA512 page-level authentication).
- **In transit** — All network communication uses TLS 1.2+ with certificate validation.
- **Credentials** — Stored in platform-native secure enclaves: iOS/macOS Keychain, Android Keystore, Windows Credential Manager.

### Access Control

- **Row-Level Security (RLS)** — Enforced on all Supabase PostgreSQL tables. Every query is scoped to the authenticated user.
- **Authentication** — Handled by Supabase Auth with support for industry-standard protocols.
- **Authorization** — Checked at both the API layer and database layer (defense in depth).

### Logging & Monitoring

- **No plain-text logging of financial data** — Monetary amounts, account numbers, and PII are never written to application logs in plain text.
- **Secret scanning** — GitHub secret scanning is enabled to prevent accidental credential commits (see `.github/secret_scanning.yml`).
- **Dependency monitoring** — Dependabot is configured for all ecosystems (npm, Gradle, GitHub Actions) with weekly update checks.

### Supply Chain

- **Dependabot** — Automated dependency updates across all package ecosystems.
- **Pinned CI actions** — GitHub Actions workflows use pinned versions to prevent supply chain attacks.
- **Minimal dependency footprint** — We prefer platform-native APIs over third-party libraries where feasible.

## Acknowledgments

We believe in recognizing the security researchers and community members who help keep Finance secure.

### Credit Policy

- Confirmed vulnerabilities will be credited in the **security advisory** and **release notes** unless the reporter requests anonymity.
- We will credit you by your preferred name, GitHub handle, or organization.
- We maintain a [Security Hall of Fame](#security-hall-of-fame) in this document for acknowledged contributors.

### Bug Bounty

Finance is a **bootstrapped, open-source project** and does not currently offer monetary rewards for vulnerability reports. We offer:

- Public credit and acknowledgment
- A mention in release notes
- Our sincere gratitude

If the project grows to a point where a formal bug bounty program is feasible, this policy will be updated.

### Security Hall of Fame

_No entries yet. Be the first to help secure Finance!_

## Safe Harbor

Finance supports responsible security research. We will not pursue legal action against individuals who:

- Make a **good-faith effort** to comply with this security policy
- Report vulnerabilities through the channels described above
- Avoid actions that could harm users, disrupt services, or destroy data
- Do not access or modify data belonging to other users
- Allow reasonable time for the vulnerability to be fixed before any disclosure

We consider security research conducted in accordance with this policy to be:

- **Authorized** under applicable computer fraud and abuse laws
- **Exempt** from DMCA restrictions on circumvention, to the extent the research is limited to the security of this application
- **Lawful** and conducted in the public interest

If at any point you are uncertain whether your research complies with this policy, please reach out to us _before_ proceeding. We are happy to clarify.

---

_This security policy is based on industry best practices and is reviewed periodically. Last updated: 2025._
