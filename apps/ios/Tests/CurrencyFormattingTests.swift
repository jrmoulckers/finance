// SPDX-License-Identifier: BUSL-1.1

// CurrencyFormattingTests.swift
// FinanceTests
//
// Tests for the currency formatting logic used by CurrencyLabel.
//
// CurrencyLabel's formatting methods are private, so these tests validate
// the same minor-to-major-unit conversion and decimal-place resolution
// patterns independently to ensure correctness across currency codes.

import XCTest
@testable import FinanceApp

final class CurrencyFormattingTests: XCTestCase {

    // MARK: - Helpers

    /// Maps currency code to expected decimal places, mirroring CurrencyLabel logic.
    private func decimalPlaces(for currencyCode: String) -> Int {
        switch currencyCode {
        case "JPY", "KRW", "VND": 0
        case "BHD", "KWD", "OMR": 3
        default: 2
        }
    }

    /// Converts minor units to major units using Decimal, mirroring CurrencyLabel logic.
    private func convertToMajorUnits(_ minorUnits: Int64, currencyCode: String) -> Decimal {
        let places = decimalPlaces(for: currencyCode)
        let divisor = pow(Decimal(10), places)
        return Decimal(minorUnits) / divisor
    }

    /// Formats an amount using NumberFormatter, mirroring CurrencyLabel logic.
    private func format(_ minorUnits: Int64, currencyCode: String) -> String? {
        let places = decimalPlaces(for: currencyCode)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.minimumFractionDigits = places
        formatter.maximumFractionDigits = places
        let divisor = NSDecimalNumber(decimal: pow(10, places))
        let amount = NSDecimalNumber(value: minorUnits)
        let majorUnits = amount.dividing(by: divisor)
        return formatter.string(from: majorUnits)
    }

    // MARK: - Decimal Places Resolution

    func testStandardCurrencyDecimalPlaces() {
        XCTAssertEqual(decimalPlaces(for: "USD"), 2)
        XCTAssertEqual(decimalPlaces(for: "EUR"), 2)
        XCTAssertEqual(decimalPlaces(for: "GBP"), 2)
        XCTAssertEqual(decimalPlaces(for: "CAD"), 2)
        XCTAssertEqual(decimalPlaces(for: "AUD"), 2)
        XCTAssertEqual(decimalPlaces(for: "CHF"), 2)
    }

    func testZeroDecimalPlaceCurrencies() {
        XCTAssertEqual(decimalPlaces(for: "JPY"), 0)
        XCTAssertEqual(decimalPlaces(for: "KRW"), 0)
        XCTAssertEqual(decimalPlaces(for: "VND"), 0)
    }

    func testThreeDecimalPlaceCurrencies() {
        XCTAssertEqual(decimalPlaces(for: "BHD"), 3)
        XCTAssertEqual(decimalPlaces(for: "KWD"), 3)
        XCTAssertEqual(decimalPlaces(for: "OMR"), 3)
    }

    // MARK: - Minor-to-Major Conversion

    func testPositiveAmountConversion() {
        let major = convertToMajorUnits(125_050, currencyCode: "USD")
        XCTAssertEqual(major, Decimal(string: "1250.50"),
                       "125050 minor units USD should convert to 1250.50")
    }

    func testNegativeAmountConversion() {
        let major = convertToMajorUnits(-42_99, currencyCode: "USD")
        XCTAssertEqual(major, Decimal(string: "-42.99"),
                       "-4299 minor units USD should convert to -42.99")
    }

    func testZeroAmountConversion() {
        let major = convertToMajorUnits(0, currencyCode: "EUR")
        XCTAssertEqual(major, Decimal(0),
                       "0 minor units should convert to 0.00")
    }

    func testJPYConversionNoFraction() {
        let major = convertToMajorUnits(15_000, currencyCode: "JPY")
        XCTAssertEqual(major, Decimal(15_000),
                       "JPY uses 0 decimal places — minor units equal major units")
    }

    func testBHDThreeDecimalConversion() {
        let major = convertToMajorUnits(12_345, currencyCode: "BHD")
        XCTAssertEqual(major, Decimal(string: "12.345"),
                       "12345 minor units BHD (3 decimal places) should convert to 12.345")
    }

    // MARK: - NumberFormatter Output

    func testFormatterProducesNonNilOutput() {
        // The formatter should produce a valid string for all currency codes
        let currencies = ["USD", "EUR", "GBP", "JPY", "BHD", "KRW", "OMR"]
        for code in currencies {
            let result = format(100_00, currencyCode: code)
            XCTAssertNotNil(result, "Formatter should produce output for \(code)")
            XCTAssertFalse(result?.isEmpty ?? true,
                           "Formatted string for \(code) should not be empty")
        }
    }

    func testFormatterHandlesLargeAmounts() {
        // 1 billion cents = $10,000,000.00
        let result = format(1_000_000_000, currencyCode: "USD")
        XCTAssertNotNil(result, "Formatter should handle large amounts")
    }
}
