# Pre-Launch Checklist

This checklist must be completed before Finance ships its first public release. Every item requires explicit sign-off. Items link to the relevant documentation or audit artifact where verification is recorded.

**Last updated:** 2025-07-22
**Sign-off required from:** Project lead

---

## Development Phases

All eight development phases must be complete with their deliverables verified.

- [ ] **Phase 1 — Project Foundation** — Repository structure, build tooling, CI/CD pipeline, AI agent configuration, coding standards, and documentation infrastructure.
- [ ] **Phase 2 — Backend & Sync** — Supabase backend (PostgreSQL + Auth + Edge Functions), PowerSync sync engine, CRDT conflict resolution, offline-first data flow, and API integration tests.
- [ ] **Phase 3 — Android App** — Jetpack Compose UI, Material Design 3, account management, transaction entry (quick-entry < 10 s), envelope budgeting, goal tracking, reports, TalkBack accessibility, and Android-specific E2E tests.
- [ ] **Phase 4 — iOS App** — SwiftUI UI, Human Interface Guidelines compliance, feature parity with Android, VoiceOver accessibility, Fastlane build pipeline, and iOS-specific E2E tests.
- [ ] **Phase 5 — Web App** — React + TypeScript PWA, offline-capable via service worker, WCAG 2.2 AA keyboard navigation, axe-core CI integration, Lighthouse performance targets, and Vercel deployment.
- [ ] **Phase 6 — Windows App** — Compose Desktop (JVM), Fluent Design alignment, Narrator accessibility, MSIX packaging, Microsoft Store submission pipeline, and Windows-specific E2E tests.
- [ ] **Phase 7 — Advanced Features** — Partner/family sharing (RBAC roles), recurring transactions, multi-currency support, natural language input, gamification (streaks, badges), and cross-platform sync validation for shared households.
- [ ] **Phase 8 — Launch Preparation** — User documentation, release workflow validation, launch checklist completion, final audits, app store listing preparation, and incident response training.

---

## Security

All security audit items must pass before release. A single FAIL-level item blocks launch.

- [ ] **Security audit passed** — Complete the [OWASP MASVS L1 Security Checklist](../audits/security-checklist.md) across all four platforms. All items must be verified; any FAIL requires remediation before launch.
  - [ ] SQLCipher encryption verified on Android, iOS, and Windows; Web Crypto API (AES-GCM) verified on Web
  - [ ] Encryption keys stored in platform secure storage (Keychain, Keystore, DPAPI) — never in plaintext
  - [ ] Database files excluded from unencrypted cloud backups
  - [ ] No sensitive data in application logs or crash reports
  - [ ] TLS 1.3 enforced for all network communication
  - [ ] Certificate pinning implemented for API and sync endpoints
- [ ] **Authentication security verified** — Passkey (WebAuthn/FIDO2) and OAuth 2.0/PKCE flows tested on all platforms. Biometric lock functions correctly. Session tokens stored in platform secure storage.
- [ ] **Dependency audit clean** — No known critical or high CVEs in production dependencies. Dependabot alerts reviewed and resolved.
- [ ] **Secret scanning enabled** — GitHub Advanced Security push protection active. No secrets in commit history (verified via `git log` search or `trufflehog`).
- [ ] **CodeQL scan passing** — No high or critical findings in static analysis. Custom financial-app queries (hardcoded keys, insecure crypto, SQL injection, sensitive data logging) all pass.
- [ ] **Penetration test** _(if applicable)_ — Third-party or internal pen test completed, findings remediated or risk-accepted with documentation.

---

## Accessibility

All accessibility audit items must pass on every platform before release.

- [ ] **Accessibility audit passed** — Complete the [WCAG 2.2 AA Accessibility Checklist](../audits/accessibility-checklist.md) on all four platforms.
  - [ ] Screen reader verification: TalkBack (Android), VoiceOver (iOS), NVDA/JAWS (Web), Narrator (Windows)
  - [ ] All interactive elements announced with correct roles and descriptive labels
  - [ ] Financial amounts read correctly by screen readers
  - [ ] Color contrast meets 4.5:1 for body text, 3:1 for large text and UI components — in both light and dark mode
  - [ ] Touch targets meet platform minimums: 48×48 dp (Android), 44×44 pt (iOS), 44×44 px (Web), 44×44 epx (Windows)
  - [ ] Focus order matches visual order; no focus traps; modal focus containment works
  - [ ] Dynamic Type / font scaling tested at maximum scale — no truncation or clipping
  - [ ] Reduced motion preference respected — animations replaced with cross-fades or static rendering
  - [ ] Keyboard navigation fully functional on Web (all features accessible without a mouse)
