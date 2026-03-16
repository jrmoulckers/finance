// SPDX-License-Identifier: BUSL-1.1

// PrivacyPolicyView.swift
// Finance
//
// Structured privacy policy screen for App Store compliance.
// Describes data collection, storage, third-party services,
// user rights, and retention policies in a scrollable List.

import os
import SwiftUI

// MARK: - View

struct PrivacyPolicyView: View {
    @ScaledMetric private var iconSize: CGFloat = 20

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "PrivacyPolicyView"
    )

    private static let effectiveDate = "January 1, 2026"
    private static let contactEmail = "privacy@finance-app.example.com"

    var body: some View {
        List {
            effectiveDateSection
            dataWeCollectSection
            howWeUseDataSection
            dataStorageSection
            thirdPartyServicesSection
            yourRightsSection
            dataRetentionSection
            contactSection
            updatesSection
        }
        .navigationTitle(String(localized: "Privacy Policy"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Self.logger.debug("Privacy policy viewed")
        }
    }

    // MARK: - Effective Date

    private var effectiveDateSection: some View {
        Section {
            Label {
                Text(String(localized: "Effective: \(Self.effectiveDate)"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } icon: {
                Image(systemName: "calendar")
                    .frame(width: iconSize)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel(
                String(localized: "Policy effective date: \(Self.effectiveDate)")
            )
        }
    }

    // MARK: - Data We Collect

    private var dataWeCollectSection: some View {
        Section {
            policyRow(
                icon: "dollarsign.circle",
                title: String(localized: "Financial Transactions"),
                detail: String(localized: "Amounts, payees, categories, dates, and notes for each transaction you enter.")
            )
            policyRow(
                icon: "building.columns",
                title: String(localized: "Account Information"),
                detail: String(localized: "Account names, types, and balances that you create within the app.")
            )
            policyRow(
                icon: "chart.pie",
                title: String(localized: "Budget & Goal Data"),
                detail: String(localized: "Budget categories, spending limits, goal targets, and progress you configure.")
            )
            policyRow(
                icon: "iphone",
                title: String(localized: "Device Identifiers"),
                detail: String(localized: "An anonymous device identifier for sync purposes only. No advertising identifiers are collected.")
            )
        } header: {
            Text(String(localized: "Data We Collect"))
        } footer: {
            Text(String(localized: "All financial data is entered by you and stored locally on your device first. We do not access your bank accounts or import data automatically."))
                .font(.footnote)
        }
    }

    // MARK: - How We Use Your Data

    private var howWeUseDataSection: some View {
        Section {
            policyRow(
                icon: "person.fill",
                title: String(localized: "Personal Financial Tracking"),
                detail: String(localized: "Your data is used exclusively to provide you with financial tracking, budgeting, and goal progress features.")
            )
            policyRow(
                icon: "nosign",
                title: String(localized: "Never Sold or Shared"),
                detail: String(localized: "We never sell, rent, or share your financial data with third parties for advertising or marketing purposes.")
            )
            policyRow(
                icon: "chart.bar.xaxis",
                title: String(localized: "No Profiling"),
                detail: String(localized: "We do not build advertising profiles or perform behavioral analysis on your financial data.")
            )
        } header: {
            Text(String(localized: "How We Use Your Data"))
        }
    }

    // MARK: - Data Storage

    private var dataStorageSection: some View {
        Section {
            policyRow(
                icon: "lock.shield",
                title: String(localized: "Local Encryption"),
                detail: String(localized: "All data is encrypted on your device using SQLCipher with AES-256 encryption. Your data is protected even if the device is compromised.")
            )
            policyRow(
                icon: "key.fill",
                title: String(localized: "Keychain Protected Secrets"),
                detail: String(localized: "Authentication tokens and encryption keys are stored in the Apple Keychain, protected by the Secure Enclave when available.")
            )
            policyRow(
                icon: "arrow.triangle.2.circlepath",
                title: String(localized: "End-to-End Encrypted Sync"),
                detail: String(localized: "When sync is enabled, data is encrypted on your device before transmission. The server cannot read your financial data.")
            )
        } header: {
            Text(String(localized: "Data Storage & Security"))
        }
    }

    // MARK: - Third-Party Services

    private var thirdPartyServicesSection: some View {
        Section {
            policyRow(
                icon: "cloud",
                title: String(localized: "Supabase"),
                detail: String(localized: "Used for authenticated data sync between your devices. Data is end-to-end encrypted before reaching Supabase servers.")
            )
            policyRow(
                icon: "arrow.clockwise.circle",
                title: String(localized: "PowerSync"),
                detail: String(localized: "Provides offline-first sync capability. Ensures your data is available without an internet connection and syncs when connectivity is restored.")
            )
            policyRow(
                icon: "xmark.circle",
                title: String(localized: "No Analytics or Advertising"),
                detail: String(localized: "We do not use any analytics tracking, advertising networks, or third-party SDKs that collect your personal information.")
            )
        } header: {
            Text(String(localized: "Third-Party Services"))
        }
    }

    // MARK: - Your Rights

    private var yourRightsSection: some View {
        Section {
            policyRow(
                icon: "square.and.arrow.up",
                title: String(localized: "Export Your Data"),
                detail: String(localized: "Export all your financial data at any time in CSV or JSON format from Settings > Data > Export Data.")
            )
            policyRow(
                icon: "trash",
                title: String(localized: "Delete Your Data"),
                detail: String(localized: "Delete all data from your device and our servers at any time from Settings > Data > Delete All Data.")
            )
            policyRow(
                icon: "externaldrive",
                title: String(localized: "Data Portability"),
                detail: String(localized: "Your exported data is in standard formats (CSV, JSON) that can be imported into other financial applications.")
            )
        } header: {
            Text(String(localized: "Your Rights"))
        }
    }

    // MARK: - Data Retention

    private var dataRetentionSection: some View {
        Section {
            policyRow(
                icon: "clock",
                title: String(localized: "Retained Until Deleted"),
                detail: String(localized: "Your data is kept on your device and sync server until you choose to delete it. We do not impose automatic data expiration.")
            )
            policyRow(
                icon: "person.badge.minus",
                title: String(localized: "Account Deletion"),
                detail: String(localized: "When you delete your account, all data is removed from our sync servers within 30 days. Local data is deleted immediately from your device.")
            )
        } header: {
            Text(String(localized: "Data Retention"))
        }
    }

    // MARK: - Contact

    private var contactSection: some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "Privacy Inquiries"))
                        .font(.body)
                    Text(Self.contactEmail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "envelope")
                    .frame(width: iconSize)
                    .foregroundStyle(Color.accentColor)
            }
            .accessibilityLabel(String(localized: "Privacy inquiries"))
            .accessibilityValue(Self.contactEmail)
            .accessibilityHint(String(localized: "Contact email for privacy questions"))
        } header: {
            Text(String(localized: "Contact"))
        } footer: {
            Text(String(localized: "For questions about this privacy policy or your data, contact us at the email above."))
                .font(.footnote)
        }
    }

    // MARK: - Updates

    private var updatesSection: some View {
        Section {
            policyRow(
                icon: "bell.badge",
                title: String(localized: "Policy Changes"),
                detail: String(localized: "We will notify you of significant changes to this privacy policy through an in-app notification. Continued use of the app after changes constitutes acceptance.")
            )
        } header: {
            Text(String(localized: "Policy Updates"))
        }
    }

    // MARK: - Helper

    private func policyRow(icon: String, title: String, detail: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: icon)
                .frame(width: iconSize)
                .foregroundStyle(Color.accentColor)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail)")
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
