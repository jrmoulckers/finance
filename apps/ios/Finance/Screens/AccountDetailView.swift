// SPDX-License-Identifier: BUSL-1.1

// AccountDetailView.swift
// Finance
//
// Account detail screen showing balance, info, and transaction history.
// Includes edit and archive/unarchive functionality.

import os
import SwiftUI

// MARK: - View

struct AccountDetailView: View {
    @Environment(BiometricAuthManager.self) private var biometricManager
    @State private var viewModel: AccountDetailViewModel
    @State private var account: AccountItem
    @State private var showAccountNumber = false
    @State private var biometricError: BiometricError?
    @State private var showingBiometricError = false
    @State private var editingTransaction: TransactionItem?
    @State private var showingEditSheet = false
    @State private var showingArchiveConfirmation = false
    @State private var showingUnarchiveConfirmation = false
    @State private var archiveError: String?
    @State private var showingArchiveError = false

    private let accountRepository: AccountRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountDetailView"
    )

    init(
        account: AccountItem,
        viewModel: AccountDetailViewModel = AccountDetailViewModel(
            repository: RepositoryProvider.shared.transactions
        ),
        accountRepository: AccountRepository = RepositoryProvider.shared.accounts
    ) {
        self.account = account
        _viewModel = State(initialValue: viewModel)
        self.accountRepository = accountRepository
    }

    var body: some View {
        List {
            accountHeader
            accountActions

            if account.isArchived {
                archivedBanner
            }

            ForEach(viewModel.groupedTransactions) { group in
                Section {
                    ForEach(group.transactions) { transaction in
                        transactionRow(transaction)
                            .contentShape(Rectangle())
                            .onTapGesture { editingTransaction = transaction }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                Button {
                                    editingTransaction = transaction
                                } label: {
                                    Label(String(localized: "Edit"), systemImage: "pencil")
                                }
                                .tint(.blue)
                                .accessibilityLabel(String(localized: "Edit transaction"))
                            }
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
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button {
                        showingEditSheet = true
                    } label: {
                        Label(String(localized: "Edit Account"), systemImage: "pencil")
                    }
                    .accessibilityLabel(String(localized: "Edit account"))
                    .accessibilityHint(String(localized: "Opens a form to edit account details"))

                    Divider()

                    if account.isArchived {
                        Button {
                            showingUnarchiveConfirmation = true
                        } label: {
                            Label(String(localized: "Unarchive Account"), systemImage: "tray.and.arrow.up")
                        }
                        .accessibilityLabel(String(localized: "Unarchive account"))
                        .accessibilityHint(String(localized: "Restores this account to your active accounts list"))
                    } else {
                        Button(role: .destructive) {
                            showingArchiveConfirmation = true
                        } label: {
                            Label(String(localized: "Archive Account"), systemImage: "archivebox")
                        }
                        .accessibilityLabel(String(localized: "Archive account"))
                        .accessibilityHint(String(localized: "Hides this account from your main list. Data is preserved."))
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel(String(localized: "Account actions"))
                .accessibilityHint(String(localized: "Shows options to edit or archive this account"))
            }
        }
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
        .confirmationDialog(
            String(localized: "Archive Account"),
            isPresented: $showingArchiveConfirmation,
            titleVisibility: .visible
        ) {
            Button(String(localized: "Archive"), role: .destructive) {
                Task { await performArchive() }
            }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "This account will be hidden from your main list. All data will be preserved and you can unarchive it at any time."))
        }
        .confirmationDialog(
            String(localized: "Unarchive Account"),
            isPresented: $showingUnarchiveConfirmation,
            titleVisibility: .visible
        ) {
            Button(String(localized: "Unarchive")) {
                Task { await performUnarchive() }
            }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: {
            Text(String(localized: "This account will be restored to your active accounts list."))
        }
        .alert(String(localized: "Error"), isPresented: $showingArchiveError) {
            Button(String(localized: "OK"), role: .cancel) {}
        } message: {
            Text(archiveError ?? "")
        }
        .sheet(item: $editingTransaction, onDismiss: {
            Task { await viewModel.loadTransactions(accountId: account.id) }
        }) { transaction in
            TransactionEditView(transaction: transaction) {
                Task { await viewModel.loadTransactions(accountId: account.id) }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            AccountEditView(account: account, repository: accountRepository) { updatedAccount in
                account = updatedAccount
            }
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

    // MARK: - Archived Banner

    private var archivedBanner: some View {
        Section {
            Label {
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(localized: "Archived"))
                        .font(.headline)
                    Text(String(localized: "This account is archived and hidden from your main list."))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "archivebox")
                    .foregroundStyle(.orange)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "This account is archived"))
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

    // MARK: - Archive / Unarchive

    private func performArchive() async {
        do {
            try await accountRepository.archiveAccount(id: account.id)
            account = AccountItem(
                id: account.id, name: account.name,
                balanceMinorUnits: account.balanceMinorUnits,
                currencyCode: account.currencyCode,
                type: account.type, icon: account.icon, isArchived: true
            )
            HapticManager.shared.transactionSaved()
            Self.logger.info("Account \(account.id, privacy: .private) archived")
        } catch {
            archiveError = String(localized: "Failed to archive account. Please try again.")
            showingArchiveError = true
            HapticManager.shared.error()
            Self.logger.error("Archive failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func performUnarchive() async {
        do {
            try await accountRepository.unarchiveAccount(id: account.id)
            account = AccountItem(
                id: account.id, name: account.name,
                balanceMinorUnits: account.balanceMinorUnits,
                currencyCode: account.currencyCode,
                type: account.type, icon: account.icon, isArchived: false
            )
            HapticManager.shared.transactionSaved()
            Self.logger.info("Account \(account.id, privacy: .private) unarchived")
        } catch {
            archiveError = String(localized: "Failed to unarchive account. Please try again.")
            showingArchiveError = true
            HapticManager.shared.error()
            Self.logger.error("Unarchive failed: \(error.localizedDescription, privacy: .public)")
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
        .accessibilityHint(String(localized: "Tap to edit. Swipe for more actions."))
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

#Preview("Archived") {
    NavigationStack {
        AccountDetailView(account: AccountItem(
            id: "preview-2", name: "Old Checking", balanceMinorUnits: 0,
            currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: true
        ))
    }
    .environment(BiometricAuthManager())
}
