// SPDX-License-Identifier: BUSL-1.1

import SwiftUI

// MARK: - Finance Color Definitions
// Derived from design tokens in packages/design-tokens/tokens/
// Source: primitive/colors.json, semantic/colors.light.json, semantic/colors.dark.json
//
// These colors use SwiftUI adaptive `Color(light:dark:)` to automatically
// switch between light and dark appearances. All values map 1:1 to the
// design-token semantic layer.

/// Centralized color palette for the Finance app, sourced from design tokens.
///
/// Usage:
/// ```swift
/// Text("Balance")
///     .foregroundStyle(FinanceColors.textPrimary)
///     .background(FinanceColors.backgroundPrimary)
/// ```
///
/// > Important: Prefer semantic colors (e.g. ``textPrimary``) over primitive
/// > palette colors (e.g. ``blue600``) in views. Primitive colors are exposed
/// > for charts and edge-cases only.
enum FinanceColors {

    // MARK: - Semantic: Backgrounds

    /// Primary background — main content area.
    static let backgroundPrimary = Color(
        light: .init(red: 1.000, green: 1.000, blue: 1.000),   // neutral.0  #FFFFFF
        dark:  .init(red: 0.012, green: 0.027, blue: 0.071)    // neutral.950 #030712
    )

    /// Secondary background — grouped / inset content.
    static let backgroundSecondary = Color(
        light: .init(red: 0.976, green: 0.980, blue: 0.984),   // neutral.50  #F9FAFB
        dark:  .init(red: 0.067, green: 0.094, blue: 0.153)    // neutral.900 #111827
    )

    /// Elevated surface — cards, modals, popovers.
    static let backgroundElevated = Color(
        light: .init(red: 1.000, green: 1.000, blue: 1.000),   // neutral.0   #FFFFFF
        dark:  .init(red: 0.122, green: 0.161, blue: 0.216)    // neutral.800  #1F2937
    )

    // MARK: - Semantic: Text

    /// Primary text color — headings and body copy.
    static let textPrimary = Color(
        light: .init(red: 0.067, green: 0.094, blue: 0.153),   // neutral.900 #111827
        dark:  .init(red: 0.976, green: 0.980, blue: 0.984)    // neutral.50  #F9FAFB
    )

    /// Secondary text — supplementary labels and metadata.
    static let textSecondary = Color(
        light: .init(red: 0.294, green: 0.333, blue: 0.388),   // neutral.600 #4B5563
        dark:  .init(red: 0.612, green: 0.639, blue: 0.686)    // neutral.400 #9CA3AF
    )

    /// Disabled text — placeholders and inactive labels.
    static let textDisabled = Color(
        light: .init(red: 0.612, green: 0.639, blue: 0.686),   // neutral.400 #9CA3AF
        dark:  .init(red: 0.294, green: 0.333, blue: 0.388)    // neutral.600 #4B5563
    )

    /// Inverse text — used on filled/primary buttons and dark surfaces.
    static let textInverse = Color(
        light: .init(red: 1.000, green: 1.000, blue: 1.000),   // neutral.0   #FFFFFF
        dark:  .init(red: 0.067, green: 0.094, blue: 0.153)    // neutral.900 #111827
    )

    // MARK: - Semantic: Borders

    /// Default border color for dividers and outlines.
    static let borderDefault = Color(
        light: .init(red: 0.898, green: 0.906, blue: 0.922),   // neutral.200 #E5E7EB
        dark:  .init(red: 0.216, green: 0.255, blue: 0.318)    // neutral.700 #374151
    )

    /// Focus ring color for keyboard / accessibility navigation.
    static let borderFocus = Color(
        light: .init(red: 0.231, green: 0.510, blue: 0.965),   // blue.500 #3B82F6
        dark:  .init(red: 0.376, green: 0.647, blue: 0.980)    // blue.400 #60A5FA
    )

    /// Error border — validation errors on inputs.
    static let borderError = Color(
        light: .init(red: 0.937, green: 0.267, blue: 0.267),   // red.500  #EF4444
        dark:  .init(red: 0.973, green: 0.443, blue: 0.443)    // red.400  #F87171
    )

