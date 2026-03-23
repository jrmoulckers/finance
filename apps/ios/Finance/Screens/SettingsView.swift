// SPDX-License-Identifier: BUSL-1.1

// SettingsView.swift
// Finance
//
// Form-style settings with large navigation title. Covers currency,
// notifications, biometric auth, data export, sync status, and about.
// Refs #565, #652, #650

import AuthenticationServices
import os
import SwiftUI

// MARK: - View

struct SettingsView: View {
    @Environment(BiometricAuthManager.self) private var biometricManager
    @Environment(AuthenticationService.self) private var authService
    @State private var viewModel: SettingsViewModel

    init(viewModel: SettingsViewModel = SettingsViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                generalSection
                notificationsSection
                securitySection
                syncSection
                dataSection
                dangerZoneSection
                aboutSection
            }
            .navigationTitle(String(localized: "Settings"))
            .navigationBarTitleDisplayMode(.large)
            .task { await viewModel.loadSettings() }
            .disabled(viewModel.isDeletingData)
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
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
            .alert(
                String(localized: "Export Failed"),
                isPresented: $viewModel.showingExportError
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
                    .accessibilityLabel(String(localized: "Dismiss error"))
            } message: {
                if let message = viewModel.exportErrorMessage {
                    Text(message)
                }
            }
            .alert(String(localized: "Sign-In Error"), isPresented: Binding(get: { authService.authError != nil }, set: { _ in })) {
                Button(String(localized: "OK"), role: .cancel) {}.accessibilityLabel(String(localized: "Dismiss sign-in error"))
            } message: { if let error = authService.authError { Text(error) } }
            .sheet(isPresented: $viewModel.showingShareSheet) {
                if let url = viewModel.exportedFileURL {
                    ShareSheetView(fileURL: url)
                }
            }
            .alert(String(localized: "Delete All Data?"), isPresented: Binding(get: { viewModel.deletionConfirmationStep == .initialWarning }, set: { if !$0 { viewModel.cancelDeletion() } })) { Button(String(localized: "Continue"), role: .destructive) { viewModel.proceedToExportOffer() }; Button(String(localized: "Cancel"), role: .cancel) { viewModel.cancelDeletion() } } message: { Text(String(localized: "Are you sure? This will permanently delete all your financial data. This action cannot be undone.")) }
            .alert(String(localized: "Export Data First?"), isPresented: Binding(get: { viewModel.deletionConfirmationStep == .exportOffer }, set: { if !$0 { viewModel.cancelDeletion() } })) { Button(String(localized: "Export Data")) { Task { let a = await viewModel.authenticateForExport(using: biometricManager); if a { viewModel.showingExportConfirmation = true }; viewModel.proceedToBiometricAuth() } }; Button(String(localized: "Skip Export"), role: .destructive) { viewModel.proceedToBiometricAuth() }; Button(String(localized: "Cancel"), role: .cancel) { viewModel.cancelDeletion() } } message: { Text(String(localized: "Would you like to export your data before deleting everything?")) }
            .sheet(isPresented: Binding(get: { viewModel.deletionConfirmationStep == .typedConfirmation }, set: { if !$0 { viewModel.cancelDeletion() } })) { deleteConfirmationSheet }
            .sheet(isPresented: Binding(get: { viewModel.deletionConfirmationStep == .deleting }, set: { _ in })) { deletionProgressSheet }
            .alert(String(localized: "Deletion Failed"), isPresented: $viewModel.showingDeletionError) { Button(String(localized: "Retry"), role: .destructive) { viewModel.deleteConfirmationText = "DELETE"; Task { await viewModel.deleteAllData() } }; Button(String(localized: "Cancel"), role: .cancel) { viewModel.cancelDeletion() } } message: { if let error = viewModel.deletionError { Text(error) } }
            .onChange(of: viewModel.deletionConfirmationStep) { _, newStep in if newStep == .biometricAuth { Task { await viewModel.authenticateForDeletion(using: biometricManager) } } }
        }
    }

    // MARK: - Account

    private var accountSection: some View {
        Section(String(localized: "Account")) {
            if authService.isAuthenticated, let user = authService.currentUser {
                HStack {
                    Image(systemName: "person.crop.circle.fill").font(.title).foregroundStyle(.secondary).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        if let name = user.name { Text(name).font(.headline) }
                        if let email = user.email { Text(email).font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Signed in as \(user.name ?? user.email ?? user.id)"))
                Button(role: .destructive) { Task { await authService.signOut() } } label: {
                    Label(String(localized: "Sign Out"), systemImage: "rectangle.portrait.and.arrow.right")
                }.accessibilityLabel(String(localized: "Sign Out")).accessibilityHint(String(localized: "Signs you out of your account"))
            } else {
                Button { Task { await authService.signInWithApple() } } label: {
                    HStack { Image(systemName: "apple.logo").accessibilityHidden(true); Text(String(localized: "Sign in with Apple")) }.frame(maxWidth: .infinity, minHeight: 44)
                }.accessibilityLabel(String(localized: "Sign in with Apple")).accessibilityHint(String(localized: "Signs you in using your Apple ID"))
                Text(String(localized: "Sign in to sync your data across devices and enable cloud backup.")).font(.footnote).foregroundStyle(.secondary)
                    .accessibilityLabel(String(localized: "Sign in to sync your data across devices and enable cloud backup."))
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
                Toggle(isOn: $viewModel.budgetAlertsEnabled) {
                    Label(String(localized: "Budget Alerts"), systemImage: "exclamationmark.triangle")
                }
                .accessibilityLabel(String(localized: "Budget alerts"))
                .accessibilityHint(String(localized: "Receive alerts when approaching budget limits"))

                Toggle(isOn: $viewModel.goalMilestonesEnabled) {
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

    // MARK: - Sync

    private var syncSection: some View {
        Section(String(localized: "Sync")) {
            HStack {
                Label(String(localized: "Last Synced"), systemImage: "arrow.triangle.2.circlepath")
                Spacer()
                if let lastSync = viewModel.lastSyncDate {
                    Text(lastSync, style: .relative)
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                } else {
                    Text(String(localized: "Never"))
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                viewModel.lastSyncDate != nil
                    ? String(localized: "Last synced")
                    : String(localized: "Never synced")
            )

            if viewModel.pendingChangesCount > 0 {
                HStack {
                    Label(String(localized: "Pending Changes"), systemImage: "clock.arrow.circlepath")
                    Spacer()
                    Text("\(viewModel.pendingChangesCount)")
                        .foregroundStyle(.orange)
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "\(viewModel.pendingChangesCount) pending changes")
                )
            }

            Button {
                Task { await viewModel.syncNow() }
            } label: {
                HStack {
                    Label(String(localized: "Sync Now"), systemImage: "arrow.clockwise")
                    Spacer()
                    if viewModel.isSyncing {
                        ProgressView()
                    }
                }
            }
            .disabled(viewModel.isSyncing)
            .accessibilityLabel(String(localized: "Sync now"))
            .accessibilityHint(String(localized: "Triggers a manual data sync with the server"))
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
                Button(String(localized: "Export as CSV")) {
                    Task { await viewModel.exportData(format: .csv) }
                }
                .accessibilityLabel(String(localized: "Export as CSV"))

                Button(String(localized: "Export as JSON")) {
                    Task { await viewModel.exportData(format: .json) }
                }
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

// MARK: - ShareSheetView

/// Wraps `UIActivityViewController` for presenting share actions.
///
/// UIKit is required here because SwiftUI's `ShareLink` does not support
/// sharing arbitrary file URLs produced at runtime. This is the only UIKit
/// usage in the settings flow.
private struct ShareSheetView: UIViewControllerRepresentable {
    let fileURL: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(
            activityItems: [fileURL],
            applicationActivities: nil
        )
    }

    func updateUIViewController(
        _ uiViewController: UIActivityViewController,
        context: Context
    ) {}
}

#Preview {
    SettingsView()
        .environment(BiometricAuthManager())
        .environment(AuthenticationService())
}
