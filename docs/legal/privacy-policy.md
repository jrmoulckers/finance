# Privacy Policy

> **⚠️ DRAFT — REQUIRES LEGAL COUNSEL REVIEW BEFORE PUBLICATION**
>
> This privacy policy is a working draft for the Finance application and related
> services. It is intended to describe the current and planned data practices of
> the product in plain language, but it has not yet been approved by legal
> counsel. Do not publish or rely on this document as final legal advice.

**Effective date:** 2026-03-16  
**Last updated:** 2026-03-16  
**Version:** Draft 0.1

## 1. Who we are

Finance is a personal and household financial management application. For the
purposes of data protection law, the data controller is:

**[Company Name]**  
[Registered Address]  
[Privacy Contact Email]  
[Support Contact URL]

If required by applicable law, **[Company Name]** will designate a data
protection contact or data protection officer and publish those details here.

## 2. Scope of this policy

This policy explains how Finance collects, uses, stores, shares, and deletes
personal information when you:

- create and use a Finance account;
- create or join a household in the app;
- add accounts, transactions, budgets, goals, and categories;
- use synchronization, authentication, support, and security features; or
- interact with optional analytics or crash reporting features, if enabled.

Finance is designed as an edge-first application. That means much of your data
processing happens on your own device first, with backend services used mainly
for authentication, synchronization, security, and account management.

## 3. The information we collect

The categories below reflect the current Finance data inventory and the shared
models in `packages/models/`, including `User`, `Household`,
`HouseholdMember`, `Account`, `Transaction`, `Budget`, `Goal`, and `Category`.

| Category                                    | Examples of data                                                                                                                                       | How we collect it                                                  | Why it is needed                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Account and profile information             | Email address, display name, avatar URL, default currency                                                                                              | Directly from you when you register or update your profile         | To create and maintain your account, authenticate you, and personalize the service                       |
| Household information                       | Household name, owner identifier, membership records, member role, joined date                                                                         | Directly from you and other authorized household members           | To support shared household finance workflows                                                            |
| Financial records                           | Account names, account type, balances, currencies, transactions, payees, notes, dates, tags, transfer links, budgets, goals, categories, colors, icons | Directly from you as you use the app                               | To provide the core budgeting, account tracking, goal tracking, and transaction features                 |
| Invitations and collaboration data          | Invited email address, invite code, inviter, invite status, role, expiry time                                                                          | When you invite someone to a household or accept an invitation     | To let you share a household with other people you choose                                                |
| Authentication and security data            | Passkey credential IDs, public key material, counters, device type, WebAuthn challenge data, session tokens, refresh cookies                           | Automatically during sign-in and security events                   | To authenticate you securely and protect your account                                                    |
| Device, sync, and service metadata          | Device identifiers, sync status, sync duration, record counts, error codes, pseudonymous service diagnostics                                           | Automatically from your device and our sync systems                | To keep the service reliable, monitor sync health, and troubleshoot problems                             |
| Audit and abuse-prevention data             | Audit log events, action history, table or record references, IP address, user agent, export or deletion audit metadata                                | Automatically when you use the service or call protected endpoints | To secure the service, investigate abuse, meet legal obligations, and demonstrate compliance             |
| Preferences and onboarding data             | Accessibility settings, notification preferences, onboarding values such as preferred currency, first account name, or first budget values             | Directly from you in the app                                       | To remember your settings and improve your experience                                                    |
| Optional analytics and crash reporting data | Pseudonymous analytics events, app version, device class, crash diagnostics, performance metrics                                                       | Only if you choose to enable optional collection                   | To understand product reliability and improve the app                                                    |
| Browser, device, and local storage data     | Strictly necessary cookies, in-memory auth tokens, local database persistence, IndexedDB or OPFS files, CacheStorage entries                           | Automatically as part of delivering the app                        | To keep you signed in, enable offline-first behavior, and store your local data securely or persistently |

### Information we do not intentionally collect for advertising

Finance is not designed to collect advertising IDs, precise location data,
contact lists, or browsing history for advertising purposes. We do not use your
financial data for targeted advertising.

## 4. Sources of personal information

We collect personal information from the following sources:

- **Directly from you** when you sign up, configure your account, create
  financial records, invite household members, or contact support.
- **From your devices** when the app stores local data, syncs, records security
  events, or detects service errors.
- **From other users you authorize** such as when another household member
  invites you to a shared household.
- **From service providers acting on our behalf** such as authentication,
  database, synchronization, and hosting providers.

## 5. How we use your information and our legal bases

Under the GDPR and similar laws, we must have a lawful basis for processing your
personal data. We rely on the following bases:

