// SPDX-License-Identifier: BUSL-1.1

// PrivacyPolicyView.swift
// Finance
//
// Displays the Finance privacy policy using semantic typography and
// full VoiceOver / Dynamic Type support.
// Refs #474

import SwiftUI

// MARK: - View

struct PrivacyPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                headerSection

                policySection(
                    title: String(localized: "Data Collection"),
                    icon: "doc.text.magnifyingglass",
                    content: String(localized: "Finance collects only the financial data you explicitly enter — accounts, transactions, budgets, and goals. We do not collect browsing history, contacts, or location data. All data entry is initiated by you.")
                )

                policySection(
                    title: String(localized: "Data Storage"),
                    icon: "lock.shield",
                    content: String(localized: "Your financial data is stored locally on your device using encrypted SQLite databases. Sensitive credentials such as authentication tokens and encryption keys are stored in the Apple Keychain with hardware-backed protection. Data is never written to UserDefaults or unencrypted files.")
                )

                policySection(
                    title: String(localized: "Data Sync"),
                    icon: "arrow.triangle.2.circlepath",
                    content: String(localized: "When you enable cloud sync, your data is transmitted to our servers using TLS 1.3 encryption in transit and AES-256 encryption at rest. Sync is optional and can be disabled at any time from Settings. Your data remains fully functional offline.")
                )

                policySection(
                    title: String(localized: "Biometric Data"),
                    icon: "faceid",
                    content: String(localized: "Finance uses Face ID, Touch ID, or Optic ID solely for app unlock and to protect sensitive operations like viewing account numbers or exporting data. Biometric data never leaves your device and is managed entirely by the iOS Secure Enclave. We do not store or transmit biometric information.")
                )

                policySection(
                    title: String(localized: "Third-Party Services"),
                    icon: "building.2",
                    content: String(localized: "Finance does not include third-party analytics SDKs or advertising frameworks. We do not sell, share, or rent your personal data to third parties. If we integrate third-party services in the future, they will be clearly disclosed here.")
                )

                policySection(
                    title: String(localized: "Data Deletion"),
                    icon: "trash",
                    content: String(localized: "You can delete all your data at any time from Settings → Data → Delete All Data. This permanently removes all accounts, transactions, budgets, and goals from your device. If cloud sync is enabled, deletion propagates to the server within 30 days.")
                )

                policySection(
                    title: String(localized: "Your Rights"),
                    icon: "person.badge.shield.checkmark",
                    content: String(localized: "You have the right to access, export, correct, and delete your personal data at any time. You can export all your data in CSV or JSON format from Settings → Data → Export Data. We comply with GDPR, CCPA, and other applicable data protection regulations.")
                )

                policySection(
                    title: String(localized: "Contact"),
                    icon: "envelope",
                    content: String(localized: "If you have questions about this privacy policy or your data, please contact us at privacy@finance.app.")
                )

                lastUpdatedFooter
            }
            .padding()
        }
        .navigationTitle(String(localized: "Privacy Policy"))
        .navigationBarTitleDisplayMode(.inline)
        .background(FinanceColors.backgroundPrimary)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Privacy Policy"))
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(FinanceColors.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "Your privacy is important to us. This policy describes how Finance handles your data."))
                .font(.body)
                .foregroundStyle(FinanceColors.textSecondary)
        }
    }

    // MARK: - Section Builder

    private func policySection(
        title: String,
        icon: String,
        content: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.headline)
                .foregroundStyle(FinanceColors.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Text(content)
                .font(.body)
                .foregroundStyle(FinanceColors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Footer

    private var lastUpdatedFooter: some View {
        Text(String(localized: "Last updated: March 2026"))
            .font(.footnote)
            .foregroundStyle(FinanceColors.textDisabled)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 16)
            .accessibilityLabel(String(localized: "Privacy policy last updated March 2026"))
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
