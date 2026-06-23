// SPDX-License-Identifier: BUSL-1.1

// TransactionCategorizerTests.swift
// FinanceTests
//
// Deterministic tests for the rule engine and the priority-ordered
// categorization pipeline (personalization > Core ML > rules > fallback).
//
// References: #2382

import FinanceShared
import XCTest

// MARK: - Stub ML Classifier

private struct StubMLClassifier: MLCategoryClassifier {
    var available: Bool
    var result: CategorizationSuggestion?

    var isAvailable: Bool { available }

    func classify(features: CategorizationFeatures) -> CategorizationSuggestion? {
        result
    }
}

final class TransactionCategorizerTests: XCTestCase {

    private func makeInput(merchant: String, memo: String = "") -> CategorizationInput {
        CategorizationInput(
            merchant: merchant,
            memo: memo,
            amountMinorUnits: 4_200,
            date: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func makeCategorizer(
        ml: MLCategoryClassifier = UnavailableMLClassifier(),
        store: CategoryCorrectionStoring = InMemoryCategoryCorrectionStore()
    ) -> TransactionCategorizer {
        TransactionCategorizer(
            featureExtractor: .utc,
            mlClassifier: ml,
            ruleSuggester: RuleBasedCategorySuggester(),
            correctionStore: store,
            fallbackCategoryId: "other"
        )
    }

    // MARK: - Rules

    func testRulesMatchKnownMerchants() {
        let categorizer = makeCategorizer()

        XCTAssertEqual(categorizer.categorize(makeInput(merchant: "Starbucks")).categoryId, "food")
        XCTAssertEqual(categorizer.categorize(makeInput(merchant: "Whole Foods Market")).categoryId, "groceries")
        XCTAssertEqual(categorizer.categorize(makeInput(merchant: "Shell Gas Station")).categoryId, "transport")
        XCTAssertEqual(categorizer.categorize(makeInput(merchant: "Netflix")).categoryId, "entertainment")
    }

    func testRuleSourceAndConfidence() {
        let categorizer = makeCategorizer()
        let suggestion = categorizer.categorize(makeInput(merchant: "Whole Foods Market"))
        XCTAssertEqual(suggestion.source, .rules)
        XCTAssertGreaterThan(suggestion.score, 0.5)
        XCTAssertLessThanOrEqual(suggestion.score, 0.85)
    }

    func testUnknownMerchantFallsBack() {
        let categorizer = makeCategorizer()
        let suggestion = categorizer.categorize(makeInput(merchant: "Zxqw"))
        XCTAssertEqual(suggestion.source, .fallback)
        XCTAssertEqual(suggestion.categoryId, "other")
        XCTAssertEqual(suggestion.score, 0.0)
        XCTAssertTrue(suggestion.isFallback)
    }

    // MARK: - Priority

    func testCoreMLWinsOverRulesWhenAvailable() {
        let mlSuggestion = CategorizationSuggestion(categoryId: "shopping", score: 0.9, source: .coreML)
        let categorizer = makeCategorizer(ml: StubMLClassifier(available: true, result: mlSuggestion))
        // "Starbucks" would be food by rules, but ML overrides.
        let suggestion = categorizer.categorize(makeInput(merchant: "Starbucks"))
        XCTAssertEqual(suggestion.source, .coreML)
        XCTAssertEqual(suggestion.categoryId, "shopping")
    }

    func testUnavailableMLFallsThroughToRules() {
        let categorizer = makeCategorizer(ml: StubMLClassifier(available: false, result: nil))
        let suggestion = categorizer.categorize(makeInput(merchant: "Starbucks"))
        XCTAssertEqual(suggestion.source, .rules)
    }

    func testMLAbstainFallsThroughToRules() {
        let categorizer = makeCategorizer(ml: StubMLClassifier(available: true, result: nil))
        let suggestion = categorizer.categorize(makeInput(merchant: "Starbucks"))
        XCTAssertEqual(suggestion.source, .rules)
    }

    func testPersonalizationWinsOverEverything() {
        let store = InMemoryCategoryCorrectionStore()
        let mlSuggestion = CategorizationSuggestion(categoryId: "shopping", score: 0.95, source: .coreML)
        let categorizer = makeCategorizer(
            ml: StubMLClassifier(available: true, result: mlSuggestion),
            store: store
        )
        let input = makeInput(merchant: "Starbucks")
        categorizer.learnCorrection(for: input, categoryId: "bills")

        let suggestion = categorizer.categorize(input)
        XCTAssertEqual(suggestion.source, .personalization)
        XCTAssertEqual(suggestion.categoryId, "bills")
        XCTAssertGreaterThan(suggestion.score, 0.9)
    }

    // MARK: - Personalization persistence

    func testLearnedCorrectionAppliesToSameSignature() {
        let store = InMemoryCategoryCorrectionStore()
        let categorizer = makeCategorizer(store: store)

        let learnInput = makeInput(merchant: "Starbucks #44")
        categorizer.learnCorrection(for: learnInput, categoryId: "food")

        // Different store number, same token signature -> personalised.
        let recallInput = makeInput(merchant: "STARBUCKS STORE 91")
        let suggestion = categorizer.categorize(recallInput)
        XCTAssertEqual(suggestion.source, .personalization)
        XCTAssertEqual(suggestion.categoryId, "food")
    }

    func testForgetCorrectionRevertsToRules() {
        let store = InMemoryCategoryCorrectionStore()
        let categorizer = makeCategorizer(store: store)
        let input = makeInput(merchant: "Starbucks")

        categorizer.learnCorrection(for: input, categoryId: "bills")
        XCTAssertEqual(categorizer.categorize(input).source, .personalization)

        categorizer.forgetCorrection(for: input)
        XCTAssertEqual(categorizer.categorize(input).source, .rules)
    }

    // MARK: - Confidence bands

    func testConfidenceBandMapping() {
        XCTAssertEqual(CategorizationConfidenceBand(score: 0.95), .high)
        XCTAssertEqual(CategorizationConfidenceBand(score: 0.65), .medium)
        XCTAssertEqual(CategorizationConfidenceBand(score: 0.35), .low)
        XCTAssertEqual(CategorizationConfidenceBand(score: 0.0), .none)
    }
}
