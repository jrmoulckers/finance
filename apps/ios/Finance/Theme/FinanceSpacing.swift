// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

// MARK: - Finance Spacing Scale
// Derived from design tokens in packages/design-tokens/tokens/
// Source: primitive/spacing.json, primitive/border-radius.json
//
// All spacing values map 1:1 to the design token spacing scale (4pt grid).
// Use these constants for padding, margins, gaps, and offsets to maintain
// visual consistency across the app.

/// Spacing and border-radius constants for the Finance app,
/// sourced from design tokens.
///
/// Usage:
/// ```swift
/// VStack(spacing: FinanceSpacing.md) {
///     ...
/// }
/// .padding(FinanceSpacing.lg)
/// ```
///
/// The scale follows a 4pt grid:
/// `none(0) → xxs(4) → xs(8) → sm(12) → md(16) → lg(20) → xl(24) → xxl(32) → xxxl(40)`
enum FinanceSpacing {

    // MARK: - Spacing Scale

    /// 0pt — no spacing.
    static let none: CGFloat = 0

    /// 4pt — hairline gaps, icon padding.
    static let xxs: CGFloat = 4

    /// 8pt — tight internal padding.
    static let xs: CGFloat = 8

    /// 12pt — compact spacing.
    static let sm: CGFloat = 12

    /// 16pt — default content spacing.
    static let md: CGFloat = 16

    /// 20pt — comfortable spacing.
    static let lg: CGFloat = 20

    /// 24pt — section spacing.
    static let xl: CGFloat = 24

    /// 32pt — generous section gaps.
    static let xxl: CGFloat = 32

    /// 40pt — large content separation.
    static let xxxl: CGFloat = 40

    /// 48pt — major section dividers.
    static let xxxxl: CGFloat = 48

    /// 64pt — page-level margins.
    static let jumbo: CGFloat = 64

    /// 80pt — hero section spacing.
    static let mega: CGFloat = 80

    // MARK: - Border Radius

    /// Border radius values from design tokens.
    enum Radius {
        /// 0pt — sharp corners.
        static let none: CGFloat = 0

        /// 4pt — subtle rounding.
        static let sm: CGFloat = 4

        /// 8pt — default rounding (buttons, inputs).
        static let md: CGFloat = 8

        /// 12pt — card rounding.
        static let lg: CGFloat = 12

        /// 16pt — prominent rounding.
        static let xl: CGFloat = 16

        /// 9999pt — fully rounded (pills, avatars).
        static let full: CGFloat = 9999
    }

    // MARK: - Component Tokens

    /// Component-level spacing from design tokens.
    enum Component {
        /// Button horizontal padding (spacing.4 = 16pt).
        static let buttonPaddingX: CGFloat = 16

        /// Button vertical padding (spacing.2 = 8pt).
        static let buttonPaddingY: CGFloat = 8

        /// Card internal padding (spacing.4 = 16pt).
        static let cardPadding: CGFloat = 16

        /// Input horizontal padding (spacing.3 = 12pt).
        static let inputPaddingX: CGFloat = 12

        /// Input vertical padding (spacing.2 = 8pt).
        static let inputPaddingY: CGFloat = 8
    }

    // MARK: - Minimum Tap Target

    /// Minimum interactive element size per Apple HIG (44×44pt).
    static let minTapTarget: CGFloat = 44
}
