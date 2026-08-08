# Windows On-Device ML Balance-Prediction Pipeline — Plan

> **Issue:** #2705 (part of #2384)
> **Branch:** `feat/windows-ml-balance-plan-2705`
> **Status:** Plan / design only — no native build. Toolchain-blocked steps are
> marked with 🔒 and require explicit human action.
> **Owner:** Architect SME

This document plans the **blocked native ML packaging work** for short-horizon
account-balance prediction on the Windows (Compose Desktop / JVM) app while
keeping **all inference on-device**. It defines the model input/output schema,
the confidence-interval format, the model-versioning and asset-packaging
approach, a Windows ML vs. ONNX Runtime trade-off analysis, a no-network
validation plan, and a graceful heuristic fallback.

It builds on and stays consistent with
[ADR-0014: AI/ML Pipeline Architecture](../architecture/0014-ai-ml-pipeline-architecture.md)
(on-device serving, CDN model registry, SHA-256 integrity, rule-based
fallback) and the existing pure-Kotlin engines in `packages/core`:

- [`BalancePredictionEngine`](../../packages/core/src/commonMain/kotlin/com/finance/core/prediction/BalancePredictionEngine.kt)
  — trailing-average + trend heuristic with `PredictionConfidence`.
- [`OperatingCashForecastEngine`](../../packages/core/src/commonMain/kotlin/com/finance/core/forecast/OperatingCashForecast.kt)
  — recurring-aware, deterministic forecast with confidence **bands** computed
  as `z(confidence) · σ · √horizon`.

## Design filters

This plan passes the four architecture filters in order:

1. **Edge first** — inference runs entirely on the client. The model file is the
   only thing fetched from the network, and only once per version.