| Category of processing                                                                 | Purpose                                                                                        | Legal basis                                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Account creation, login, profile management, and service delivery                      | To create your account, authenticate you, store your settings, and provide the Finance service | **Contract** — processing is necessary to provide the service you requested                                           |
| Household sharing, invitations, and synced collaboration features                      | To let you create households, invite others, sync data, and manage shared finances             | **Contract** for core collaboration features; **legitimate interests** for operational integrity of shared workspaces |
| Financial records and budgeting features                                               | To store and display accounts, transactions, budgets, goals, categories, balances, and reports | **Contract**                                                                                                          |
| Passkeys, session management, security monitoring, abuse prevention, and audit logging | To protect accounts, prevent fraud, investigate misuse, and maintain platform security         | **Legitimate interests** and, where strictly necessary to provide secure authentication, **contract**                 |
| Sync reliability and service diagnostics                                               | To operate synchronization, monitor failures, and maintain service performance                 | **Legitimate interests**                                                                                              |
| Optional analytics and crash reporting                                                 | To understand app usage and improve reliability when you choose to participate                 | **Consent**                                                                                                           |
| Legal compliance, enforcement, and response to lawful requests                         | To comply with legal obligations, defend legal claims, or enforce our terms                    | **Legal obligation** or **legitimate interests**, depending on context                                                |

Where we rely on **consent**, you may withdraw that consent at any time. A
withdrawal does not affect processing that already occurred lawfully before the
withdrawal.

## 6. How we share personal information

We do not sell your personal information. We disclose personal information only
in the following circumstances:

- **With service providers and sub-processors** that help us operate Finance;
- **With other members of your household** when you intentionally use shared
  household features;
- **With legal authorities or regulators** if required by law or necessary to
  protect rights, safety, or the integrity of the service;
- **In a business transfer** such as a merger, acquisition, or asset sale,
  subject to applicable legal safeguards; and
- **At your direction** if you request an export, integration, or support action.

### Sub-processors

| Provider           | Role                                                                           | Data involved                                                                                     | Notes                                              |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Supabase           | Database hosting, authentication, and edge functions                           | Account data, profile data, financial sync data, passkey metadata, audit and export/deletion logs | Acts as a processor/service provider on our behalf |
| PowerSync          | Data synchronization and replication path                                      | Application records required to sync your local data with backend systems                         | Acts as a processor/service provider on our behalf |
| [Hosting Provider] | Application hosting, content delivery, uptime monitoring, and operational logs | Network metadata, service logs, and application delivery data                                     | Placeholder until final provider is confirmed      |

We expect our processors to operate under written agreements that include
appropriate confidentiality, security, and data protection commitments.

## 7. International data transfers

Finance may use service providers located in, or accessible from, countries
outside your country of residence, including the United States. If you are in
the EEA, UK, or Switzerland and your personal data is transferred
internationally, we will seek to use appropriate safeguards such as:

- Standard Contractual Clauses or equivalent approved transfer mechanisms;
- data processing agreements with confidentiality and security commitments; and
- additional technical and organizational measures where appropriate.

Because some infrastructure providers are US-based, cross-border transfers may
occur when you use synchronization, authentication, hosting, or support
features.

## 8. Data retention

We keep personal information only for as long as necessary for the purposes
described in this policy, unless a longer retention period is required or
permitted by law. The following schedule is the current draft retention model
and must be validated by legal counsel and engineering before publication.

| Data type                                                                              | Typical retention period                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account and profile data                                                               | For the life of your account, and then up to 30 days after deletion to complete account closure, fraud checks, backup rotation, and deletion workflows unless law requires longer retention          |
| Household records, memberships, accounts, transactions, budgets, goals, and categories | Until you delete them or close your account; soft-deleted records may be retained for up to 30 days before hard deletion or equivalent erasure steps, unless legal obligations require a longer hold |
| Household invitations                                                                  | Until accepted or expired; invitations are intended to expire after approximately 72 hours and may then be retained for up to 30 additional days for abuse prevention and troubleshooting            |
| Passkey credentials                                                                    | Until removed by you or until account deletion                                                                                                                                                       |
| WebAuthn challenge data                                                                | Up to 5 minutes or until the authentication ceremony completes or expires                                                                                                                            |
| Session cookies and access tokens                                                      | For the session or token lifetime, unless revoked earlier                                                                                                                                            |
| Preferences and onboarding data                                                        | Until you change them, uninstall the app, reset the app, or delete your account                                                                                                                      |
| Sync health logs                                                                       | Approximately 30 days, unless a longer period is required to investigate abuse or operational incidents                                                                                              |
| Audit, security, export, and deletion logs                                             | Up to 12 months, or longer where required to establish, exercise, or defend legal claims or comply with legal obligations                                                                            |
| Optional analytics and crash reporting data                                            | Until consent is withdrawn and no longer than 26 months from collection, unless aggregated or de-identified earlier                                                                                  |
| Backups and disaster recovery copies                                                   | Rolling backup periods of up to 30 days, after which older encrypted backups are deleted or overwritten in the ordinary course                                                                       |

Where deletion is requested, we may retain limited information necessary to
honor the request, prevent fraud, comply with law, resolve disputes, or protect
the rights of other users. If information is retained for those reasons, we will
limit its use accordingly.

## 9. Security measures

We use a combination of technical and organizational safeguards designed to
protect personal information, including:

- encryption in transit using HTTPS/TLS;
- encryption at rest for supported storage layers, including encrypted native
  databases and secure credential storage;
