// SPDX-License-Identifier: BUSL-1.1

// WalletCaptureView.swift
// Finance
//
// Review inbox for Wallet-aware transaction capture (#2171). Surfaces recent
// Apple Pay / card activity with recognized merchant, category suggestion,
// confidence, and duplicate warnings so an Apple Pay-heavy user can confirm
// imports in one tap instead of full manual re-entry.

import SwiftUI

struct WalletCaptureView: View {
    @State var viewModel: WalletCaptureViewModel
    var onImported: () -> Void = {}
    @Environment(\.dismiss) private var dismiss

    init(
        viewModel: WalletCaptureViewModel = WalletCaptureViewModel(),
        onImported: @escaping () -> Void = {}
    ) {
        _viewModel = State(initialValue: viewModel)
        self.onImported = onImported
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(String(localized: "From Apple Pay"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(String(localized: "Done")) {
                            if viewModel.importedCount > 0 { onImported() }
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        if !viewModel.nonDuplicateCandidates.isEmpty {
                            Button(String(localized: "Import All")) {
                                Task {
                                    await viewModel.importAllNonDuplicates()
                                }
                            }
                            .accessibilityIdentifier("wallet_import_all_button")
                        }
                    }
                }
                .task { await viewModel.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            ProgressView(String(localized: "Reading recent card activity…"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.isEmpty {
            ContentUnavailableView(
                String(localized: "Nothing to Import"),
                systemImage: "creditcard",
                description: Text(String(localized: "No new Apple Pay activity to review right now."))
            )
        } else {
            List {
                Section {
                    ForEach(viewModel.candidates) { candidate in
                        row(candidate)
                    }
                } footer: {
                    Text(String(localized: "Recent card activity, matched to merchants automatically. Review and import what you recognize — duplicates of existing entries are flagged."))
                }
            }
        }
    }

    private func row(_ candidate: WalletTransactionCandidate) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(candidate.merchant)
                        .font(.body.weight(.semibold))
                    Text(candidate.rawDescriptor)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                CurrencyLabel(
                    amountInMinorUnits: -candidate.amountMinorUnits,
                    currencyCode: candidate.currencyCode,
                    showSign: false,
                    font: .body.weight(.semibold)
                )
            }

            HStack(spacing: 8) {
                Label(candidate.confidence.displayName, systemImage: candidate.confidence.systemImage)
                    .font(.caption2)
                    .foregroundStyle(candidate.confidence.tint)
                if let category = candidate.suggestedCategory {
                    Text(category)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.15), in: Capsule())
                }
                if let last4 = candidate.cardLast4 {
                    Text(String(localized: "•••• \(last4)"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if candidate.isLikelyDuplicate {
                Label(
                    String(localized: "Looks like a duplicate of an existing transaction"),
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption2)
                .foregroundStyle(.orange)
            }

            HStack {
                Button {
                    Task { await viewModel.importCandidate(candidate) }
                } label: {
                    Label(
                        candidate.isLikelyDuplicate
                            ? String(localized: "Import Anyway")
                            : String(localized: "Import"),
                        systemImage: "square.and.arrow.down"
                    )
                    .font(.callout)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("wallet_import_button")

                Button(role: .cancel) {
                    viewModel.dismiss(candidate)
                } label: {
                    Text(String(localized: "Dismiss"))
                        .font(.callout)
                }
                .buttonStyle(.bordered)
            }
            .buttonBorderShape(.capsule)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    WalletCaptureView(
        viewModel: WalletCaptureViewModel(
            provider: SimulatedWalletActivityProvider()
        )
    )
}
