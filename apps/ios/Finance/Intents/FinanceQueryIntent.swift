// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryIntent.swift
// Finance
//
// App Intent exposing on-device natural-language finance queries to Siri and
// Shortcuts (#2386). Reuses the same deterministic ``FinanceQueryParser`` and
// ``FinanceQueryPlanner`` as the in-app screen.
//
// Privacy: balances are *sensitive*. Siri will not speak a balance aloud;
// instead the intent returns a privacy-preserving dialog directing the user to
// open the app, where reading a balance aloud requires explicit confirmation.

import AppIntents
import Foundation
import os

struct FinanceQueryIntent: AppIntent {

    static let title: LocalizedStringResource = "Ask About My Money"

    static let description = IntentDescription(
        "Ask a natural-language question about your spending, answered from local data.",
        categoryName: "Transactions"
    )

    // MARK: - Parameters

    @Parameter(
        title: "Question",
        description: "For example: how much did I spend on groceries this week."
    )
    var query: String

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinanceQueryIntent"
    )

    // MARK: - Perform

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let txnRepo = RepositoryProvider.shared.transactions
        let acctRepo = RepositoryProvider.shared.accounts
        let catRepo = RepositoryProvider.shared.categories

        let transactions: [TransactionItem]
        let accounts: [AccountItem]
        let categories: [CategoryItem]
        do {
            async let t = txnRepo.getTransactions()
            async let a = acctRepo.getAccounts()
            async let c = catRepo.getCategories()
            (transactions, accounts, categories) = try await (t, a, c)
        } catch {
            Self.logger.error("Query data load failed: \(error.localizedDescription, privacy: .public)")
            throw IntentError.saveFailed
        }

        let dialog = Self.dialogText(
            for: query,
            transactions: transactions,
            accounts: accounts,
            categories: categories
        )
        Self.logger.info("Finance query intent answered")
        return .result(dialog: IntentDialog(stringLiteral: dialog))
    }

    // MARK: - Pure Response Builder (testable)

    /// Produces the spoken dialog string for a query without touching Siri.
    ///
    /// Sensitive balance questions are answered with a privacy-preserving
    /// redirect rather than the figure itself.
    static func dialogText(
        for query: String,
        transactions: [TransactionItem],
        accounts: [AccountItem],
        categories: [CategoryItem],
        calendar: Calendar = .current,
        referenceDate: Date = .now
    ) -> String {
        let vocabulary = FinanceQueryVocabulary(
            categories: categories.map(\.name),
            accounts: accounts.map(\.name),
            merchants: Array(Set(transactions.map(\.payee))).filter { !$0.isEmpty }
        )

        let parser = FinanceQueryParser(
            vocabulary: vocabulary,
            calendar: calendar,
            referenceDate: referenceDate
        )

        switch parser.parse(query) {
        case .plan(let plan):
            if plan.isSensitive {
                return String(localized: "For your privacy, open Finance to view your balance.")
            }
            let planner = FinanceQueryPlanner(calendar: calendar)
            let result = planner.execute(plan, transactions: transactions, accounts: accounts)
            return result.spokenSummary

        case .clarification(let clarification):
            return clarificationPrompt(for: clarification)

        case .unrecognized:
            return String(localized: "I can only answer questions about your spending and balances right now.")
        }
    }

    private static func clarificationPrompt(for clarification: FinanceQueryClarification) -> String {
        switch clarification {
        case .ambiguousDate(let phrase, _):
            return String(localized: "Which period did you mean by \(phrase)? Try this week, this month, or this year.")
        case .ambiguousCategory(let phrase, let options):
            let list = options.formatted(.list(type: .or))
            return String(localized: "Did you mean \(list) for \(phrase)?")
        case .missingSubject:
            return String(localized: "What would you like to know? Try a category, merchant, account, or time period.")
        }
    }
}

// TODO(human): Register `FinanceQueryIntent` for Siri voice invocation by
// adding it to `FinanceShortcuts` and enabling the Siri & App Intents
// capability in the Xcode project. Voice *dictation* of the question also
// requires the Speech capability and microphone usage strings (see
// FinanceQuerySpeech.swift). These steps need the Xcode project file and
// cannot be performed from this environment.
