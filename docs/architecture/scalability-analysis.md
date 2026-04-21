# Scalability Analysis — Finance Monorepo

_Last updated: 2025-04-21_

This document analyzes the Finance application's scalability characteristics across all tiers: database performance, sync engine throughput, API rate limiting, storage projections, and cost modeling. It extends [ADR-0011 (Scaling Architecture)](./0011-scaling-architecture.md) with quantitative analysis.

---

## Table of Contents

- [1. Architecture Scalability Profile](#1-architecture-scalability-profile)
- [2. Edge-First Multiplier Effect](#2-edge-first-multiplier-effect)
- [3. Database Performance Analysis](#3-database-performance-analysis)
- [4. Sync Engine Performance at Scale](#4-sync-engine-performance-at-scale)
- [5. PowerSync Scaling Characteristics](#5-powersync-scaling-characteristics)
- [6. API Rate Limiting Strategy](#6-api-rate-limiting-strategy)
- [7. Storage Growth Projections](#7-storage-growth-projections)
- [8. Cost Modeling per Tier](#8-cost-modeling-per-tier)
- [9. Bottleneck Analysis](#9-bottleneck-analysis)
- [10. Scaling Decision Framework](#10-scaling-decision-framework)
- [11. Load Testing Strategy](#11-load-testing-strategy)

---

## 1. Architecture Scalability Profile

Finance's edge-first architecture fundamentally changes scaling characteristics compared to traditional server-heavy applications.

```mermaid
graph LR
    subgraph Traditional["Traditional App (server-heavy)"]
        TU["10K Users"] -->|"100K req/min"| TS["Server<br/>Cluster"]
        TS -->|"100K queries/min"| TD["Database<br/>Cluster"]
    end

    subgraph Finance["Finance (edge-first)"]
        FU["10K Users"] -->|"~500 req/min<br/>(sync only)"| FS["Single<br/>VPS"]
        FS -->|"~500 queries/min"| FD["Single<br/>PostgreSQL"]
    end

    style Traditional fill:#fdd,stroke:#933
    style Finance fill:#dfd,stroke:#393
```

**Why Finance scales differently:**

| Property             | Traditional App            | Finance (Edge-First)         |
| -------------------- | -------------------------- | ---------------------------- |
| Read path            | Server → DB for every view | Local SQLite (0 server load) |
| Write path           | Client → Server → DB       | Local SQLite → async sync    |
| Query load           | N users × M views/min      | N users × 1 sync/30s         |
| Offline behavior     | App is dead                | App is fully functional      |
| Server load per user | ~10 req/min average        | ~2 req/min (sync cycle)      |
| **10× reduction**    | Baseline                   | **~5% of traditional load**  |

---

## 2. Edge-First Multiplier Effect

The edge-first architecture provides a ~10–20× server load reduction compared to server-first apps.

```mermaid
graph TD
    subgraph UserBehavior["Typical User Session (5 min)"]
        A1["View dashboard (1 read)"]
        A2["View transactions (1 read)"]
        A3["Add transaction (1 write)"]
        A4["View budget (1 read)"]
        A5["View insights (1 read)"]
        A6["Edit transaction (1 write)"]
    end

    subgraph Traditional["Traditional: 6 server requests"]
        T1["GET /dashboard"]
        T2["GET /transactions"]
        T3["POST /transactions"]
        T4["GET /budgets"]
        T5["GET /insights"]
        T6["PUT /transactions/:id"]
    end

    subgraph EdgeFirst["Finance: 0–1 server requests"]
        E1["All reads from local SQLite<br/>(0 server requests)"]
        E2["Writes to local SQLite<br/>(0 server requests)"]
        E3["Background sync<br/>(1 push in 30s cycle)"]
    end

    UserBehavior -->|"Server-first"| Traditional
    UserBehavior -->|"Edge-first"| EdgeFirst

    style Traditional fill:#fdd,stroke:#933
    style EdgeFirst fill:#dfd,stroke:#393
```

**Quantified multiplier:**

| Metric                       | Traditional | Finance | Reduction |
| ---------------------------- | ----------- | ------- | --------- |
| API requests/user/hour       | 120         | 6–12    | 10–20×    |
| DB queries/user/hour         | 240         | 6–12    | 20–40×    |
| Bandwidth/user/hour          | 5 MB        | 50 KB   | 100×      |
| P95 latency (user-perceived) | 200ms       | 10ms    | 20×       |

---

## 3. Database Performance Analysis

### 3.1 Per-User Data Profile

```mermaid
graph LR
    subgraph TypicalUser["Typical User (1 year)"]
        TX["transactions:<br/>~600 rows<br/>(~50/month)"]
        ACCT["accounts:<br/>~5 rows"]
        CAT["categories:<br/>~30 rows"]
        BUD["budgets:<br/>~12 rows<br/>(1/month)"]
        GOAL["goals:<br/>~3 rows"]
        REC["recurring_templates:<br/>~10 rows"]
        MEM["household_members:<br/>~2 rows"]
    end

    TX --> SUM["Total: ~660 rows/user/year"]
    ACCT --> SUM
    CAT --> SUM
    BUD --> SUM
    GOAL --> SUM
    REC --> SUM
    MEM --> SUM
```

**Row growth estimates:**

| Table               | Rows/user/year | Row size (avg) | Storage/user/year |
| ------------------- | -------------- | -------------- | ----------------- |
| transactions        | 600            | 400 bytes      | 240 KB            |
| accounts            | 5              | 300 bytes      | 1.5 KB            |
| categories          | 30             | 200 bytes      | 6 KB              |
| budgets             | 12             | 250 bytes      | 3 KB              |
| goals               | 3              | 300 bytes      | 0.9 KB            |
| recurring_templates | 10             | 350 bytes      | 3.5 KB            |
| household_members   | 2              | 200 bytes      | 0.4 KB            |
| **Total**           | **~660**       | —              | **~255 KB**       |

### 3.2 Database Size Projections

```mermaid
xychart-beta
    title "Database Size Growth (GB)"
    x-axis ["10K", "50K", "100K", "500K", "1M"]
    y-axis "Size (GB)" 0 --> 300
    bar [2.5, 12.5, 25, 125, 250]
```

| Users | Total Rows | DB Size | Index Size | Total   |
| ----- | ---------- | ------- | ---------- | ------- |
| 10K   | 6.6M       | 2.5 GB  | 0.8 GB     | 3.3 GB  |
| 50K   | 33M        | 12.5 GB | 4 GB       | 16.5 GB |
| 100K  | 66M        | 25 GB   | 8 GB       | 33 GB   |
| 500K  | 330M       | 125 GB  | 40 GB      | 165 GB  |
| 1M    | 660M       | 250 GB  | 80 GB      | 330 GB  |

### 3.3 Query Performance at Scale

All queries are scoped by `household_id` (RLS + explicit WHERE). With proper indexing, query performance is O(household_size), not O(total_users).

```mermaid
graph TD
    subgraph QueryPatterns["Common Query Patterns"]
        Q1["SELECT * FROM transactions<br/>WHERE household_id = $1<br/>AND date >= $2<br/>ORDER BY date DESC<br/>LIMIT 50"]
        Q2["SELECT category_id, SUM(amount_cents)<br/>FROM transactions<br/>WHERE household_id = $1<br/>AND date BETWEEN $2 AND $3<br/>GROUP BY category_id"]
        Q3["SELECT * FROM accounts<br/>WHERE household_id = $1<br/>AND is_active = true"]
    end

    subgraph Performance["Performance (with household_id index)"]
        P1["Q1: < 5ms regardless of total users<br/>(scans ~600 rows max per household)"]
        P2["Q2: < 10ms<br/>(aggregate ~600 rows per household)"]
        P3["Q3: < 1ms<br/>(scan ~5 rows per household)"]
    end

    Q1 --> P1
    Q2 --> P2
    Q3 --> P3
```

**Key index strategy:**

```sql
-- These indexes ensure all queries are household-scoped and fast
CREATE INDEX idx_transactions_household_date ON transactions(household_id, date DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_household_category ON transactions(household_id, category_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_household ON accounts(household_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_budgets_household ON budgets(household_id)
    WHERE deleted_at IS NULL;
```

### 3.4 Sharding Strategy (Tier 3+)

Per ADR-0011, `household_id` is the shard key via Citus extension:

```mermaid
graph TD
    subgraph Router["Citus Coordinator"]
        CR["Query Router"]
    end

    subgraph Shard1["Shard 1"]
        S1["Households A–F<br/>~25% of data"]
    end

    subgraph Shard2["Shard 2"]
        S2["Households G–L<br/>~25% of data"]
    end

    subgraph Shard3["Shard 3"]
        S3["Households M–R<br/>~25% of data"]
    end

    subgraph Shard4["Shard 4"]
        S4["Households S–Z<br/>~25% of data"]
    end

    subgraph RefTables["Reference Tables (replicated)"]
        RT1["exchange_rates"]
        RT2["feature_flags"]
    end

    CR -->|"hash(household_id)"| S1
    CR -->|"hash(household_id)"| S2
    CR -->|"hash(household_id)"| S3
    CR -->|"hash(household_id)"| S4

    RT1 -.->|"replicated to all"| S1
    RT1 -.->|"replicated to all"| S2
    RT1 -.->|"replicated to all"| S3
    RT1 -.->|"replicated to all"| S4
```

**Why `household_id` is the perfect shard key:**

1. **Zero cross-shard queries:** All application queries filter by `household_id` (RLS + PowerSync sync rules). No query ever needs data from multiple households.
2. **Uniform distribution:** UUID household IDs distribute evenly across shards.
3. **Colocated JOINs:** All tables for a household are on the same shard — JOINs remain local.
4. **PowerSync alignment:** The `by_household` bucket maps 1:1 to shard boundaries.

---

## 4. Sync Engine Performance at Scale

### 4.1 Sync Throughput Model

```mermaid
graph TD
    subgraph SyncLoad["Sync Load per User"]
        SC["Sync cycle: every 30s<br/>(SyncConfig.syncIntervalMs)"]
        PL["Pull: avg 2 changes/cycle"]
        PU["Push: avg 0.5 mutations/cycle"]
        BW["Bandwidth: ~2 KB/cycle"]
    end

    subgraph ServerLoad["Server Load Aggregation"]
        S10K["10K users:<br/>~330 sync cycles/sec<br/>~660 KB/s bandwidth"]
        S100K["100K users:<br/>~3,300 sync cycles/sec<br/>~6.6 MB/s bandwidth"]
        S1M["1M users:<br/>~33,000 sync cycles/sec<br/>~66 MB/s bandwidth"]
    end

    SyncLoad --> S10K
    SyncLoad --> S100K
    SyncLoad --> S1M
```

**Detailed sync load calculation:**

| Metric                 | Per User | 10K Users | 100K Users | 1M Users |
| ---------------------- | -------- | --------- | ---------- | -------- |
| Sync cycles/min        | 2        | 20K/min   | 200K/min   | 2M/min   |
| Sync cycles/sec        | 0.033    | 333/s     | 3,333/s    | 33,333/s |
| Changes pulled/cycle   | 2 avg    | 667/s     | 6,667/s    | 66,667/s |
| Mutations pushed/cycle | 0.5 avg  | 167/s     | 1,667/s    | 16,667/s |
| Bandwidth (pull)       | 1 KB     | 667 KB/s  | 6.5 MB/s   | 65 MB/s  |
| Bandwidth (push)       | 0.5 KB   | 167 KB/s  | 1.6 MB/s   | 16 MB/s  |
| WebSocket connections  | 1        | 10K       | 100K       | 1M       |

### 4.2 Concurrent Connection Limits

```mermaid
xychart-beta
    title "WebSocket Connections vs Server Capacity"
    x-axis ["VPS 2vCPU", "VPS 4vCPU", "2x VPS 4vCPU", "4x VPS 4vCPU", "8x VPS 4vCPU"]
    y-axis "Max WebSocket Connections" 0 --> 200000
    line [5000, 15000, 30000, 80000, 200000]
    line [10000, 10000, 100000, 100000, 1000000]
```

| Infrastructure             | Max WebSocket Connections | Sufficient For          |
| -------------------------- | ------------------------- | ----------------------- |
| Single VPS (2 vCPU / 4 GB) | ~5,000                    | Tier 1 (< 1K users)     |
| Single VPS (4 vCPU / 8 GB) | ~15,000                   | Tier 2 (1K–10K users)   |
| 2× VPS + LB                | ~30,000                   | Tier 2–3                |
| PowerSync Cloud (managed)  | 100K+                     | Tier 3 (10K–100K users) |
| Multi-region cluster       | 1M+                       | Tier 4 (100K–1M users)  |

### 4.3 Batch Size Optimization

The `SyncConfig.batchSize` (default 100) and `QueueProcessor.DEFAULT_BATCH_SIZE` (50) affect throughput:

```mermaid
graph LR
    subgraph SmallBatch["Batch Size = 10"]
        SB_RTT["10 round trips<br/>for 100 mutations"]
        SB_LAT["Higher latency<br/>(10 × RTT)"]
        SB_MEM["Lower memory<br/>per batch"]
    end

    subgraph MedBatch["Batch Size = 50 (default)"]
        MB_RTT["2 round trips<br/>for 100 mutations"]
        MB_LAT["Balanced latency"]
        MB_MEM["Moderate memory"]
    end

    subgraph LargeBatch["Batch Size = 500"]
        LB_RTT["1 round trip<br/>for 100 mutations"]
        LB_LAT["Lowest latency<br/>(1 × RTT)"]
        LB_MEM["Higher memory<br/>per batch"]
    end

    style MedBatch fill:#dfd,stroke:#393
```

| Batch Size | RTTs for 100 mutations | Optimal For                               |
| ---------- | ---------------------- | ----------------------------------------- |
| 10         | 10                     | Low-memory devices, high-latency networks |
| 50         | 2                      | **Default — balanced for most devices**   |
| 100        | 1                      | Desktop/web with good connectivity        |
| 500        | 1                      | Bulk import scenarios                     |

---

## 5. PowerSync Scaling Characteristics

PowerSync is the sync coordination layer. Its scaling properties determine the system's ceiling.

```mermaid
graph TD
    subgraph PSArch["PowerSync Architecture"]
        PSC["PowerSync Client SDK<br/>(on each device)"]
        PSS["PowerSync Service<br/>(WebSocket server)"]
        WAL["PostgreSQL WAL<br/>(logical replication)"]
        PG["PostgreSQL Primary"]
    end

    subgraph Scaling["Scaling Dimensions"]
        WS["WebSocket connections<br/>(connection count)"]
        WAL_T["WAL throughput<br/>(changes/second)"]
        MEM["Memory per connection<br/>(sync state)"]
        BAND["Bandwidth<br/>(delta payloads)"]
    end

    PSC <-->|"persistent WS"| PSS
    PSS <-->|"logical replication"| WAL
    WAL <-->|"stream changes"| PG

    PSS --> WS
    PSS --> WAL_T
    PSS --> MEM
    PSS --> BAND
```

**PowerSync scaling characteristics:**

| Dimension                 | Self-Hosted              | PowerSync Cloud | Notes                  |
| ------------------------- | ------------------------ | --------------- | ---------------------- |
| WebSocket connections     | ~5K–15K per VPS          | 100K+ (managed) | Memory-bound           |
| Changes/second throughput | ~10K/s                   | 100K+/s         | CPU-bound              |
| Memory per connection     | ~50 KB                   | Optimized       | Sync state + buffers   |
| Bucket computation        | Per-change               | Per-change      | Evaluated on WAL event |
| Horizontal scaling        | Manual (sticky sessions) | Auto-scaled     | Consistent hashing     |

### Bucket Computation Cost

Each WAL change triggers bucket rule evaluation:

```mermaid
flowchart TD
    A["PostgreSQL WAL event:<br/>INSERT INTO transactions(...)"] --> B["PowerSync evaluates sync rules"]
    B --> C["by_household bucket:<br/>WHERE household_id = bucket.household_id"]
    C --> D{"household_id matches<br/>any connected client?"}
    D -->|Yes| E["Push delta to matching clients"]
    D -->|No| F["Discard (no connected clients)"]

    E --> G["Serialize row data<br/>(column allowlist)"]
    G --> H["Send via WebSocket<br/>to each matching client"]

    style F fill:#ddd,stroke:#999
```

---

## 6. API Rate Limiting Strategy

Rate limiting protects the backend from abuse while ensuring legitimate users have a smooth experience.

```mermaid
graph TD
    subgraph Tiers["Rate Limits by Subscription Tier"]
        Free["Free Tier<br/>60 req/min<br/>2 sync cycles/min"]
        Plus["Plus Tier<br/>300 req/min<br/>4 sync cycles/min"]
        Pro["Pro Tier<br/>1,000 req/min<br/>6 sync cycles/min"]
    end

    subgraph Endpoints["Per-Endpoint Limits"]
        Sync["POST /sync<br/>(push/pull)"]
        Auth["POST /auth/*<br/>(login/refresh)"]
        Export["POST /export<br/>(data export)"]
        Receipt["POST /validate-receipt"]
        Edge["Edge Functions<br/>(general)"]
    end

    subgraph Enforcement["Enforcement Layers"]
        Caddy["Caddy reverse proxy<br/>(IP-based rate limit)"]
        Redis["Redis<br/>(token bucket per user)"]
        RLS["PostgreSQL RLS<br/>(query-level guard)"]
    end

    Tiers --> Endpoints
    Endpoints --> Caddy
    Caddy --> Redis
    Redis --> RLS
```

**Rate limit matrix:**

| Endpoint           | Free   | Plus    | Pro     | Window         | Algorithm     |
| ------------------ | ------ | ------- | ------- | -------------- | ------------- |
| Sync push          | 2/min  | 4/min   | 6/min   | Sliding window | Token bucket  |
| Sync pull          | 4/min  | 8/min   | 12/min  | Sliding window | Token bucket  |
| Auth (login)       | 5/min  | 5/min   | 5/min   | Fixed window   | Fixed counter |
| Auth (refresh)     | 10/min | 10/min  | 10/min  | Fixed window   | Fixed counter |
| Data export        | 2/hour | 10/hour | 30/hour | Fixed window   | Fixed counter |
| Receipt validation | 5/hour | 5/hour  | 5/hour  | Fixed window   | Fixed counter |
| Edge functions     | 30/min | 120/min | 600/min | Sliding window | Token bucket  |

**Rate limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers):**

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1714693200
Retry-After: 42
```

### Sync Interval Adaptation

When rate limited, the sync engine should back off:

```mermaid
flowchart TD
    A["Sync cycle"] --> B{"Response status?"}
    B -->|200 OK| C["Normal: syncInterval = 30s"]
    B -->|429 Too Many Requests| D["Read Retry-After header"]
    D --> E["Increase syncInterval<br/>to max(Retry-After, 60s)"]
    E --> F["Retry after delay"]
    F --> G{"Still 429?"}
    G -->|Yes| H["Double syncInterval<br/>(max 300s)"]
    G -->|No| I["Gradually return to 30s<br/>(halve interval each success)"]

    style C fill:#9f9,stroke:#333
    style H fill:#f99,stroke:#333
```

---

## 7. Storage Growth Projections

### 7.1 Server-Side Storage

```mermaid
xychart-beta
    title "Cumulative Server Storage (GB) — 3 Year Projection"
    x-axis ["Y1 Q1", "Y1 Q2", "Y1 Q3", "Y1 Q4", "Y2 Q1", "Y2 Q2", "Y2 Q3", "Y2 Q4", "Y3 Q1", "Y3 Q2", "Y3 Q3", "Y3 Q4"]
    y-axis "Storage (GB)" 0 --> 500
    line "10K users" [0.8, 1.7, 2.5, 3.3, 4.2, 5, 5.8, 6.7, 7.5, 8.3, 9.2, 10]
    line "100K users" [8, 17, 25, 33, 42, 50, 58, 67, 75, 83, 92, 100]
    line "1M users" [83, 167, 250, 330, 416, 500, 500, 500, 500, 500, 500, 500]
```

**Note:** At 1M users, data retention policies should limit growth (e.g., archive transactions > 5 years).

### 7.2 Client-Side Storage

| Content                       | Size per User                 |
| ----------------------------- | ----------------------------- |
| SQLite database (1 year data) | ~5 MB (with SQLCipher)        |
| SQLite database (3 year data) | ~15 MB                        |
| AI models (if downloaded)     | 10–80 MB                      |
| App binary                    | 20–40 MB (platform-dependent) |
| Cached images (receipts)      | 0–100 MB                      |
| **Typical total**             | **35–235 MB**                 |

### 7.3 Backup Storage

| Tier | Users | DB Size | Daily Backup | 30-Day Retention |
| ---- | ----- | ------- | ------------ | ---------------- |
| 1    | 1K    | 0.33 GB | 0.33 GB      | 10 GB            |
| 2    | 10K   | 3.3 GB  | 3.3 GB       | 100 GB           |
| 3    | 100K  | 33 GB   | 33 GB        | 1 TB             |
| 4    | 1M    | 330 GB  | 330 GB       | 10 TB            |

---

## 8. Cost Modeling per Tier

```mermaid
xychart-beta
    title "Monthly Infrastructure Cost ($)"
    x-axis ["1K users", "10K users", "50K users", "100K users", "500K users", "1M users"]
    y-axis "Monthly Cost ($)" 0 --> 2500
    bar [20, 60, 150, 350, 1000, 2500]
```

**Detailed cost breakdown:**

| Component         | Tier 1 (1K)    | Tier 2 (10K)     | Tier 3 (100K)    | Tier 4 (1M)       |
| ----------------- | -------------- | ---------------- | ---------------- | ----------------- |
| VPS (compute)     | $10–20         | $40–60           | $100–200         | $500–800          |
| Database storage  | Included       | $10–20           | $30–50           | $100–200          |
| PowerSync         | Self-hosted    | Self-hosted      | Cloud ($50–100)  | Cloud ($200–500)  |
| Backups           | $5             | $10–20           | $50–100          | $200–500          |
| CDN (Cloudflare)  | Free           | Free             | $20              | $50–100           |
| Monitoring        | Free           | $10              | $20              | $50               |
| Domain + SSL      | $15/yr         | $15/yr           | $15/yr           | $15/yr            |
| **Total/month**   | **$20–40**     | **$60–120**      | **$200–500**     | **$1,000–2,500**  |
| **Cost per user** | **$0.02–0.04** | **$0.006–0.012** | **$0.002–0.005** | **$0.001–0.0025** |

**Revenue vs. cost (freemium model):**

Assuming 5% conversion to Plus ($4.99/mo) and 1% to Pro ($9.99/mo):

| Users | Paying Users | Monthly Revenue | Monthly Cost | Margin |
| ----- | ------------ | --------------- | ------------ | ------ |
| 10K   | 600          | $3,694          | $60–120      | 97%    |
| 100K  | 6,000        | $36,940         | $200–500     | 99%    |
| 1M    | 60,000       | $369,400        | $1,000–2,500 | 99%    |

---

## 9. Bottleneck Analysis

Identifying the first bottleneck at each scale tier:

```mermaid
graph TD
    subgraph Tier1["Tier 1: 100–1K users"]
        B1["🟢 No bottlenecks<br/>Single VPS handles everything"]
    end

    subgraph Tier2["Tier 2: 1K–10K users"]
        B2_1["🟡 PostgreSQL connections<br/>(PgBouncer needed at ~200 conn)"]
        B2_2["🟡 WebSocket memory<br/>(PowerSync at ~5K connections)"]
    end

    subgraph Tier3["Tier 3: 10K–100K users"]
        B3_1["🔴 Database write throughput<br/>(single primary bottleneck)"]
        B3_2["🟡 WAL replication lag<br/>(affects sync latency)"]
        B3_3["🟡 WebSocket connection count<br/>(need horizontal scaling)"]
    end

    subgraph Tier4["Tier 4: 100K–1M users"]
        B4_1["🔴 Single-region latency<br/>(geo-distributed users)"]
        B4_2["🔴 Database size (>100 GB)<br/>(sharding required)"]
        B4_3["🟡 Backup/restore time<br/>(>30 min restore)"]
    end

    Tier1 --> Tier2
    Tier2 --> Tier3
    Tier3 --> Tier4
```

**Mitigation per bottleneck:**

| Bottleneck             | Trigger                   | Mitigation                                | ADR Reference   |
| ---------------------- | ------------------------- | ----------------------------------------- | --------------- |
| PostgreSQL connections | > 200 concurrent          | PgBouncer (transaction mode, pool=50)     | ADR-0011 Tier 1 |
| WebSocket memory       | > 5K connections          | Dedicated PowerSync VPS                   | ADR-0011 Tier 2 |
| DB write throughput    | > 5K writes/sec           | Read replica + Citus sharding             | ADR-0011 Tier 3 |
| WAL replication lag    | > 5s p95                  | Tune `max_wal_senders`, dedicated replica | ADR-0011 Tier 2 |
| Geo-latency            | Users > 200ms from server | Multi-region read replicas                | ADR-0011 Tier 4 |
| DB size                | > 100 GB                  | Citus sharding by household_id            | ADR-0011 Tier 3 |
| Backup time            | > 30 min restore          | Incremental backups (pgBackRest)          | —               |

---

## 10. Scaling Decision Framework

When to trigger each scaling tier:

```mermaid
flowchart TD
    A["Monitor metrics continuously"] --> B{"postgresql_connections > 80<br/>for 1 hour?"}
    B -->|Yes| C["⚡ Add PgBouncer<br/>(Tier 1 → 2 trigger)"]
    B -->|No| D{"sync_lag_p95 > 5s<br/>for 30 min?"}
    D -->|Yes| E["⚡ Dedicated PowerSync VPS<br/>(Tier 1 → 2 trigger)"]
    D -->|No| F{"vps_cpu > 70%<br/>for 2 hours?"}
    F -->|Yes| G["⚡ Vertical scale<br/>(upgrade VPS)"]
    F -->|No| H{"write_latency_p95 > 50ms<br/>for 1 hour?"}
    H -->|Yes| I["⚡ Read replica + Citus<br/>(Tier 2 → 3 trigger)"]
    H -->|No| J{"websocket_connections > 8,000?"}
    J -->|Yes| K["⚡ PowerSync cluster<br/>(Tier 2 → 3 trigger)"]
    J -->|No| L["✅ Current tier sufficient"]

    style C fill:#ff9,stroke:#333
    style E fill:#ff9,stroke:#333
    style G fill:#ff9,stroke:#333
    style I fill:#f96,stroke:#333
    style K fill:#f96,stroke:#333
    style L fill:#9f9,stroke:#333
```

**Monitoring stack:**

| Metric                 | Source                | Alert Threshold    |
| ---------------------- | --------------------- | ------------------ |
| PostgreSQL connections | `pg_stat_activity`    | > 80 active for 1h |
| Sync lag P95           | PowerSync metrics     | > 5s for 30min     |
| VPS CPU utilization    | Node exporter         | > 70% for 2h       |
| VPS memory utilization | Node exporter         | > 85% for 1h       |
| Write latency P95      | `pg_stat_statements`  | > 50ms for 1h      |
| WebSocket connections  | PowerSync metrics     | > 80% of capacity  |
| Disk usage             | Node exporter         | > 75% of volume    |
| WAL lag (replication)  | `pg_stat_replication` | > 10s for 15min    |

---

## 11. Load Testing Strategy

Before scaling decisions, validate assumptions with realistic load tests.

```mermaid
graph TD
    subgraph TestScenarios["Load Test Scenarios"]
        S1["Scenario 1: Steady State<br/>1K concurrent users<br/>Normal sync pattern"]
        S2["Scenario 2: Peak Hour<br/>5K concurrent users<br/>Morning expense logging rush"]
        S3["Scenario 3: Bulk Import<br/>100 users importing CSV<br/>simultaneously"]
        S4["Scenario 4: Stress Test<br/>10K concurrent users<br/>Sustained for 1 hour"]
    end

    subgraph Tools["Testing Tools"]
        K6["k6 (HTTP load testing)"]
        WS["k6 WebSocket extension"]
        PG["pgbench (DB benchmarking)"]
    end

    subgraph Metrics["Key Metrics to Capture"]
        M1["Sync cycle latency (P50, P95, P99)"]
        M2["Mutation push success rate"]
        M3["WebSocket connection stability"]
        M4["PostgreSQL query latency"]
        M5["Memory usage growth"]
        M6["Error rate"]
    end

    S1 --> K6
    S2 --> K6
    S3 --> K6
    S4 --> WS
    S4 --> PG

    K6 --> Metrics
    WS --> Metrics
    PG --> Metrics
```

**Load test acceptance criteria:**

| Metric              | Acceptable  | Warning     | Critical  |
| ------------------- | ----------- | ----------- | --------- |
| Sync cycle P95      | < 500ms     | 500ms–2s    | > 2s      |
| Push success rate   | > 99.9%     | 99–99.9%    | < 99%     |
| WebSocket drop rate | < 0.1%/hour | 0.1–1%/hour | > 1%/hour |
| DB query P95        | < 50ms      | 50–200ms    | > 200ms   |
| Error rate          | < 0.1%      | 0.1–1%      | > 1%      |

---

## References

- [ADR-0011: Scaling Architecture](./0011-scaling-architecture.md) — Phased scaling tiers
- [ADR-0002: Backend & Sync Architecture](./0002-backend-sync-architecture.md) — Sync protocol design
- [ADR-0007: Hosting Strategy](./0007-hosting-strategy.md) — VPS infrastructure
- [ADR-0015: Premium Architecture](./adr/adr-0015-premium-architecture.md) — Tier-based rate limits
- [Data Flow Diagrams](./data-flow.md) — Detailed sync flow diagrams
- `packages/sync/src/commonMain/kotlin/com/finance/sync/SyncConfig.kt`
- `packages/sync/src/commonMain/kotlin/com/finance/sync/queue/QueueProcessor.kt`
- [Citus Documentation](https://docs.citusdata.com/)
- [PgBouncer](https://www.pgbouncer.org/)
- [k6 Load Testing](https://k6.io/)

_Last updated: 2025-04-21. Maintained by `@system-architect`._
