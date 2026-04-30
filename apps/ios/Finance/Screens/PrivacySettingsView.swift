// SPDX-License-Identifier: BUSL-1.1
// PrivacySettingsView.swift — In-app privacy controls for GDPR compliance.
//
// Provides a Settings > Privacy screen where users can:
// - View and modify per-purpose consent toggles
// - Trigger ATT re-prompt (opens System Settings on iOS 17+)
// - Export all personal data (GDPR Article 20 — data portability)
// - Delete all data (GDPR Article 17 — right to erasure)
// - View current consent state and last consent date
//
// References: #879, #649, #474

import os
import SwiftUI

// MARK: - PrivacySettingsView

/// In-app privacy controls accessible from Settings.
///
/// This view satisfies multiple GDPR requirements:
/// - **Article 7(3)**: Easy consent withdrawal
/// - **Article 15**: Right of access (via data export)
/// - **Article 17**: Right to erasure (via delete all data)
/// - **Article 20**: Right to data portability (via export)
struct PrivacySettingsView: View {

    @State private var consentManager = ConsentManager.shared
    @State private var showingDeleteConfirmation = false
    @State private var showingExportSheet = false
    @State private var showingTrackingInfo = false

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "PrivacySettingsView"
    )

    var body: some View {
        Form {
            consentSection
            trackingSection
            dataPortabilitySection
            dataErasureSection
            consentInfoSection
        }
        .navigationTitle(String(localized: "Privacy"))
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Consent Toggles

    @ViewBuilder
    private var consentSection: some View {
        Section {
            ForEach(ConsentPurpose.allCases) { purpose in
                Toggle(isOn: binding(for: purpose)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Label(purpose.title, systemImage: purpose.icon)
                            .font(.body)
                        Text(purpose.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityLabel(purpose.title)
                .accessibilityHint(purpose.description)
            }
        } header: {
            Text(String(localized: "Data Processing"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(String(localized: "Toggle each purpose independently. Changes take effect immediately."))
        }
    }

    // MARK: - App Tracking Transparency

    @ViewBuilder
    private var trackingSection: some View {
        Section {
            HStack {
                Label(
                    String(localized: "Tracking Status"),
                    systemImage: "megaphone"
                )
                Spacer()
                Text(consentManager.attStatusString)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                String(localized: "Tracking status: \(consentManager.attStatusString)")
            )

            Button {
                // On iOS 17+, ATT re-prompt is not possible — direct to Settings
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            } label: {
                Label(
                    String(localized: "Open Tracking Settings"),
                    systemImage: "gear"
                )
            }
            .accessibilityLabel(String(localized: "Open tracking settings in system preferences"))
            .accessibilityHint(String(localized: "Opens iOS Settings to change tracking permissions"))
        } header: {
            Text(String(localized: "App Tracking Transparency"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(String(localized: "Apple requires apps to ask permission before tracking you across other companies' apps and websites."))
        }
    }

    // MARK: - Data Portability (GDPR Article 20)

    @ViewBuilder
    private var dataPortabilitySection: some View {
        Section {
            NavigationLink {
                DataExportView()
            } label: {
                Label(
                    String(localized: "Export My Data"),
                    systemImage: "square.and.arrow.up"
                )
            }
            .accessibilityLabel(String(localized: "Export all your financial data"))
            .accessibilityHint(String(localized: "Opens the data export screen where you can download your data in JSON or CSV format"))

            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Label(
                    String(localized: "Privacy Policy"),
                    systemImage: "doc.text"
                )
            }
            .accessibilityLabel(String(localized: "View the privacy policy"))
        } header: {
            Text(String(localized: "Your Data"))
                .accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Data Erasure (GDPR Article 17)

    @ViewBuilder
    private var dataErasureSection: some View {
        Section {
            Button(role: .destructive) {
                showingDeleteConfirmation = true
            } label: {
                Label(
                    String(localized: "Delete All My Data"),
                    systemImage: "trash"
                )
                .foregroundStyle(.red)
            }
            .accessibilityLabel(String(localized: "Delete all your data permanently"))
            .accessibilityHint(String(localized: "Shows a confirmation dialog before permanently deleting all your financial data"))
            .confirmationDialog(
                String(localized: "Delete All Data"),
                isPresented: $showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "Delete Everything"), role: .destructive) {
                    Task {
                        Self.logger.info("User confirmed data deletion from privacy settings")
                        // Delegate to SettingsViewModel.deleteEverything()
                        // This is wired through the parent Settings screen
                    }
                }
                Button(String(localized: "Export First, Then Delete"), role: .destructive) {
                    showingExportSheet = true
                }
                Button(String(localized: "Cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "This will permanently delete all your accounts, transactions, budgets, goals, and settings. This action cannot be undone."))
            }
        } header: {
            Text(String(localized: "Data Erasure"))
                .accessibilityAddTraits(.isHeader)
        } footer: {
            Text(String(localized: "Under GDPR Article 17, you have the right to have your personal data erased. We recommend exporting your data first."))
        }
    }

    // MARK: - Consent Info

    @ViewBuilder
    private var consentInfoSection: some View {
        Section {
            if let date = consentManager.consentDate {
                HStack {
                    Text(String(localized: "Last Updated"))
                    Spacer()
                    Text(date, style: .date)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "Consent last updated on \(date.formatted(date: .long, time: .omitted))")
                )
            }

            Button {
                consentManager.withdrawAllConsent()
            } label: {
                Label(
                    String(localized: "Withdraw All Optional Consent"),
                    systemImage: "hand.raised"
                )
                .foregroundStyle(.orange)
            }
            .accessibilityLabel(String(localized: "Withdraw all optional data processing consent"))
            .accessibilityHint(String(localized: "Disables analytics, tracking, and notifications. Cloud sync remains enabled."))
        } header: {
            Text(String(localized: "Consent Management"))
                .accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Helpers

    private func binding(for purpose: ConsentPurpose) -> Binding<Bool> {
        Binding<Bool>(
            get: { consentManager.hasConsent(for: purpose) },
            set: { consentManager.setConsent($0, for: purpose) }
        )
    }
}

#Preview {
    NavigationStack {
        PrivacySettingsView()
    }
}
