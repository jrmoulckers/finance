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
                    title: String(localized: "privacy.section.dataCollection.title"),
                    icon: "doc.text.magnifyingglass",
                    content: String(localized: "privacy.section.dataCollection.body")
                )

                policySection(
                    title: String(localized: "privacy.section.dataStorage.title"),
                    icon: "lock.shield",
                    content: String(localized: "privacy.section.dataStorage.body")
                )

                policySection(
                    title: String(localized: "privacy.section.cloudSync.title"),
                    icon: "arrow.triangle.2.circlepath",
                    content: String(localized: "privacy.section.cloudSync.body")
                )

                policySection(
                    title: String(localized: "privacy.section.dataUsage.title"),
                    icon: "hand.raised",
                    content: String(localized: "privacy.section.dataUsage.body")
                )

                policySection(
                    title: String(localized: "privacy.section.thirdPartyServices.title"),
                    icon: "building.2",
                    content: String(localized: "privacy.section.thirdPartyServices.body")
                )

                policySection(
                    title: String(localized: "privacy.section.dataDeletion.title"),
                    icon: "trash",
                    content: String(localized: "privacy.section.dataDeletion.body")
                )

                policySection(
                    title: String(localized: "privacy.section.gdprRights.title"),
                    icon: "person.badge.shield.checkmark",
                    content: String(localized: "privacy.section.gdprRights.body")
                )

                policySection(
                    title: String(localized: "privacy.section.contact.title"),
                    icon: "envelope",
                    content: String(localized: "privacy.section.contact.body")
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

            Text(String(localized: "privacy.header.subtitle"))
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
        Text(String(localized: "privacy.footer.lastUpdated"))
            .font(.footnote)
            .foregroundStyle(FinanceColors.textDisabled)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 16)
            .accessibilityLabel(
                String(localized: "privacy.footer.lastUpdated.accessibilityLabel")
            )
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
