// SPDX-License-Identifier: BUSL-1.1

// AccountDetailView.swift
// Finance
//
// Account detail screen showing balance, info, and transaction history.

import os
import SwiftUI

// MARK: - View

struct AccountDetailView: View {
    let account: AccountItem
    @Environment(BiometricAuthManager.self) private var biometricManager
    @State private var viewModel: AccountDetailViewModel
    @State private var showAccountNumber = false
    @State private var biometricError: BiometricError?
    @State private var showingBiometricError = false

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountDetailView"
    )

    init(
        account: AccountItem,
        viewModel: AccountDetailViewModel = AccountDetailViewModel(repository: KMPTransactionRepository())
    ) {
        self.account = account
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        List {
            accountHeader
            accountActions
            ForEach(viewModel.groupedTransactions) { group in
                Section {
                    ForEach(group.transactions) { transaction in
                        transactionRow(transaction)
                    }
                } header: {
                    Text(group.date, style: .date)
                }
            }
            if viewModel.transactions.isEmpty && !viewModel.isLoading {
                Section {
                    EmptyStateView(
                        systemImage: "arrow.left.arrow.right",
                        title: String(localized: "No Transactions"),
                        message: String(localized: "Transactions for this account will appear here.")
                    )
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(account.name)
        .navigationBarTitleDisplayMode(.large)
        .refreshable { await viewModel.loadTransactions(accountId: account.id) }
        .task { await viewModel.loadTransactions(accountId: account.id) }
        .alert(String(localized: "Error"), isPresented: Binding(
            get: { viewModel.showError },
            set: { if !$0 { viewModel.dismissError() } }
        )) {
            Button(String(localized: "Retry")) { Task { await viewModel.loadTransactions(accountId: account.id) } }
            Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .alert(
            String(localized: "Authentication Error"),
            isPresented: $showingBiometricError,
            presenting: biometricError
        ) { _ in
            Button(String(localized: "OK"), role: .cancel) {}
                .accessibilityLabel(String(localized: "Dismiss error"))
        } message: { error in
            Text(error.localizedDescription)
        }
    }

    private var accountHeader: some View {
        Section {
            VStack(spacing: 8) {
                Image(systemName: account.icon)
                    .font(.largeTitle).foregroundStyle(.blue)
                    .frame(width: 64, height: 64)
                    .background(Color.blue.opacity(0.1), in: Circle())
                Text(String(localized: "Current Balance"))
                    .font(.subheadline).foregroundStyle(.secondary)
                CurrencyLabel(amountInMinorUnits: account.balanceMinorUnits, currencyCode: account.currencyCode, showSign: false, font: .title.bold())
                Text(account.type.displayName)
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(.quaternary, in: Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "\(account.name), \(account.type.displayName)"))
            .accessibilityHint(String(localized: "Double tap to view details"))
        }
    }

    // MARK: - Account Actions

    /// Section with sensitive account operations gated behind biometric
    /// authentication.  Viewing the account number requires Face ID /
    /// Touch ID (with passcode fallback) before the value is revealed.
    private var accountActions: some View {
        Section {
            Button {
                Task { await toggleAccountNumber() }
            } label: {
                Label(
                    showAccountNumber
                        ? String(localized: "Hide Account Number")
                        : String(localized: "View Account Number"),
                    systemImage: showAccountNumber ? "eye.slash" : "eye"
                )
            }
            .accessibilityLabel(
                showAccountNumber
                    ? String(localized: "Hide account number")
                    : String(localized: "View account number")
            )
            .accessibilityHint(
                showAccountNumber
                    ? String(localized: "Hides the account number")
                    : String(localized: "Requires authentication to reveal the account number")
            )

            if showAccountNumber {
                LabeledContent(String(localized: "Account Number")) {
                    Text("•••• •••• •••• 4242")
                        .font(.body.monospaced())
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Account number ending in 4242"))
            }
        }
    }

    // MARK: - Biometric Authentication

    /// Toggles the visibility of the masked account number.
    ///
    /// Showing the number requires biometric / passcode authentication;
    /// hiding is immediate and does not require re-authentication.
    private func toggleAccountNumber() async {
        if showAccountNumber {
            showAccountNumber = false
            Self.logger.debug("Account number hidden")
            return
        }
        do {
            try await biometricManager.authenticate(
                reason: String(localized: "Authenticate to view account number")
            )
            showAccountNumber = true
            Self.logger.info("Account number revealed after authentication")
        } catch let error as BiometricError {
            Self.logger.warning(
                "Account number auth failed: \(error.localizedDescription, privacy: .public)"
            )
            if case .cancelled = error { return }
            biometricError = error
            showingBiometricError = true
        } catch {
            Self.logger.error(
                "Account number auth error: \(error.localizedDescription, privacy: .public)"
            )
            biometricError = .unknown(underlying: error)
            showingBiometricError = true
        }
    }

    private func transactionRow(_ transaction: TransactionItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.isExpense ? "arrow.up.right" : "arrow.down.left")
                .font(.caption)
                .foregroundStyle(transaction.isExpense ? .red : .green)
                .frame(width: 28, height: 28)
                .background((transaction.isExpense ? Color.red : Color.green).opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.payee).font(.body).lineLimit(1)
                Text(transaction.category).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: transaction.amountMinorUnits, currencyCode: transaction.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.payee), \(transaction.category)")
    }
}

#Preview {
    NavigationStack {
        AccountDetailView(account: AccountItem(
            id: "preview-1", name: "Main Checking", balanceMinorUnits: 12_450_00,
            currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false
        ))
    }
    .environment(BiometricAuthManager())
}