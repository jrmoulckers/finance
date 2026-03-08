// SPDX-License-Identifier: BUSL-1.1

// ChartColorPalette.swift
// Finance
//
// IBM CVD-safe color palette from design tokens for accessible chart rendering.
// Refs #28

import SwiftUI

/// Color-blind safe palette derived from the IBM CVD-safe design tokens
/// (packages/design-tokens/tokens/primitive/colors.json -> color.chart.*).
///
/// Every chart in the app **must** use these colors so that users with
/// colour-vision deficiency can distinguish data series.
enum ChartColorPalette {
    // MARK: - IBM CVD-Safe Series Colors

    /// IBM CVD-safe blue  (#648FFF)
    static let blue = Color(red: 0x64 / 255.0, green: 0x8F / 255.0, blue: 0xFF / 255.0)
    /// IBM CVD-safe purple (#785EF0)
    static let purple = Color(red: 0x78 / 255.0, green: 0x5E / 255.0, blue: 0xF0 / 255.0)
    /// IBM CVD-safe magenta (#DC267F)
    static let magenta = Color(red: 0xDC / 255.0, green: 0x26 / 255.0, blue: 0x7F / 255.0)
    /// IBM CVD-safe orange (#FE6100)
    static let orange = Color(red: 0xFE / 255.0, green: 0x61 / 255.0, blue: 0x00 / 255.0)
    /// IBM CVD-safe gold (#FFB000)
    static let gold = Color(red: 0xFF / 255.0, green: 0xB0 / 255.0, blue: 0x00 / 255.0)
    /// CVD-safe teal (#009E73)
    static let teal = Color(red: 0x00 / 255.0, green: 0x9E / 255.0, blue: 0x73 / 255.0)

    /// Ordered series array - use palette[index % palette.count] to cycle.
    static let ordered: [Color] = [blue, purple, magenta, orange, gold, teal]

    /// Returns a color for the given zero-based series index, cycling if needed.
    static func color(at index: Int) -> Color {
        ordered[index % ordered.count]
    }
}
