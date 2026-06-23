// SPDX-License-Identifier: BUSL-1.1

// CoreMLCategoryClassifier.swift
// Finance
//
// Concrete on-device Core ML adapter conforming to the Shared `MLCategoryClassifier`
// seam. It loads a compiled category model from the app bundle when present and
// classifies reduced `CategorizationFeatures` entirely on-device — no merchant,
// memo, or amount content ever leaves the device.
//
// When no model asset is bundled (the current shipping state), the adapter
// reports `isAvailable == false`, which drives the rule-engine fallback in
// `TransactionCategorizer`. Packaging the compiled `.mlmodelc` and wiring the
// `MLModel` feature-vector prediction is an Xcode/Core ML toolchain step.
//
// References: #2382

import CoreML
import FinanceShared
import Foundation
import os

/// Core ML-backed implementation of ``MLCategoryClassifier``.
///
/// Thread-safe and `Sendable`: the underlying `MLModel` is loaded once at init
/// and only read afterwards.
final class CoreMLCategoryClassifier: MLCategoryClassifier, @unchecked Sendable {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "CoreMLCategoryClassifier"
    )

    /// Name of the compiled model resource expected in the app bundle.
    private let modelResourceName: String

    /// The loaded model, or `nil` when no asset is bundled / load failed.
    private let model: MLModel?

    /// Whether the model and runtime are ready for inference.
    let isAvailable: Bool

    /// Loads the model from the given bundle if present.
    init(modelResourceName: String = "TransactionCategoryClassifier", bundle: Bundle = .main) {
        self.modelResourceName = modelResourceName

        // A compiled Core ML model ships as a `.mlmodelc` directory in the
        // bundle. When absent (current shipping state) we stay unavailable and
        // the rule engine takes over — the feature never fails closed.
        guard let url = bundle.url(forResource: modelResourceName, withExtension: "mlmodelc") else {
            Self.logger.info(
                "No Core ML category model bundled; using rule-engine fallback."
            )
            self.model = nil
            self.isAvailable = false
            return
        }

        do {
            let configuration = MLModelConfiguration()
            configuration.computeUnits = .all
            let loaded = try MLModel(contentsOf: url, configuration: configuration)
            self.model = loaded
            self.isAvailable = true
            Self.logger.info("Core ML category model loaded.")
        } catch {
            // Runtime load failure: log an aggregate, content-free error and
            // fall back to rules.
            Self.logger.error(
                "Core ML model load failed: \(error.localizedDescription, privacy: .public)"
            )
            self.model = nil
            self.isAvailable = false
        }
    }

    func classify(features: CategorizationFeatures) -> CategorizationSuggestion? {
        guard isAvailable, model != nil else { return nil }

        // TODO(human): Map `features` (tokens + numeric/temporal signals) into the
        // model's `MLFeatureProvider` input, run `model.prediction(from:)`, and
        // translate the top label + probability into a `CategorizationSuggestion`
        // with source `.coreML`. This requires the compiled `.mlmodelc` and its
        // generated input/output schema, which are produced by the Xcode/Core ML
        // toolchain and cannot be authored here. Until wired, abstain to `nil`
        // so the deterministic rule engine drives suggestions.
        return nil
    }
}
