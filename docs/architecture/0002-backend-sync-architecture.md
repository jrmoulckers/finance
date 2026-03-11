# ADR-0002: Backend & Sync Architecture

**Status:** Accepted
**Date:** 2025-07-17
**Author:** Copilot (AI agent), based on backend/sync research
**Reviewers:** Pending human review

## Context

The Finance app follows an **edge-first, offline-first** architecture as described in the project's skill files:

- **All CRUD operations execute against the local database first** — the app must be fully functional without network connectivity
- **Sync is opportunistic** — changes replicate to the server when connectivity is available
- **Conflict resolution** — Last-Write-Wins (LWW) with vector clocks for simple fields; CRDTs or operational transforms for complex shared data (budgets, shared household items)
- **Delta sync** — monotonic sequence numbers per client; only changed records sync
- **Soft deletes** — synced records are never hard-deleted
- **Idempotent operations** — all sync operations must be safe to retry
- **Privacy-first** — financial data encrypted at rest and in transit; server should ideally never see plaintext
- **Multi-user** — household/family/partner account sharing with fine-grained access control
- **Background sync** — platform-native background task APIs for periodic sync
- **Minimal server cost** — thin backend, low operational overhead (Signal/Bevel model)

The backend must serve as a **thin sync coordination layer**, not a traditional application server. Business logic lives on the client. The server's responsibilities are limited to: receiving and storing encrypted sync payloads, authenticating users, enforcing access control, and relaying changes between devices.

### Key Constraints

- Must support PostgreSQL (relational data model required for financial queries)
- Must support self-hosting as an escape hatch from managed services
- Must provide authentication with social login (Google, Apple) and email/password
- Must scale to 100K+ users without architectural changes
- Open-source alignment preferred to reduce vendor lock-in
- Engineering cost matters — a solo/small-team project cannot afford 6–12 months building sync infrastructure

## Decision

**Use Supabase (PostgreSQL + Auth + Edge Functions) as the backend database and auth layer, paired with PowerSync as the offline-first sync engine.**

This is a **layered architecture** where each component handles what it does best:

```
┌──────────────────────────────┐
│        Client Device          │
│                               │
│  ┌─────────────────────────┐  │
│  │  Local SQLite            │  │
│  │  (SQLCipher encrypted)   │  │  All reads/writes happen here
│  │  via SQLDelight          │  │
│  └────────────┬─────────────┘  │
│               │                │
│  ┌────────────▼─────────────┐  │
│  │  PowerSync SDK           │  │  Manages sync queue, delta sync,
│  │  (sync client)           │  │  reconnection, selective replication
│  └────────────┬─────────────┘  │
└───────────────┼────────────────┘
                │ WebSocket / HTTPS
                │ (TLS encrypted)
┌───────────────▼────────────────┐
│  PowerSync Service              │
│  (managed cloud or self-hosted) │  Sync coordination, change streaming,
│  Reads from PostgreSQL via      │  selective sync rules
│  logical replication            │
└───────────────┬─────────────────┘
                │ PostgreSQL logical replication
┌───────────────▼────────────────┐
│  Supabase                       │
│  ┌─────────────┐               │
│  │ PostgreSQL   │ ← Source of truth (server-side)
│  │ + RLS        │ ← Row-level security for multi-tenant access
│  │ + pgcrypto   │ ← Optional server-side field encryption
│  ├─────────────┤               │
│  │ Auth         │ ← Email, social, phone OTP, JWT
│  ├─────────────┤               │
│  │ Edge Fns     │ ← Webhooks, notifications, data processing
│  ├─────────────┤               │
│  │ Storage      │ ← Receipt images, document attachments
│  └─────────────┘               │
└─────────────────────────────────┘
```

### Why Two Services?

Supabase and PowerSync solve **different problems**:

