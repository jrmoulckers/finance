// SPDX-License-Identifier: BUSL-1.1

import Foundation

/// Semantic icon vocabulary mirrored from the KMP IconToken enum.
enum IconToken: String, CaseIterable, Hashable, Sendable {
    case home
    case dashboard
    case accounts
    case transactions
    case budgets
    case goals
    case reports
    case insights
    case settings
    case search
    case notifications
    case profile
    case wallet
    case cash
    case bank
    case creditCard
    case debitCard
    case savings
    case investment
    case loan
    case mortgage
    case netWorth
    case balance
    case income
    case expense
    case transfer
    case recurring
    case bill
    case budget
    case goal
    case piggyBank
    case chartLine
    case chartBar
    case chartPie
    case add
    case edit
    case delete
    case save
    case cancel
    case close
    case check
    case refresh
    case sync
    case download
    case upload
    case export
    case import
    case filter
    case sort
    case scan
    case copy
    case share
    case success
    case warning
    case error
    case info
    case pending
    case locked
    case unlocked
    case online
    case offline
    case secure
    case checkingAccount
    case savingsAccount
    case cashAccount
    case creditAccount
    case investmentAccount
    case loanAccount
    case mortgageAccount
    case retirementAccount
    case categoryFood
    case categoryGroceries
    case categoryRestaurants
    case categoryTransport
    case categoryFuel
    case categoryShopping
    case categoryEntertainment
    case categoryTravel
    case categoryHealth
    case categoryFitness
    case categoryHome
    case categoryUtilities
    case categoryEducation
    case categoryGifts
    case categoryTaxes
    case categoryInsurance
    case categorySubscriptions
    case categorySalary

    var kmpName: String {
        switch self {
        case .home: "HOME"
        case .dashboard: "DASHBOARD"
        case .accounts: "ACCOUNTS"
        case .transactions: "TRANSACTIONS"
        case .budgets: "BUDGETS"
        case .goals: "GOALS"
        case .reports: "REPORTS"
        case .insights: "INSIGHTS"
        case .settings: "SETTINGS"
        case .search: "SEARCH"
        case .notifications: "NOTIFICATIONS"
        case .profile: "PROFILE"
        case .wallet: "WALLET"
        case .cash: "CASH"
        case .bank: "BANK"
        case .creditCard: "CREDIT_CARD"
        case .debitCard: "DEBIT_CARD"
        case .savings: "SAVINGS"
        case .investment: "INVESTMENT"
        case .loan: "LOAN"
        case .mortgage: "MORTGAGE"
        case .netWorth: "NET_WORTH"
        case .balance: "BALANCE"
        case .income: "INCOME"
        case .expense: "EXPENSE"
        case .transfer: "TRANSFER"
        case .recurring: "RECURRING"
        case .bill: "BILL"
        case .budget: "BUDGET"
        case .goal: "GOAL"
        case .piggyBank: "PIGGY_BANK"
        case .chartLine: "CHART_LINE"
        case .chartBar: "CHART_BAR"
        case .chartPie: "CHART_PIE"
        case .add: "ADD"
        case .edit: "EDIT"
        case .delete: "DELETE"
        case .save: "SAVE"
        case .cancel: "CANCEL"
        case .close: "CLOSE"
        case .check: "CHECK"
        case .refresh: "REFRESH"
        case .sync: "SYNC"
        case .download: "DOWNLOAD"
        case .upload: "UPLOAD"
        case .export: "EXPORT"
        case .import: "IMPORT"
        case .filter: "FILTER"
        case .sort: "SORT"
        case .scan: "SCAN"
        case .copy: "COPY"
        case .share: "SHARE"
        case .success: "SUCCESS"
        case .warning: "WARNING"
        case .error: "ERROR"
        case .info: "INFO"
        case .pending: "PENDING"
        case .locked: "LOCKED"
        case .unlocked: "UNLOCKED"
        case .online: "ONLINE"
        case .offline: "OFFLINE"
        case .secure: "SECURE"
        case .checkingAccount: "CHECKING_ACCOUNT"
        case .savingsAccount: "SAVINGS_ACCOUNT"
        case .cashAccount: "CASH_ACCOUNT"
        case .creditAccount: "CREDIT_ACCOUNT"
        case .investmentAccount: "INVESTMENT_ACCOUNT"
        case .loanAccount: "LOAN_ACCOUNT"
        case .mortgageAccount: "MORTGAGE_ACCOUNT"
        case .retirementAccount: "RETIREMENT_ACCOUNT"
        case .categoryFood: "CATEGORY_FOOD"
        case .categoryGroceries: "CATEGORY_GROCERIES"
        case .categoryRestaurants: "CATEGORY_RESTAURANTS"
        case .categoryTransport: "CATEGORY_TRANSPORT"
        case .categoryFuel: "CATEGORY_FUEL"
        case .categoryShopping: "CATEGORY_SHOPPING"
        case .categoryEntertainment: "CATEGORY_ENTERTAINMENT"
        case .categoryTravel: "CATEGORY_TRAVEL"
        case .categoryHealth: "CATEGORY_HEALTH"
        case .categoryFitness: "CATEGORY_FITNESS"
        case .categoryHome: "CATEGORY_HOME"
        case .categoryUtilities: "CATEGORY_UTILITIES"
        case .categoryEducation: "CATEGORY_EDUCATION"
        case .categoryGifts: "CATEGORY_GIFTS"
        case .categoryTaxes: "CATEGORY_TAXES"
        case .categoryInsurance: "CATEGORY_INSURANCE"
        case .categorySubscriptions: "CATEGORY_SUBSCRIPTIONS"
        case .categorySalary: "CATEGORY_SALARY"
        }
    }
}

enum IconPackID: String, CaseIterable, Identifiable, Sendable {
    case standardLucide = "standard_lucide"
    case sfSymbols = "ios_sf_symbols"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .standardLucide:
            String(localized: "Standard")
        case .sfSymbols:
            String(localized: "SF Symbols")
        }
    }

    static let defaultIOS = IconPackID.sfSymbols

    static func from(_ rawValue: String) -> IconPackID {
        IconPackID(rawValue: rawValue) ?? .defaultIOS
    }
}

enum IconPackPreference {
    /// Mirrors ICON_PACK_PREFERENCE_KEY from packages/core IconToken.kt.
    static let key = "icon_pack_id"
}
