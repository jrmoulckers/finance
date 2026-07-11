// SPDX-License-Identifier: BUSL-1.1

// FeatureVisibility.swift
// Finance
//
// Central registry of user-controllable feature-visibility flags powering the
// low-noise / minimalist mode. Flags default to visible when unset, so the app
// is fully featured until the user opts to hide something.
//
// Views observe these keys with `@AppStorage`; this type owns the key
// constants and the preset logic so the behaviour is unit-testable without
// SwiftUI.
//
// References: #2122

import Foundation

/// Namespace of feature-visibility preference keys and presets.
enum FeatureVisibility {

    // MARK: - Keys

    /// Investments quick-access card on the Dashboard.
    static let investmentsKey = "feature.investments.visible"
    /// Bills quick-access card on the Dashboard.
    static let billsKey = "feature.bills.visible"
    /// Reports quick-access card on the Dashboard.
    static let reportsKey = "feature.reports.visible"
    /// Budgets tab in the main tab bar.
    static let budgetsTabKey = "feature.budgetsTab.visible"
    /// Goals tab in the main tab bar.
    static let goalsTabKey = "feature.goalsTab.visible"
    /// Mood tags on transactions (shared with the experimental setting).
    static let moodTagsKey = "experimental.moodTags.enabled"

    /// Master flag: whether minimalist mode has been switched on at least once.
    /// Used purely to badge the Settings entry point.
    static let minimalistModeEngagedKey = "feature.minimalistMode.engaged"

    /// All boolean visibility keys that default to `true` (visible).
    static let visibilityKeys: [String] = [
        investmentsKey, billsKey, reportsKey, budgetsTabKey, goalsTabKey,
    ]

    // MARK: - Reads

    /// Returns whether a visibility-keyed feature is visible, treating an unset
    /// value as visible (`true`).
    static func isVisible(_ key: String, defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: key) == nil ? true : defaults.bool(forKey: key)
    }

    // MARK: - Presets

    /// FIRE / minimalist preset: keep savings-rate, net-worth, investments,
    /// budgets and goals; hide bills, reports and mood tags.
    static func firePreset() -> [String: Bool] {
        [
            investmentsKey: true,
            budgetsTabKey: true,
            goalsTabKey: true,
            billsKey: false,
            reportsKey: false,
            moodTagsKey: false,
        ]
    }

    /// Full preset: everything visible (restores defaults).
    static func fullPreset() -> [String: Bool] {
        var preset: [String: Bool] = [:]
        for key in visibilityKeys { preset[key] = true }
        return preset
    }

    /// Applies a preset dictionary to a defaults store.
    static func apply(_ preset: [String: Bool], to defaults: UserDefaults = .standard) {
        for (key, value) in preset {
            defaults.set(value, forKey: key)
        }
    }

    /// Whether any feature is currently hidden.
    static func hasHiddenFeatures(defaults: UserDefaults = .standard) -> Bool {
        visibilityKeys.contains { !isVisible($0, defaults: defaults) }
    }
}