- platform-native secure key storage such as Keychain, Keystore, DPAPI, or
  equivalent secure storage mechanisms where available;
- row-level security and least-privilege access controls for multi-tenant backend
  data;
- passkey and WebAuthn-based authentication flows;
- rate limiting, authentication checks, and audit logging on sensitive endpoints;
- data minimization and privacy-by-design review for optional processing; and
- deletion workflows designed to include **crypto-shredding** or equivalent key
  destruction for encrypted data where applicable, so encrypted data can be made
  unreadable when deletion is required.

No system is completely secure. You are responsible for maintaining the secrecy
of your credentials and using secure devices and networks where possible.

## 10. Your privacy rights

Depending on where you live, you may have the right to:

- **Access** the personal data we hold about you;
- **Rectify** inaccurate or incomplete personal data;
- **Erase** your personal data, subject to legal and operational exceptions;
- **Port** your data in a structured, commonly used, machine-readable format;
- **Restrict** certain processing activities;
- **Object** to processing based on legitimate interests;
- **Withdraw consent** for optional analytics, crash reporting, or similar
  consent-based processing; and
- **Complain** to your local data protection authority if you believe your rights
  have been violated.

### How to exercise your rights

You can exercise privacy rights by contacting us at **[Privacy Contact Email]**
or through in-app privacy controls where available. We may need to verify your
identity before completing a request. We will not discriminate against you for
exercising your rights.

### Household and shared-data limitations

Some data in Finance may relate to shared households. If you participate in a
shared household, information you created may also affect other members. When we
handle access, correction, or deletion requests, we may need to balance your
rights with the rights and freedoms of other users and our legal obligations.

## 11. California privacy notice (CCPA/CPRA)

If you are a California resident, this section also applies to you.

### Categories of personal information we collect

In the preceding 12 months, we may have collected the following categories of
personal information:

- identifiers, such as email address and account IDs;
- customer records and profile information;
- commercial or transaction information you enter into the app;
- internet or network activity information such as IP address, user agent, and
  app interaction or sync metadata;
- sensitive personal information, including financial account and transaction
  details that you choose to store in Finance; and
- inferences are **not** used to profile you for advertising purposes.

### California rights

Subject to applicable exceptions, California residents may request:

- to know the categories and specific pieces of personal information we collect,
  use, disclose, or retain;
- to delete personal information;
- to correct inaccurate personal information;
- to access information about the categories of sources, purposes, and third
  parties involved in processing;
- to opt out of the **sale** or **sharing** of personal information; and
- to limit the use of sensitive personal information where the law grants that
  right.

### No sale or sharing

**We do not sell or share personal information** as those terms are defined under
California law, and we do not use personal information for cross-context
behavioral advertising.

### Non-discrimination

We will not discriminate against you for exercising your California privacy
rights.

### Authorized agents

You may designate an authorized agent to submit requests on your behalf where
allowed by law. We may require proof of that authorization and identity
verification.

## 12. Cookies and local storage

Finance uses only **strictly necessary** cookies and similar storage
technologies required to operate the service and support offline-first
functionality.

These technologies may include:

- **Strictly necessary authentication cookies** such as secure, HttpOnly refresh
  cookies on the web;
- **In-memory session state** for active access tokens;
- **Local database storage** on device, including encrypted native databases and
  browser persistence technologies such as OPFS or IndexedDB;
- **CacheStorage or similar browser caches** to support application delivery and
  offline use; and
- **Preference storage** for settings such as accessibility, onboarding, and app
  configuration.

We do **not** use advertising cookies, third-party marketing cookies, or similar
tracking technologies for targeted advertising. If we introduce non-essential
cookies or trackers in the future, we will update this policy and request any
required consent before using them.

## 13. Children’s privacy

Finance is intended for users who are **13 years of age or older**. If local law
requires a higher minimum age, that higher age applies. We do not knowingly
collect personal information from children under 13.

If you believe a child under 13 has provided personal information to Finance,
please contact us at **[Privacy Contact Email]** so we can investigate and, where
required, delete the information.

## 14. Do Not Sell or Share statement

Finance does not sell personal information and does not share personal
information for cross-context behavioral advertising. We do not broker,
monetize, or rent user financial data to advertisers or data brokers.

## 15. Changes to this policy

We may update this privacy policy from time to time. If we make a material
change, we will provide at least **30 days’ notice** before the updated policy
takes effect, unless a shorter period is required by law, security needs, or an
urgent operational reason.

We may provide notice by:

- posting the updated policy in the app or on our website;
- sending an in-app notification or email; or
- updating the effective date shown at the top of this document.

## 16. Contact us and complaints

If you have questions, requests, or complaints about this policy or our privacy
practices, contact:

**[Company Name]**  
Attn: Privacy Team  
[Privacy Contact Email]  
[Support Contact URL]

If you are in the EEA, UK, or another jurisdiction with a supervisory authority,
you may also have the right to lodge a complaint with your local data protection
regulator.

---

**Reminder:** This policy is a **draft** and must be reviewed by qualified legal
counsel before use in production, app stores, or any public-facing surface.