| Responsibility            | Supabase                              | PowerSync                            |
| ------------------------- | ------------------------------------- | ------------------------------------ |
| Database (PostgreSQL)     | ✅ Managed PostgreSQL with extensions | —                                    |
| Authentication            | ✅ Email, social, phone OTP, JWT      | — (integrates with Supabase Auth)    |
| Offline-first sync        | ❌ No offline support                 | ✅ Purpose-built sync engine         |
| Delta sync & reconnection | ❌                                    | ✅ Automatic, battle-tested          |
| Selective replication     | ❌                                    | ✅ Sync only authorized data subsets |
| Conflict resolution       | ❌                                    | ✅ Developer-defined handlers        |
| Row-level security        | ✅ PostgreSQL RLS                     | — (enforced at DB level)             |
| Serverless functions      | ✅ Edge Functions (Deno)              | —                                    |
| File storage              | ✅ S3-compatible                      | —                                    |

Neither service alone meets all requirements. Together, they provide a complete backend with minimal custom code.

## Alternatives Considered

### Alternative 1: Firebase (Firestore + Cloud Functions + Auth)

Google's fully managed Backend-as-a-Service with built-in offline persistence.

- **Pros:**
  - **Best out-of-box offline experience** — Firestore SDK caches data locally and syncs automatically on reconnect on iOS, Android, and Web
  - **Zero sync code** — offline persistence, automatic reconnection, and change replay are built into the SDK
  - **Strongest multi-platform SDKs** — iOS, Android, Web, Flutter, Unity, React Native (via React Native Firebase)
  - **Comprehensive auth** — email, social, phone, MFA, anonymous auth
  - **Best compliance certifications** — SOC 1/2/3, ISO 27001, HIPAA (with BAA), GDPR

- **Cons:**
  - **Proprietary and high vendor lock-in** — no self-hosting option; Firestore's NoSQL document data model is not portable to any other database
  - **NoSQL data model is wrong for financial data** — no JOINs, no complex aggregations, no `SUM(amount) WHERE category = ? AND date BETWEEN ? AND ?`. Financial reporting requires relational queries that Firestore cannot express
  - **Unpredictable costs at scale** — $0.06/100K reads, $0.18/100K writes. Financial apps with frequent transaction reads and listeners can generate very high read volumes. Estimated $500–$2,000+/mo at 100K users
  - **Offline cache is not encrypted** — local Firestore cache stores financial data in plaintext on-device by default. No SQLCipher equivalent.
  - **LWW-only conflict resolution** — no vector clocks, CRDTs, or custom merge strategies without significant application-level code
  - **No E2E encryption** — cannot implement zero-knowledge architecture at the infrastructure level
  - **Migration away requires re-architecture** — switching from Firestore requires replacing the entire data model, queries, and sync logic

- **Why rejected:** Proprietary nature, NoSQL data model incompatibility with financial domain requirements, unencrypted local cache, unpredictable costs at scale, and inability to self-host are collectively disqualifying. The project's privacy-first and open-source alignment principles conflict fundamentally with Firebase's model.

### Alternative 2: Custom Backend (Node.js/Deno + PostgreSQL)

Build a bespoke thin sync layer with custom delta sync protocol, CRDT-based conflict resolution (Automerge/Yjs), and WebSocket real-time streaming.

- **Pros:**
  - **Maximum flexibility** — can implement exactly the delta sync protocol described in the project skills (monotonic sequence numbers, checksum verification, full re-sync recovery)
  - **Zero vendor lock-in** — standard PostgreSQL, standard protocols, you own every line of code
  - **Full E2E encryption** — can implement zero-knowledge architecture where the server never sees plaintext financial data
  - **Lowest marginal cost at scale** — infrastructure only ($200–$500/mo at 100K users); no per-read/write/MAU charges
  - **Any conflict resolution strategy** — LWW, vector clocks, CRDTs (Automerge, Yjs), OT, or custom merge logic

- **Cons:**
  - **Massive engineering effort** — 6–12+ months for a production-grade sync engine. Must handle: interrupted sync recovery, schema migrations during sync, large dataset initial sync, network partitions, and clock skew
  - **Must build SDKs for each platform** — iOS, Android, Web, Windows sync clients must be written and maintained
  - **High risk of sync bugs** — sync and conflict resolution are among the hardest distributed systems problems. Bugs in financial data sync have severe consequences (duplicate transactions, lost data, incorrect balances)
  - **Auth must be built or integrated** — Lucia Auth, NextAuth, Passport.js, or custom JWT implementation adds another surface area
  - **No compliance certifications** — SOC 2, HIPAA, etc. require separate pursuit
  - **Engineering cost is 10–50x higher** than adopting existing sync infrastructure

