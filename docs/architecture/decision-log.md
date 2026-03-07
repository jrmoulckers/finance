# Decision Log

Runtime decisions made during development that don't warrant a full [Architecture Decision Record](adr-template.md) but should be documented for future reference.

For significant architectural choices, see the numbered ADRs in this directory (e.g., [ADR-0001](0001-cross-platform-framework.md)). This log captures smaller, tactical decisions — the kind that come up during implementation and are easy to forget.

## How to Use This Log

- **Add new entries at the bottom** of the table to maintain chronological order.
- **Date** — The date the decision was made (not when it was documented).
- **Decision** — What was decided, stated as a fact.
- **Rationale** — Why this choice was made over alternatives.
- **Impact** — What downstream effects this decision has on the codebase or workflow.

## Decisions

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-03-05 | Use `generateAsync = true` for SQLDelight | Needed for KMP multiplatform coroutine support across all targets | Requires `NoOpSchema` wrapper for synchronous driver constructors (see [cheat sheet](../guides/workflow-cheatsheet.md#noopschema-for-platform-drivers)) |
| 2026-03-06 | Install JDK 21 (Temurin) for local development | Kotlin 2.1.0 doesn't support JDK 25; JDK 21 is the latest compatible LTS | `tools/gradle.js` auto-detects JDK 21 and configures Gradle accordingly |
| 2026-03-06 | All PRs target `main` independently | Stacked PRs caused complex rebase conflicts and blocked merges | PRs can be merged in any order with no inter-PR dependencies |
| 2026-03-06 | CI runs `jvmTest` only, not `allTests` | JS browser tests are flaky in ChromeHeadless due to timing sensitivity | Tracked in issue #173 for a proper fix using `TestClock` |
| 2026-03-06 | Issues close only via PR merge (`Closes #N`) | Premature manual closure broke the audit trail and GitHub project board tracking | Codified in workflow instructions and enforced by convention |
| 2026-03-06 | Use `npm install` over `npm ci` in CI | Lock file diverges across feature branches, causing `npm ci` failures | Slightly slower but resilient to concurrent branch development |
| 2026-03-07 | Windows app uses Compose Desktop (JVM target) | Maximum KMP code sharing — same Kotlin language, direct dependency on shared packages | Windows app shares business logic and data layer with mobile apps |
| 2026-03-07 | Pure-Kotlin SHA-256 for JS target | `require('crypto')` is unavailable in browser environments | `PlatformSHA256.js.kt` implements SHA-256 manually; JVM and Native targets use platform crypto |
| 2026-03-07 | Add `android-actions/setup-android@v3` to CI | Convention plugin applies `com.android.library` to all KMP modules, requiring Android SDK | All KMP CI jobs now include Android SDK setup even for non-Android tests |
| 2026-03-07 | iOS CI uses `swift build` not `xcodebuild` | Project uses `Package.swift` (SPM), not `.xcodeproj` | SPM-based build matches the project structure; no Xcode project file to maintain |

## See Also

- [ADR Template](adr-template.md) — For decisions that warrant full context, alternatives analysis, and consequences
- [Workflow Cheat Sheet](../guides/workflow-cheatsheet.md) — Quick-reference commands and patterns
- [SDLC](sdlc.md) — Full development lifecycle and methodology
