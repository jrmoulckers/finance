# ADR-0001: Cross-Platform Framework Selection

**Status:** Proposed
**Date:** 2025-07-17
**Author:** Copilot (AI agent), based on cross-platform research
**Reviewers:** Pending human review

## Context

The Finance app targets iOS (iPhone, iPad, Mac, watchOS), Android (phones, tablets, Wear OS), Web (PWA), and Windows 11. The project requires:

- **Native-first UX** — each platform must feel indistinguishable from a fully native app
- **Offline-first architecture** — all CRUD operations execute against a local database; sync is opportunistic
- **WCAG 2.2 AA accessibility** — mandated for all platforms
- **Monorepo structure** — shared business logic in `packages/`, platform apps in `apps/`
- **AI-developed** — primary development via GitHub Copilot agents; AI tooling quality matters
- **Financial-grade data handling** — integer cents, encrypted storage, complex aggregation queries
- **Wearable support** — companion apps on watchOS and Wear OS

The framework decision is foundational — it determines the language(s), build system, UI toolkit, local database strategy, and the shape of every package in the monorepo. Changing this decision later would require a near-complete rewrite.

### Forces at Play

1. **Native feel vs. development speed** — truly native UI per platform maximizes UX quality but increases per-platform code. Shared-UI frameworks reduce code but compromise platform fidelity.
2. **AI tooling quality** — TypeScript has the best Copilot accuracy (~85–90%), but Kotlin (~78–85%) and Swift are individually strong. Dart (~60–70%) lags significantly.
3. **Offline-first ecosystem** — the local database and sync strategy are tightly coupled to the framework choice. SQLDelight (KMP) and expo-sqlite (RN) represent fundamentally different approaches.
4. **Wearable coverage** — watchOS and Wear OS support eliminates some frameworks entirely.
5. **Long-term viability** — the framework must be actively maintained and growing for 5+ years.

## Decision

**Use Kotlin Multiplatform (KMP) for shared business logic with native UI per platform.**

- Shared Kotlin code in `commonMain` for business logic, domain models, data layer, and sync engine
- **SwiftUI** for iOS/iPadOS/macOS/watchOS UI
- **Jetpack Compose** for Android/Wear OS UI
- **Compose Multiplatform (Desktop)** for Windows 11
- **Compose for Web (Wasm)** or Kobweb for the web PWA target
- **SQLDelight** for the shared data layer (cross-platform type-safe SQL)
- **Ktor** for networking across all platforms

### Architecture Mapping

```
finance/
├── packages/
│   ├── core/              ← Kotlin commonMain: business logic, domain models
│   │   └── src/
│   │       ├── commonMain/    ← Shared Kotlin (expect declarations)
│   │       ├── androidMain/   ← Android actual declarations
│   │       ├── iosMain/       ← iOS actual declarations
│   │       ├── jvmMain/       ← Desktop (Windows) actual declarations
│   │       └── jsMain/        ← Web actual declarations
│   ├── models/            ← Kotlin commonMain: data classes, serialization
│   └── sync/              ← Kotlin commonMain: sync engine, conflict resolution
├── apps/
│   ├── ios/               ← SwiftUI app (imports packages/core as framework)
│   ├── android/           ← Jetpack Compose app (depends on packages/core)
│   ├── web/               ← Compose for Web / Kobweb
│   └── windows/           ← Compose Desktop (JVM target)
├── services/
│   └── api/               ← Ktor server (Kotlin) — thin sync coordination
└── tools/                 ← Gradle convention plugins, KSP processors
```

### Example: Shared Domain Model in commonMain

```kotlin
// packages/models/src/commonMain/kotlin/finance/models/Transaction.kt
import kotlinx.serialization.Serializable
import kotlinx.datetime.Instant

@Serializable
data class Transaction(
    val id: String,
    val accountId: String,
    val categoryId: String?,
    val amountCents: Long,          // Always integer cents — never floating point
    val currencyCode: String,       // ISO 4217 (e.g., "USD", "EUR")
    val description: String,
    val date: Instant,
    val type: TransactionType,
    val isReconciled: Boolean = false,
    // Sync metadata
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null, // Soft delete
    val syncVersion: Long = 0,
)

enum class TransactionType {
    INCOME, EXPENSE, TRANSFER
}
```

