// SPDX-License-Identifier: BUSL-1.1

import XCTest
@testable import FinanceShared

final class WidgetPrivacyTests: XCTestCase {
    func testDefaultWidgetMaskingModeIsBucketed() {
        XCTAssertEqual(WidgetPrivacySettings.defaultMode, .bucketed)
    }

    func testBucketedFormatterDoesNotExposeExactCents() {
        let formatted = WidgetMoneyFormatter.formatAmount(
            minorUnits: 12_345,
            currencyCode: "USD",
            mode: .bucketed,
            locale: Locale(identifier: "en_US_POSIX")
        )

        XCTAssertFalse(formatted.contains("123.45"))
        XCTAssertTrue(formatted.contains("$100"))
        XCTAssertTrue(formatted.contains("$500"))
    }

    func testDotsFormatterMasksValue() {
        XCTAssertEqual(
            WidgetMoneyFormatter.formatAmount(minorUnits: 99_999, mode: .dots),
            "•••"
        )
    }

    func testPercentFormatterUsesProvidedDenominator() {
        let formatted = WidgetMoneyFormatter.formatAmount(
            minorUnits: 25,
            mode: .percent,
            locale: Locale(identifier: "en_US_POSIX"),
            percentOfMinorUnits: 100
        )

        XCTAssertEqual(formatted, "25%")
    }

    func testWidgetPromptFlagIsConsumedOnce() {
        let suiteName = "test.widget.privacy.prompt"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        WidgetPrivacySettings.markFirstAddPromptPending(defaults: defaults)
        WidgetPrivacySettings.markFirstAddPromptPending(defaults: defaults)

        XCTAssertTrue(WidgetPrivacySettings.consumeFirstAddPrompt(defaults: defaults))
        XCTAssertFalse(WidgetPrivacySettings.consumeFirstAddPrompt(defaults: defaults))
    }

    func testBudgetCategoryDeepLinkPercentEncodesIdentifier() {
        let url = FinanceWidgetDeepLinks.budgetCategoryURL(categoryId: "food/rent")

        XCTAssertEqual(url.absoluteString, "finance://budget/category/food%2Frent")
    }
}