2. **Privacy first** — no transaction, account, balance, or derived feature ever
   leaves the device. Only privacy-safe aggregate counters are emitted as
   telemetry (see [Privacy guarantees](#privacy-guarantees)).
3. **Native first** — Windows uses the `.onnx` format and DirectML acceleration
   already specified for the platform in ADR-0014, served through a runtime with
   first-class JVM bindings so it fits the Compose Desktop host.
4. **Simplicity** — the deterministic heuristic engines already in `core` are
   the always-available baseline and the fallback. ML is a strict, optional
   _upgrade_ layered on top, never a hard dependency.

## Goals & non-goals

**Goals**

- Predict an account's balance over a short horizon (7 / 14 / 30 days) on-device.
- Emit a calibrated **confidence interval**, not just a point estimate.
- Define a stable, versioned **feature contract** and **output contract**.
- Specify model **versioning** and Windows **asset packaging**.
- Specify a no-network **validation plan** for inference, packaging, and
  fallback.
- Always degrade gracefully to a deterministic heuristic when the model or
  runtime is unavailable.

**Non-goals**

- Training the model, building the `.onnx` artifact, or selecting the model
  architecture (🔒 ML training pipeline; out of scope for this plan).
- Implementing the `expect/actual` `ModelRuntime` in `packages/core`
  (owned by @native-app-engineer).
- Adding native dependencies or Gradle wiring to `apps/windows`
  (owned by the Windows platform agent).
- Cloud inference of any kind (explicitly rejected — breaks privacy-first).

## 1. Model input feature schema

Features are derived **on-device** from already-local data
(`Transaction`, `Account`, `RecurringTransactionRule`). All money is integer
`Cents` (Long-backed) — never floating dollars — and amounts are normalized to
account currency before featurization. Dates use `kotlinx.datetime.LocalDate`.

### 1.1 Feature contract (`feature_schema_version: 1`)

The feature vector is grouped into four blocks. The **order and length are
fixed** per `feature_schema_version` so the `.onnx` input tensor stays stable.

| #   | Group             | Feature                        | Type / shape | Source                                        | Notes                                                         |
| --- | ----------------- | ------------------------------ | ------------ | --------------------------------------------- | ------------------------------------------------------------- |
| 1   | Account state     | `current_balance_cents`        | f32 (scaled) | `Account.currentBalance`                      | Scaled by a fixed divisor; see [scaling](#13-normalization)   |
| 2   | Account state     | `account_type_onehot`          | f32[7]       | `Account.type`                                | `CHECKING…OTHER` one-hot                                      |
| 3   | Calendar context  | `day_of_month`                 | f32          | reference date                                | `1..31`, scaled                                               |
| 4   | Calendar context  | `days_until_month_end`         | f32          | derived                                       | drives end-of-month horizon                                   |
| 5   | Calendar context  | `day_of_week_onehot`           | f32[7]       | reference date                                | weekend spend skew                                            |
| 6   | Trailing spend    | `daily_expense_avg_cents[3]`   | f32[3]       | `Transaction` (EXPENSE)                       | 30 / 60 / 90-day trailing daily averages                      |
| 7   | Trailing spend    | `daily_income_avg_cents[3]`    | f32[3]       | `Transaction` (INCOME)                        | 30 / 60 / 90-day trailing daily averages                      |
| 8   | Trailing spend    | `expense_volatility_cents`     | f32          | `Transaction`                                 | std-dev of daily net (feeds CI width — see §2)                |
| 9   | Trailing spend    | `mtd_expense_pace_ratio`       | f32          | `Transaction`                                 | this-month pace ÷ trailing average (trend signal)             |
| 10  | Trailing spend    | `txn_count_lookback`           | f32          | `Transaction`                                 | data-sufficiency signal; drives confidence floor              |
| 11  | Recurring cadence | `committed_outflow_horizon[3]` | f32[3]       | `RecurringTransactionRule` + `RecurrenceRule` | sum of confirmed bills due within 7 / 14 / 30 days            |
| 12  | Recurring cadence | `committed_inflow_horizon[3]`  | f32[3]       | `RecurringTransactionRule`                    | confirmed recurring income (e.g. payroll) within each horizon |
| 13  | Recurring cadence | `next_bill_days`               | f32          | `RecurringTransactionRule.nextDueDate`        | days to nearest confirmed bill                                |
| 14  | Recurring cadence | `cadence_onehot`               | f32[8]       | `ForecastCadence`                             | dominant detected cadence of recurring set                    |

**Filtering rules (must match the heuristic engine for parity):**

- Exclude `deletedAt != null` and `type == TRANSFER` (mirrors
  `BalancePredictionEngine`).
- Only **confirmed** recurring rules (`isConfirmed == true`) contribute to
  committed inflow/outflow; auto-detected-but-unconfirmed rules are excluded to
  avoid double counting.
- Lookback windows are inclusive of the reference date's history and exclusive
  of the reference date itself.

### 1.2 Runtime input envelope

The host passes a typed `BalanceFeatures` object to the shared `ModelRuntime`
(🔒 `expect/actual`, owned by @native-app-engineer). The serialized ONNX input tensor
is `float32[1, N]` where `N` is fixed by `feature_schema_version`.

```jsonc
{
  "feature_schema_version": 1,
  "reference_date": "2026-06-22", // local; never transmitted
  "horizon_days": 30, // one of the supported horizons {7, 14, 30}
  "currency": "USD",
  "features": [/* fixed-order float32 vector, length N */],
}
```

### 1.3 Normalization

- Monetary features are scaled by a **fixed, versioned divisor** (e.g.
  `1_000_00` cents) baked into `feature_schema_version` — _not_ a per-user
  statistic, so featurization is deterministic and stateless across sessions.
- One-hot groups are emitted in the enum declaration order of the corresponding
  Kotlin enum (`AccountType`, `ForecastCadence`) to keep the contract stable.
- A bump to scaling, ordering, or any feature requires a
  `feature_schema_version` increment **and** a model retrain (see §3).

## 2. Output schema & confidence-interval format

The model predicts a **distribution**, expressed as quantiles, for each
requested horizon. We use a three-point quantile output (`p10`, `p50`, `p90`)
which yields a directly usable **80% central interval** without assuming
normality. This matches the band semantics already used by
`OperatingCashForecastEngine` and the `PredictionConfidence` enum.

### 2.1 Output contract (`output_schema_version: 1`)

ONNX output tensor: `float32[1, 3]` ordered `[p10, p50, p90]` in scaled cents,
de-scaled and re-wrapped as `Cents` by the host.

```jsonc
{
  "output_schema_version": 1,
  "horizon_days": 30,
  "prediction_date": "2026-07-22",
  "predicted_balance_cents": 184230, // p50 point estimate
  "interval": {
    "method": "quantile", // "quantile" (ML) | "gaussian_band" (heuristic)
    "level": 0.8, // central probability mass (p10..p90)
    "low_cents": 121040, // p10
    "high_cents": 251820, // p90
  },
  "confidence": "MEDIUM", // LOW | MEDIUM | HIGH (see §2.3)
  "source": "ML_MODEL", // ML_MODEL | HEURISTIC (see §5)
  "model_version": "balance-predictor@1.0.0",
  "feature_schema_version": 1,
}
```

### 2.2 Two interval methods, one shape

Both prediction sources produce the **same output shape** so the UI and tests
are source-agnostic:

| Source    | `interval.method` | How `low`/`high` are computed                                                                                               |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ML model  | `quantile`        | Model emits `p10 / p50 / p90` directly (quantile regression). Monotonicity enforced: `low ≤ p50 ≤ high` (clamp if needed).  |
| Heuristic | `gaussian_band`   | `p50` from the engine point estimate; band = `z(confidence) · σ · √horizon` reusing the `OperatingCashForecastEngine` math. |

The heuristic `z` presets match the existing engine: `HIGH = 1.28`,
`MEDIUM = 1.64`, `LOW = 1.96` (wider band when confidence is lower). `σ` is the
`expense_volatility_cents` feature (std-dev of daily net).

### 2.3 Confidence mapping

`confidence` is reported for both sources using data-sufficiency and horizon,
consistent with `BalancePredictionEngine`:

- **HIGH** — short horizon (≤ 7 days) **and** ≥ 30 trailing transactions.
- **MEDIUM** — ≥ 10 trailing transactions and horizon ≤ 30 days.
- **LOW** — sparse history, long horizon, or model output failed validation.

The ML source can never report **higher** confidence than the heuristic would
for the same inputs unless it passed the calibration gate (§4.4); this prevents
an overconfident model from misleading the user.

## 3. Model versioning

Three independent version axes, all surfaced in the output envelope so a stale
pairing is detectable at runtime:

| Axis                     | Format                          | Bump when…                                        | Consumer                         |
| ------------------------ | ------------------------------- | ------------------------------------------------- | -------------------------------- |
| `model_version`          | semver `name@MAJOR.MINOR.PATCH` | weights/architecture change                       | registry manifest, telemetry     |
| `feature_schema_version` | integer                         | feature set, order, or scaling change             | host featurizer ↔ model contract |
| `output_schema_version`  | integer                         | output tensor layout or interval semantics change | host decoder ↔ UI                |

**Compatibility rule:** the host only loads a model whose embedded
`feature_schema_version` and `output_schema_version` exactly match the host's
compiled contract. A mismatch is treated like a missing model → **heuristic
fallback** (§5). This makes schema drift fail safe, not crash.

**Registry manifest** (extends the ADR-0014 manifest; CDN-hosted, 🔒 backend/
devops to host):

```jsonc
{
  "registry_version": 1,
  "models": [
    {
      "id": "balance-predictor",
      "version": "1.0.0",
      "tier": "premium",
      "feature_schema_version": 1,
      "output_schema_version": 1,
      "horizons": [7, 14, 30],
      "artifacts": {
        "windows": {
          "url": "/models/v1/balance-predictor/1.0.0/model.onnx",
          "sha256": "…",
          "bytes": 4718592,
        },
      },
      "fallback": "heuristic",
    },
  ],
}
```

Lifecycle (per ADR-0014): Draft → Testing (eval gate) → Staged (5% canary) →
Live → Archived, with automatic rollback on metric degradation. Target size
**< 10 MB** and latency **< 100 ms** (the ADR-0014 predictive-budgeting budget).

## 4. Windows runtime & asset packaging

### 4.1 Windows ML vs. ONNX Runtime trade-off

Both consume the same `.onnx` artifact and can use **DirectML** for GPU/NPU
acceleration. The deciding factor is that the Windows app is a **Compose Desktop
/ JVM** process, so JVM bindings and self-contained packaging dominate.

| Factor                   | Windows ML (`Windows.AI.MachineLearning`)                               | ONNX Runtime (standalone)                                                |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Footprint / size**     | ~0 MB to bundle — inbox OS component (Win10 1809+)                      | Bundle native libs: CPU EP ~10–15 MB; DirectML EP adds `DirectML.dll`    |
| **Runtime deps**         | WinRT / OS-version-coupled; needs a JNI/JNA → WinRT bridge from the JVM | Official **Java API** (`com.microsoft.onnxruntime`); self-contained DLLs |
| **Performance**          | DirectML (GPU/NPU), good                                                | CPU by default; optional DirectML/CUDA EP — comparable                   |
| **Packaging**            | Nothing extra to ship; but no first-class JVM binding                   | Vendored native libs via `jpackage` app resources; version-pinned        |
| **Cross-platform reuse** | Windows-only API surface                                                | Same `.onnx` + API shape reused for Web/Android per ADR-0014             |
| **OS-version risk**      | Coupled to shipped WinML/OS version; behavior varies across builds      | App pins the runtime version → reproducible across Windows versions      |
| **Privacy posture**      | Local inference (✓)                                                     | Local inference (✓)                                                      |

**Recommendation: ONNX Runtime (CPU EP baseline, optional DirectML EP).**

Rationale: it has first-class **JVM bindings** that fit the Compose Desktop host
without a brittle WinRT bridge; it is **version-pinned and self-contained**
(reproducible across Windows builds, easier to validate offline); and it keeps
the `.onnx` + runtime shape consistent with the Web/Android targets already
chosen in ADR-0014. Windows ML remains a **future native-first optimization**
to revisit if/when a robust JVM↔WinRT path or NPU-only gains justify it — that
re-evaluation should be its own ADR.

> 🔒 **Toolchain-blocked (human action):** adding the
> `com.microsoft.onnxruntime:onnxruntime` (and optional `-directml`) dependency
> and native-lib vendoring to `apps/windows/build.gradle.kts` is owned by the
> **Windows platform agent**, not the architect. The DirectML EP DLL must be
> **code-signed** with the existing pipeline
> (see [code-signing-setup.md](./code-signing-setup.md)).

### 4.2 Asset packaging strategy

Default: **on-demand download, not bundled** (per ADR-0014, to keep the
installer small and decouple model cadence from app releases).

```text
%LOCALAPPDATA%\Finance\models\
  balance-predictor\
    1.0.0\
      model.onnx          ← downloaded once; SHA-256 verified before first use
      model.onnx.sha256   ← expected digest from the registry manifest
      manifest.json       ← id, version, feature/output schema versions
```

Steps:

1. On app start (or feature first-use), the `ModelManager` reads the CDN
   manifest, compares versions, and downloads the Windows `.onnx` artifact **if
   absent or outdated**, into the per-user app-data path above.
2. The download is **SHA-256 verified** against the manifest digest before the
   file is marked usable. A mismatch deletes the file and falls back (§5).
3. The **runtime native libraries** (ONNX Runtime DLLs) are bundled with the
   installer via the existing Compose Desktop `appResourcesRootDir`
   (`apps/windows/packaging/resources`) so inference itself needs **no network**.
4. Disk quota and eviction follow the ADR-0014 80 MB on-device budget; old
   versions are pruned after a newer version is verified.

**Optional baseline bundle (offline-first cold start):** a single small,
last-known-good `.onnx` _may_ be bundled in `packaging/resources` so first-run
users get ML before any download. If omitted, first-run uses the heuristic
until the model lands — both are acceptable and indistinguishable to the UI.

> 🔒 **Toolchain-blocked (human action):** producing/training `model.onnx`,
> hosting the CDN registry, and wiring `ModelManager` download + the bundled
> DLLs are ML-pipeline / backend / platform tasks. This plan defines the
> contracts they must satisfy.

## 5. Graceful heuristic fallback

The deterministic engines already in `packages/core` are the **always-available
baseline** and the **fallback**. The Windows app selects a source with a strict
preference order and **never blocks the UI on the model**:

```text
predictBalance(account, txns, recurringRules, horizon):
  if model runtime available
     and model present, SHA-256-verified, schema-compatible:
       try ML_MODEL inference (timeout ≤ 100 ms)
       → validate output (monotonic p10≤p50≤p90, finite, in plausible range)
       → on success: return ML result (source = ML_MODEL)
  # any failure below falls through, no exception escapes to the UI:
  return heuristic result (source = HEURISTIC)
```

The heuristic combines the two existing engines:

- **Trailing-average + trend** —
  [`BalancePredictionEngine.predictAtDate`](../../packages/core/src/commonMain/kotlin/com/finance/core/prediction/BalancePredictionEngine.kt)
  projects daily income/expense averages over the horizon with a dampened trend
  adjustment, and reports `PredictionConfidence`.
- **Recurring-aware committed cash flows** —
  [`OperatingCashForecastEngine`](../../packages/core/src/commonMain/kotlin/com/finance/core/forecast/OperatingCashForecast.kt)
  expands confirmed `RecurringTransactionRule`s into dated occurrences and
  produces the `low/high` band via `z(confidence) · σ · √horizon`.

The fallback is triggered by **any** of: runtime missing/failed to load, model
file absent, SHA-256 mismatch, schema-version mismatch, inference timeout or
exception, or an output that fails validation (non-finite, non-monotonic
quantiles, or implausible magnitude). In every case the result shape is
identical; only `source` and (usually) `confidence` differ, and the UI surfaces
a subtle "estimated" indicator when `source == HEURISTIC`.

## 6. No-network on-device validation plan

All tests below assert that **no network egress** occurs during inference and
that packaging/fallback behave correctly. Pure-logic checks live in
`commonTest`; Windows runtime/packaging checks are JVM/desktop integration
tests (🔒 implementation owned by @native-app-engineer / Windows platform agent — this
plan defines the cases and acceptance criteria).

### 6.1 No-network inference

- **Egress guard:** run inference with the process network blocked
  (loopback-only firewall profile / no-route test harness). **Accept:** a
  prediction is produced and zero outbound connections are attempted.
- **Determinism:** identical `BalanceFeatures` → identical output bytes across
  runs and across app restarts. **Accept:** bit-stable `p10/p50/p90`.
- **Latency budget:** p95 inference ≤ 100 ms on the reference desktop spec.
  **Accept:** within budget for all supported horizons.
- **Source telemetry contains no data:** assert only aggregate counters
  (`inferenceCount`, `latencyMs`, `userOverrideRate`, `source`) are emitted —
  never features, inputs, or outputs.

### 6.2 Model-asset packaging

- **Presence & integrity:** after a simulated download, the artifact exists at
  the app-data path and its SHA-256 equals the manifest digest. **Accept:** load
  succeeds only on match.
- **Tamper rejection:** flip one byte of `model.onnx` → load is refused, file is
  quarantined/deleted, and the engine falls back. **Accept:** no crash, `source
== HEURISTIC`.
- **Schema-pairing:** a model whose embedded `feature_schema_version` /
  `output_schema_version` differs from the host contract is rejected.
  **Accept:** fallback, with a logged (data-free) reason code.
- **Bundled-runtime offline load:** with networking disabled and only the
  installer-bundled DLLs + a local `.onnx`, the runtime initializes and runs.
  **Accept:** ML inference works fully offline.
- **Quota/eviction:** exceeding the 80 MB budget prunes older versions only
  after a newer one is verified. **Accept:** never deletes the in-use model.

### 6.3 Graceful fallback

- **No model present (fresh install):** prediction returns from the heuristic.
  **Accept:** `source == HEURISTIC`, valid interval, no error surfaced.
- **Runtime missing/unloadable:** simulate absent native libs → heuristic path.
  **Accept:** no exception reaches the ViewModel.
- **Inference timeout/exception:** inject a slow/throwing runtime → fallback
  within the timeout. **Accept:** UI renders a heuristic estimate.
- **Parity / sanity:** for a fixed fixture, ML and heuristic `p50` agree within a
  tolerance band; if they diverge beyond the band, the calibration gate (below)
  fails the model in CI rather than shipping it.

### 6.4 Calibration gate (pre-ship, offline eval)

🔒 Runs in the ML training/eval pipeline, not on-device. Before a model is
promoted past **Testing** in the registry: interval **coverage** of the 80%
band must be within `[0.75, 0.85]` on a held-out synthetic set, `p50` MAPE must
beat the heuristic baseline, and monotonicity (`p10 ≤ p50 ≤ p90`) must hold for
100% of eval rows. Failing any check blocks promotion.

## Privacy guarantees

- **No data leaves the device for inference.** Transactions, balances, recurring
  rules, derived features, and predictions are computed and consumed entirely
  on-device. There is no inference API call.
- **One-way model fetch only.** The sole network interaction is downloading a
  public, versioned model artifact and its manifest (a _pull_); nothing about the
  user is sent to obtain it. The download carries no user identifiers beyond what
  standard CDN access requires, and never any financial data.
- **No raw telemetry.** Only privacy-safe aggregate counters are emitted per
  ADR-0014 (`inferenceCount`, `latencyMs`, `userOverrideRate`, `source`) — no
  inputs, outputs, or transaction content.
- **Fail-safe degradation.** Any uncertainty (missing/tampered model, schema
  drift, runtime error) falls back to the local heuristic; it never escalates to
  a network or cloud path.
- **Architecturally enforced.** Because the only inference code path is the local
  `ModelRuntime` + heuristic, there is no code route that could exfiltrate data,
  consistent with ADR-0014's "privacy absolute" property.

## Toolchain-blocked steps (require human action)

| #   | Step                                                                                           | Owner (not architect)      |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | Train/export `balance-predictor` `model.onnx` (quantile regression) + run calibration gate     | 🔒 ML training pipeline    |
| 2   | Add `com.microsoft.onnxruntime` (+ optional `-directml`) dep & native-lib vendoring to Windows | 🔒 @windows platform agent |
| 3   | Implement `expect/actual` `ModelRuntime` + `ModelManager` in `packages/core`                   | 🔒 @native-app-engineer    |
| 4   | Host the CDN model registry/manifest and staged rollout                                        | 🔒 backend / devops        |
| 5   | Code-sign bundled ONNX Runtime / DirectML DLLs via the existing signing pipeline               | 🔒 @devops (code signing)  |
| 6   | Bundle runtime DLLs (and optional baseline `.onnx`) under `apps/windows/packaging/resources`   | 🔒 @windows platform agent |

The architect deliverable is this **plan**: schemas, versioning, packaging
strategy, runtime trade-off, validation cases, fallback, and privacy
guarantees. The implementation steps above are intentionally left to their
owning agents and gated on the ML toolchain.

## References

- [ADR-0014: AI/ML Pipeline Architecture](../architecture/0014-ai-ml-pipeline-architecture.md)
- [ADR-0010: V2 Architecture Vision](../architecture/0010-v2-architecture-vision.md)
- [`BalancePredictionEngine`](../../packages/core/src/commonMain/kotlin/com/finance/core/prediction/BalancePredictionEngine.kt)
- [`OperatingCashForecastEngine`](../../packages/core/src/commonMain/kotlin/com/finance/core/forecast/OperatingCashForecast.kt)
- [`RecurringTransactionRule`](../../packages/core/src/commonMain/kotlin/com/finance/core/recurring/RecurringTransactionRule.kt)
- [Windows Code Signing Setup](./code-signing-setup.md)
- [ONNX Runtime](https://onnxruntime.ai/) · [Windows ML](https://learn.microsoft.com/windows/ai/windows-ml/) · [DirectML](https://learn.microsoft.com/windows/ai/directml/dml)