- **Why rejected:** The engineering investment is disproportionate to the value. Production-grade sync is a solved problem — PowerSync, ElectricSQL, and others exist specifically so that application developers don't need to build sync infrastructure. The risk of sync bugs corrupting financial data is unacceptable for a small team. Building sync is not a competitive advantage for a personal finance app.

### Alternative 3: PocketBase

Single-binary Go backend with embedded SQLite, REST API, realtime subscriptions, and auth.

- **Pros:**
  - **Simplest deployment** — single binary, runs on a $5/mo VPS
  - **MIT license** — maximum permissiveness, fully open-source
  - **Built-in auth** — email/password, OAuth2 (Google, Apple, GitHub)
  - **Lowest hosting cost** — $5–$10/mo for up to 1K users
  - **Realtime subscriptions** — WebSocket-based change notifications

- **Cons:**
  - **No sync engine** — no offline-first support, no delta sync, no change queue. Realtime subscriptions only work for connected clients
  - **SQLite backend limits scalability** — write concurrency is a fundamental limitation; not designed for high-concurrency multi-user write workloads. Questionable at 100K+ users
  - **Single-maintainer project** — bus factor risk; uncertain long-term maintenance
  - **No encryption at rest** by default — server-side SQLite is not encrypted without custom SQLCipher build
  - **Community-maintained mobile SDKs** — no official React Native, KMP, or Windows SDK
  - **No compliance certifications** — SOC 2, HIPAA, etc. not available

- **Why rejected:** The absence of a sync engine is disqualifying for an offline-first app. SQLite's write concurrency limitations prevent scaling to multi-user households with concurrent edits. The single-maintainer risk is concerning for a financial application. PocketBase is excellent for rapid prototyping but not for production financial data.

### Alternative 4: ElectricSQL

Open-source (Apache 2.0) active-active sync engine using PostgreSQL logical replication and CRDT-based conflict resolution.

- **Pros:**
  - **Most technically elegant sync** — CRDTs provide automatic, deterministic conflict resolution without central coordination; no data loss guaranteed
  - **Apache 2.0 license** — fully open-source, no source-available caveats
  - **PostgreSQL logical replication** — high-throughput sync using Postgres's native change data capture
  - **Shape-based partial replication** — sync filtered subsets of data per user/device
  - **Zero managed service cost** — self-hosted only (infrastructure cost ~$50–$200/mo)
  - **Active-active bidirectional sync** — changes flow both directions simultaneously

- **Cons:**
  - **Limited multi-platform SDK support** — TypeScript/JavaScript is mature, but React Native and Flutter support is early/experimental. No native Swift or Kotlin SDKs. This is the critical gap for a native-first KMP app.
  - **Newer/less battle-tested** — smaller community, fewer production deployments than PowerSync
  - **No built-in auth** — must integrate with external auth
  - **No compliance certifications** — small team, limited enterprise support
  - **CRDT semantics may not align with financial domain** — CRDTs guarantee convergence but the merge result may not be financially correct (e.g., two conflicting balance adjustments)
  - **Elixir/Erlang runtime** — adds operational complexity for teams not familiar with the BEAM ecosystem
  - **Write-path sync requires more manual setup** than read-path

- **Why rejected (for now):** The multi-platform SDK gap is the deciding factor. ElectricSQL cannot provide native KMP/Swift/Kotlin sync clients today. However, it is the **strongest watch-list candidate** — if SDK support matures in the next 6–12 months, it could replace PowerSync as the sync layer. Its Apache 2.0 license and CRDT-based approach are technically superior. **Re-evaluate in Q1 2026.**

## Consequences

### Positive

