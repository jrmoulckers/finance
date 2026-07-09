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
///
/// ## Performance
/// `NumberFormatter` allocation is expensive (~0.1 ms per instance).
/// This view caches formatters per currency code in a static dictionary
/// to avoid re-allocating on every SwiftUI body evaluation.
struct CurrencyLabel: View {
    let amountInMinorUnits: Int64
    let currencyCode: String
    let showSign: Bool
    let font: Font

    /// Thread-safe cache of `NumberFormatter` instances keyed by
    /// `"currencyCode:decimalPlaces"`. Avoids repeated allocation during
    /// rapid list scrolling and dashboard re-renders.
    private static let formatterCache = FormatterCache()

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

    private var formattedAmount: String {
        let base = Self.formatted(
            minorUnits: amountInMinorUnits,
            currencyCode: currencyCode
        )
        // Reinforce sign with a non-color cue (WCAG 1.4.1): negatives already
        // carry a leading "-" from the formatter, so add an explicit "+" for
        // positive signed amounts. (#3594)
        if showSign, amountInMinorUnits > 0 {
            return "+\(base)"
        }
        return base
    }

    private var amountColor: Color {
        guard showSign else { return .primary }
        // Use WCAG-tuned semantic tokens rather than raw system colors so
        // amounts keep sufficient contrast on light/dark surfaces. (#3579)
        if amountInMinorUnits > 0 { return FinanceColors.amountPositive }
        if amountInMinorUnits < 0 { return FinanceColors.amountNegative }
        return .primary
    }

    private var accessibilityDescription: String {
        let formatted = Self.formatted(
            minorUnits: amountInMinorUnits,
            currencyCode: currencyCode
        )
        if showSign && amountInMinorUnits > 0 {
            return String(localized: "Income of \(formatted)")
        } else if showSign && amountInMinorUnits < 0 {
            return String(localized: "Expense of \(formatted)")
        }
        return formatted
    }
}

// MARK: - Reusable Formatting

extension CurrencyLabel {
    /// Minor-unit decimal places for a given ISO currency code.
    static func decimalPlaces(for currencyCode: String) -> Int {
        switch currencyCode {
        case "JPY", "KRW", "VND": 0
        case "BHD", "KWD", "OMR": 3
        default: 2
        }
    }

    /// Formats a minor-unit amount as a localized currency string.
    ///
    /// Exposed so other views (e.g. accessibility labels that combine an
    /// amount with surrounding context) can reuse the exact same formatting
    /// and cached formatters as `CurrencyLabel` itself.
    static func formatted(minorUnits: Int64, currencyCode: String) -> String {
        let places = decimalPlaces(for: currencyCode)
        let formatter = formatterCache.formatter(currencyCode: currencyCode, decimalPlaces: places)
        let divisor = NSDecimalNumber(decimal: pow(10, places))
        let amount = NSDecimalNumber(value: minorUnits)
        let majorUnits = amount.dividing(by: divisor)
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(minorUnits)"
    }
}

// MARK: - Formatter Cache

/// Thread-safe cache for `NumberFormatter` instances.
///
/// `NumberFormatter` is expensive to create (~0.1 ms). In a scrolling list
/// with 50+ `CurrencyLabel` instances, caching eliminates thousands of
/// redundant allocations per second and keeps scroll performance at 60 FPS.
private final class FormatterCache: @unchecked Sendable {
    private var cache: [String: NumberFormatter] = [:]
    private let lock = NSLock()

    func formatter(currencyCode: String, decimalPlaces: Int) -> NumberFormatter {
        let key = "\(currencyCode):\(decimalPlaces)"
        lock.lock()
        defer { lock.unlock() }
        if let cached = cache[key] {
            return cached
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.minimumFractionDigits = decimalPlaces
        formatter.maximumFractionDigits = decimalPlaces
        cache[key] = formatter
        return formatter
    }
}

#Preview("Positive") { CurrencyLabel(amountInMinorUnits: 125_050) }
#Preview("Negative") { CurrencyLabel(amountInMinorUnits: -42_99) }
#Preview("Zero") { CurrencyLabel(amountInMinorUnits: 0, currencyCode: "EUR", showSign: false) }
#Preview("JPY") { CurrencyLabel(amountInMinorUnits: 15_000, currencyCode: "JPY") }
