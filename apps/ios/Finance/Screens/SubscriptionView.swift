// SPDX-License-Identifier: BUSL-1.1

// SubscriptionView.swift
// Finance
//
// Premium subscription paywall and management screen using StoreKit 2.
// Shows available plans, feature comparison, purchase flow, and
// subscription management.
//
// References: #338

import SwiftUI

struct SubscriptionView: View {
    @State private var viewModel = SubscriptionViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 24) {
                    headerSection
                    featuresSection
                    if !viewModel.isPremium {
                        plansSection
                        purchaseButton
                        restoreButton
                    } else {
                        activeSubscriptionSection
                    }
                    legalSection
                }
                .padding()
            }
            .navigationTitle(String(localized: "Premium"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(String(localized: "Done")) {
                        dismiss()
                    }
                    .accessibilityLabel(String(localized: "Close subscription screen"))
                }
            }
            .task {
                await viewModel.loadSubscriptionData()
            }
            .alert(
                String(localized: "Error"),
                isPresented: .init(
                    get: { viewModel.showError },
                    set: { if !$0 { viewModel.dismissError() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .alert(
                String(localized: "Success"),
                isPresented: .init(
                    get: { viewModel.showSuccess },
                    set: { if !$0 { viewModel.dismissSuccess() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.successMessage ?? "")
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "crown.fill")
                .font(.system(size: 48))
                .foregroundStyle(
                    LinearGradient(
                        colors: [.yellow, .orange],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .accessibilityHidden(true)

            Text(String(localized: "Finance Premium"))
                .font(.title)
                .fontWeight(.bold)

            Text(String(localized: "Unlock powerful tools to take full control of your finances"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Finance Premium. Unlock powerful tools to take full control of your finances.")
        )
    }

    // MARK: - Features

    private var featuresSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Premium Features"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(PremiumFeature.allCases, id: \.self) { feature in
                featureRow(feature)
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func featureRow(_ feature: PremiumFeature) -> some View {
        HStack(spacing: 12) {
            Image(systemName: feature.systemImage)
                .font(.body)
                .foregroundStyle(FinanceColors.interactive)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(feature.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(feature.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(FinanceColors.statusPositive)
                .font(.body)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(feature.displayName): \(feature.description)")
        )
    }

    // MARK: - Plans

    private var plansSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Choose Your Plan"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(String(localized: "Loading subscription plans"))
            } else if viewModel.products.isEmpty {
                Text(String(localized: "Subscription plans are temporarily unavailable. Please try again later."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            } else {
                ForEach(viewModel.products) { product in
                    planCard(product)
                }
            }
        }
    }

    private func planCard(_ product: SubscriptionProductInfo) -> some View {
        let isSelected = viewModel.selectedProductId == product.id

        return Button {
            viewModel.selectedProductId = product.id
        } label: {
            HStack(spacing: 12) {
                Image(systemName: product.tier.systemImage)
                    .font(.title3)
                    .foregroundStyle(isSelected ? .white : FinanceColors.interactive)
                    .frame(width: 32)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(product.tier.displayName)
                            .font(.subheadline)
                            .fontWeight(.semibold)

                        if product.isBestValue {
                            Text(String(localized: "Best Value"))
                                .font(.caption2)
                                .fontWeight(.bold)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.orange)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }

                    Text(product.tier.description)
                        .font(.caption)
                        .foregroundStyle(isSelected ? .white.opacity(0.8) : .secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.headline)
                        .fontWeight(.bold)

                    if let perMonth = product.pricePerMonth {
                        Text(String(localized: "\(perMonth)/mo"))
                            .font(.caption2)
                            .foregroundStyle(isSelected ? .white.opacity(0.7) : .secondary)
                    }
                }
            }
            .padding()
            .background(
                isSelected
                    ? FinanceColors.interactive
                    : FinanceColors.backgroundElevated
            )
            .foregroundStyle(isSelected ? .white : FinanceColors.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isSelected ? FinanceColors.interactive : FinanceColors.borderDefault,
                        lineWidth: isSelected ? 2 : 1
                    )
            )
        }
        .accessibilityLabel(
            product.isBestValue
                ? String(localized: "\(product.tier.displayName), \(product.displayPrice), best value")
                : String(localized: "\(product.tier.displayName), \(product.displayPrice)")
        )
        .accessibilityHint(
            isSelected
                ? String(localized: "Currently selected")
                : String(localized: "Double tap to select this plan")
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Purchase Button

    private var purchaseButton: some View {
        Button {
            Task {
                await viewModel.purchaseSelected()
            }
        } label: {
            Group {
                if viewModel.isPurchasing {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text(String(localized: "Subscribe Now"))
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.borderedProminent)
        .disabled(viewModel.isPurchasing || viewModel.selectedProductId == nil)
        .accessibilityLabel(String(localized: "Subscribe to Finance Premium"))
        .accessibilityHint(String(localized: "Starts the subscription purchase process"))
    }

    // MARK: - Restore Button

    private var restoreButton: some View {
        Button {
            Task {
                await viewModel.restorePurchases()
            }
        } label: {
            if viewModel.isRestoring {
                ProgressView()
            } else {
                Text(String(localized: "Restore Purchases"))
                    .font(.subheadline)
            }
        }
        .disabled(viewModel.isRestoring)
        .accessibilityLabel(String(localized: "Restore previous purchases"))
        .accessibilityHint(String(localized: "Restores your subscription if you've previously purchased"))
    }

    // MARK: - Active Subscription

    private var activeSubscriptionSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 48))
                .foregroundStyle(FinanceColors.statusPositive)
                .accessibilityHidden(true)

            Text(String(localized: "Premium Active"))
                .font(.title2)
                .fontWeight(.bold)

            Text(viewModel.entitlement.displayName)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if case .premium(_, let expiresAt) = viewModel.entitlement,
               let expiry = expiresAt {
                Text(String(localized: "Renews \(expiry.formatted(date: .abbreviated, time: .omitted))"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if case .gracePeriod(let expiresAt) = viewModel.entitlement {
                Text(String(localized: "Grace period expires \(expiresAt.formatted(date: .abbreviated, time: .omitted)). Please update your payment method."))
                    .font(.caption)
                    .foregroundStyle(FinanceColors.statusWarning)
                    .multilineTextAlignment(.center)
            }

            Button(String(localized: "Manage Subscription")) {
                if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)
            .accessibilityLabel(String(localized: "Manage subscription in App Store"))
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Premium subscription is active. \(viewModel.entitlement.displayName)")
        )
    }

    // MARK: - Legal

    private var legalSection: some View {
        VStack(spacing: 8) {
            Text(String(localized: "Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless it is canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period."))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            HStack(spacing: 16) {
                Link(
                    String(localized: "Terms of Use"),
                    destination: URL(string: "https://finance.app/terms")!
                )
                .font(.caption2)

                Link(
                    String(localized: "Privacy Policy"),
                    destination: URL(string: "https://finance.app/privacy")!
                )
                .font(.caption2)
            }
        }
        .padding(.top, 8)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Preview

#Preview("Subscription Paywall") {
    SubscriptionView()
}

#Preview("Premium Active") {
    SubscriptionView()
}