- [ ] **Automated accessibility CI passing** — axe-core (Web), Espresso Accessibility Checks (Android), XCUITest accessibility audit (iOS), Accessibility Insights (Windows) all green in CI.
- [ ] **CVD-safe palette verified** — Charts and status indicators distinguishable by pattern/texture, not color alone. Tested with color vision deficiency simulation tools.

---

## Privacy & Compliance

- [ ] **Privacy compliance verified** — Data practices documented and compliant with applicable regulations.
  - [ ] Privacy policy published and accessible from app store listings, onboarding flow, and in-app settings
  - [ ] Data collection inventory complete — every piece of data collected is documented with purpose, storage location, retention period, and legal basis
  - [ ] GDPR baseline applied globally — right to access, right to erasure (account deletion), data portability (export), and consent management
  - [ ] Account deletion flow verified — all user data (transactions, accounts, budgets, goals, profile) is permanently deleted from server and propagated to synced devices
  - [ ] Data export flow verified — users can export all their data in CSV and JSON formats
  - [ ] No third-party data sharing — financial data is not shared with advertisers, analytics providers, or data brokers
  - [ ] Analytics (if any) use privacy-preserving, first-party tooling — no user-level tracking without consent
- [ ] **Terms of service published** — available from app store listings and in-app settings.
- [ ] **Children's privacy** — app is not directed at children under 13; age gate or content rating configured appropriately for each app store.

---

## App Store Listings

- [ ] **App store listings ready** — all metadata prepared and validated for each distribution channel. See the [App Store Submission Guide](app-store-submission.md) for exact field values, character counts, and asset specs.
  - [ ] **Google Play Store**
    - [ ] App title, short description, full description finalized
    - [ ] Feature graphic (1024×500), icon (512×512), screenshots for phone and tablet
    - [ ] Content rating questionnaire completed
    - [ ] Data safety section filled out (encryption, data handling, deletion)
    - [ ] Target API level meets Google Play requirements
  - [ ] **Apple App Store**
    - [ ] App name, subtitle, description, keywords finalized
    - [ ] App icon (1024×1024), screenshots for iPhone, iPad, and Mac
    - [ ] App privacy nutrition labels completed (data types, usage, linking)
    - [ ] App Review notes prepared (demo account credentials if needed)
    - [ ] Export compliance answered (uses encryption: yes — SQLCipher AES-256)
  - [ ] **Microsoft Store**
    - [ ] App name, description, screenshots for desktop
    - [ ] MSIX package validated (passes Windows App Certification Kit)
    - [ ] Age rating questionnaire completed
    - [ ] Privacy policy URL configured
  - [ ] **Web (PWA)**
    - [ ] Landing page with download links to all app stores
    - [ ] `manifest.json` configured with correct name, icons, theme color, and start URL
    - [ ] Service worker provides offline fallback page

---

## Testing

- [ ] **Beta testing complete** — real users have tested the app on each platform and critical feedback has been addressed.
  - [ ] iOS: TestFlight beta with at least 10 testers, minimum 2-week testing period
  - [ ] Android: Internal/closed track with at least 10 testers, minimum 2-week testing period
  - [ ] Web: Preview deployment shared with testers, feedback collected
  - [ ] Windows: Flight ring with testers, feedback collected
  - [ ] Critical user flows validated by beta testers: onboarding, add account, add transaction, create budget, set goal, view reports, sync across devices, export data
  - [ ] Bug reports from beta triaged — all critical and high-severity bugs resolved
