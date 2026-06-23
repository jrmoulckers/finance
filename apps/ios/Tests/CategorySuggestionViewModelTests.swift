// SPDX-License-Identifier: BUSL-1.1

// CategorySuggestionViewModelTests.swift
// FinanceTests
//
// Tests the review-surface view model: showing a suggestion, accept, override,
// disable, and the disabled-at-init path. Uses isolated UserDefaults and an
// in-memory telemetry recorder for determinism.
//
// References: #2382

import FinanceShared
import XCTest
@testable import FinanceApp

final class CategorySuggestionViewModelTests: XCTestCase {

    private let categories: [CategoryItem] = [
        CategoryItem(id: "food", name: "Food", colorHex: "#38A169", icon: "fork.knife"),
        CategoryItem(id: "groceries", name: "Groceries", colorHex: "#3182CE", icon: "cart"),
        CategoryItem(id: "bills", name: "Bills", colorHex: "#805AD5", icon: "doc.text"),
        CategoryItem(id: "other", name: "Other", colorHex: "#718096", icon: "ellipsis"),
    ]

    private func makeInput(merchant: String) -> CategorizationInput {
        CategorizationInput(
            merchant: merchant,
            amountMinorUnits: 1_500,
            date: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeContext() -> (TransactionCategorizer, InMemoryCategorizationTelemetry, UserDefaults, String) {
        let store = InMemoryCategoryCorrectionStore()
        let categorizer = TransactionCategorizer(
            featureExtractor: .utc,
            correctionStore: store,
            fallbackCategoryId: "other"
        )
        let telemetry = InMemoryCategorizationTelemetry()
        let suiteName = "test.categorization.vm.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        return (categorizer, telemetry, defaults, suiteName)
    }

    @MainActor
    func testShowsSuggestionAndRecordsTelemetry() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let vm = CategorySuggestionViewModel(
            input: makeInput(merchant: "Starbucks"),
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )

        XCTAssertEqual(vm.state, .suggested)
        XCTAssertEqual(vm.selectedCategoryId, "food")
        XCTAssertEqual(vm.selectedCategory?.name, "Food")
        XCTAssertFalse(vm.confidenceText.isEmpty)
        XCTAssertFalse(vm.isFallback)
        XCTAssertEqual(telemetry.snapshot().suggestionsShown, 1)
    }

    @MainActor
    func testAcceptPersistsCorrectionAndRecords() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let input = makeInput(merchant: "Starbucks")

        let vm = CategorySuggestionViewModel(
            input: input,
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )
        vm.accept()

        XCTAssertEqual(vm.state, .accepted)
        XCTAssertEqual(telemetry.snapshot().accepted, 1)
        // The acceptance is learned for future personalization.
        XCTAssertEqual(categorizer.categorize(input).source, .personalization)
    }

    @MainActor
    func testOverrideChangesSelectionAndRecords() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let input = makeInput(merchant: "Starbucks")

        let vm = CategorySuggestionViewModel(
            input: input,
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )
        vm.override(to: "bills")

        XCTAssertEqual(vm.state, .overridden)
        XCTAssertEqual(vm.selectedCategoryId, "bills")
        XCTAssertEqual(vm.selectedCategory?.name, "Bills")
        XCTAssertEqual(telemetry.snapshot().overridden, 1)
        XCTAssertEqual(categorizer.categorize(input).categoryId, "bills")
    }

    @MainActor
    func testDisableTurnsOffAndPersistsPreference() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let vm = CategorySuggestionViewModel(
            input: makeInput(merchant: "Starbucks"),
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )
        vm.disableSuggestions()

        XCTAssertEqual(vm.state, .disabled)
        XCTAssertNil(vm.suggestion)
        XCTAssertFalse(vm.isEnabled)
        XCTAssertEqual(telemetry.snapshot().disabled, 1)
        XCTAssertFalse(CategorizationPreferences.isEnabled(defaults: defaults))
    }

    @MainActor
    func testInitRespectsDisabledPreference() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }
        CategorizationPreferences.setEnabled(false, defaults: defaults)

        let vm = CategorySuggestionViewModel(
            input: makeInput(merchant: "Starbucks"),
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )

        XCTAssertEqual(vm.state, .disabled)
        XCTAssertNil(vm.suggestion)
        XCTAssertEqual(telemetry.snapshot().suggestionsShown, 0)
    }

    @MainActor
    func testUnknownMerchantIsFallback() {
        let (categorizer, telemetry, defaults, suiteName) = makeContext()
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let vm = CategorySuggestionViewModel(
            input: makeInput(merchant: "Zxqw"),
            availableCategories: categories,
            categorizer: categorizer,
            telemetry: telemetry,
            preferencesDefaults: defaults
        )

        XCTAssertTrue(vm.isFallback)
        XCTAssertEqual(vm.selectedCategoryId, "other")
        XCTAssertEqual(telemetry.snapshot().fallbackShown, 1)
    }
}
