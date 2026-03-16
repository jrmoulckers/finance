// SPDX-License-Identifier: BUSL-1.1

// AccountsView.swift
// Finance
//
// Displays user accounts grouped by type with NavigationLink to detail.

import SwiftUI

// MARK: - View

struct AccountsView: View {
    @State private var viewModel: AccountsViewModel

    init(viewModel: AccountsViewModel = AccountsViewModel(repository: KMPAccountRepository())) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.accountGroups.isEmpty && !viewModel.isLoading {
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
                    .accessibilityLabel(String(localized: "Add account"))
                    .accessibilityHint(String(localized: "Opens a form to create a new account"))
                }
            }
            .sheet(isPresented: $viewModel.showingAddAccount) { addAccountPlaceholder }
            .refreshable { await viewModel.loadAccounts() }
            .task { await viewModel.loadAccounts() }
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

#Preview { AccountsView(viewModel: AccountsViewModel(repository: MockAccountRepository())) }
