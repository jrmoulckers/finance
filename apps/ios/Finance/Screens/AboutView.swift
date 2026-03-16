// SPDX-License-Identifier: BUSL-1.1

// AboutView.swift
// Finance
//
// About screen showing app identity, version information,
// description, and links to privacy policy, terms, and
// open-source license acknowledgments.

import os
import SwiftUI

// MARK: - View

struct AboutView: View {
    @ScaledMetric private var appIconSize: CGFloat = 80

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AboutView"
    )

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    var body: some View {
        List {
            appIdentitySection
            descriptionSection
            linksSection
            creditsSection
        }
        .navigationTitle(String(localized: "About"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Self.logger.debug("About screen viewed")
        }
    }

    // MARK: - App Identity

    private var appIdentitySection: some View {
        Section {
            VStack(spacing: 12) {
                Image(systemName: "banknote")
                    .font(.system(size: appIconSize * 0.5))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: appIconSize, height: appIconSize)
                    .background(
                        RoundedRectangle(cornerRadius: appIconSize * 0.2, style: .continuous)
                            .fill(Color.accentColor.opacity(0.12))
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "Finance"))
                    .font(.title2)
                    .fontWeight(.bold)
                    .accessibilityAddTraits(.isHeader)

                Text(String(localized: "Version %@ (%@)", defaultValue: "Version \(appVersion) (\(buildNumber))"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(
                        String(localized: "App version \(appVersion), build \(buildNumber)")
                    )
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Description

    private var descriptionSection: some View {
        Section {
            Text(String(localized: "Finance is a privacy-first personal financial tracking app. Your data is encrypted locally and synced end-to-end across your devices. We never sell or share your financial information."))
                .font(.body)
                .foregroundStyle(.secondary)
                .accessibilityLabel(
                    String(localized: "Finance is a privacy-first personal financial tracking app. Your data is encrypted locally and synced end-to-end across your devices. We never sell or share your financial information.")
                )
        }
    }

    // MARK: - Links

    private var linksSection: some View {
        Section {
            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Label(String(localized: "Privacy Policy"), systemImage: "hand.raised")
            }
            .accessibilityLabel(String(localized: "Privacy Policy"))
            .accessibilityHint(String(localized: "Opens the privacy policy"))

            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Label(String(localized: "Terms of Service"), systemImage: "doc.text")
            }
            .accessibilityLabel(String(localized: "Terms of Service"))
            .accessibilityHint(String(localized: "Opens the terms of service"))

            NavigationLink {
                LicensesView()
            } label: {
                Label(String(localized: "Open Source Licenses"), systemImage: "chevron.left.forwardslash.chevron.right")
            }
            .accessibilityLabel(String(localized: "Open Source Licenses"))
            .accessibilityHint(String(localized: "Opens the open source license attributions"))
        } header: {
            Text(String(localized: "Legal"))
        }
    }

    // MARK: - Credits

    private var creditsSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Text(String(localized: "Built with SwiftUI and Kotlin Multiplatform"))
                    .font(.body)

                Text(String(localized: "Designed and developed by the Finance team."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                String(localized: "Built with SwiftUI and Kotlin Multiplatform. Designed and developed by the Finance team.")
            )

            LabeledContent(String(localized: "Copyright")) {
                Text("© 2026 Jeffrey Moulckers")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(String(localized: "Copyright 2026 Jeffrey Moulckers"))
        } header: {
            Text(String(localized: "Credits"))
        }
    }
}

#Preview {
    NavigationStack {
        AboutView()
    }
}
