import SwiftUI

// MARK: - Finance Typography Scale
// Derived from design tokens in packages/design-tokens/tokens/
// Source: primitive/typography.json, semantic/typography.json
//
// All type styles map to SwiftUI Dynamic Type text styles so the app
// automatically supports all accessibility text sizes (including AX1–AX5).
// Never hardcode font sizes — always use these token-based styles.

/// Typography scale for the Finance app, mapped from design tokens to
/// SwiftUI Dynamic Type.
///
/// Usage:
/// ```swift
/// Text("Account Balance")
///     .font(FinanceTypography.headline)
/// ```
///
/// > Important: These fonts all use Dynamic Type under the hood. Never call
/// > `.font(.system(size:))` with a hardcoded value — always go through
/// > this enum or use SwiftUI's built-in `.font(.body)` etc.
enum FinanceTypography {

    // MARK: - Type Scale

    /// Display — large hero text (maps to design token `typeScale.display`).
    /// Design token: 48pt bold, lineHeight 1.25.
    /// SwiftUI mapping: `.largeTitle` with `.bold` weight.
    static let display: Font = .largeTitle.weight(.bold)

    /// Headline — section headers (maps to design token `typeScale.headline`).
    /// Design token: 30pt semibold, lineHeight 1.25.
    /// SwiftUI mapping: `.title` with `.semibold` weight.
    static let headline: Font = .title.weight(.semibold)

    /// Title — card and list headers (maps to design token `typeScale.title`).
    /// Design token: 20pt semibold, lineHeight 1.5.
    /// SwiftUI mapping: `.title3` with `.semibold` weight.
    static let title: Font = .title3.weight(.semibold)

    /// Body — main content text (maps to design token `typeScale.body`).
    /// Design token: 16pt regular, lineHeight 1.5.
    /// SwiftUI mapping: `.body` (default weight).
    static let body: Font = .body

    /// Label — form labels, metadata (maps to design token `typeScale.label`).
    /// Design token: 14pt medium, lineHeight 1.5.
    /// SwiftUI mapping: `.subheadline` with `.medium` weight.
    static let label: Font = .subheadline.weight(.medium)

    /// Caption — supplementary info, timestamps (maps to design token `typeScale.caption`).
    /// Design token: 12pt regular, lineHeight 1.5.
    /// SwiftUI mapping: `.caption`.
    static let caption: Font = .caption

    // MARK: - Specialized Financial Typography

    /// Large monetary amount display (e.g., account balance hero).
    static let balanceDisplay: Font = .system(.largeTitle, design: .rounded, weight: .bold)

    /// Inline monetary amount in lists and rows.
    static let amountInline: Font = .body.monospacedDigit()

    /// Small monetary amount — transaction metadata.
    static let amountSmall: Font = .subheadline.monospacedDigit()
}

// MARK: - Typography View Modifier

/// Convenience modifier that applies a Finance typography style.
///
/// ```swift
/// Text("Total Balance")
///     .financeFont(.headline)
/// ```
struct FinanceFontModifier: ViewModifier {
    let font: Font

    func body(content: Content) -> some View {
        content.font(font)
    }
}

extension View {
    /// Applies a Finance design-token typography style.
    func financeFont(_ font: Font) -> some View {
        modifier(FinanceFontModifier(font: font))
    }
}
