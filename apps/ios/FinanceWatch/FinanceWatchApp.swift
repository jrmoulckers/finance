// FinanceWatchApp.swift
// FinanceWatch
//
// watchOS companion app entry point for the Finance app.
// Displays account balances, recent transactions, and budget status
// using data transferred from the iPhone app via WatchConnectivity.
// Refs #30

import SwiftUI
import WatchConnectivity

/// The main entry point for the Finance watchOS companion app.
@main
struct FinanceWatchApp: App {
    @State private var connectivityManager = WatchConnectivityManager()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                TabView {
                    BalanceView(manager: connectivityManager)
                    RecentTransactionsView(manager: connectivityManager)
                    BudgetStatusView(manager: connectivityManager)
                }
                .tabViewStyle(.verticalPage)
            }
        }
    }
}

// MARK: - WatchConnectivity Manager

/// Manages the WCSession connection with the paired iPhone app.
///
/// Receives pre-computed financial data via applicationContext or
/// userInfo transfers - the watchOS app never imports the KMP framework
/// directly.
@Observable
@MainActor
final class WatchConnectivityManager: NSObject, Sendable {
    var totalBalance: Double = 0
    var currencyCode: String = "USD"
    var recentTransactions: [WatchTransaction] = []
    var budgetStatuses: [WatchBudgetStatus] = []
    var hasReceivedData: Bool = false

    override init() {
        super.init()
        activateSession()
    }

    private func activateSession() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    nonisolated func applyContext(_ context: [String: Any]) {
        Task { @MainActor in
            if let balance = context["totalBalance"] as? Double {
                self.totalBalance = balance
            }
            if let code = context["currencyCode"] as? String {
                self.currencyCode = code
            }
            if let txData = context["recentTransactions"] as? [[String: Any]] {
                self.recentTransactions = txData.compactMap(WatchTransaction.init)
            }
            if let budgetData = context["budgetStatuses"] as? [[String: Any]] {
                self.budgetStatuses = budgetData.compactMap(WatchBudgetStatus.init)
            }
            self.hasReceivedData = true
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if activationState == .activated {
            let context = session.receivedApplicationContext
            if !context.isEmpty { applyContext(context) }
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        applyContext(applicationContext)
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:]
    ) {
        applyContext(userInfo)
    }
}

// MARK: - Lightweight Watch Models

struct WatchTransaction: Identifiable, Sendable {
    let id: String
    let payee: String
    let amount: Double
    let category: String
    let date: Date
    let isExpense: Bool

    init?(dictionary: [String: Any]) {
        guard let id = dictionary["id"] as? String,
              let payee = dictionary["payee"] as? String,
              let amount = dictionary["amount"] as? Double,
              let category = dictionary["category"] as? String,
              let timestamp = dictionary["date"] as? TimeInterval
        else { return nil }
        self.id = id
        self.payee = payee
        self.amount = amount
        self.category = category
        self.date = Date(timeIntervalSince1970: timestamp)
        self.isExpense = dictionary["isExpense"] as? Bool ?? true
    }
}

struct WatchBudgetStatus: Identifiable, Sendable {
    let id: String
    let name: String
    let spent: Double
    let budgeted: Double

    var fraction: Double {
        guard budgeted > 0 else { return 0 }
        return min(max(spent / budgeted, 0), 1)
    }

    var isOverBudget: Bool { spent > budgeted }

    init?(dictionary: [String: Any]) {
        guard let id = dictionary["id"] as? String,
              let name = dictionary["name"] as? String,
              let spent = dictionary["spent"] as? Double,
              let budgeted = dictionary["budgeted"] as? Double
        else { return nil }
        self.id = id
        self.name = name
        self.spent = spent
        self.budgeted = budgeted
    }
}