    // MARK: - Semantic: Interactive

    /// Default interactive color — buttons, links, tappable elements.
    static let interactive = Color(
        light: .init(red: 0.145, green: 0.388, blue: 0.922),   // blue.600 #2563EB
        dark:  .init(red: 0.376, green: 0.647, blue: 0.980)    // blue.400 #60A5FA
    )

    /// Pressed interactive state.
    static let interactivePressed = Color(
        light: .init(red: 0.118, green: 0.251, blue: 0.686),   // blue.800 #1E40AF
        dark:  .init(red: 0.749, green: 0.859, blue: 0.996)    // blue.200 #BFDBFE
    )

    /// Disabled interactive elements.
    static let interactiveDisabled = Color(
        light: .init(red: 0.820, green: 0.835, blue: 0.859),   // neutral.300 #D1D5DB
        dark:  .init(red: 0.216, green: 0.255, blue: 0.318)    // neutral.700 #374151
    )

    // MARK: - Semantic: Status

    /// Positive status — successful operations, income.
    static let statusPositive = Color(
        light: .init(red: 0.086, green: 0.639, blue: 0.290),   // green.600 #16A34A
        dark:  .init(red: 0.133, green: 0.773, blue: 0.369)    // green.500 #22C55E
    )

    /// Negative status — errors, declines.
    static let statusNegative = Color(
        light: .init(red: 0.863, green: 0.149, blue: 0.149),   // red.600   #DC2626
        dark:  .init(red: 0.937, green: 0.267, blue: 0.267)    // red.500   #EF4444
    )

    /// Warning status — budget thresholds, pending actions.
    static let statusWarning = Color(
        light: .init(red: 0.851, green: 0.467, blue: 0.024),   // amber.600 #D97706
        dark:  .init(red: 0.961, green: 0.620, blue: 0.043)    // amber.500 #F59E0B
    )

    /// Info status — informational banners and tooltips.
    static let statusInfo = Color(
        light: .init(red: 0.145, green: 0.388, blue: 0.922),   // blue.600  #2563EB
        dark:  .init(red: 0.376, green: 0.647, blue: 0.980)    // blue.400  #60A5FA
    )

    // MARK: - Semantic: Financial Amounts

    /// Positive monetary amount (income, gains).
    static let amountPositive = Color(
        light: .init(red: 0.082, green: 0.502, blue: 0.239),   // green.700 #15803D
        dark:  .init(red: 0.133, green: 0.773, blue: 0.369)    // green.500 #22C55E
    )

    /// Negative monetary amount (expenses, losses).
    static let amountNegative = Color(
        light: .init(red: 0.725, green: 0.110, blue: 0.110),   // red.700   #B91C1C
        dark:  .init(red: 0.937, green: 0.267, blue: 0.267)    // red.500   #EF4444
    )

    // MARK: - Chart Colors (IBM CVD-safe palette)

    /// Chart series colors — accessible for color-vision deficiency.
    /// Based on the IBM CVD-safe palette from design tokens.
    static let chart: [Color] = [
        Color(red: 0.392, green: 0.561, blue: 1.000),  // #648FFF — blue
        Color(red: 0.471, green: 0.369, blue: 0.941),  // #785EF0 — purple
        Color(red: 0.863, green: 0.149, blue: 0.498),  // #DC267F — magenta
        Color(red: 0.996, green: 0.380, blue: 0.000),  // #FE6100 — orange
        Color(red: 1.000, green: 0.690, blue: 0.000),  // #FFB000 — gold
        Color(red: 0.000, green: 0.620, blue: 0.451),  // #009E73 — teal
    ]
}

// MARK: - Adaptive Color Initializer

private extension Color {
    /// Creates an adaptive color that switches between light and dark appearances.
    init(light: Color, dark: Color) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil
                ? NSColor(dark)
                : NSColor(light)
        })
        #endif
    }
}
