// SPDX-License-Identifier: BUSL-1.1

// AppThemePreference.swift
// Finance
//
// User-selectable appearance override (System / Light / Dark) applied at the
// app root via `.preferredColorScheme`. Persisted in UserDefaults so the
// choice survives launches. References: #3581

import SwiftUI

/// A user preference that overrides the system color scheme app-wide.
///
/// `system` defers to the OS setting; `light` and `dark` force the
/// corresponding appearance regardless of the system schedule.
enum AppThemePreference: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    /// `@AppStorage` key backing this preference.
    static let key = "appThemePreference"

    var id: String { rawValue }

    /// Localized label shown in the appearance picker.
    var displayName: String {
        switch self {
        case .system: String(localized: "System")
        case .light: String(localized: "Light")
        case .dark: String(localized: "Dark")
        }
    }

    /// The SwiftUI `ColorScheme` to force, or `nil` to follow the system.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    /// Resolves a stored raw value to a preference, defaulting to `.system`.
    static func resolved(from rawValue: String) -> AppThemePreference {
        AppThemePreference(rawValue: rawValue) ?? .system
    }
}
