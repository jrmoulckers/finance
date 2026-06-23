// SPDX-License-Identifier: BUSL-1.1

// TransactionCategorizer.swift
// FinanceShared
//
// Orchestrates the on-device categorization pipeline. Given a transaction it
// returns exactly one suggestion by consulting, in priority order:
//
//   1. Personalization  — a learned user correction for this token signature.
//   2. Core ML          — the on-device classifier (if a model is bundled).
//   3. Rules            — the deterministic keyword engine.
//   4. Fallback         — a safe default category, never failing.
//
// The pipeline is pure and synchronous: no network, no disk reads beyond the
// injected correction store. See `Shared/Categorization/README.md` for the
// documented fallback behaviour when Core ML assets/runtime are unavailable.
//
// References: #2382

import Foundation

/// Lightweight on-device preference flag for enabling/disabling suggestions.
public enum CategorizationPreferences {
    public static let suggestionsEnabledKey = "finance:categorization-suggestions-enabled"

    /// Whether category suggestions are enabled (default `true`).
    public static func isEnabled(defaults: UserDefaults? = SharedConstants.sharedDefaults) -> Bool {
        guard let defaults, defaults.object(forKey: suggestionsEnabledKey) != nil else {
            return true
        }
        return defaults.bool(forKey: suggestionsEnabledKey)
    }

    /// Enables or disables category suggestions.
    public static func setEnabled(
        _ enabled: Bool,
        defaults: UserDefaults? = SharedConstants.sharedDefaults
    ) {
        defaults?.set(enabled, forKey: suggestionsEnabledKey)
    }
}

/// The on-device categorization orchestrator.
public struct TransactionCategorizer: Sendable {

    private let featureExtractor: CategorizationFeatureExtractor
    private let mlClassifier: MLCategoryClassifier
    private let ruleSuggester: CategorySuggesting
    private let correctionStore: CategoryCorrectionStoring

    /// Category id used when nothing else matches. Must always exist in the app.
    public let fallbackCategoryId: String

    /// Confidence assigned to a learned personalization match.
    private static let personalizationScore = 0.97

    public init(
        featureExtractor: CategorizationFeatureExtractor = CategorizationFeatureExtractor(),
        mlClassifier: MLCategoryClassifier = UnavailableMLClassifier(),
        ruleSuggester: CategorySuggesting = RuleBasedCategorySuggester(),
        correctionStore: CategoryCorrectionStoring,
        fallbackCategoryId: String = "other"
    ) {
        self.featureExtractor = featureExtractor
        self.mlClassifier = mlClassifier
        self.ruleSuggester = ruleSuggester
        self.correctionStore = correctionStore
        self.fallbackCategoryId = fallbackCategoryId
    }

    /// Convenience factory wiring the production-style defaults.
    public static func makeDefault(
        mlClassifier: MLCategoryClassifier = UnavailableMLClassifier(),
        correctionStore: CategoryCorrectionStoring = UserDefaultsCategoryCorrectionStore(),
        fallbackCategoryId: String = "other"
    ) -> TransactionCategorizer {
        TransactionCategorizer(
            mlClassifier: mlClassifier,
            correctionStore: correctionStore,
            fallbackCategoryId: fallbackCategoryId
        )
    }

    /// Derives the deterministic features for an input (exposed for callers
    /// that need the signature, e.g. to record a correction).
    public func features(for input: CategorizationInput) -> CategorizationFeatures {
        featureExtractor.features(for: input)
    }

    /// Returns the best suggestion for a transaction. Never throws; always
    /// returns at least the fallback.
    public func categorize(_ input: CategorizationInput) -> CategorizationSuggestion {
        let features = featureExtractor.features(for: input)

        // 1. Personalization — highest trust: the user already told us.
        if let learned = correctionStore.correctedCategory(forSignature: features.signature) {
            return CategorizationSuggestion(
                categoryId: learned,
                score: Self.personalizationScore,
                source: .personalization
            )
        }

        // 2. On-device Core ML, when available.
        if mlClassifier.isAvailable,
           let ml = mlClassifier.classify(features: features) {
            return ml
        }

        // 3. Deterministic rule engine.
        if let rule = ruleSuggester.suggest(features: features, input: input) {
            return rule
        }

        // 4. Safe fallback — feature never fails closed.
        return CategorizationSuggestion(
            categoryId: fallbackCategoryId,
            score: 0.0,
            source: .fallback
        )
    }

    /// Persists a user correction so future transactions with the same merchant
    /// signature are personalised. Records only the signature, never content.
    public func learnCorrection(for input: CategorizationInput, categoryId: String) {
        let signature = featureExtractor.features(for: input).signature
        correctionStore.recordCorrection(signature: signature, categoryId: categoryId)
    }

    /// Forgets a previously learned correction for an input's signature.
    public func forgetCorrection(for input: CategorizationInput) {
        let signature = featureExtractor.features(for: input).signature
        correctionStore.removeCorrection(forSignature: signature)
    }
}
