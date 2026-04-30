// SPDX-License-Identifier: BUSL-1.1
// ConsentView.swift — First-run GDPR consent dialog.
//
// Presented on first launch before the user can access the app.
// Shows per-purpose consent toggles with clear descriptions of what
// data is processed and why. The user must actively opt-in to each
// non-essential purpose (GDPR Article 7 — consent must be freely
// given, specific, informed, and unambiguous).
//
// References: #879, #474

import os
import SwiftUI

// MARK: - ConsentView

/// First-run privacy consent dialog with per-purpose toggles.
///
/// Satisfies GDPR requirements:
/// - **Article 7**: Specific consent per processing purpose
/// - **Article 13**: Information about data processing before consent
/// - **Article 7(3)**: Right to withdraw consent at any time
///
/// Users can modify their choices later in Settings > Privacy.
struct ConsentView: View {

    @State private var consentManager = ConsentManager.shared
    @State private var localConsents: [ConsentPurpose: Bool] = [:]

    /// Callback when the user accepts and the consent dialog should dismiss.
    let onAccept: () -> Void

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ConsentView"
    )

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection
                    essentialSection
                    optionalSection
                    legalSection
                    acceptSection
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .navigationTitle(String(localized: "Your Privacy"))
            .navigationBarTitleDisplayMode(.large)
            .onAppear { initialiseLocalConsents() }
        }
    }

    // MARK: - Header

    @ViewBuilder
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "hand.raised.fill")
                .font(.system(size: 48))
                .foregroundStyle(.blue)
                .accessibilityHidden(true)

            Text(String(localized: "We respect your privacy"))
                .font(.title2)
                .fontWeight(.bold)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "Finance processes your data locally by default. Choose which optional features to enable. You can change these settings at any time."))
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Essential Processing

    @ViewBuilder
    private var essentialSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Essential"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ConsentItemView(
                icon: "lock.shield",
                title: String(localized: "Local Data Storage"),
                description: String(localized: "Your financial data is stored securely on this device with hardware encryption. This is required for the app to function."),
                isEnabled: .constant(true),
                isRequired: true
            )
        }
    }

    // MARK: - Optional Processing

    @ViewBuilder
    private var optionalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Optional"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(ConsentPurpose.allCases) { purpose in
                ConsentItemView(
                    icon: purpose.icon,
                    title: purpose.title,
                    description: purpose.description,
                    isEnabled: binding(for: purpose),
                    isRequired: false
                )
            }
        }
    }

    // MARK: - Legal Footer

    @ViewBuilder
    private var legalSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "By continuing, you acknowledge our Privacy Policy. You can withdraw consent at any time from Settings > Privacy."))
                .font(.caption)
                .foregroundStyle(.secondary)

            NavigationLink {
                PrivacyPolicyView()
            } label: {
                Text(String(localized: "Read Privacy Policy"))
                    .font(.caption)
                    .foregroundStyle(.blue)
            }
            .accessibilityLabel(String(localized: "Read the full privacy policy"))
        }
    }

    // MARK: - Accept Button

    @ViewBuilder
    private var acceptSection: some View {
        Button {
            consentManager.recordInitialConsent(localConsents)
            Self.logger.info("User accepted privacy consent")
            onAccept()
        } label: {
            Text(String(localized: "Continue"))
                .frame(maxWidth: .infinity)
                .padding()
                .background(.blue)
                .foregroundStyle(.white)
                .cornerRadius(12)
                .font(.headline)
        }
        .accessibilityLabel(String(localized: "Accept privacy settings and continue"))
        .accessibilityHint(String(localized: "Saves your privacy choices and opens the app"))
        .padding(.top, 8)
    }

    // MARK: - Helpers

    private func initialiseLocalConsents() {
        for purpose in ConsentPurpose.allCases {
            localConsents[purpose] = consentManager.consents[purpose] ?? false
        }
    }

    private func binding(for purpose: ConsentPurpose) -> Binding<Bool> {
        Binding<Bool>(
            get: { localConsents[purpose] ?? false },
            set: { localConsents[purpose] = $0 }
        )
    }
}

// MARK: - ConsentItemView

/// A single consent toggle with icon, title, and description.
struct ConsentItemView: View {
    let icon: String
    let title: String
    let description: String
    @Binding var isEnabled: Bool
    let isRequired: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(isRequired ? .green : .blue)
                .frame(width: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(title)
                        .font(.subheadline)
                        .fontWeight(.medium)

                    if isRequired {
                        Text(String(localized: "Required"))
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(.green.opacity(0.15))
                            .foregroundStyle(.green)
                            .cornerRadius(4)
                    }

                    Spacer()

                    if isRequired {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .accessibilityLabel(String(localized: "Required, always enabled"))
                    } else {
                        Toggle("", isOn: $isEnabled)
                            .labelsHidden()
                            .accessibilityLabel(title)
                            .accessibilityHint(
                                isEnabled
                                    ? String(localized: "Currently enabled. Double tap to disable.")
                                    : String(localized: "Currently disabled. Double tap to enable.")
                            )
                    }
                }

                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    ConsentView(onAccept: {})
}
