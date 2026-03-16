// SPDX-License-Identifier: BUSL-1.1

// SettingsView.swift
// Finance
//
// Form-style settings with large navigation title. Covers currency,
// notifications, biometric auth, data export, and about.

import os
import SwiftUI

// MARK: - View

struct SettingsView: View {
    @Environment(BiometricAuthManager.self) private var biometricManager
    @State private var viewModel = SettingsViewModel()

    var body: some View {
        NavigationStack {
            Form {
                generalSection
                notificationsSection
                securitySection
                dataSection
                aboutSection
            }
            .navigationTitle(String(localized: "Settings"))
            .navigationBarTitleDisplayMode(.large)
            .task { await viewModel.loadSettings() }
            .alert(
                String(localized: "Authentication Error"),
                isPresented: $viewModel.showingBiometricError,
                presenting: viewModel.biometricError
            ) { _ in
                Button(String(localized: "OK"), role: .cancel) {}
                    .accessibilityLabel(String(localized: "Dismiss error"))
            } message: { error in
                Text(error.localizedDescription)
            }
        }
    }

    // MARK: - General

    private var generalSection: some View {
        Section(String(localized: "General")) {
            Picker(String(localized: "Currency"), selection: $viewModel.selectedCurrency) {
                ForEach(viewModel.supportedCurrencies, id: \.0) { code, name in
                    Text("\(code) — \(name)").tag(code)
                }
            }
            .accessibilityLabel(String(localized: "Default currency"))
            .accessibilityHint(String(localized: "Select your preferred currency for displaying amounts"))
        }
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        Section(String(localized: "Notifications")) {
            Toggle(isOn: $viewModel.notificationsEnabled) {
                Label(String(localized: "Enable Notifications"), systemImage: "bell")
            }
            .accessibilityLabel(String(localized: "Enable notifications"))
            .accessibilityHint(String(localized: "Toggles push notifications for the app"))

            if viewModel.notificationsEnabled {
                Toggle(isOn: $viewModel.budgetAlerts) {
                    Label(String(localized: "Budget Alerts"), systemImage: "exclamationmark.triangle")
                }
                .accessibilityLabel(String(localized: "Budget alerts"))
                .accessibilityHint(String(localized: "Receive alerts when approaching budget limits"))

                Toggle(isOn: $viewModel.goalMilestones) {
                    Label(String(localized: "Goal Milestones"), systemImage: "flag")
                }
                .accessibilityLabel(String(localized: "Goal milestones"))
                .accessibilityHint(String(localized: "Receive notifications for goal progress milestones"))
            }
        }
    }

    // MARK: - Security

    private var securitySection: some View {
        Section(String(localized: "Security")) {
            Toggle(isOn: Binding(
                get: { viewModel.biometricEnabled },
                set: { _ in
                    Task { await viewModel.toggleBiometric(using: biometricManager) }
                }
            )) {
                Label(
                    biometricManager.biometricType.displayName,
                    systemImage: biometricManager.biometricType.systemImage
                )
            }
            .disabled(!biometricManager.isAvailable)
            .accessibilityLabel(biometricManager.biometricType.displayName)
            .accessibilityHint(
                biometricManager.isAvailable
                    ? String(localized: "Require biometric authentication to open the app")
                    : String(localized: "Biometric authentication is not available on this device")
            )
            .accessibilityValue(
                viewModel.biometricEnabled
                    ? String(localized: "Enabled")
                    : String(localized: "Disabled")
            )

            if !biometricManager.isAvailable {
                Text(String(localized: "Biometric authentication is not available. Enroll Face ID or Touch ID in device Settings."))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(String(localized: "Biometric authentication is not available. Enroll Face ID or Touch ID in device Settings."))
            }

            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Label(String(localized: "Privacy Policy"), systemImage: "hand.raised")
            }
            .accessibilityLabel(String(localized: "Privacy Policy"))
            .accessibilityHint(String(localized: "Opens the privacy policy"))
        }
    }

    // MARK: - Data

    private var dataSection: some View {
        Section(String(localized: "Data")) {
            Button {
                Task {
                    let authorized = await viewModel.authenticateForExport(
                        using: biometricManager
                    )
                    if authorized {
                        viewModel.showingExportConfirmation = true
                    }
                }
            } label: {
                Label {
                    if viewModel.isExporting {
                        HStack(spacing: 8) {
                            Text(String(localized: "Exporting..."))
                            ProgressView()
                        }
                    } else {
                        Text(String(localized: "Export Data"))
                    }
                } icon: {
                    Image(systemName: "square.and.arrow.up")
                }
            }
            .disabled(viewModel.isExporting)
            .accessibilityLabel(String(localized: "Export data"))
            .accessibilityHint(String(localized: "Exports all your financial data as a file"))
            .confirmationDialog(
                String(localized: "Export Data"),
                isPresented: $viewModel.showingExportConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "Export as CSV")) { Task { await viewModel.exportData() } }
                    .accessibilityLabel(String(localized: "Export as CSV"))
                Button(String(localized: "Export as JSON")) { Task { await viewModel.exportData() } }
                    .accessibilityLabel(String(localized: "Export as JSON"))
                Button(String(localized: "Cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "Choose your preferred export format."))
            }

            Button(role: .destructive) {
                viewModel.showingDeleteConfirmation = true
            } label: {
                Label(String(localized: "Delete All Data"), systemImage: "trash").foregroundStyle(.red)
            }
            .accessibilityLabel(String(localized: "Delete all data"))
            .accessibilityHint(String(localized: "Permanently deletes all your financial data"))
            .confirmationDialog(
                String(localized: "Delete All Data?"),
                isPresented: $viewModel.showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "Delete Everything"), role: .destructive) {
                    // TODO: Replace MockRepository with KMP-backed repository
                }
                Button(String(localized: "Cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "This will permanently delete all accounts, transactions, budgets, and goals. This action cannot be undone."))
            }
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        Section(String(localized: "About")) {
            LabeledContent(String(localized: "Version")) {
                Text("\(viewModel.appVersion) (\(viewModel.buildNumber))").foregroundStyle(.secondary)
            }
            .accessibilityLabel(String(localized: "App version \(viewModel.appVersion), build \(viewModel.buildNumber)"))

            NavigationLink {
                AboutView()
            } label: {
                Label(String(localized: "About Finance"), systemImage: "info.circle")
            }
            .accessibilityLabel(String(localized: "About Finance"))
            .accessibilityHint(String(localized: "Opens app information, licenses, and acknowledgments"))

            NavigationLink {
                AboutView()
            } label: {
                Label(String(localized: "Acknowledgments"), systemImage: "heart")
            }
            .accessibilityLabel(String(localized: "Acknowledgments"))
            .accessibilityHint(String(localized: "Opens the open source acknowledgments"))
        }
    }
}

#Preview {
    SettingsView()
        .environment(BiometricAuthManager())
}
