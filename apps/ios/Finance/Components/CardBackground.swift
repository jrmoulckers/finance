// SPDX-License-Identifier: BUSL-1.1

// CardBackground.swift
// Finance
//
// A card surface background that respects the Reduce Transparency setting.
// Refs #3586

import SwiftUI

// MARK: - Modifier

/// Applies a card surface background that honors **Reduce Transparency**.
///
/// When `accessibilityReduceTransparency` is enabled, the translucent
/// `.regularMaterial` is swapped for the opaque `FinanceColors.backgroundElevated`
/// token so text layered on the card keeps sufficient contrast and legibility
/// (WCAG-aligned). When the setting is off, the standard material look is
/// preserved. (#3586)
struct CardBackgroundModifier: ViewModifier {
    let cornerRadius: CGFloat

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius)
        if reduceTransparency {
            content.background(FinanceColors.backgroundElevated, in: shape)
        } else {
            content.background(.regularMaterial, in: shape)
        }
    }
}

// MARK: - View Extension

extension View {
    /// Applies a rounded card background that falls back to an opaque token
    /// color when **Reduce Transparency** is enabled, and uses the standard
    /// translucent material otherwise. (#3586)
    ///
    /// Prefer this over `.background(.regularMaterial, in:)` for card surfaces
    /// so overlaid text stays legible for users who reduce transparency.
    func cardBackground(cornerRadius: CGFloat) -> some View {
        modifier(CardBackgroundModifier(cornerRadius: cornerRadius))
    }
}
