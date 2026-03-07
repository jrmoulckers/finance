// DynamicTypeSupport.swift
// Finance
//
// Dynamic Type configuration ensuring every piece of financial data
// scales with the user's preferred text size while remaining readable.
// References: #27

import SwiftUI

// MARK: - Design-Token → Dynamic Type Mapping

/// Maps the Finance design-token type scale to the built-in SwiftUI
/// `Font.TextStyle` hierarchy so all text automatically participates
/// in Dynamic Type.
///
/// **Rule:** Never hardcode point sizes. Always go through this enum
/// or use a system `Font.TextStyle` directly.
enum FinanceTextStyle {
    /// Screen titles — "Accounts", "Budgets".
    case screenTitle
    /// Section headers inside a list.
    case sectionHeader
    /// Primary body copy — transaction descriptions, notes.
    case body
    /// Secondary / supporting text — dates, categories.
    case caption
    /// Monetary amounts displayed prominently (e.g. total balance).
    case currencyLarge
    /// Monetary amounts inside list rows.
    case currencyRow
    /// Small legal / footnote text.
    case footnote

    /// The SwiftUI `Font` corresponding to this design token.
    /// All values resolve to Dynamic-Type–aware system fonts.
    var font: Font {
        switch self {
        case .screenTitle:   return .largeTitle
        case .sectionHeader: return .headline
        case .body:          return .body
        case .caption:       return .caption
        case .currencyLarge: return .system(.title, design: .rounded, weight: .semibold)
        case .currencyRow:   return .system(.body, design: .rounded, weight: .medium)
        case .footnote:      return .footnote
        }
    }
}

// MARK: - View Extension — Convenience

extension View {
    /// Applies a Finance design-token font that automatically scales
    /// with the user's Dynamic Type setting.
    func financeFont(_ style: FinanceTextStyle) -> some View {
        self.font(style.font)
    }
}

// MARK: - ScaledFont — Custom Font with Dynamic Type

/// Wraps a custom font file (e.g. a brand typeface loaded via the asset
/// catalog) so it scales with Dynamic Type just like system fonts.
///
/// Usage:
/// ```swift
/// Text("$1,234.56")
///     .font(ScaledFont.custom("FinanceMono", relativeTo: .body))
/// ```
struct ScaledFont {
    /// Returns a `Font` for a custom typeface that scales relative to
    /// the given `TextStyle`.
    ///
    /// - Parameters:
    ///   - name: The PostScript name of the custom font.
    ///   - textStyle: The system text style this font should track.
    /// - Returns: A Dynamic-Type–aware custom `Font`.
    static func custom(_ name: String, relativeTo textStyle: Font.TextStyle) -> Font {
        .custom(name, relativeTo: textStyle)
    }
}

// MARK: - ScaledMetric Examples

/// Demonstrates `@ScaledMetric` for non-text dimensions that should
/// grow proportionally with Dynamic Type (e.g. icon sizes, padding).
///
/// Attach as an `@Environment` or instantiate inside a view body.
struct DynamicTypeMetrics {
    /// Icon size that scales with `.body` text style.
    @ScaledMetric(relativeTo: .body) var iconSize: CGFloat = 24

    /// Horizontal padding that scales with `.body`.
    @ScaledMetric(relativeTo: .body) var horizontalPadding: CGFloat = 16

    /// Minimum tap-target dimension (44pt base per Apple HIG).
    @ScaledMetric(relativeTo: .body) var minTapTarget: CGFloat = 44

    /// Spacing between a currency symbol and the numeric value.
    @ScaledMetric(relativeTo: .title) var currencySpacing: CGFloat = 4
}

// MARK: - Clamped Scaled Value

/// A property wrapper that behaves like `@ScaledMetric` but clamps
/// the result between a minimum and maximum.  This prevents financial
/// figures from becoming too small to read or too large to fit on
/// screen at extreme accessibility sizes (AX1 – AX5).
///
/// Usage:
/// ```swift
/// @ClampedScaledMetric(min: 14, max: 48, relativeTo: .body)
/// var currencyFontSize: CGFloat = 17
/// ```
@propertyWrapper
struct ClampedScaledMetric: DynamicProperty {
    @ScaledMetric private var scaled: CGFloat
    private let minimum: CGFloat
    private let maximum: CGFloat

    var wrappedValue: CGFloat {
        min(max(scaled, minimum), maximum)
    }

    /// Creates a clamped scaled metric.
    ///
    /// - Parameters:
    ///   - wrappedValue: The base value at the default (Large) content size.
    ///   - min: The smallest the value may shrink to.
    ///   - max: The largest the value may grow to.
    ///   - textStyle: The text style to scale relative to.
    init(wrappedValue: CGFloat, min: CGFloat, max: CGFloat, relativeTo textStyle: Font.TextStyle = .body) {
        _scaled = ScaledMetric(wrappedValue: wrappedValue, relativeTo: textStyle)
        self.minimum = min
        self.maximum = max
    }
}

// MARK: - Size-Constrained Currency Text

/// A view that renders a monetary amount using Dynamic Type while
/// guaranteeing the text never drops below a readable minimum size
/// or overflows its container at maximum accessibility sizes.
///
/// ```swift
/// SizeConstrainedCurrencyText(amount: "$1,234.56")
/// ```
struct SizeConstrainedCurrencyText: View {
    let amount: String

    @ClampedScaledMetric(min: 14, max: 52, relativeTo: .title)
    private var fontSize: CGFloat = 22

    var body: some View {
        Text(amount)
            .font(.system(size: fontSize, weight: .semibold, design: .rounded))
            .minimumScaleFactor(0.7)
            .lineLimit(1)
            .accessibilityLabel(Text(amount))
    }
}

// MARK: - Environment Key — Dynamic Type Category

/// Reads the current Dynamic Type size category so views can make
/// layout decisions (e.g. switching from horizontal to vertical
/// layout at accessibility sizes).
///
/// ```swift
/// @Environment(\.dynamicTypeSize) private var typeSize
///
/// var body: some View {
///     if typeSize.isAccessibilitySize {
///         VStack { accountRow }
///     } else {
///         HStack { accountRow }
///     }
/// }
/// ```
struct AdaptiveFinanceStack<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder let content: () -> Content

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) { content() }
        } else {
            HStack(spacing: 12) { content() }
        }
    }
}
