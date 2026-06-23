// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryViewModel.swift
// Finance
//
// Drives the natural-language finance query screen (#2386). Orchestrates the
// deterministic parse → clarify → plan → answer pipeline and gates speaking
// sensitive balances behind explicit user confirmation. All interpretation
// happens on-device. Speech is injected behind protocols so the ViewModel is
// fully unit-testable without speech availability.

import Foundation
import Observation
import os

@Observable
final class FinanceQueryViewModel {

    // MARK: - Phase

    /// The current state of the query screen.
    enum Phase: Equatable {
        case idle
        case loading
        case answered(FinanceQueryResult)
        case clarifying(FinanceQueryClarification)
        case unrecognized
    }

    // MARK: - Observable State

    var inputText = ""
    var phase: Phase = .idle

    /// When non-nil, a sensitive result is awaiting confirmation before its
    /// spoken variant is read aloud.
    var pendingSpokenConfirmation: FinanceQueryResult?

    var errorMessage: String?
    var showError: Bool { errorMessage != nil }

    /// Whether spoken input (dictation) is available on this device.
    var isSpeechInputAvailable: Bool { speechRecognizer.isAvailable }

    // MARK: - Dependencies

    private let transactions: TransactionRepository
    private let accounts: AccountRepository
    private let categories: CategoryRepository
    private let voice: FinanceQueryVoiceOutput
    private let speechRecognizer: FinanceQuerySpeechRecognizer
    private let calendar: Calendar

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FinanceQueryViewModel"
    )

    /// The most recent raw input, retained so clarification choices can
    /// re-parse with an override.
    private var lastInput = ""

    // MARK: - Init

    init(
        transactions: TransactionRepository,
        accounts: AccountRepository,
        categories: CategoryRepository,
        voice: FinanceQueryVoiceOutput = SystemVoiceOutput(),
        speechRecognizer: FinanceQuerySpeechRecognizer = UnavailableSpeechRecognizer(),
        calendar: Calendar = .current
    ) {
        self.transactions = transactions
        self.accounts = accounts
        self.categories = categories
        self.voice = voice
        self.speechRecognizer = speechRecognizer
        self.calendar = calendar
    }

    // MARK: - Query Submission

    /// Parses and answers the current `inputText`.
    func submit() async {
        await run(input: inputText)
    }

    /// Re-runs the last query forcing a resolved date window.
    func resolveDate(_ preset: FinanceQueryDatePreset) async {
        await run(input: lastInput, dateOverride: preset)
    }

    /// Re-runs the last query forcing a resolved category.
    func resolveCategory(_ name: String) async {
        await run(input: lastInput, categoryOverride: name)
    }

    private func run(
        input: String,
        dateOverride: FinanceQueryDatePreset? = nil,
        categoryOverride: String? = nil
    ) async {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            phase = .idle
            return
        }

        lastInput = input
        phase = .loading
        pendingSpokenConfirmation = nil

        let txns: [TransactionItem]
        let accts: [AccountItem]
        let cats: [CategoryItem]
        do {
            async let t = transactions.getTransactions()
            async let a = accounts.getAccounts()
            async let c = categories.getCategories()
            (txns, accts, cats) = try await (t, a, c)
        } catch {
            Self.logger.error("Query data load failed: \(error.localizedDescription, privacy: .public)")
            errorMessage = String(localized: "Couldn't load your finance data. Please try again.")
            phase = .idle
            return
        }

        let vocabulary = FinanceQueryVocabulary(
            categories: cats.map(\.name),
            accounts: accts.map(\.name),
            merchants: Array(Set(txns.map(\.payee))).filter { !$0.isEmpty }
        )

        let parser = FinanceQueryParser(vocabulary: vocabulary, calendar: calendar)
        let outcome = parser.parse(
            input,
            dateOverride: dateOverride,
            categoryOverride: categoryOverride
        )

        switch outcome {
        case .plan(let plan):
            let planner = FinanceQueryPlanner(calendar: calendar)
            let result = planner.execute(plan, transactions: txns, accounts: accts)
            Self.logger.info("Query answered (sensitive: \(plan.isSensitive, privacy: .public))")
            phase = .answered(result)

        case .clarification(let clarification):
            Self.logger.info("Query needs clarification")
            phase = .clarifying(clarification)

        case .unrecognized:
            Self.logger.info("Query not recognised as a finance question")
            phase = .unrecognized
        }
    }

    // MARK: - Speaking

    /// Requests that the current answer be read aloud.
    ///
    /// Sensitive results (balances) are routed through
    /// ``pendingSpokenConfirmation`` so the View can require an explicit tap
    /// before anything is spoken. Non-sensitive results speak immediately.
    func requestSpeak() {
        guard case .answered(let result) = phase else { return }
        if result.requiresSpokenConfirmation {
            pendingSpokenConfirmation = result
        } else {
            voice.speak(result.spokenSummary)
        }
    }

    /// Confirms and speaks a pending sensitive result.
    func confirmSpeak() {
        guard let result = pendingSpokenConfirmation else { return }
        Self.logger.info("User confirmed speaking sensitive balance aloud")
        voice.speak(result.spokenSummary)
        pendingSpokenConfirmation = nil
    }

    /// Cancels a pending sensitive spoken result without speaking it.
    func cancelSpeak() {
        pendingSpokenConfirmation = nil
    }

    func stopSpeaking() {
        voice.stop()
    }

    // MARK: - Reset

    func reset() {
        inputText = ""
        lastInput = ""
        phase = .idle
        pendingSpokenConfirmation = nil
    }

    func dismissError() {
        errorMessage = nil
    }
}