### Example: Platform-Specific Implementation (expect/actual)

```kotlin
// packages/core/src/commonMain/kotlin/finance/platform/SecureStorage.kt
expect class SecureStorage {
    fun store(key: String, value: String)
    fun retrieve(key: String): String?
    fun delete(key: String)
}

// packages/core/src/androidMain/kotlin/finance/platform/SecureStorage.kt
actual class SecureStorage(private val context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        "finance_secure_prefs",
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    actual fun store(key: String, value: String) = prefs.edit().putString(key, value).apply()
    actual fun retrieve(key: String): String? = prefs.getString(key, null)
    actual fun delete(key: String) = prefs.edit().remove(key).apply()
}

// packages/core/src/iosMain/kotlin/finance/platform/SecureStorage.kt
actual class SecureStorage {
    actual fun store(key: String, value: String) {
        // iOS Keychain via Security framework interop
        val query = mapOf(
            kSecClass to kSecClassGenericPassword,
            kSecAttrAccount to key,
            kSecValueData to value.encodeToByteArray().toNSData()
        )
        SecItemAdd(query.toCFDictionary(), null)
    }
    // ...
}
```

## Alternatives Considered

### Alternative 1: React Native / Expo

React Native with Expo is the most popular cross-platform framework, using a single TypeScript codebase with native UI bridges.

- **Pros:**
  - **Best AI tooling support** — TypeScript is Copilot's #1 language with ~85–90% accuracy
  - **Largest community** — massive npm ecosystem, thousands of libraries, battle-tested at Coinbase, Bloomberg, Shopify
  - **Single language** — TypeScript across all platforms minimizes context switching for AI agents
  - **Excellent monorepo support** — Turborepo/nx/pnpm workspaces; aligns with existing `package.json` root
  - **Strong offline-first options** — WatermelonDB, expo-sqlite, Drizzle ORM, PowerSync SDK
  - **Fastest to MVP** — lowest initial development effort, most developers available

- **Cons:**
  - **No watchOS or Wear OS support** — hard gap; no official or community solution exists
  - **Windows requires ejecting from Expo** — `react-native-windows` is community-maintained, not in Expo managed workflow; loses the primary advantage of Expo
  - **Not truly native** — bridge-based architecture; JavaScript thread ↔ native thread communication adds overhead for complex animations and interactions
  - **Web output feels web-like** — `react-native-web` output is styled div/span elements, not a native-feeling PWA
  - **Platform coverage: 5/10** — missing wearables entirely, Windows is second-class

- **Why rejected:** watchOS/Wear OS are project requirements. Windows support requires ejecting from Expo, losing the managed workflow. While TypeScript AI tooling is superior, the platform coverage gaps are disqualifying for a project targeting 6+ platform targets.

### Alternative 2: Flutter

Flutter uses a single Dart codebase with a custom rendering engine (Impeller/Skia) that draws every pixel.

- **Pros:**
  - **Pixel-perfect consistency** — same rendering on every platform; excellent for financial dashboards and charts
  - **Strong platform coverage (7/10)** — stable on iOS, Android, Web (Wasm), Windows, macOS, Linux
  - **Excellent performance** — Impeller engine delivers 60fps+; Wasm web compilation is 2–3x faster than JS
  - **Large community (9/10)** — 2M+ developers, Google-backed, strong enterprise adoption (Nubank, Google Pay, BMW)
  - **Drift ORM** — type-safe, reactive SQLite wrapper with excellent migration support

- **Cons:**
  - **Not native-first** — custom rendering means apps look and feel "Flutter-ish," not like native platform apps; violates the project's "native-first" principle
  - **Weakest AI tooling (6/10)** — Dart has the least Copilot training data and lowest accuracy (~60–70%) among the four frameworks evaluated
  - **Accessibility requires extra effort (6/10)** — custom rendering means every widget needs manual `Semantics` annotations; WCAG compliance is achievable but costly
  - **No wearable support** — watchOS and Wear OS are experimental/community-driven at best
  - **Monorepo tooling is less mature** — `melos` works but is less ergonomic than Gradle or npm workspaces