- **~$74/mo baseline cost** for production infrastructure — Supabase Pro ($25/mo) + PowerSync Pro ($49/mo). This includes managed PostgreSQL, auth, sync, and edge functions. At 100K users, estimated ~$800–$1,200/mo total.
- **Open-source escape hatch** — both Supabase (Apache 2.0) and PowerSync (Open Edition) can be self-hosted, dropping cost to pure infrastructure (~$50–$200/mo). Data is standard PostgreSQL + SQLite — always portable.
- **2–4 month estimated development time** to production sync — vs. 6–12+ months for custom backend. PowerSync handles the hardest parts (delta sync, reconnection, selective replication, sync queue).
- **PostgreSQL as source of truth** — full relational query power for financial reporting, analytics, and data export. Standard SQL, standard tooling, massive ecosystem.
- **Auth solved** — Supabase Auth provides email/password, social login (Google, Apple, GitHub), phone OTP, and JWT-based sessions. Row-level security enforces access control at the database level.
- **Multi-user/household support** — PostgreSQL RLS policies combined with Supabase Auth enable fine-grained access control. PowerSync's selective sync ensures each user/device receives only authorized data.
- **Compliance path** — Supabase offers SOC 2 Type II (managed cloud). PowerSync Team plan includes SOC 2/HIPAA options. Self-hosting gives full GDPR/CCPA data residency control.

### Negative

- **Two managed services to monitor** — Supabase and PowerSync are separate systems with separate dashboards, billing, and status pages. Operational complexity is higher than a single service.
- **PowerSync sync protocol is proprietary** — while the data layer (PostgreSQL + SQLite) is portable, the sync protocol itself is not. Switching away from PowerSync requires re-implementing the sync layer.
- **No built-in CRDT support** — PowerSync provides developer-defined conflict handlers, but CRDTs for complex data (shared budgets) must be implemented at the application level. ElectricSQL would provide this automatically.
- **Supabase Edge Functions use Deno** — minor lock-in for serverless code. Migrating edge functions to another platform requires rewriting.
- **PowerSync Open Edition licensing** — self-hosted version is source-available but not OSI-approved open-source. Review license terms before self-hosting in production.

### Risks

| Risk                      | Severity | Mitigation                                                                                                                                                                                                                                         |
| ------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PowerSync vendor lock-in  | Medium   | Abstract the sync interface behind a `SyncEngine` protocol in `packages/sync`. If PowerSync becomes untenable, swap to ElectricSQL or custom sync without changing business logic.                                                                 |
| Supabase service outage   | Low      | App is offline-first — a Supabase outage means sync stops but the app continues working locally. PowerSync also buffers changes. No data loss.                                                                                                     |
| Cost overrun at scale     | Low      | Monitor sync volume closely. At 50K+ users, evaluate self-hosting both services. PowerSync overages are $1/GB synced — optimize sync payload size and selective sync rules.                                                                        |
| PowerSync deprecation     | Low      | PowerSync is well-funded and growing. The sync interface abstraction (above) provides a migration path. ElectricSQL is the ready fallback.                                                                                                         |
| E2E encryption complexity | Medium   | Encrypt sensitive fields (amounts, descriptions, account names) on-device before sync. Server stores ciphertext. Key management via platform keystores. Accept that encrypted fields cannot be queried server-side (server queries only metadata). |

## Implementation Notes

### Supabase Project Setup

