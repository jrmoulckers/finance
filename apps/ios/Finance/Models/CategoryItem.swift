// SPDX-License-Identifier: BUSL-1.1

// CategoryItem.swift
// Finance
//
// Data model for transaction categories with color and icon metadata.
// Used by the category management screen and transaction/budget pickers.

import SwiftUI

// MARK: - Category Item

/// A transaction category with an associated color and SF Symbol icon.
///
/// Categories are user-customisable and persisted via the repository layer.
/// Each category has a unique identifier, display name, hex color string,
/// and an SF Symbol name for iconography.
struct CategoryItem: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let colorHex: String
    let icon: String
    let sortOrder: Int

    /// Resolved Color from the stored hex string.
    var color: Color {
        Color(hex: colorHex) ?? .accentColor
    }

    init(
        id: String = UUID().uuidString,
        name: String,
        colorHex: String,
        icon: String,
        sortOrder: Int = 0
    ) {
        self.id = id
        self.name = name
        self.colorHex = colorHex
        self.icon = icon
        self.sortOrder = sortOrder
    }
}

// MARK: - Preset Colors

enum CategoryColors {

    static let presets: [(name: String, hex: String)] = [
        ("Red", "#E53E3E"),
        ("Orange", "#DD6B20"),
        ("Amber", "#D69E2E"),
        ("Green", "#38A169"),
        ("Teal", "#319795"),
        ("Blue", "#3182CE"),
        ("Indigo", "#5A67D8"),
        ("Purple", "#805AD5"),
        ("Pink", "#D53F8C"),
        ("Cyan", "#00B5D8"),
        ("Lime", "#68D391"),
        ("Brown", "#8B6914"),
    ]
}

// MARK: - Preset Icons

/// Curated set of SF Symbols suitable for financial categories.
enum CategoryIcons {

    /// SF Symbol names for the category icon picker.
    static let presets: [String] = [
        "cart",
        "fork.knife",
        "car",
        "film",
        "bag",
        "bolt",
        "heart",
        "house",
        "airplane",
        "book",
        "gift",
        "graduationcap",
        "dumbbell",
        "pawprint",
        "tshirt",
        "wrench.and.screwdriver",
        "music.note",
        "gamecontroller",
        "cross.case",
        "banknote",
        "creditcard",
        "phone",
        "wifi",
        "drop",
    ]
}

// MARK: - Color Hex Extension

extension Color {
    /// Creates a `Color` from a CSS-style hex string (e.g. "#3182CE").
    ///
    /// Returns `nil` if the string cannot be parsed.
    init?(hex: String) {
        var hexSanitised = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if hexSanitised.hasPrefix("#") {
            hexSanitised.removeFirst()
        }

        guard hexSanitised.count == 6,
              let intValue = UInt64(hexSanitised, radix: 16) else {
            return nil
        }

        let red = Double((intValue >> 16) & 0xFF) / 255.0
        let green = Double((intValue >> 8) & 0xFF) / 255.0
        let blue = Double(intValue & 0xFF) / 255.0

        self.init(red: red, green: green, blue: blue)
    }
}
