// SPDX-License-Identifier: BUSL-1.1

// MerchantRecognizerTests.swift
// FinanceTests
//
// Tests that noisy card descriptors are cleaned into merchant names with
// best-effort category suggestions and honest confidence levels (#2171).

import XCTest
@testable import FinanceApp

final class MerchantRecognizerTests: XCTestCase {

    func testCleansNoisyDescriptor() {
        let name = MerchantRecognizer.clean("WHOLE FOODS MKT #123 POS DEBIT")
        XCTAssertTrue(name.localizedCaseInsensitiveContains("Whole"))
        XCTAssertTrue(name.localizedCaseInsensitiveContains("Foods"))
        XCTAssertFalse(name.contains("123"))
        XCTAssertFalse(name.localizedCaseInsensitiveContains("POS"))
    }

    func testSuggestsCategoryFromKeywords() {
        XCTAssertEqual(MerchantRecognizer.suggestedCategory(for: "SQ *BLUE BOTTLE COFFEE"), "Dining Out")
        XCTAssertEqual(MerchantRecognizer.suggestedCategory(for: "UBER *TRIP HELP.UBER.COM"), "Transport")
        XCTAssertEqual(MerchantRecognizer.suggestedCategory(for: "AIRBNB * HMXYZ12345"), "Travel")
        XCTAssertNil(MerchantRecognizer.suggestedCategory(for: "ACME WIDGETS 5567"))
    }

    func testHighConfidenceWhenNameAndCategoryResolved() {
        let candidate = MerchantRecognizer.recognize(
            id: "1",
            rawDescriptor: "SQ *BLUE BOTTLE COFFEE",
            amountMinorUnits: 540,
            currencyCode: "USD",
            date: Date(),
            cardLast4: "4242"
        )
        XCTAssertEqual(candidate.confidence, .high)
        XCTAssertEqual(candidate.suggestedCategory, "Dining Out")
        XCTAssertEqual(candidate.amountMinorUnits, 540)
    }

    func testMediumConfidenceWhenNameButNoCategory() {
        let candidate = MerchantRecognizer.recognize(
            id: "2",
            rawDescriptor: "ACME WIDGETS 5567",
            amountMinorUnits: 1200,
            currencyCode: "USD",
            date: Date(),
            cardLast4: nil
        )
        XCTAssertEqual(candidate.confidence, .medium)
        XCTAssertNil(candidate.suggestedCategory)
    }

    func testLowConfidenceWhenDescriptorIsAllNoise() {
        let candidate = MerchantRecognizer.recognize(
            id: "3",
            rawDescriptor: "PAYMENT REF 88213 AUTH",
            amountMinorUnits: 999,
            currencyCode: "USD",
            date: Date(),
            cardLast4: nil
        )
        XCTAssertEqual(candidate.confidence, .low)
    }

    func testAmountIsNormalizedToPositiveMagnitude() {
        let candidate = MerchantRecognizer.recognize(
            id: "4",
            rawDescriptor: "SOME SHOP",
            amountMinorUnits: -2500,
            currencyCode: "USD",
            date: Date(),
            cardLast4: nil
        )
        XCTAssertEqual(candidate.amountMinorUnits, 2500)
    }
}
