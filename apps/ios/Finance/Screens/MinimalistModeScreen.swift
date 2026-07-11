// SPDX-License-Identifier: BUSL-1.1

// MinimalistModeScreen.swift
// Finance
//
// Low-noise / minimalist mode. Lets a FIRE-minded minimalist hide features they
// don't use — Dashboard quick-access cards, optional tabs, and experimental
// extras — so the app surfaces only what matters to them. Preferences are
// stored via `FeatureVisibility` keys and observed live by the affected
// surfaces (Dashboard and the tab bar).
//
// References: #2122

import SwiftUI

/// Configuration screen for low-noise mode: per-feature visibility toggles plus
/// one-tap presets.
struct MinimalistModeScreen: View {
    @AppStorage(FeatureVisibility.investmentsKey) private var showInvestments = true
    @AppStorage(FeatureVisibility.billsKey) private var showBills = true
    @AppStorage(FeatureVisibility.reportsKey) private var showReports = true
    @AppStorage(FeatureVisibility.budgetsTabKey) private var showBudgetsTab = true
    @AppStorage(FeatureVisibility.goalsTabKey) private var showGoalsTab = true
    @AppStorage(FeatureVisibility.moodTagsKey) private var moodTagsEnabled = false
    @AppStorage(FeatureVisibility.minimalistModeEngagedKey) private var engaged = false

    /// Whether at least one feature is currently hidden.
    private var anyHidden: Bool {
        !showInvestments || !showBills || !showReports || !showBudgetsTab || !showGoalsTab
    }

    var body: some View {
        Form {
            Section {
                Text(String(localized: "Turn off anything you don't use. The app stays fully featured — hidden items simply disappear from your Dashboard and tab bar, and you can bring them back any time."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section {
                Toggle(String(localized: "Investments card"), isOn: $showInvestments)
                Toggle(String(localized: "Bills card"), isOn: $showBills)
                Toggle(String(localized: "Reports card"), isOn: $showReports)
            } header: {
                Text(String(localized: "Dashboard"))
            } footer: {
                Text(String(localized: "Quick-access cards shown under your net worth."))
            }

            Section {
                Toggle(String(localized: "Budgets tab"), isOn: $showBudgetsTab)
                Toggle(String(localized: "Goals tab"), isOn: $showGoalsTab)
            } header: {
                Text(String(localized: "Tabs"))
            } footer: {
                Text(String(localized: "Dashboard, Accounts, and Transactions always stay."))
            }

            Section {
                Toggle(String(localized: "Mood tags on transactions"), isOn: $moodTagsEnabled)
            } header: {
                Text(String(localized: "Extras"))
            }

            Section {
                Button {
                    applyFirePreset()
                } label: {
                    Label(String(localized: "Apply FIRE preset"), systemImage: "flame")
                }
                .accessibilityHint(String(localized: "Hides bills, reports, and mood tags; keeps investments, budgets, and goals"))

                Button {
                    showEverything()
                } label: {
                    Label(String(localized: "Show everything"), systemImage: "square.grid.2x2")
                }
                .accessibilityHint(String(localized: "Restores all features"))
            } header: {
                Text(String(localized: "Presets"))
            }
        }
        .navigationTitle(String(localized: "Focus Mode"))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: anyHidden) { _, hidden in
            if hidden { engaged = true }
        }
    }

    // MARK: - Presets

    private func applyFirePreset() {
        showInvestments = true
        showBudgetsTab = true
        showGoalsTab = true
        showBills = false
        showReports = false
        moodTagsEnabled = false
    }

    private func showEverything() {
        showInvestments = true
        showBills = true
        showReports = true
        showBudgetsTab = true
        showGoalsTab = true
    }
}

#Preview {
    NavigationStack {
        MinimalistModeScreen()
    }
}
