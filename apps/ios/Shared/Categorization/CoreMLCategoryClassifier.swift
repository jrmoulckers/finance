// SPDX-License-Identifier: BUSL-1.1

// CoreMLCategoryClassifier.swift
// FinanceShared
//
// Protocol seam for the on-device Core ML classifier. The Shared module stays
// dependency-free (no CoreML import) so it builds everywhere and stays fully
// unit-testable; the concrete Core ML-backed adapter lives in the Finance app
// target where the compiled model is bundled.
//
// When no model is available this seam yields `nil`, and the orchestrating
// ``TransactionCategorizer`` transparently falls back to the rule engine. See
// `Shared/Categorization/README.md` for the documented fallback chain.
//
// References: #2382

import Foundation

/// Contract for an on-device machine-learning category classifier.
///
/// Conformers must run entirely on-device. They receive only the reduced
/// ``CategorizationFeatures`` (tokens + coarse numeric/temporal signals), never
/// raw merchant/memo/amount content beyond what the features already expose.
public protocol MLCategoryClassifier: Sendable {
    /// Whether the model and runtime are loaded and ready.
    ///
    /// When `false`, callers must skip ML and fall back to rules.
    var isAvailable: Bool { get }

    /// Returns a classification, or `nil` when the model abstains or is missing.
    func classify(features: CategorizationFeatures) -> CategorizationSuggestion?
}

/// A no-op classifier used when no Core ML asset is bundled.
///
/// Always reports `isAvailable == false` and classifies to `nil`, which drives
/// the rule-engine fallback. This is the default wired into
/// ``TransactionCategorizer/makeDefault(...)``.
public struct UnavailableMLClassifier: MLCategoryClassifier {
    public init() {}

    public var isAvailable: Bool { false }

    public func classify(features: CategorizationFeatures) -> CategorizationSuggestion? {
        nil
    }
}

/// Wraps any ``MLCategoryClassifier`` as a ``CategorySuggesting`` so the
/// orchestrator can treat ML and rules uniformly.
public struct MLCategorySuggester: CategorySuggesting {
    private let classifier: MLCategoryClassifier

    public init(classifier: MLCategoryClassifier) {
        self.classifier = classifier
    }

    public func suggest(
        features: CategorizationFeatures,
        input: CategorizationInput
    ) -> CategorizationSuggestion? {
        guard classifier.isAvailable else { return nil }
        return classifier.classify(features: features)
    }
}
