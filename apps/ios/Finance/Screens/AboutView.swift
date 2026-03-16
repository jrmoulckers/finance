// SPDX-License-Identifier: BUSL-1.1

// AboutView.swift
// Finance
//
// Displays app version, build info, and third-party licenses/acknowledgments.
// Reads THIRD-PARTY-NOTICES from the app bundle for license attributions.
// Refs #474

import os
import SwiftUI

// MARK: - View

struct AboutView: View {
    @State private var viewModel = AboutViewModel()

    var body: some View {
        List {
            appInfoSection
            linksSection
            acknowledgmentsSection
            legalSection
        }
        .listStyle(.insetGrouped)
        .navigationTitle(String(localized: "About"))
        .navigationBarTitleDisplayMode(.inline)
        .task { viewModel.loadAppInfo() }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "dollarsign.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(FinanceColors.interactive)
                    .accessibilityHidden(true)

                Text(String(localized: "Finance"))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(FinanceColors.textPrimary)

                Text(String(localized: "Your personal financial tracker"))
                    .font(.subheadline)
                    .foregroundStyle(FinanceColors.textSecondary)

                Text(
                    String(localized: "Version \(viewModel.appVersion) (\(viewModel.buildNumber))")
                )
                .font(.caption)
                .foregroundStyle(FinanceColors.textDisabled)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                String(localized: "Finance, version \(viewModel.appVersion), build \(viewModel.buildNumber)")
            )
        }
    }

    // MARK: - Links

    private var linksSection: some View {
        Section(String(localized: "Information")) {
            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Label(String(localized: "Privacy Policy"), systemImage: "hand.raised")
            }
            .accessibilityLabel(String(localized: "Privacy Policy"))
            .accessibilityHint(String(localized: "Opens the privacy policy"))

            LabeledContent(String(localized: "Platform")) {
                Text(viewModel.platformDescription)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(
                String(localized: "Platform: \(viewModel.platformDescription)")
            )

            LabeledContent(String(localized: "Minimum iOS")) {
                Text("17.0")
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(String(localized: "Minimum iOS version: 17.0"))
        }
    }

    // MARK: - Acknowledgments

    private var acknowledgmentsSection: some View {
        Section(String(localized: "Acknowledgments")) {
            NavigationLink {
                ThirdPartyNoticesView(content: viewModel.thirdPartyNotices)
            } label: {
                Label(String(localized: "Third-Party Licenses"), systemImage: "doc.text")
            }
            .accessibilityLabel(String(localized: "Third-party licenses"))
            .accessibilityHint(String(localized: "Opens the open source license attributions"))

            NavigationLink {
                technologyStackView
            } label: {
                Label(String(localized: "Technology Stack"), systemImage: "cpu")
            }
            .accessibilityLabel(String(localized: "Technology stack"))
            .accessibilityHint(String(localized: "Shows the technologies used to build Finance"))
        }
    }

    // MARK: - Legal

    private var legalSection: some View {
        Section {
            Text(String(localized: "© 2026 Finance Contributors. Licensed under BUSL-1.1."))
                .font(.footnote)
                .foregroundStyle(FinanceColors.textDisabled)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityLabel(
                    String(localized: "Copyright 2026 Finance Contributors. Licensed under Business Source License 1.1.")
                )
        }
    }

    // MARK: - Technology Stack

    private var technologyStackView: some View {
        List {
            Section(String(localized: "Frontend")) {
                technologyRow(name: "SwiftUI", detail: String(localized: "Declarative UI framework"))
                technologyRow(name: "Swift Charts", detail: String(localized: "Financial data visualization"))
                technologyRow(name: "WidgetKit", detail: String(localized: "Home Screen widgets"))
            }

            Section(String(localized: "Shared Logic")) {
                technologyRow(name: "Kotlin Multiplatform", detail: String(localized: "Cross-platform business logic"))
                technologyRow(name: "SQLDelight", detail: String(localized: "Type-safe local database"))
            }

            Section(String(localized: "Security")) {
                technologyRow(name: "Apple Keychain", detail: String(localized: "Secure credential storage"))
                technologyRow(name: "LocalAuthentication", detail: String(localized: "Face ID / Touch ID"))
                technologyRow(name: "Secure Enclave", detail: String(localized: "Hardware-backed key generation"))
            }

            Section(String(localized: "Infrastructure")) {
                technologyRow(name: "Supabase", detail: String(localized: "Backend and real-time sync"))
                technologyRow(name: "APNs", detail: String(localized: "Push notifications"))
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(String(localized: "Technology Stack"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func technologyRow(name: String, detail: String) -> some View {
        LabeledContent(name) {
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(detail)")
    }
}

// MARK: - Third-Party Notices View

/// Displays the raw content of the THIRD-PARTY-NOTICES file from the
/// app bundle in a scrollable text view with Dynamic Type support.
struct ThirdPartyNoticesView: View {
    let content: String

    var body: some View {
        ScrollView {
            if content.isEmpty {
                ContentUnavailableView(
                    String(localized: "No Notices Found"),
                    systemImage: "doc.text",
                    description: Text(String(localized: "Third-party notices could not be loaded."))
                )
            } else {
                Text(content)
                    .font(.caption)
                    .foregroundStyle(FinanceColors.textSecondary)
                    .padding()
                    .textSelection(.enabled)
                    .accessibilityLabel(String(localized: "Third-party software notices and license attributions"))
            }
        }
        .navigationTitle(String(localized: "Third-Party Licenses"))
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - ViewModel

@Observable
@MainActor
final class AboutViewModel {
    private(set) var appVersion: String = "—"
    private(set) var buildNumber: String = "—"
    private(set) var thirdPartyNotices: String = ""

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AboutViewModel"
    )

    /// The current platform description.
    var platformDescription: String {
        #if os(iOS)
        return "iOS / iPadOS"
        #elseif os(macOS)
        return "macOS (Catalyst)"
        #elseif os(watchOS)
        return "watchOS"
        #else
        return "Apple Platform"
        #endif
    }

    /// Loads app version info from the main bundle and reads the
    /// THIRD-PARTY-NOTICES file for license attributions.
    func loadAppInfo() {
        appVersion = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleShortVersionString"
        ) as? String ?? "0.1.0"

        buildNumber = Bundle.main.object(
            forInfoDictionaryKey: "CFBundleVersion"
        ) as? String ?? "1"

        loadThirdPartyNotices()
    }

    /// Reads the THIRD-PARTY-NOTICES file from the app bundle.
    private func loadThirdPartyNotices() {
        // Try both .md and plain text variants
        let fileNames = ["THIRD-PARTY-NOTICES.md", "THIRD-PARTY-NOTICES"]

        for fileName in fileNames {
            let components = fileName.split(separator: ".", maxSplits: 1)
            let name = String(components[0])
            let ext = components.count > 1 ? String(components[1]) : nil

            if let url = Bundle.main.url(
                forResource: name,
                withExtension: ext
            ) {
                do {
                    thirdPartyNotices = try String(contentsOf: url, encoding: .utf8)
                    Self.logger.debug(
                        "Loaded third-party notices from \(fileName, privacy: .public)"
                    )
                    return
                } catch {
                    Self.logger.warning(
                        "Failed to read \(fileName, privacy: .public): \(error.localizedDescription, privacy: .public)"
                    )
                }
            }
        }

        Self.logger.info("No THIRD-PARTY-NOTICES file found in bundle")
        thirdPartyNotices = ""
    }
}

#Preview {
    NavigationStack {
        AboutView()
    }
}