- [ ] **E2E tests passing** — Playwright (Web), XCUITest (iOS), Espresso (Android), WinAppDriver (Windows) all green on `main`.
- [ ] **Performance benchmarks passing** — all targets met per the [Performance Guide](performance.md): cold start < 2 s, scroll at 60 fps, SQLite aggregation < 100 ms, memory < 150 MB.
- [ ] **Cross-device sync tested** — data syncs correctly between all platform combinations (iOS ↔ Android, iOS ↔ Web, Android ↔ Windows, etc.). Offline → online transition works without data loss.

---

## Monitoring & Incident Response

- [ ] **Monitoring and alerting configured** — production systems have observability in place before users arrive.
  - [ ] Error tracking service configured (e.g., Sentry) for all four platforms — crashes and unhandled exceptions are captured with stack traces and device info
  - [ ] Backend health monitoring — Supabase database, auth, and Edge Functions monitored for uptime, latency, and error rates
  - [ ] PowerSync status monitored — sync latency, queue depth, and conflict rates tracked
  - [ ] Alerting rules configured — team is notified (email, Slack, or PagerDuty) when error rates or latency exceed thresholds
  - [ ] Uptime monitoring — external ping check on API and web endpoints (e.g., UptimeRobot, Pingdom)
- [ ] **Team trained on incident response** — the team knows what to do when something goes wrong.
  - [ ] Incident response runbook documented — who to contact, escalation path, communication templates
  - [ ] On-call rotation established (if applicable)
  - [ ] Rollback procedures reviewed — every team member knows how to roll back each platform (see [Rollback Procedures](release-process.md#rollback-procedures))
  - [ ] Post-incident review process defined — blameless retrospective template ready
  - [ ] Status page configured (if applicable) — users can check system status independently

---

## Documentation

- [ ] **User documentation published** — the [User Guide](../user-guide/README.md) is complete, accurate, and accessible from in-app help.
  - [ ] Getting started guide covers account creation, first account, first transaction
  - [ ] All features documented: accounts, transactions, budgeting, goals, reports, data management, settings
  - [ ] FAQ answers common questions: offline support, multi-device, security, sharing
- [ ] **Release workflows tested** — the [Release Process](release-process.md) has been executed end-to-end for each platform at least once.
  - [ ] Changeset → version PR → tag → release pipeline verified for Android, iOS, Web, and Windows
  - [ ] Hotfix process dry-run completed on at least one platform
  - [ ] Rollback procedure dry-run completed for Web (Vercel redeploy) and one mobile platform
- [ ] **Contributing guide current** — `.github/CONTRIBUTING.md` reflects the latest development workflow, commit conventions, and PR process.
- [ ] **Architecture Decision Records up to date** — all ADRs in `docs/architecture/` reflect current decisions. No "Pending" or "Draft" ADRs that should be "Accepted."

---

## Final Sign-Off

| Area                     | Reviewer       | Date         | Status |
| ------------------------ | -------------- | ------------ | ------ |
| Development (all phases) | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Security                 | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Accessibility            | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Privacy & Compliance     | _Name_         | _YYYY-MM-DD_ | ⬜     |
| App Store Listings       | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Testing                  | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Monitoring & Ops         | _Name_         | _YYYY-MM-DD_ | ⬜     |
| Documentation            | _Name_         | _YYYY-MM-DD_ | ⬜     |
| **Overall Go/No-Go**     | _Project Lead_ | _YYYY-MM-DD_ | ⬜     |

> **Launch criteria:** All rows above must show ✅ before the first public release. Any ⬜ or ❌ blocks launch. Exceptions require documented risk acceptance from the project lead.

---

## References

- [User Guide](../user-guide/README.md) — End-user documentation
- [Release Process](release-process.md) — Release workflows, versioning, hotfix, and rollback
- [App Store Submission Guide](app-store-submission.md) — Submission metadata, checklists, and field values
- [App Store Preparation Guide](app-store-preparation.md) — Developer account setup and store requirements
- [Performance Guide](performance.md) — Performance targets and benchmarking
- [Security Checklist](../audits/security-checklist.md) — OWASP MASVS L1 audit
- [Accessibility Checklist](../audits/accessibility-checklist.md) — WCAG 2.2 AA audit
- [System Architecture Roadmap](../architecture/roadmap.md) — Phase definitions and technology decisions
- [CI/CD Strategy (ADR-0006)](../architecture/0006-cicd-strategy.md) — Pipeline architecture
