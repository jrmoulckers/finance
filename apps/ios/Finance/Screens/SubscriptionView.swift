// SPDX-License-Identifier: BUSL-1.1

// SubscriptionView.swift
// Finance
//
// Subscription paywall and management screen.
//
// The current plan is display-only: it mirrors the minimized entitlement
// projection Finance returned, including its pending, stale, offline, and
// unavailable states. Nothing on this screen gates manual entry, import,
// export, deletion, privacy and security controls, accessibility, or existing
// financial data, and nothing here authorizes a paid action — Finance
// re-reads its own projection for that.
//
// References: #338, #4403

import SwiftUI

struct SubscriptionView: View {
    @State private var viewModel = SubscriptionViewModel()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 24) {
                    headerSection
                    entitlementStatusSection
                    catalogSection
                    if viewModel.showsManagedSubscription {
                        manageSubscriptionSection
                    } else {
                        plansSection
                        purchaseButton
                    }
                    restoreButton
                    legalSection
                }
                .padding()
            }
            .navigationTitle(String(localized: "Subscription"))
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
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                Task {
                    await viewModel.refreshEntitlementIfNeeded()
                }
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
            .safeAreaInset(edge: .bottom) {
                if let confirmationMessage {
                    Text(confirmationMessage)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(.regularMaterial)
                        .accessibilityLabel(confirmationMessage)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
        }
    }

    private var confirmationMessage: String? {
        viewModel.statusMessage
            ?? EntitlementStatusMessages.confirmationMessage(viewModel.confirmationState.phase)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "building.columns")
                .font(.system(size: 48))
                .foregroundStyle(FinanceColors.interactive)
                .accessibilityHidden(true)

            Text(String(localized: "Finance Subscriptions"))
                .font(.title)
                .fontWeight(.bold)

            Text(
                String(
                    localized: """
                    Paid plans add bank connections and household sharing. Everything else — \
                    entry, import, export, history, privacy and accessibility — is always \
                    included.
                    """
                )
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding(.top, 16)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Entitlement status

    private var entitlementStatusSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                if viewModel.entitlement.isPending {
                    ProgressView()
                        .accessibilityHidden(true)
                } else {
                    Image(systemName: "checkmark.seal")
                        .font(.title3)
                        .foregroundStyle(FinanceColors.interactive)
                        .accessibilityHidden(true)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "Current plan"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(viewModel.entitlementHeadline)
                        .font(.headline)
                }
            }

            Text(viewModel.entitlementDetail)
                .font(.footnote)
                .foregroundStyle(.secondary)

            if viewModel.entitlement.needsRefresh {
                Button(String(localized: "Check again")) {
                    Task { await viewModel.refreshEntitlement() }
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "Check my plan with Finance again"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(
                localized: """
                Your current plan: \(viewModel.entitlementHeadline). \
                \(viewModel.entitlementDetail)
                """
            )
        )
        .accessibilityAddTraits(.updatesFrequently)
    }

    // MARK: - Catalog

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "What each plan includes"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(viewModel.plans) { plan in
                catalogRow(plan)
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func catalogRow(_ plan: CatalogPlan) -> some View {
        let isCurrent = plan.tier == viewModel.entitlement.tier
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(plan.displayName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                Spacer()
                Text(String(localized: "\(plan.monthlyPrice) or \(plan.yearlyPrice)"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(plan.bankConnections)
                .font(.caption)
                .foregroundStyle(.secondary)

            ForEach(plan.notes, id: \.self) { note in
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(
                localized: """
                \(plan.displayName) plan. \(plan.monthlyPrice) per month or \(plan.yearlyPrice) \
                per year. \(plan.bankConnections). \(plan.notes.joined(separator: ". ")).
                """
            )
        )
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
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
                Text(
                    String(
                        localized: """
                        Subscription plans are temporarily unavailable. Please try again later.
                        """
                    )
                )
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
                                .background(FinanceColors.statusWarning)
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
                    Text(String(localized: "Subscribe"))
                        .fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.borderedProminent)
        .disabled(viewModel.isPurchasing || viewModel.selectedProductId == nil)
        .accessibilityLabel(String(localized: "Subscribe to the selected plan"))
        .accessibilityHint(
            String(
                localized: """
                Starts the purchase. Your plan changes only after Finance confirms it.
                """
            )
        )
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
        .accessibilityHint(
            String(localized: "Asks Finance to confirm purchases made with this Apple ID")
        )
    }

    // MARK: - Manage

    private var manageSubscriptionSection: some View {
        VStack(spacing: 12) {
            if viewModel.entitlement.bankConnectionAllowance > 0 {
                Text(
                    String(
                        localized: """
                        Bank connections included: \
                        \(viewModel.entitlement.bankConnectionAllowance)
                        """
                    )
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
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
    }

    // MARK: - Legal

    private var legalSection: some View {
        VStack(spacing: 8) {
            Text(
                String(
                    localized: """
                    Payment will be charged to your Apple ID account at confirmation of \
                    purchase. Subscription automatically renews unless it is canceled at least \
                    24 hours before the end of the current period. Your account will be charged \
                    for renewal within 24 hours prior to the end of the current period.
                    """
                )
            )
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

#Preview("Subscription") {
    SubscriptionView()
}
