// SPDX-License-Identifier: BUSL-1.1

// CurrencyPreferences.swift
// Finance
//
// Centralised access to the user's display-currency preference so that the
// dashboard, budgets, and analytics all roll up into a single home-currency
// view. Previously the preference lived only inside SettingsViewModel and was
// not read by the dashboard or budget flows (#2203).

import Foundation

/// Persists and resolves the app-wide display-currency preference.
///
/// The preference is stored under the same `finance_currency` UserDefaults key
/// that ``SettingsViewModel`` writes, so changing the currency in Settings
/// immediately drives dashboard totals, budget rollups, and formatting copy.
enum CurrencyPreferences {
    /// UserDefaults key shared with `SettingsViewModel`.
    static let key = "finance_currency"

    /// Fallback currency when the user has not chosen one.
    static let defaultCurrencyCode = "USD"

    /// A curated list of currencies a digital nomad is likely to use, surfaced
    /// in pickers. Ordered by rough global usage.
    static let supportedCurrencyCodes = [
        "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD",
        "THB", "MXN", "PHP", "IDR", "VND", "SGD", "INR", "BRL", "ZAR",
    ]

    /// Reads the current display-currency code, defaulting to ``defaultCurrencyCode``.
    static func displayCurrencyCode(defaults: UserDefaults = .standard) -> String {
        let stored = defaults.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let stored, !stored.isEmpty else { return defaultCurrencyCode }
        return stored.uppercased()
    }

    /// Persists the display-currency code (stored uppercased).
    static func setDisplayCurrencyCode(_ code: String, defaults: UserDefaults = .standard) {
        let normalised = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !normalised.isEmpty else { return }
        defaults.set(normalised, forKey: key)
    }

    /// Returns the localized currency symbol for a code (e.g. "USD" → "$",
    /// "THB" → "฿"), falling back to the code itself when no symbol exists.
    static func symbol(for currencyCode: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        // `currencySymbol` can return the code for uncommon currencies; that is
        // an acceptable, unambiguous fallback.
        return formatter.currencySymbol ?? currencyCode
    }

    /// Human-readable label combining code and symbol for pickers,
    /// e.g. "USD ($)" or "THB (฿)".
    static func pickerLabel(for currencyCode: String) -> String {
        let symbol = symbol(for: currencyCode)
        return symbol == currencyCode ? currencyCode : "\(currencyCode) (\(symbol))"
    }
}
