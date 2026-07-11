// SPDX-License-Identifier: BUSL-1.1

// CurrencyConverter.swift
// Finance
//
// A pure, unit-testable currency converter used to roll up multi-currency
// spend into a single display currency. Digital nomads earn in one currency
// but spend across many, so dashboard and budget totals must convert and,
// crucially, disclose when a total is converted and whether it relied on a
// stale/offline exchange rate (#2203).

import Foundation

// MARK: - Exchange Rate

/// A single exchange rate quote expressing how many units of the display
/// currency one unit of `currencyCode` is worth.
struct ExchangeRate: Equatable, Sendable {
    /// The source currency (e.g. "THB").
    let currencyCode: String

    /// Value of one unit of `currencyCode` in the display currency.
    let rateToDisplay: Double

    /// When the rate was captured. Used to flag stale/offline rates.
    let asOf: Date

    init(currencyCode: String, rateToDisplay: Double, asOf: Date = .now) {
        self.currencyCode = currencyCode.uppercased()
        self.rateToDisplay = rateToDisplay
        self.asOf = asOf
    }
}

// MARK: - Converted Amount

/// The result of converting a single amount into the display currency.
struct ConvertedAmount: Equatable, Sendable {
    /// Converted value in minor units of the display currency.
    let minorUnits: Int64

    /// Whether a conversion actually occurred (source ≠ display currency).
    let isConverted: Bool

    /// Whether the conversion fell back to a rate older than the freshness
    /// window (or a missing rate treated as 1:1).
    let usedStaleRate: Bool
}

// MARK: - Rollup

/// Aggregate result of rolling up many amounts into the display currency.
struct CurrencyRollup: Equatable, Sendable {
    /// Total in minor units of the display currency.
    let totalMinorUnits: Int64

    /// The display currency the total is expressed in.
    let displayCurrencyCode: String

    /// True when at least one contributing amount was converted from another
    /// currency — the UI should badge the total as an approximate roll-up.
    let containsConversions: Bool

    /// True when at least one contributing conversion used a stale/offline or
    /// missing rate — the UI should warn the number may be out of date.
    let usedStaleRate: Bool
}

// MARK: - Converter

/// Converts amounts into a display currency using a snapshot of exchange rates.
///
/// The converter is deliberately pure: callers supply the rate table and the
/// "now" reference, so behaviour is deterministic and fully testable offline.
struct CurrencyConverter: Sendable {
    /// Display (home) currency all conversions target.
    let displayCurrencyCode: String

    /// Rates keyed by uppercased source-currency code.
    private let rates: [String: ExchangeRate]

    /// Rates older than this are considered stale (default: 24h).
    let freshnessWindow: TimeInterval

    init(
        displayCurrencyCode: String,
        rates: [ExchangeRate],
        freshnessWindow: TimeInterval = 60 * 60 * 24
    ) {
        self.displayCurrencyCode = displayCurrencyCode.uppercased()
        self.freshnessWindow = freshnessWindow
        self.rates = Dictionary(
            rates.map { ($0.currencyCode, $0) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// Converts a single amount from `currencyCode` into the display currency.
    ///
    /// - Missing rates are treated as 1:1 and flagged as stale so totals never
    ///   silently drop money, but the UI can warn the value is unverified.
    func convert(
        minorUnits: Int64,
        from currencyCode: String,
        now: Date = .now
    ) -> ConvertedAmount {
        let source = currencyCode.uppercased()
        guard source != displayCurrencyCode else {
            return ConvertedAmount(minorUnits: minorUnits, isConverted: false, usedStaleRate: false)
        }

        guard let rate = rates[source] else {
            // No rate available (e.g. fully offline with no cached rate).
            return ConvertedAmount(minorUnits: minorUnits, isConverted: true, usedStaleRate: true)
        }

        let converted = Int64((Double(minorUnits) * rate.rateToDisplay).rounded())
        let stale = now.timeIntervalSince(rate.asOf) > freshnessWindow
        return ConvertedAmount(minorUnits: converted, isConverted: true, usedStaleRate: stale)
    }

    /// Rolls up a list of `(minorUnits, currencyCode)` pairs into a single
    /// display-currency total, tracking whether any conversion or stale rate
    /// contributed.
    func rollup(
        _ amounts: [(minorUnits: Int64, currencyCode: String)],
        now: Date = .now
    ) -> CurrencyRollup {
        var total: Int64 = 0
        var converted = false
        var stale = false

        for amount in amounts {
            let result = convert(minorUnits: amount.minorUnits, from: amount.currencyCode, now: now)
            total += result.minorUnits
            converted = converted || result.isConverted
            stale = stale || result.usedStaleRate
        }

        return CurrencyRollup(
            totalMinorUnits: total,
            displayCurrencyCode: displayCurrencyCode,
            containsConversions: converted,
            usedStaleRate: stale
        )
    }
}
