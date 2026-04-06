// SPDX-License-Identifier: BUSL-1.1

// AccountsView.swift
// Finance
//
// Displays user accounts grouped by type with NavigationLink to detail.
// Supports archive/unarchive and an optional archived accounts section.

import SwiftUI

// MARK: - View

struct AccountsView: View {
    @State private var viewModel: AccountsViewModel

    init(viewModel: AccountsViewModel = AccountsViewModel(
        repository: RepositoryProvider.shared.accounts
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.accountGroups.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.accountGroups.isEmpty && viewModel.archivedAccounts.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        systemImage: "building.columns",
                        title: String(localized: "No Accounts"),
                        message: String(localized: "Add your first account to start tracking your finances."),
                        actionLabel: String(localized: "Add Account"),
                        action: { viewModel.showingAddAccount = true }
                    )
                } else {
                    accountsList
                }
            }
            .navigationTitle(String(localized: "Accounts"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingAddAccount = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("add_account_button")
                    .accessibilityLabel(String(localized: "Add account"))
                    .accessibilityHint(String(localized: "Opens a form to create a new account"))
                }
            }
            .sheet(isPresented: \$viewModel.showingAddAccount) { addAccountPlaceholder }
            .refreshable { await viewModel.loadAccounts() }
            .task { await viewModel.loadAccounts() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !\$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadAccounts() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    private var accountsList: some View {
        List {
            ForEach(viewModel.accountGroups) { group in
                Section {
                    ForEach(group.accounts) { account in
                        NavigationLink(value: account) { accountRow(account) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await viewModel.deleteAccount(id: account.id) }
                                } label: {
                                    Label(String(localized: "Delete"), systemImage: "trash")
                                }
                                .accessibilityLabel(String(localized: "Delete \(account.name)"))

                                Button {
                                    Task { await viewModel.archiveAccount(id: account.id) }
                                } label: {
                                    Label(String(localized: "Archive"), systemImage: "archivebox")
                                }
                                .tint(.orange)
                                .accessibilityLabel(String(localized: "Archive \(account.name)"))
                            }
                    }
                } header: {
                    HStack {
                        Label(group.type.displayName, systemImage: group.type.systemImage)
                        Spacer()
                        CurrencyLabel(amountInMinorUnits: group.totalBalance, currencyCode: "USD", showSign: false, font: .caption)
                    }
                }
            }

            // Archived accounts toggle and section
            if !viewModel.archivedAccounts.isEmpty {
                Section {
                    Button {
                        withAnimation {
                            viewModel.showArchivedAccounts.toggle()
                        }
                    } label: {
                        HStack {
                            Label(
                                String(localized: "Archived Accounts"),
                                systemImage: "archivebox"
                            )
                            Spacer()
                            Text("\(viewModel.archivedAccounts.count)")
                                .foregroundStyle(.secondary)
                            Image(systemName: viewModel.showArchivedAccounts ? "chevron.up" : "chevron.down")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityLabel(String(localized: "Archived accounts"))
                    .accessibilityValue(String(localized: "\(viewModel.archivedAccounts.count) accounts"))
                    .accessibilityHint(
                        viewModel.showArchivedAccounts
                            ? String(localized: "Tap to hide archived accounts")
                            : String(localized: "Tap to show archived accounts")
                    )

                    if viewModel.showArchivedAccounts {
                        ForEach(viewModel.archivedAccounts) { account in
                            NavigationLink(value: account) {
                                archivedAccountRow(account)
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                Button {
                                    Task { await viewModel.unarchiveAccount(id: account.id) }
                                } label: {
                                    Label(String(localized: "Unarchive"), systemImage: "tray.and.arrow.up")
                                }
                                .tint(.blue)
                                .accessibilityLabel(String(localized: "Unarchive \(account.name)"))
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await viewModel.deleteAccount(id: account.id) }
                                } label: {
                                    Label(String(localized: "Delete"), systemImage: "trash")
                                }
                                .accessibilityLabel(String(localized: "Delete \(account.name)"))
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: AccountItem.self) { account in
            AccountDetailView(account: account)
        }
    }

    private func accountRow(_ account: AccountItem) -> some View {
        HStack {
            Image(systemName: account.icon)
                .font(.title3).foregroundStyle(.blue)
                .frame(width: 36, height: 36)
                .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            Text(account.name).font(.body)
            Spacer()
            CurrencyLabel(amountInMinorUnits: account.balanceMinorUnits, currencyCode: account.currencyCode, font: .callout.bold())
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(account.name)
        .accessibilityHint(String(localized: "Shows account details and transaction history"))
    }

    private func archivedAccountRow(_ account: AccountItem) -> some View {
        HStack {
            Image(systemName: account.icon)
                .font(.title3).foregroundStyle(.secondary)
                .frame(width: 36, height: 36)
                .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(account.name).font(.body)
                Text(String(localized: "Archived"))
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            Spacer()
            CurrencyLabel(amountInMinorUnits: account.balanceMinorUnits, currencyCode: account.currencyCode, font: .callout)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "\(account.name), archived"))
        .accessibilityHint(String(localized: "Shows archived account details. Swipe right to unarchive."))
    }

    private var addAccountPlaceholder: some View {
        NavigationStack {
            Form {
                Section {
                    Text(String(localized: "Account creation will be connected to KMP shared logic."))
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(String(localized: "Add Account"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { viewModel.showingAddAccount = false }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the add account form"))
                }
            }
        }
    }
}

#Preview {
    AccountsView(viewModel: AccountsViewModel(repository: MockAccountRepository()))
        .environment(BiometricAuthManager())
}
