// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryParserTests.swift
// FinanceTests
//
// Deterministic fixture tests for the on-device natural-language finance query
// parser (#2386). A fixed calendar (UTC) and reference date make every date
// window reproducible, and parsing never touches Speech or App Intents.

import XCTest
@testable import FinanceApp

final class FinanceQueryParserTests: XCTestCase {

    // MARK: - Fixtures

    /// 2024-06-15 12:00 UTC (a Saturday in June).
    private static let referenceDate: Date = {
        var components = DateComponents()
        components.year = 2024
        components.month = 6
        components.day = 15
        components.hour = 12
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: components)!
    }()

    private func makeParser() -> FinanceQueryParser {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let vocabulary = FinanceQueryVocabulary(
            categories: ["Groceries", "Dining Out", "Entertainment", "Transport"],
            accounts: ["Main Checking", "Savings", "Travel Card"],
            merchants: ["Netflix", "Whole Foods", "Shell Gas"]
        )
        return FinanceQueryParser(
            vocabulary: vocabulary,
            calendar: calendar,
            referenceDate: Self.referenceDate
        )
    }

    private func plan(from outcome: FinanceQueryParse) -> FinanceQueryPlan? {
        if case .plan(let plan) = outcome { return plan }
        return nil
    }

    // MARK: - Spend by Category

    func testSpendByCategoryResolves() {
        let outcome = makeParser().parse("How much did I spend on groceries this week?")
        let plan = plan(from: outcome)
        XCTAssertEqual(plan?.kind, .spend(.category("Groceries")))
        XCTAssertEqual(plan?.dateRange?.label, "this week")
        XCTAssertFalse(plan?.isSensitive ?? true)
    }

    func testSpendByCategoryWithoutDate() {
        let outcome = makeParser().parse("How much have I spent on entertainment")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.category("Entertainment")))
        XCTAssertNil(plan(from: outcome)?.dateRange)
    }

    // MARK: - Spend by Merchant

    func testSpendByMerchantViaPreposition() {
        let outcome = makeParser().parse("How much did I spend at Netflix?")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.merchant("Netflix")))
    }

    func testSpendByMerchantStripsTrailingDate() {
        let outcome = makeParser().parse("How much did I spend at Whole Foods last week")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.merchant("Whole Foods")))
        XCTAssertEqual(plan(from: outcome)?.dateRange?.label, "last week")
    }

    // MARK: - Spend by Account

    func testSpendByAccount() {
        let outcome = makeParser().parse("How much did I spend on my Travel Card last month")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.account("Travel Card")))
        XCTAssertEqual(plan(from: outcome)?.dateRange?.label, "last month")
    }

    // MARK: - Spend by Date Range Only

    func testSpendByDateRangeOnly() {
        let outcome = makeParser().parse("How much did I spend last month")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.all))
        XCTAssertEqual(plan(from: outcome)?.dateRange?.label, "last month")
    }

    // MARK: - Clarifications

    func testAmbiguousCategoryRequestsClarification() {
        let outcome = makeParser().parse("How much did I spend on food this week")
        guard case .clarification(.ambiguousCategory(let phrase, let options)) = outcome else {
            return XCTFail("Expected ambiguousCategory clarification, got \(outcome)")
        }
        XCTAssertEqual(phrase, "food")
        XCTAssertTrue(options.contains("Groceries"))
        XCTAssertTrue(options.contains("Dining Out"))
    }

    func testAmbiguousDateRequestsClarification() {
        let outcome = makeParser().parse("How much did I spend on groceries recently")
        guard case .clarification(.ambiguousDate(let phrase, let options)) = outcome else {
            return XCTFail("Expected ambiguousDate clarification, got \(outcome)")
        }
        XCTAssertEqual(phrase, "recently")
        XCTAssertTrue(options.contains(.thisMonth))
    }

    func testMissingSubjectRequestsClarification() {
        let outcome = makeParser().parse("How much did I spend")
        XCTAssertEqual(outcome, .clarification(.missingSubject))
    }

    // MARK: - Overrides (clarification resolution)

    func testCategoryOverrideResolves() {
        let outcome = makeParser().parse(
            "How much did I spend on food this week",
            categoryOverride: "Groceries"
        )
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.category("Groceries")))
    }

    func testDateOverrideResolves() {
        let outcome = makeParser().parse(
            "How much did I spend on groceries recently",
            dateOverride: .thisMonth
        )
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.category("Groceries")))
        XCTAssertEqual(plan(from: outcome)?.dateRange?.label, "this month")
    }

    // MARK: - Balance (sensitive)

    func testTotalBalanceIsSensitive() {
        let outcome = makeParser().parse("What's my balance?")
        XCTAssertEqual(plan(from: outcome)?.kind, .balance(account: nil))
        XCTAssertTrue(plan(from: outcome)?.isSensitive ?? false)
    }

    func testSpecificAccountBalance() {
        let outcome = makeParser().parse("What's my Savings balance")
        XCTAssertEqual(plan(from: outcome)?.kind, .balance(account: "Savings"))
    }

    // MARK: - Unrecognized

    func testUnrecognizedQuery() {
        let outcome = makeParser().parse("What's the weather today")
        XCTAssertEqual(outcome, .unrecognized(rawInput: "What's the weather today"))
    }

    func testEmptyInputUnrecognized() {
        let outcome = makeParser().parse("   ")
        XCTAssertEqual(outcome, .unrecognized(rawInput: "   "))
    }

    // MARK: - Determinism & Case Insensitivity

    func testParsingIsDeterministic() {
        let parser = makeParser()
        let first = parser.parse("How much did I spend on groceries this week?")
        let second = parser.parse("How much did I spend on groceries this week?")
        XCTAssertEqual(first, second)
    }

    func testParsingIsCaseInsensitive() {
        let outcome = makeParser().parse("HOW MUCH DID I SPEND ON GROCERIES THIS WEEK")
        XCTAssertEqual(plan(from: outcome)?.kind, .spend(.category("Groceries")))
    }

    // MARK: - Date Window Boundaries

    func testThisMonthWindowBounds() {
        let parser = makeParser()
        guard let range = parser.resolveDateRange(for: .thisMonth) else {
            return XCTFail("Expected a resolved month range")
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!

        let inside = calendar.date(from: DateComponents(year: 2024, month: 6, day: 10))!
        let before = calendar.date(from: DateComponents(year: 2024, month: 5, day: 31))!
        let after = calendar.date(from: DateComponents(year: 2024, month: 7, day: 1))!

        XCTAssertTrue(range.contains(inside))
        XCTAssertFalse(range.contains(before))
        XCTAssertFalse(range.contains(after))
    }
}