- **Why rejected:** The "native-first" requirement is non-negotiable. Flutter's custom rendering engine, while performant, produces UIs that don't match platform conventions (scrolling physics, navigation patterns, system dialogs). The lowest AI tooling accuracy among all options is a significant productivity drag for an AI-developed project. No wearable support compounds the issue.

### Alternative 3: .NET MAUI

.NET MAUI (Multi-platform App UI) is Microsoft's cross-platform framework using C#/XAML with native UI controls.

- **Pros:**
  - **Strong C# AI support (8/10)** — Copilot C# accuracy is ~80–87%; excellent Visual Studio integration
  - **Best Windows desktop experience** — WinUI 3 integration is first-class; ideal for Windows-first apps
  - **Native UI controls** — uses platform handlers, similar to KMP's approach
  - **Mature .NET ecosystem** — Entity Framework Core, strong LINQ support, dependency injection patterns

- **Cons:**
  - **No web deployment** — Blazor Hybrid embeds web content inside a native shell; it is **not** a standalone PWA and cannot be deployed as a web app. This is a dealbreaker for the project's web target.
  - **No wearable support** — watchOS and Wear OS are not on the roadmap
  - **Smallest community (5/10)** — lower community confidence than RN/Flutter/KMP; mixed sentiment on GitHub Discussions about bugs and regressions
  - **Mobile performance concerns** — Android/iOS performance still lags behind truly native apps; .NET 10 promises AOT improvements but they're not proven yet
  - **Platform coverage: 4/10** — lowest coverage score; missing web, watchOS, Wear OS
  - **Doesn't integrate with existing repo** — MSBuild doesn't integrate with the existing `package.json` root

