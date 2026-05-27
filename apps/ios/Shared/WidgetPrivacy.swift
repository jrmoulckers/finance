// SPDX-License-Identifier: BUSL-1.1

import Foundation

/// Canonical privacy masking modes for widget and shortcut money surfaces.
public enum WidgetMaskingMode: String, Codable, CaseIterable, Sendable {
    case visible = "Visible"
    case bucketed = "Bucketed"
    case percent = "Percent"
    case dots = "Dots"
}

/// Privacy-aware formatter that mirrors the web `MaskingMode` formatter.
public enum WidgetMoneyFormatter {
    private static let dotMask = "•••"
    private static let progressOnlyLabel = String(localized: "Progress only")
    private static let bucketsMajor: [Int64] = [
        0, 1, 10, 50, 100, 500, 1_000, 5_000,
        10_000, 50_000, 100_000, 500_000, 1_000_000,
    ]

    /// Formats integer minor units through a privacy-aware masking mode.
    public static func formatAmount(
        minorUnits: Int64,
        currencyCode: String = "USD",
        mode: WidgetMaskingMode = .visible,
        locale: Locale = .current,
        percentOfMinorUnits: Int64? = nil,
        percentValue: Double? = nil,
        compact: Bool = false,
        showCents: Bool = true
    ) -> String {
        switch mode {
        case .visible:
            return formatCurrency(
                majorUnits: NSDecimalNumber(value: minorUnits)
                    .dividing(by: NSDecimalNumber(value: 100))
                    .decimalValue,
                currencyCode: currencyCode,
                locale: locale,
                compact: compact,
                showCents: showCents
            )
        case .bucketed:
            return formatBucket(minorUnits: minorUnits, currencyCode: currencyCode, locale: locale)
        case .percent:
            return formatPercent(
                minorUnits: minorUnits,
                percentOfMinorUnits: percentOfMinorUnits,
                percentValue: percentValue,
                locale: locale
            )
        case .dots:
            return dotMask
        }
    }

    /// Formats a range while respecting privacy masking semantics.
    public static func formatRange(
        minMinorUnits: Int64,
        maxMinorUnits: Int64,
        currencyCode: String = "USD",
        mode: WidgetMaskingMode = .visible,
        locale: Locale = .current
    ) -> String {
        switch mode {
        case .percent:
            return progressOnlyLabel
        case .dots:
            return dotMask
        case .visible, .bucketed:
            let left = formatAmount(
                minorUnits: minMinorUnits,
                currencyCode: currencyCode,
                mode: mode,
                locale: locale
            )
            let right = formatAmount(
                minorUnits: maxMinorUnits,
                currencyCode: currencyCode,
                mode: mode,
                locale: locale
            )
            return left == right ? left : String(localized: "\(left)–\(right)")
        }
    }

    private static func formatCurrency(
        majorUnits: Decimal,
        currencyCode: String,
        locale: Locale,
        compact: Bool,
        showCents: Bool
    ) -> String {
        if compact {
            return formatCompactCurrency(
                majorUnits: majorUnits,
                currencyCode: currencyCode,
                locale: locale
            )
        }

        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.locale = locale
        formatter.usesGroupingSeparator = true
        formatter.maximumFractionDigits = showCents ? 2 : 0
        formatter.minimumFractionDigits = showCents ? 2 : 0
        return formatter.string(from: majorUnits as NSDecimalNumber) ?? currencyCode
    }

    private static func formatCompactCurrency(
        majorUnits: Decimal,
        currencyCode: String,
        locale: Locale
    ) -> String {
        let value = NSDecimalNumber(decimal: majorUnits).doubleValue
        let absolute = abs(value)
        let suffix: String
        let scaled: Double

        if absolute >= 1_000_000 {
            suffix = "M"
            scaled = value / 1_000_000
        } else if absolute >= 1_000 {
            suffix = "K"
            scaled = value / 1_000
        } else {
            suffix = ""
            scaled = value
        }

        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.locale = locale
        formatter.maximumFractionDigits = suffix.isEmpty ? 0 : 1
        formatter.minimumFractionDigits = 0
        return (formatter.string(from: NSNumber(value: scaled)) ?? currencyCode) + suffix
    }

    private static func formatBucket(
        minorUnits: Int64,
        currencyCode: String,
        locale: Locale
    ) -> String {
        let sign = minorUnits < 0 ? "-" : ""
        let absoluteMajor = Double(abs(minorUnits)) / 100.0
        let bounds = bucketBounds(absoluteMajor: absoluteMajor)

        if bounds.min == 0 && bounds.max == 0 {
            return formatCurrency(
                majorUnits: 0,
                currencyCode: currencyCode,
                locale: locale,
                compact: true,
                showCents: false
            )
        }

        let lower = formatCurrency(
            majorUnits: Decimal(bounds.min),
            currencyCode: currencyCode,
            locale: locale,
            compact: true,
            showCents: false
        )

        guard let max = bounds.max else {
            return "\(sign)\(lower)+"
        }

        let upper = formatCurrency(
            majorUnits: Decimal(max),
            currencyCode: currencyCode,
            locale: locale,
            compact: true,
            showCents: false
        )
        return "\(sign)\(lower)–\(upper)"
    }

