// AccessibilityModifiers.swift
// Finance
//
// Accessibility view modifiers for VoiceOver, rotor navigation,
// and live-region announcements across the Finance app.
// References: #25

import SwiftUI

// MARK: - View Extension — Finance Accessibility Modifiers

extension View {

    // MARK: Label & Hint

    /// Attaches a localized VoiceOver label to the view.
    ///
    /// Every interactive element **must** carry a label so VoiceOver users
    /// can identify its purpose.
    ///
    /// - Parameter label: A concise, localized description (e.g. "Add transaction").
    /// - Returns: The modified view.
    func financeLabel(_ label: String) -> some View {
        self.accessibilityLabel(Text(label))
    }

    /// Attaches a localized VoiceOver hint to the view.
    ///
    /// Use hints for non-obvious actions to give additional context
    /// after the label is announced.
    ///
    /// - Parameter hint: A brief explanation of the action (e.g. "Double-tap to open account details").
    /// - Returns: The modified view.
    func financeHint(_ hint: String) -> some View {
        self.accessibilityHint(Text(hint))
    }

    // MARK: Currency Formatting

    /// Formats a minor-unit currency amount into a VoiceOver-friendly label.
    ///
    /// The amount is stored as an `Int64` in the smallest currency unit
    /// (e.g. cents for USD). This modifier converts it to a human-readable
    /// string such as *"Balance: $1,234.56"* and sets it as the
    /// accessibility label.
    ///
    /// - Parameters:
    ///   - amount: The value in minor units (e.g. `123456` → `$1,234.56`).
    ///   - currency: An ISO 4217 currency code (e.g. `"USD"`).
    /// - Returns: The modified view.
    func financeCurrencyLabel(amount: Int64, currency: String) -> some View {
        let formattedAmount = Self.formatCurrency(amount: amount, currencyCode: currency)
        let label = String(localized: "Balance: \(formattedAmount)")
        return self.accessibilityLabel(Text(label))
    }

    // MARK: Heading (Rotor)

    /// Marks the view as a **heading** so VoiceOver's rotor can jump to it.
    ///
    /// Use this on section titles ("Accounts", "Recent Transactions",
    /// "Budget Overview") to let users navigate quickly.
    ///
    /// - Returns: The modified view.
    func financeHeading() -> some View {
        self.accessibilityAddTraits(.isHeader)
    }

    // MARK: Live Region

    /// Designates the view as a live region that announces content
    /// changes automatically.
    ///
    /// Attach this to dynamic balance displays, sync-status indicators,
    /// or any element whose value changes without user interaction so
    /// VoiceOver users are informed immediately.
    ///
    /// - Returns: The modified view.
    func financeLiveRegion() -> some View {
        self.accessibilityAddTraits(.updatesFrequently)
            .accessibilityAddTraits(.isStaticText)
    }

    // MARK: Convenience — Announcement

    /// Posts an accessibility announcement for transient events.
    ///
    /// Examples: *"Transaction saved"*, *"Sync complete"*.
    ///
    /// - Parameter message: The string to announce.
    static func announceForAccessibility(_ message: String) {
        AccessibilityNotification.Announcement(message).post()
    }

    // MARK: - Private Helpers

    /// Converts a minor-unit amount + ISO 4217 code into a locale-aware
    /// currency string.
    ///
    /// Falls back to a plain decimal representation when the currency
    /// code is not recognised by `Locale`.
    private static func formatCurrency(amount: Int64, currencyCode: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode

        // Determine the number of fractional digits for the currency.
        // `NumberFormatter` infers this from the currency code.
        let fractionDigits = formatter.maximumFractionDigits
        let divisor = pow(10.0, Double(fractionDigits))
        let decimalValue = Double(amount) / divisor

        return formatter.string(from: NSNumber(value: decimalValue))
            ?? String(format: "%.\(fractionDigits)f", decimalValue)
    }
}

// MARK: - Reusable Modifier Structs

/// A `ViewModifier` that combines a currency label with a live-region
/// trait — useful for balance displays that update in real time.
struct FinanceLiveBalanceModifier: ViewModifier {
    let amount: Int64
    let currency: String

    func body(content: Content) -> some View {
        content
            .financeCurrencyLabel(amount: amount, currency: currency)
            .financeLiveRegion()
    }
}

extension View {
    /// Convenience: applies both a formatted currency label **and**
    /// a live-region trait in a single call.
    func financeLiveBalance(amount: Int64, currency: String) -> some View {
        modifier(FinanceLiveBalanceModifier(amount: amount, currency: currency))
    }
}
