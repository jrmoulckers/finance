# Architecture Diagrams — Finance Monorepo

This document contains Mermaid diagrams for all major system components. These diagrams are the canonical visual reference for understanding how the Finance application is structured.

> **Rendering:** GitHub, VS Code (with Mermaid extension), and most Markdown viewers render these diagrams automatically. If your viewer doesn't render Mermaid, use the [Mermaid Live Editor](https://mermaid.live/).

---

## Table of Contents

- [1. High-Level System Architecture](#1-high-level-system-architecture)
- [2. Data Flow — Transaction Lifecycle](#2-data-flow--transaction-lifecycle)
- [3. Sync Architecture](#3-sync-architecture)
- [4. Platform Integration Map](#4-platform-integration-map)
- [5. Monorepo Package Dependencies](#5-monorepo-package-dependencies)
- [6. Authentication Flow](#6-authentication-flow)
- [7. CI/CD Pipeline](#7-cicd-pipeline)
- [8. AI Agent Fleet Architecture](#8-ai-agent-fleet-architecture)

---

## 1. High-Level System Architecture

The edge-first architecture: most logic and storage is on-device. The backend is a thin coordination layer for sync and auth.

```mermaid
graph TB
    subgraph Clients["Client Platforms"]
        direction LR
        Android["📱 Android<br/>Jetpack Compose"]
        iOS["🍎 iOS<br/>SwiftUI"]
        Web["🌐 Web PWA<br/>React + TS"]
        Windows["🖥️ Windows<br/>Compose Desktop"]
    end

    subgraph SharedKMP["Shared KMP Layer"]
        direction LR
        Core["Core Logic<br/>packages/core"]
        Models["Data Models<br/>packages/models"]
        Sync["Sync Engine<br/>packages/sync"]
    end

    subgraph LocalStorage["On-Device Storage"]
        direction LR
        SQLite["SQLDelight<br/>+ SQLCipher"]
        SecureStore["Platform Keystore<br/>Keys & Tokens"]
    end

    subgraph Backend["Cloud Backend"]
        direction LR
        Supabase["Supabase<br/>PostgreSQL + Auth"]
        PowerSync["PowerSync<br/>Delta Sync"]
        EdgeFn["Edge Functions<br/>Deno Runtime"]
    end

    Android --> Core
    iOS --> Core
    Web --> Core
    Windows --> Core

    Core --> Models
    Core --> Sync
    Models --> SQLite
    Core --> SecureStore

    Sync <-->|"Delta Protocol<br/>(encrypted)"| PowerSync
    PowerSync <--> Supabase
    EdgeFn --> Supabase

    Android -.->|"API calls"| EdgeFn
    iOS -.->|"API calls"| EdgeFn
    Web -.->|"API calls"| EdgeFn
    Windows -.->|"API calls"| EdgeFn
```

---

## 2. Data Flow — Transaction Lifecycle

How a financial transaction moves from user input through local storage, sync, and multi-device propagation.

```mermaid
sequenceDiagram
    participant User
    participant UI as Platform UI
    participant Core as Core Logic (KMP)
    participant DB as Local SQLite
    participant Queue as Mutation Queue
    participant Sync as Sync Engine
    participant PS as PowerSync
    participant SB as Supabase (PostgreSQL)
    participant Other as Other Devices

    User->>UI: Add transaction ($19.99)
    UI->>Core: createTransaction(1999L, "Groceries")
    Core->>Core: Validate & categorize
    Core->>DB: INSERT (encrypted via SQLCipher)
    DB-->>UI: Update UI immediately

    Core->>Queue: Enqueue mutation

    Note over Sync,PS: Background sync (when online)

    Queue->>Sync: Next pending mutation
    Sync->>PS: Push delta (encrypted payload)
    PS->>SB: Apply via RLS-checked write
    SB->>SB: Enforce row-level security
    SB-->>PS: Confirm + distribute
    PS-->>Other: Push delta to other devices
    Other->>Other: Apply to local SQLite
```

---

## 3. Sync Architecture

The offline-first sync pipeline with conflict resolution.

```mermaid
graph TD
    subgraph Client["Client Device"]
        LocalDB["Local SQLite<br/>(SQLCipher encrypted)"]
        MutQueue["Mutation Queue<br/>(pending changes)"]
        SyncEngine["Sync Engine<br/>(packages/sync)"]
        ConflictRes["Conflict Resolver<br/>(strategy-based)"]
    end

    subgraph Cloud["Cloud Sync Layer"]
        PSClient["PowerSync Client"]
        PSServer["PowerSync Server"]
        SupaDB["Supabase PostgreSQL"]
        RLS["Row-Level Security"]
    end

    LocalDB -->|"Track changes"| MutQueue
    MutQueue -->|"Dequeue"| SyncEngine
    SyncEngine -->|"Push deltas"| PSClient
    PSClient <-->|"Bidirectional sync"| PSServer
    PSServer <-->|"Read/Write"| SupaDB
    SupaDB -->|"Enforce"| RLS

    PSClient -->|"Pull remote changes"| SyncEngine
    SyncEngine -->|"Detect conflicts"| ConflictRes

    ConflictRes -->|"LWW<br/>(simple fields)"| LocalDB
    ConflictRes -->|"Field-level merge<br/>(complex: budgets, goals)"| LocalDB

    style ConflictRes fill:#ff9,stroke:#333
```

### Conflict Resolution Strategies

| Data Type         | Strategy                 | Rationale                                     |
| ----------------- | ------------------------ | --------------------------------------------- |
| Simple fields     | Last-Write-Wins (LWW)    | Timestamps determine the winner               |
| Budgets & goals   | Field-level merge        | Each field resolves independently             |
| Household data    | Field-level merge + RBAC | Role-based access controls who can write what |
| Transaction edits | LWW per field            | Individual field timestamps                   |
| Deletes           | Soft-delete + tombstone  | Prevents resurrection of deleted records      |

---

## 4. Platform Integration Map

How each platform integrates with the shared KMP layer and uses platform-native capabilities.

```mermaid
graph LR
    subgraph KMP["Shared KMP (Kotlin Multiplatform)"]
        CoreAPI["Core API<br/>(business logic)"]
        ModelsAPI["Data Models<br/>(SQLDelight)"]
        SyncAPI["Sync API<br/>(PowerSync client)"]
    end

    subgraph AndroidPlatform["Android"]
        AUI["Jetpack Compose UI"]
        AKoin["Koin DI"]
        AKeystore["Android Keystore"]
        ABio["BiometricPrompt"]
        ATalk["TalkBack a11y"]
    end

    subgraph iOSPlatform["iOS"]
        IUI["SwiftUI Views"]
        IExport["Swift Export / SKIE"]
        IKeychain["Apple Keychain"]
        IBio["Face ID / Touch ID"]
        IVoice["VoiceOver a11y"]
    end

    subgraph WebPlatform["Web PWA"]
        WUI["React + TypeScript"]
        WASM["Kotlin/JS or WASM"]
        WCrypto["Web Crypto API"]
        WSW["Service Worker"]
        WARIA["ARIA a11y"]
    end

    subgraph WinPlatform["Windows"]
        WnUI["Compose Desktop"]
        WnKoin["Koin DI"]
        WnHello["Windows Hello"]
        WnDPAPI["DPAPI Storage"]
        WnNarr["Narrator a11y"]
    end

    CoreAPI --> AUI
    CoreAPI -->|"Swift Export"| IUI
    CoreAPI -->|"Kotlin/JS"| WUI
    CoreAPI --> WnUI

    AUI --> AKoin
    AUI --> AKeystore
    AUI --> ABio
    AUI --> ATalk

    IUI --> IExport
    IUI --> IKeychain
    IUI --> IBio
    IUI --> IVoice

    WUI --> WASM
    WUI --> WCrypto
    WUI --> WSW
    WUI --> WARIA

    WnUI --> WnKoin
    WnUI --> WnHello
    WnUI --> WnDPAPI
    WnUI --> WnNarr
```

---

## 5. Monorepo Package Dependencies

Build dependency graph for the monorepo packages.

```mermaid
graph TD
    subgraph Packages["packages/"]
        Core["core<br/>(business logic)"]
        Models["models<br/>(data models, schemas)"]
        SyncPkg["sync<br/>(sync engine)"]
        Tokens["design-tokens<br/>(DTCG → platform outputs)"]
    end

    subgraph Apps["apps/"]
        AApp["android"]
        IApp["ios"]
        WApp["web"]
        WnApp["windows"]
    end

    subgraph Services["services/"]
        API["api<br/>(Supabase project)"]
    end

    subgraph BuildTools["Build Infrastructure"]
        Gradle["Gradle + KMP"]
        Turbo["Turborepo"]
        SD["Style Dictionary"]
    end

    Models --> Core
    Core --> SyncPkg

    Core --> AApp
    Core --> IApp
    Core --> WApp
    Core --> WnApp

    Tokens -->|"CSS"| WApp
    Tokens -->|"Swift"| IApp
    Tokens -->|"Android XML"| AApp
    Tokens -->|"XAML"| WnApp

    SyncPkg -->|"PowerSync client"| API

    Gradle -->|"builds"| Core
    Gradle -->|"builds"| Models
    Gradle -->|"builds"| SyncPkg
    Turbo -->|"orchestrates"| AApp
    Turbo -->|"orchestrates"| WApp
    SD -->|"transforms"| Tokens
```

---

## 6. Authentication Flow

Multi-factor authentication with passkeys as primary and OAuth as fallback.

```mermaid
sequenceDiagram
    participant User
    participant App as Client App
    participant Bio as Biometric<br/>(Face ID / Fingerprint / Hello)
    participant KS as Platform Keystore<br/>(Keychain / Keystore / DPAPI)
    participant Auth as Supabase Auth
    participant DB as PostgreSQL + RLS

    Note over User,DB: First-time registration
    User->>App: Create account
    App->>Auth: Register (email or social)
    Auth-->>App: JWT + refresh token
    App->>KS: Store tokens securely
    App->>Bio: Register biometric for local unlock

    Note over User,DB: Subsequent logins
    User->>App: Open app
    App->>Bio: Request biometric verification
    Bio-->>App: Verified ✅
    App->>KS: Retrieve stored JWT

    alt Token valid
        App->>DB: Access data (RLS enforces tenant isolation)
    else Token expired
        App->>Auth: Refresh token
        Auth-->>App: New JWT
        App->>KS: Store new token
        App->>DB: Access data
    end

    Note over User,DB: Passkey authentication (WebAuthn/FIDO2)
    User->>App: Login with passkey
    App->>Auth: WebAuthn challenge
    Auth-->>App: Challenge nonce
    App->>Bio: Sign challenge with device key
    Bio-->>App: Signed assertion
    App->>Auth: Verify assertion
    Auth-->>App: JWT + refresh token
```

---

## 7. CI/CD Pipeline

GitHub Actions workflow triggered by pull requests.

```mermaid
graph TD
    subgraph Trigger["PR Event"]
        PR["Pull Request<br/>opened / updated"]
    end

    subgraph CI["CI Workflows (GitHub Actions)"]
        PRTitle["PR Title Check<br/>(conventional commit)"]

        subgraph SharedCI["CI — Shared Packages"]
            KMPBuild["KMP Build<br/>(Gradle)"]
            KMPTest["KMP JVM Tests"]
        end

        subgraph WebCI["Web CI"]
            WebBuild["Web Build<br/>(Turbo + Vite)"]
            WebTest["Web Tests"]
        end

        subgraph LintFmt["Lint & Format"]
            ESLint["ESLint"]
            Prettier["Prettier"]
            Ktlint["Ktlint"]
        end
    end

    subgraph Protection["Branch Protection"]
        AllGreen["All checks green?"]
        Review["Human review<br/>approved?"]
        Merge["Merge to main"]
    end

    PR --> PRTitle
    PR --> KMPBuild
    PR --> WebBuild
    PR --> ESLint

    KMPBuild --> KMPTest
    WebBuild --> WebTest
    ESLint --> Prettier
    Prettier --> Ktlint

    KMPTest --> AllGreen
    WebTest --> AllGreen
    Ktlint --> AllGreen
    PRTitle --> AllGreen

    AllGreen -->|"✅ Yes"| Review
    AllGreen -->|"❌ No"| PR
    Review -->|"✅ Approved"| Merge
```

---

## 8. AI Agent Fleet Architecture

How AI agents are organized, dispatched, and coordinated in fleet mode.

```mermaid
graph TD
    subgraph Orchestrator["Fleet Orchestrator"]
        Analyze["1. Analyze task"]
        Assign["2. Assign subtasks"]
        Monitor["4. Monitor health"]
    end

    subgraph Fleet["Agent Fleet (parallel execution)"]
        KMP["@kmp-engineer<br/>packages/"]
        Android["@android-engineer<br/>apps/android/"]
        iOS["@ios-engineer<br/>apps/ios/"]
        Web["@web-engineer<br/>apps/web/"]
        Win["@windows-engineer<br/>apps/windows/"]
        Backend["@backend-engineer<br/>services/api/"]
        Docs["@docs-writer<br/>docs/"]
    end

    subgraph Worktrees["Git Worktrees (isolated)"]
        WT1["wt-kmp-feat-X-601"]
        WT2["wt-android-feat-X-602"]
        WT3["wt-ios-feat-X-603"]
        WT4["wt-web-feat-X-604"]
        WT5["wt-windows-feat-X-605"]
        WT6["wt-backend-feat-X-606"]
        WT7["wt-docs-feat-X-607"]
    end

    subgraph PRs["Pull Requests (independent CI)"]
        PR1["PR #610"]
        PR2["PR #611"]
        PR3["PR #612"]
        PR4["PR #613"]
        PR5["PR #614"]
        PR6["PR #615"]
        PR7["PR #616"]
    end

    Human["👤 Human Review<br/>& Merge"]

    Analyze --> Assign
    Assign --> KMP & Android & iOS & Web & Win & Backend & Docs

    KMP --> WT1 --> PR1
    Android --> WT2 --> PR2
    iOS --> WT3 --> PR3
    Web --> WT4 --> PR4
    Win --> WT5 --> PR5
    Backend --> WT6 --> PR6
    Docs --> WT7 --> PR7

    PR1 & PR2 & PR3 & PR4 & PR5 & PR6 & PR7 --> Monitor
    Monitor --> Human

    style Human fill:#ffd,stroke:#333
```

### Fleet Coordination Rules (Visual)

```mermaid
graph LR
    subgraph Rules["Mandatory Rules"]
        R1["1️⃣ One file,<br/>one agent"]
        R2["2️⃣ Shared config =<br/>single owner"]
        R3["3️⃣ Schema changes<br/>serialized"]
        R4["4️⃣ Last agent runs<br/>integration check"]
        R5["5️⃣ Never guess<br/>on financial logic"]
        R6["6️⃣ Each agent monitors<br/>its own PR"]
    end
```

---

## Diagram Maintenance

When updating these diagrams:

1. Modify this file (`docs/architecture/diagrams.md`)
2. Verify diagrams render correctly in the [Mermaid Live Editor](https://mermaid.live/)
3. Update `docs/architecture/overview.md` if the high-level architecture diagram changes
4. Commit with: `docs(architecture): update [diagram-name] diagram (#N)`

If a diagram becomes outdated because of a code change, file a pain point in [pain-points.md](../ai/pain-points.md) with category "Documentation."

---

_Last updated: 2025-07-27. Maintained by `@docs-writer`._