    private static func bucketBounds(absoluteMajor: Double) -> (min: Int64, max: Int64?) {
        if absoluteMajor <= 0 {
            return (0, 0)
        }

        for index in 0..<(bucketsMajor.count - 1) {
            let min = bucketsMajor[index]
            let max = bucketsMajor[index + 1]
            if absoluteMajor > Double(min) && absoluteMajor <= Double(max) {
                return (min, max)
            }
        }

        return (bucketsMajor[bucketsMajor.count - 1], nil)
    }

    private static func formatPercent(
        minorUnits: Int64,
        percentOfMinorUnits: Int64?,
        percentValue: Double?,
        locale: Locale
    ) -> String {
        let resolvedPercent: Double?
        if let percentValue {
            resolvedPercent = percentValue
        } else if let percentOfMinorUnits, percentOfMinorUnits != 0 {
            resolvedPercent = Double(minorUnits) / Double(percentOfMinorUnits)
        } else {
            resolvedPercent = nil
        }

        guard let resolvedPercent else {
            return progressOnlyLabel
        }

        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.locale = locale
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: resolvedPercent)) ?? progressOnlyLabel
    }
}

/// Shared storage keys and helpers for widget privacy configuration.
public enum WidgetPrivacySettings {
    public static let maskingModesKey = "finance:widget-masking-modes"
    public static let defaultMaskingModeKey = "finance:widget-default-masking-mode"
    public static let firstAddPromptPendingKey = "finance:widget-first-add-prompt-pending"
    public static let firstAddPromptHandledKey = "finance:widget-first-add-prompt-handled"
    public static let defaultMode: WidgetMaskingMode = .bucketed

    /// Returns the masking mode for a widget instance, defaulting to Bucketed.
    public static func maskingMode(
        for widgetId: String,
        defaults: UserDefaults? = SharedConstants.sharedDefaults
    ) -> WidgetMaskingMode {
        if let rawModes = defaults?.data(forKey: maskingModesKey),
           let decoded = try? JSONDecoder().decode([String: WidgetMaskingMode].self, from: rawModes),
           let mode = decoded[widgetId] {
            return mode
        }

        if let rawDefault = defaults?.string(forKey: defaultMaskingModeKey),
           let mode = WidgetMaskingMode(rawValue: rawDefault) {
            return mode
        }

        return defaultMode
    }

    /// Persists the default mode used when a widget instance has no override.
    public static func setDefaultMaskingMode(
        _ mode: WidgetMaskingMode,
        defaults: UserDefaults? = SharedConstants.sharedDefaults
    ) {
        defaults?.set(mode.rawValue, forKey: defaultMaskingModeKey)
    }

    /// Marks that the app should ask whether exact widget amounts are acceptable.
    public static func markFirstAddPromptPending(defaults: UserDefaults? = SharedConstants.sharedDefaults) {
        guard defaults?.bool(forKey: firstAddPromptHandledKey) != true,
              defaults?.bool(forKey: firstAddPromptPendingKey) != true
        else { return }
        defaults?.set(true, forKey: firstAddPromptPendingKey)
    }

    /// Consumes and clears the first-add prompt flag.
    @discardableResult
    public static func consumeFirstAddPrompt(defaults: UserDefaults? = SharedConstants.sharedDefaults) -> Bool {
        let shouldPrompt = defaults?.bool(forKey: firstAddPromptPendingKey) == true
        if shouldPrompt {
            defaults?.set(false, forKey: firstAddPromptPendingKey)
        }
        return shouldPrompt
    }

    /// Records that the first-add prompt has been handled.
    public static func markFirstAddPromptHandled(defaults: UserDefaults? = SharedConstants.sharedDefaults) {
        defaults?.set(true, forKey: firstAddPromptHandledKey)
        defaults?.set(false, forKey: firstAddPromptPendingKey)
    }
}

/// Deep links emitted by widgets. They contain identifiers only, never money.
public enum FinanceWidgetDeepLinks {
    public static func quickEntryURL(action: String?) -> URL {
        var components = URLComponents()
        components.scheme = "finance"
        components.host = "quick-entry"
        if let action, !action.isEmpty {
            components.queryItems = [URLQueryItem(name: "action", value: action)]
        }
        return components.url ?? URL(string: "finance://quick-entry")!
    }

    public static func budgetCategoryURL(categoryId: String) -> URL {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        let encodedId = categoryId.addingPercentEncoding(withAllowedCharacters: allowed) ?? categoryId
        return URL(string: "finance://budget/category/\(encodedId)")
            ?? URL(string: "finance://budget/category")!
    }
}
