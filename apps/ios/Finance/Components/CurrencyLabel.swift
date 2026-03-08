// SPDX-License-Identifier: BUSL-1.1

// CurrencyLabel.swift
// Finance
//
// Reusable component for displaying monetary amounts with proper formatting,
// sign coloring, and accessibility support.

import SwiftUI

/// Displays a formatted currency amount with sign-aware coloring.
///
/// Uses `Decimal` internally to avoid floating-point precision errors.
/// All text uses Dynamic Type system fonts — no hardcoded sizes.
struct CurrencyLabel: View {
    let amountInMinorUnits: Int64
    let currencyCode: String
    let showSign: Bool
    let font: Font

    init(
        amountInMinorUnits: Int64,
        currencyCode: String = "USD",
        showSign: Bool = true,
        font: Font = .body
    ) {
        self.amountInMinorUnits = amountInMinorUnits
        self.currencyCode = currencyCode
        self.showSign = showSign
        self.font = font
    }

    var body: some View {
        Text(formattedAmount)
            .font(font)
            .foregroundStyle(amountColor)
            .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Private

    private var decimalPlaces: Int {
        switch currencyCode {
        case "JPY", "KRW", "VND": 0
        case "BHD", "KWD", "OMR": 3
        default: 2
        }
    }

    private var formattedAmount: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.minimumFractionDigits = decimalPlaces
        formatter.maximumFractionDigits = decimalPlaces
        let divisor = NSDecimalNumber(decimal: pow(10, decimalPlaces))
        let amount = NSDecimalNumber(value: amountInMinorUnits)
        let majorUnits = amount.dividing(by: divisor)
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(amountInMinorUnits)"
    }

    private var amountColor: Color {
        guard showSign else { return .primary }
        if amountInMinorUnits > 0 { return .green }
        if amountInMinorUnits < 0 { return .red }
        return .primary
    }

    private var accessibilityDescription: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.minimumFractionDigits = decimalPlaces
        formatter.maximumFractionDigits = decimalPlaces
        let divisor = NSDecimalNumber(decimal: pow(10, decimalPlaces))
        let amount = NSDecimalNumber(value: amountInMinorUnits)
        let majorUnits = amount.dividing(by: divisor)
        let formatted = formatter.string(from: majorUnits) ?? "\(amountInMinorUnits) \(currencyCode)"
        if showSign && amountInMinorUnits > 0 {
            return String(localized: "Income of \(formatted)")
        } else if showSign && amountInMinorUnits < 0 {
            return String(localized: "Expense of \(formatted)")
        }
        return formatted
    }
}

#Preview("Positive") { CurrencyLabel(amountInMinorUnits: 125_050) }
#Preview("Negative") { CurrencyLabel(amountInMinorUnits: -42_99) }
#Preview("Zero") { CurrencyLabel(amountInMinorUnits: 0, currencyCode: "EUR", showSign: false) }
#Preview("JPY") { CurrencyLabel(amountInMinorUnits: 15_000, currencyCode: "JPY") }