- **Why rejected:** No true web deployment is disqualifying. Combined with missing wearable support, the smallest community, and mobile performance concerns, MAUI has the weakest overall fit (55/90 in weighted scoring vs. KMP's 80/90).

## Consequences

### Positive

- **Truly native UI on every platform** — SwiftUI, Jetpack Compose, and Compose Desktop produce UIs indistinguishable from fully native apps. Users get the exact platform experience they expect (navigation patterns, scrolling physics, system dialogs, haptics).
- **Best-in-class accessibility** — native UI widgets inherit the full accessibility stack of each platform (VoiceOver, TalkBack, Windows Narrator). WCAG 2.2 AA compliance comes from the platform, not from framework workarounds.
- **Financial-grade data layer** — SQLDelight was literally built by Cash App (a financial app) for KMP. Type-safe SQL with integer arithmetic, complex aggregations, and encrypted storage via SQLCipher. See ADR-0003 for details.
- **Wearable coverage** — Wear OS is fully supported via the Android/JVM target. watchOS logic sharing works via KMP with native SwiftUI UI. No other cross-platform framework covers both.
- **Monorepo maps perfectly** — KMP's source set structure (`commonMain`, `androidMain`, `iosMain`, `jvmMain`, `jsMain`) maps directly to the project's `packages/` + `apps/` layout. Gradle multimodule projects are designed for this exact pattern.
- **Financial pedigree** — Cash App, Google Docs, Shopify, Netflix, and H&M all use KMP in production. Cash App created SQLDelight for exactly the offline-first financial use case this project requires.
- **Shared business logic is 100% Kotlin** — the most complex code (models, sync engine, validation, financial calculations) lives in one language. Platform-specific code is limited to UI and platform integrations (~20–30% of total code).

### Negative

- **Must maintain UI code per platform** — SwiftUI, Jetpack Compose, Compose Desktop, and Compose for Web are four distinct UI implementations. This is the primary cost of native-first: more code surface area.
- **Multi-language complexity** — AI agents and developers must work across Kotlin, Swift, and potentially HTML/CSS for the web target. Context switching between languages adds friction.
- **KMP expertise is less common** — fewer developers know KMP compared to React Native or Flutter. Hiring and onboarding have a higher bar.
- **Compose for Web is still in beta** — the web PWA target carries risk. Kotlin/Wasm is stable for logic but Compose for Web UI rendering is not yet production-proven at scale.
- **Gradle build system complexity** — Gradle multimodule projects with KMP require careful configuration. Build times can be long, and Gradle's learning curve is steep.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Compose for Web beta stability | Medium | Start with core mobile/desktop targets; web can ship slightly later. Alternatively, use Kobweb (Kotlin/JS + HTML/CSS) or a thin TypeScript PWA that calls KMP-compiled JS modules. |
| watchOS KMP support is beta | Low | watchOS companion app has limited scope (complications, quick glance). Use native Swift with a thin KMP logic bridge for shared models. |
| Multi-language AI agent complexity | Medium | Configure custom Copilot agents per platform (`@ios-agent` for SwiftUI, `@android-agent` for Compose). Each UI language is individually well-supported by Copilot. Shared Kotlin core reduces total platform-specific surface to ~20–30%. |
| Smaller community than RN/Flutter | Low | JetBrains + Google dual backing ensures long-term viability. Google officially recommends KMP for shared logic. Ecosystem is growing rapidly (Jetpack libraries now support KMP). |
| Gradle build time | Medium | Use Gradle build cache, configuration cache, and remote build caching. Modularize to enable incremental builds. CI can parallelize platform builds. |

## Implementation Notes

### Package Structure

| Package | Source Sets | Purpose |
|---------|-----------|---------|
| `packages/core` | `commonMain`, `androidMain`, `iosMain`, `jvmMain`, `jsMain` | Business logic, domain services, validation, financial calculations |
| `packages/models` | `commonMain` (primarily) | Data classes, serialization (kotlinx.serialization), enums |
| `packages/sync` | `commonMain`, platform actuals for networking | Sync engine, conflict resolution, delta sync protocol |
| `apps/android` | Android app module | Jetpack Compose UI, Android-specific integrations |
| `apps/ios` | Xcode project | SwiftUI app that imports KMP framework via SPM or CocoaPods |
| `apps/web` | Kotlin/JS or Kotlin/Wasm | Compose for Web or Kobweb frontend |
| `apps/windows` | JVM Desktop module | Compose Desktop app targeting Windows 11 |

### Build System

- **Gradle** with Kotlin DSL (`build.gradle.kts`)
- **Gradle Version Catalog** (`libs.versions.toml`) for centralized dependency management
- **Convention plugins** in `tools/` for shared build configuration
- **KSP** (Kotlin Symbol Processing) for code generation (serialization, SQLDelight)

### Key Dependencies

```kotlin
// gradle/libs.versions.toml
[versions]
kotlin = "2.1.0"
kmp = "2.1.0"
compose-multiplatform = "1.7.0"
sqldelight = "2.1.0"
ktor = "3.1.0"
kotlinx-serialization = "1.7.0"
kotlinx-coroutines = "1.9.0"
kotlinx-datetime = "0.6.0"

[libraries]
sqldelight-runtime = { module = "app.cash.sqldelight:runtime", version.ref = "sqldelight" }
sqldelight-coroutines = { module = "app.cash.sqldelight:coroutines-extensions", version.ref = "sqldelight" }
sqldelight-android-driver = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-native-driver = { module = "app.cash.sqldelight:native-driver", version.ref = "sqldelight" }
sqldelight-jvm-driver = { module = "app.cash.sqldelight:sqlite-driver", version.ref = "sqldelight" }
sqldelight-js-driver = { module = "app.cash.sqldelight:web-worker-driver", version.ref = "sqldelight" }
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
ktor-client-content-negotiation = { module = "io.ktor:ktor-client-content-negotiation", version.ref = "ktor" }
ktor-serialization-json = { module = "io.ktor:ktor-serialization-kotlinx-json", version.ref = "ktor" }
```

## References

- [JetBrains KMP Roadmap (August 2025)](https://blog.jetbrains.com/kotlin/2025/08/kotlin-multiplatform-development-roadmap-for-2025/)
- [Google Android Developers: Share business logic with KMP](https://developer.android.com/kotlin/multiplatform)
- [SQLDelight documentation](https://cashapp.github.io/sqldelight/)
- [Compose Multiplatform](https://www.jetbrains.com/lp/compose-multiplatform/)
- [Cash App KMP case study](https://code.cash.app/)
- [Kotlin Multiplatform for Mobile (KMM) by JetBrains](https://kotlinlang.org/docs/multiplatform.html)
- Research: `research-cross-platform.md` (project research document, 2025)
