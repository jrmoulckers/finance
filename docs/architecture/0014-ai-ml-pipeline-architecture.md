# ADR-0014: AI/ML Pipeline Architecture — On-Device Serving, Training Pipeline, Federated Learning

**Status:** Proposed
**Date:** 2025-07-27
**Author:** System Architect (AI agent)
**Reviewers:** Pending human review
**Sprint:** S12

## Context

Finance V2 AI features (ADR-0010) must run **entirely on-device** — transaction data never leaves the device for inference.

### Requirements

| Feature              | Model Type          | Size    | Latency  |
| -------------------- | ------------------- | ------- | -------- |
| Auto-categorization  | Text classification | < 15 MB | < 30 ms  |
| Anomaly detection    | Statistical + ML    | < 5 MB  | < 50 ms  |
| Predictive budgeting | Time-series         | < 10 MB | < 100 ms |
| NLP search           | Embedding           | < 30 MB | < 100 ms |
| Receipt OCR          | Vision              | < 20 MB | < 500 ms |

Total: < 80 MB. Downloaded on-demand, not bundled.

| Platform | Runtime         | Format     | Acceleration  |
| -------- | --------------- | ---------- | ------------- |
| Android  | TensorFlow Lite | .tflite    | GPU, NNAPI    |
| iOS      | Core ML         | .mlpackage | Neural Engine |
| Windows  | ONNX Runtime    | .onnx      | DirectML      |
| Web      | TF.js / ONNX    | .onnx      | WebGPU, WASM  |

## Decision

**Three-layer ML architecture**: on-device inference → centralized training → federated learning.

### Layer 1: On-Device Serving

```kotlin
// packages/core/src/commonMain/kotlin/com/finance/core/ai/ModelRuntime.kt
expect class ModelRuntime() {
    suspend fun loadModel(artifact: ModelArtifact): LoadedModel
    suspend fun predict(model: LoadedModel, input: ModelInput): ModelOutput
    fun isHardwareAccelerated(): Boolean
    suspend fun unloadModel(model: LoadedModel)
}
```

**ModelManager** handles version checking, background download, SHA-256 integrity, 80 MB disk quota, and rule-based fallback.

**Model Registry** hosted on CDN with versioned manifest:

```json
{
  "registry_version": 1,
  "models": [
    {
      "id": "categorizer",
      "version": "1.2.0",
      "tier": "premium",
      "artifacts": {
        "android": { "url": "/models/v1/categorizer/1.2.0/model.tflite", "sha256": "..." },
        "ios": { "url": "/models/v1/categorizer/1.2.0/model.mlpackage", "sha256": "..." },
        "windows": { "url": "/models/v1/categorizer/1.2.0/model.onnx", "sha256": "..." },
        "web": { "url": "/models/v1/categorizer/1.2.0/model.onnx", "sha256": "..." }
      },
      "fallback": "rule-based"
    }
  ]
}
```

### Layer 2: Centralized Training

Data sources (prioritized by privacy):

1. **Synthetic data** (primary) — generated descriptions, known category mappings
2. **Public datasets** — government data, MCC database, open-source categorization
3. **Opt-in anonymized** (future) — differential privacy; category mappings only; k-anonymity ≥ 100

Pipeline: Data Prep → PyTorch/TF Training → INT8 Quantization → Export (TFLite + CoreML + ONNX + WASM) → Evaluation Gate (accuracy > 85%, size < budget) → Staged CDN Rollout (5% → 25% → 100%)

### Layer 3: Federated Learning (Future)

Each round: server publishes model → devices fine-tune locally → compute gradient delta → apply differential privacy (ε ≤ 8.0) → encrypt via secure aggregation → upload → server aggregates 100+ encrypted updates → new model version.

**Server never sees device data or individual updates.**

**Prerequisites (all required):** 10K+ premium users, secure aggregation deployed, DP library integrated, external privacy audit, opt-in UI, GDPR Art. 22 review.

### Rule-Based Fallback