1. **Create Supabase project** on [supabase.com](https://supabase.com) (or self-host via Docker)
2. **Configure Auth providers**: email/password, Google OAuth, Apple Sign-In
3. **Define PostgreSQL schema** with sync metadata columns on all tables
4. **Enable Row-Level Security (RLS)** on all tables
5. **Create Edge Functions** for: webhook handlers, push notifications, data export

### Example: PostgreSQL Schema with Sync Metadata

```sql
-- Supabase PostgreSQL schema
-- All tables include sync metadata columns

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    household_id UUID REFERENCES households(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit', 'investment', 'cash', 'loan')),
    currency_code TEXT NOT NULL DEFAULT 'USD',  -- ISO 4217
    balance_cents BIGINT NOT NULL DEFAULT 0,    -- Integer cents, never float
    institution TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Sync metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,                     -- Soft delete
    sync_version BIGINT NOT NULL DEFAULT 0      -- Monotonic version for delta sync
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    category_id UUID REFERENCES categories(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount_cents BIGINT NOT NULL,               -- Integer cents; negative = expense
    currency_code TEXT NOT NULL DEFAULT 'USD',
    description TEXT NOT NULL,
    notes TEXT,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    transfer_pair_id UUID,                      -- Links two sides of a transfer
    -- Sync metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    sync_version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    parent_id UUID REFERENCES categories(id),   -- Hierarchical categories
    budget_cents BIGINT,                         -- Monthly budget limit
    -- Sync metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    NEW.sync_version = OLD.sync_version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for sync queries
CREATE INDEX idx_accounts_sync ON accounts (user_id, sync_version) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_sync ON transactions (user_id, sync_version) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_date ON transactions (user_id, date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_sync ON categories (user_id, sync_version) WHERE deleted_at IS NULL;
```

### Example: Row-Level Security (RLS) Policies

```sql
-- Enable RLS on all tables
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own accounts"
    ON accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
    ON accounts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
    ON accounts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Household sharing: users can access data from their household members
CREATE POLICY "Household members can view shared accounts"
    ON accounts FOR SELECT
    USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'editor', 'viewer')
        )
    );

CREATE POLICY "Household editors can update shared accounts"
    ON accounts FOR UPDATE
    USING (
        household_id IN (
            SELECT household_id FROM household_members
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'editor')
        )
    );

-- Transactions follow account access
CREATE POLICY "Users can view own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
    ON transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
    ON transactions FOR UPDATE
    USING (auth.uid() = user_id);

-- Soft delete policy: prevent hard deletes on synced tables
CREATE POLICY "Prevent hard deletes on accounts"
    ON accounts FOR DELETE
    USING (false);  -- All deletes blocked; use UPDATE SET deleted_at = now()

CREATE POLICY "Prevent hard deletes on transactions"
    ON transactions FOR DELETE
    USING (false);
```

### PowerSync Configuration

PowerSync is configured in `packages/sync/` and integrated into the KMP shared layer:

```yaml
# powersync-config.yaml (PowerSync sync rules)
bucket_definitions:
  # Each user gets a bucket with their own data
  user_data:
    parameters:
      - SELECT token_parameters.user_id AS user_id
    data:
      - SELECT * FROM accounts WHERE user_id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM transactions WHERE user_id = bucket.user_id AND deleted_at IS NULL
      - SELECT * FROM categories WHERE user_id = bucket.user_id AND deleted_at IS NULL

  # Household shared data bucket
  household_data:
    parameters:
      - SELECT hm.household_id
        FROM household_members hm
        WHERE hm.user_id = token_parameters.user_id
    data:
      - SELECT a.* FROM accounts a
        WHERE a.household_id = bucket.household_id
        AND a.deleted_at IS NULL
      - SELECT t.* FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        WHERE a.household_id = bucket.household_id
        AND t.deleted_at IS NULL
```

### Implementation Phases

| Phase               | Scope                                                                                                                                                                         | Timeline    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Phase 1: MVP**    | Supabase managed (free tier) + PowerSync managed (free tier). Single-user, core sync with encrypted local SQLite.                                                             | Months 1–3  |
| **Phase 2: Growth** | Upgrade to Supabase Pro ($25/mo) + PowerSync Pro ($49/mo). Add household sharing via RLS. Implement E2E encryption for sensitive fields.                                      | Months 4–6  |
| **Phase 3: Scale**  | Evaluate self-hosting Supabase + PowerSync Open Edition to reduce costs. Monitor ElectricSQL SDK maturity for potential migration. Add push notifications via Edge Functions. | Months 7–12 |

### Package Structure

```
packages/sync/
├── src/
│   ├── commonMain/
│   │   └── kotlin/finance/sync/
│   │       ├── SyncEngine.kt          ← Interface abstraction (swap PowerSync later)
│   │       ├── ConflictResolver.kt    ← LWW + custom merge strategies
│   │       ├── SyncStatus.kt          ← Observable sync state
│   │       └── PowerSyncEngine.kt     ← PowerSync implementation
│   ├── androidMain/                   ← PowerSync Android SDK integration
│   ├── iosMain/                       ← PowerSync Swift SDK integration
│   └── jvmMain/                       ← Desktop sync via PowerSync Web SDK (JVM)
└── build.gradle.kts
```

## References

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
- [PowerSync Documentation](https://docs.powersync.com)
- [PowerSync + Supabase Integration Guide](https://docs.powersync.com/integration-guides/supabase)
- [PowerSync Open Edition](https://github.com/powersync-ja/powersync-service)
- [ElectricSQL Documentation](https://electric-sql.com/docs)
- [Firebase Firestore Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- Research: `research-backend-sync.md` (project research document, 2025)
