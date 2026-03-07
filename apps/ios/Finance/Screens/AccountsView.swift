// AccountsView.swift
// Finance
//
// Displays user accounts grouped by type with NavigationLink to detail.

import SwiftUI

// MARK: - View Model

@Observable
@MainActor
final class AccountsViewModel {
    var accountGroups: [AccountGroup] = []
    var isLoading = false
    var showingAddAccount = false

    struct AccountGroup: Identifiable {
        let id: String
        let type: AccountTypeUI
        let accounts: [AccountItem]
        var totalBalance: Int64 { accounts.reduce(0) { $0 + $1.balanceMinorUnits } }
    }

    struct AccountItem: Identifiable, Hashable {
        let id: String
        let name: String
        let balanceMinorUnits: Int64
        let currencyCode: String
        let type: AccountTypeUI
        let icon: String
        let isArchived: Bool
    }

    enum AccountTypeUI: String, CaseIterable, Hashable {
        case checking, savings, creditCard, cash, investment, loan, other

        var displayName: String {
            switch self {
            case .checking: String(localized: "Checking")
            case .savings: String(localized: "Savings")
            case .creditCard: String(localized: "Credit Cards")
            case .cash: String(localized: "Cash")
            case .investment: String(localized: "Investments")
            case .loan: String(localized: "Loans")
            case .other: String(localized: "Other")
            }
        }

        var systemImage: String {
            switch self {
            case .checking: "building.columns"
            case .savings: "banknote"
            case .creditCard: "creditcard"
            case .cash: "dollarsign.circle"
            case .investment: "chart.line.uptrend.xyaxis"
            case .loan: "percent"
            case .other: "ellipsis.circle"
            }
        }
    }

    func loadAccounts() async {
        isLoading = true
        defer { isLoading = false }

        // TODO: Replace with KMP shared logic via Swift Export bridge
        let sampleAccounts: [AccountItem] = [
            AccountItem(id: "a1", name: "Main Checking", balanceMinorUnits: 12_450_00, currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false),
            AccountItem(id: "a2", name: "Savings", balanceMinorUnits: 25_000_00, currencyCode: "USD", type: .savings, icon: "banknote", isArchived: false),
            AccountItem(id: "a3", name: "Travel Card", balanceMinorUnits: -1_200_00, currencyCode: "USD", type: .creditCard, icon: "creditcard", isArchived: false),
            AccountItem(id: "a4", name: "Brokerage", balanceMinorUnits: 18_500_00, currencyCode: "USD", type: .investment, icon: "chart.line.uptrend.xyaxis", isArchived: false),
            AccountItem(id: "a5", name: "Emergency Fund", balanceMinorUnits: 10_000_00, currencyCode: "USD", type: .savings, icon: "banknote", isArchived: false),
        ]

        let grouped = Dictionary(grouping: sampleAccounts) { $0.type }
        accountGroups = AccountTypeUI.allCases.compactMap { type in
            guard let accounts = grouped[type], !accounts.isEmpty else { return nil }
            return AccountGroup(id: type.rawValue, type: type, accounts: accounts)
        }
    }

    func deleteAccount(id: String) async {
        // TODO: Implement via KMP shared logic
        accountGroups = accountGroups.compactMap { group in
            let filtered = group.accounts.filter { $0.id != id }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
    }
}

// MARK: - View

struct AccountsView: View {
    @State private var viewModel = AccountsViewModel()

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
        .navigationDestination(for: AccountsViewModel.AccountItem.self) { account in
            AccountDetailView(account: account)
        }
    }

    private func accountRow(_ account: AccountsViewModel.AccountItem) -> some View {
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

#Preview { AccountsView() }