```kotlin
interface Categorizer {
    suspend fun categorize(description: String): CategorySuggestion
}

class RuleBasedCategorizer(
    private val merchantDb: MerchantDatabase,
    private val keywordRules: List<CategoryRule>,
) : Categorizer {
    override suspend fun categorize(description: String): CategorySuggestion {
        merchantDb.findMerchant(description)?.let {
            return CategorySuggestion(it.defaultCategoryId, 0.9, MERCHANT_DB)
        }
        keywordRules.firstOrNull { it.matches(description) }?.let {
            return CategorySuggestion(it.categoryId, 0.7, KEYWORD_RULE)
        }
        return CategorySuggestion(null, 0.0, NONE)
    }
}

class MLCategorizer(
    private val runtime: ModelRuntime,
    private val modelManager: ModelManager,
    private val fallback: RuleBasedCategorizer,
) : Categorizer {
    override suspend fun categorize(description: String): CategorySuggestion {
        val model = modelManager.getModel("categorizer")
            ?: return fallback.categorize(description)
        return try {
            val output = runtime.predict(model, ModelInput.text(description))
            CategorySuggestion(output.topClass, output.topConfidence, ML_MODEL)
        } catch (e: Exception) { fallback.categorize(description) }
    }
}
```

### Model Lifecycle

Draft → Testing (eval gate) → Staged (5% canary) → Live → Archived. Automatic rollback on metric degradation.

**Privacy-safe telemetry:** inferenceCount, latency, userOverrideRate — NO input/output/transaction data.

## Alternatives Considered

### Alternative 1: Cloud ML (OpenAI / Vertex AI)

- **Pros:** SOTA models; no on-device management.
- **Cons:** **Breaks privacy-first.** Sends transactions to third parties. No offline. Per-request costs.

### Alternative 2: On-Device Training Only

- **Pros:** Maximum privacy.
- **Cons:** Cold-start: no help for new users. Battery/thermal impact.

### Alternative 3: Homomorphic Encryption

- **Pros:** Encrypted cloud inference.
- **Cons:** 1000x–10000x overhead (30ms → 30–300 seconds).

### Alternative 4: Federated Learning Only

- **Pros:** Real data without collection.
- **Cons:** Can't bootstrap from scratch; needs 10K+ users.

## Consequences

### Positive

- **Privacy absolute** — data never leaves device; architecturally enforced
- Offline AI — works after model download
- Graceful degradation — rule-based fallback always available
- Platform-optimal — Neural Engine, NNAPI, DirectML
- Clear path — synthetic → production → federated

### Negative

- Four-format model maintenance (TFLite + CoreML + ONNX + WASM)
- On-device accuracy ceiling (80–90% vs. cloud 95%+)
- 15–80 MB model downloads required
- Federated learning is research-grade complexity

### Risks

| Risk                    | Likelihood | Impact   | Mitigation                                |
| ----------------------- | ---------- | -------- | ----------------------------------------- |
| Accuracy too low        | Medium     | High     | Confidence scores; easy override; iterate |
| Model too large         | Medium     | Medium   | INT8 quantization; skip on < 2 GB RAM     |
| FL privacy leak         | Low        | Critical | External audit; conservative ε; cohorts   |
| Runtime breaking change | Low        | Medium   | Pin versions; CPU fallback                |

## Implementation Notes

### Phased Plan

```
Phase 1 (V2.0): ModelRuntime expect/actual, ModelManager, CDN, rule-based fallbacks
Phase 2 (V2.1): First ML models (categorizer), A/B test
Phase 3 (V2.2): NLP search, predictive budgeting, receipt OCR
Phase 4 (V3.0): Federated learning (prereqs: 10K+ users, privacy audit)
```

## References

- [ADR-0010: V2 Architecture Vision](./0010-v2-architecture-vision.md)
- [TensorFlow Lite](https://www.tensorflow.org/lite), [Core ML](https://developer.apple.com/documentation/coreml), [ONNX Runtime](https://onnxruntime.ai/)
- [Federated Learning — Google AI](https://ai.google/research/pubs/pub45648)
- [Differential Privacy — Apple](https://www.apple.com/privacy/docs/Differential_Privacy_Overview.pdf)
- [Secure Aggregation — Bonawitz et al.](https://eprint.iacr.org/2017/281)
- [Flower FL Framework](https://flower.ai/)
