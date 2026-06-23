// SPDX-License-Identifier: BUSL-1.1

// CategorySuggestionViewModel.swift
// Finance
//
// Drives the category-suggestion review surface. It asks the on-device
// `TransactionCategorizer` for a suggestion, exposes its confidence, and lets
// the user accept, override, or disable suggestions. Accept/override persist a
// correction for future personalization; every action emits aggregate,
// content-free telemetry.
//
// References: #2382

import FinanceShared
import Observation
import os
import SwiftUI

/// Outcome state of the suggestion review surface.
enum CategoryReviewState: Equatable, Sendable {
    case suggested
    case accepted
    case overridden
    case disabled
}

@Observable
final class CategorySuggestionViewModel {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "CategorySuggestionViewModel"
    )

    private let input: CategorizationInput
    private let categorizer: TransactionCategorizer
    private let telemetry: any CategorizationTelemetryRecording
    private let preferencesDefaults: UserDefaults?

    // MARK: - State

    /// Categories the user can choose from when overriding.
    let availableCategories: [CategoryItem]

    /// The current suggestion (nil only when suggestions are disabled).
    private(set) var suggestion: CategorizationSuggestion?

    /// The category id currently selected (suggested or overridden).
    private(set) var selectedCategoryId: String

    /// Current review state.
    private(set) var state: CategoryReviewState

    // MARK: - Init

    init(
        input: CategorizationInput,
        availableCategories: [CategoryItem],
        categorizer: TransactionCategorizer,
        telemetry: any CategorizationTelemetryRecording,
        preferencesDefaults: UserDefaults? = SharedConstants.sharedDefaults
    ) {
        self.input = input
        self.availableCategories = availableCategories
        self.categorizer = categorizer
        self.telemetry = telemetry
        self.preferencesDefaults = preferencesDefaults

        guard CategorizationPreferences.isEnabled(defaults: preferencesDefaults) else {
            self.suggestion = nil
            self.selectedCategoryId = ""
            self.state = .disabled
            return
        }

        let suggestion = categorizer.categorize(input)
        self.suggestion = suggestion
        self.selectedCategoryId = suggestion.categoryId
        self.state = .suggested

        telemetry.recordSuggestionShown(source: suggestion.source, band: suggestion.band)
        Self.logger.info(
            "Suggestion shown: source \(suggestion.source.rawValue, privacy: .public), band \(suggestion.band.rawValue, privacy: .public)"
        )
    }

    // MARK: - Derived display

    /// Whether suggestions are currently enabled.
    var isEnabled: Bool { state != .disabled }

    /// Whether the current suggestion is the no-signal fallback.
    var isFallback: Bool { suggestion?.isFallback ?? false }

    /// The resolved `CategoryItem` for the selected category, if known.
    var selectedCategory: CategoryItem? {
        availableCategories.first { $0.id == selectedCategoryId }
    }

    /// Confidence as a whole-number percentage string (e.g. "85%").
    var confidenceText: String {
        guard let suggestion else { return "" }
        return String(format: "%.0f%%", suggestion.score * 100)
    }

    /// Localised confidence band label.
    var confidenceBandLabel: String {
        switch suggestion?.band ?? .none {
        case .high: String(localized: "High confidence")
        case .medium: String(localized: "Medium confidence")
        case .low: String(localized: "Low confidence")
        case .none: String(localized: "No confident match")
        }
    }

    // MARK: - Actions

    /// Accepts the current suggestion as-is and persists it for personalization.
    func accept() {
        guard let suggestion, state == .suggested else { return }
        categorizer.learnCorrection(for: input, categoryId: suggestion.categoryId)
        telemetry.recordAccepted(source: suggestion.source)
        state = .accepted
        Self.logger.info("Suggestion accepted: source \(suggestion.source.rawValue, privacy: .public)")
    }

    /// Overrides the suggestion with a different category and learns from it.
    func override(to categoryId: String) {
        guard isEnabled else { return }
        let source = suggestion?.source ?? .fallback
        selectedCategoryId = categoryId
        categorizer.learnCorrection(for: input, categoryId: categoryId)
        telemetry.recordOverridden(source: source)
        state = .overridden
        Self.logger.info("Suggestion overridden: source \(source.rawValue, privacy: .public)")
    }

    /// Disables category suggestions everywhere and records the choice.
    func disableSuggestions() {
        CategorizationPreferences.setEnabled(false, defaults: preferencesDefaults)
        telemetry.recordDisabled()
        suggestion = nil
        state = .disabled
        Self.logger.info("Category suggestions disabled by user.")
    }
}
