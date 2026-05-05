// SPDX-License-Identifier: BUSL-1.1

// NlpInputViewModel.swift
// Finance
//
// ViewModel for the NLP transaction input screen. Provides real-time parsing
// of free-form text ("Coffee at Starbucks $4.50") into structured transaction
// data, merchant autocomplete from history, locale-aware amount/date parsing,
// per-field confidence, and recent inputs history.
//
// Uses @Observable (iOS 17+), structured concurrency, and os.Logger.
// Bridges to KMP NaturalLanguageParser via KMPBridge protocols.

import Foundation
import Observation
import os
import SwiftUI

// MARK: - ViewModel

@Observable
final class NlpInputViewModel {

    // MARK: - Dependencies

    private let transactionRepository: TransactionRepository
    private let categoryRepository: CategoryRepository
    private let categorizationEngine: KMPCategorizationEngineProtocol
    private let currencyFormatter: KMPCurrencyFormatterProtocol

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "NlpInput"
    )

    // MARK: - Published State

    /// Raw text the user has typed into the NLP input field.
    var inputText = ""

    /// The parsed result from the current input, updated with debounce.
    var parseResult: NlpParseResult?

    /// Whether parsing is actively in progress.
    var isParsing = false

    /// Merchant name suggestions based on transaction history.
    var suggestions: [String] = []

    /// Whether to show the suggestions dropdown.
    var showSuggestions = false

    /// Recent NLP input entries for quick re-entry.
    var recentEntries: [RecentNlpEntry] = []

    /// Whether a transaction save is in progress.
    var isSaving = false

    /// Whether the transaction was saved successfully (drives success feedback).
    var isSaved = false

    /// Error message to display, if any.
    var errorMessage: String?

    /// Whether the error alert is showing.
    var showingError = false

    /// The field currently being quick-fixed by the user.
    var editingField: NlpParsedField.FieldType?

    /// Quick-fix override values keyed by field type.
    var fieldOverrides: [NlpParsedField.FieldType: String] = [:]

    // MARK: - Private State

    /// Debounce task for parsing input.
    private var parseTask: Task<Void, Never>?

    /// Cached payee names from transaction history for autocomplete.
    private var payeeHistory: [String] = []

    /// Available categories for matching.
    private var categories: [CategoryItem] = []

    /// User's current locale for amount/date parsing.
    private let userLocale: Locale

    /// Maximum number of recent entries to retain.
    private static let maxRecentEntries = 10

    /// UserDefaults key for recent entries (non-sensitive display data).
    private static let recentEntriesKey = "nlp_recent_entries"

    // MARK: - Computed Properties

    /// Whether the current parse result has enough data to save.
    var canSave: Bool {
        guard let result = parseResult else { return false }
        return result.isValid && !isSaving
    }

    /// The effective parsed fields, incorporating any quick-fix overrides.
    var effectiveParsedFields: [NlpParsedField] {
        guard let result = parseResult else { return [] }
        return result.parsedFields.map { field in
            if let override = fieldOverrides[field.id] {
                return NlpParsedField(id: field.id, value: override, isUncertain: false)
            }
            return field
        }
    }

    // MARK: - Initialisation

    init(
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        categoryRepository: CategoryRepository = RepositoryProvider.shared.categories,
        categorizationEngine: KMPCategorizationEngineProtocol = KMPBridge.shared.categorizationEngine,
        currencyFormatter: KMPCurrencyFormatterProtocol = KMPBridge.shared.currencyFormatter,
        locale: Locale = .current
    ) {
        self.transactionRepository = transactionRepository
        self.categoryRepository = categoryRepository
        self.categorizationEngine = categorizationEngine
        self.currencyFormatter = currencyFormatter
        self.userLocale = locale
        loadRecentEntries()
    }

    // MARK: - Data Loading

    /// Loads payee history and categories for autocomplete and matching.
    func loadData() async {
        do {
            let transactions = try await transactionRepository.getTransactions()
            payeeHistory = Array(Set(transactions.map(\.payee).filter { !$0.isEmpty })).sorted()
            Self.logger.info("Loaded \(self.payeeHistory.count, privacy: .public) payees for NLP autocomplete")
        } catch {
            Self.logger.error("Failed to load payee history: \(error.localizedDescription, privacy: .public)")
            payeeHistory = []
        }

        do {
            categories = try await categoryRepository.getCategories()
            Self.logger.info("Loaded \(self.categories.count, privacy: .public) categories for NLP matching")
        } catch {
            Self.logger.error("Failed to load categories: \(error.localizedDescription, privacy: .public)")
            categories = []
        }
    }

    // MARK: - Input Handling

    /// Called when the user modifies the input text. Triggers debounced parsing
    /// and updates merchant suggestions.
    func onInputChanged(_ text: String) {
        inputText = text
        errorMessage = nil
        isSaved = false
        fieldOverrides = [:]
        editingField = nil

        // Cancel any in-flight parse
        parseTask?.cancel()

        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            parseResult = nil
            suggestions = []
            showSuggestions = false
            isParsing = false
            return
        }

        // Update autocomplete suggestions immediately
        updateSuggestions(for: text)

        // Debounced parsing (150ms, matching web implementation)
        isParsing = true
        parseTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            self?.parseInput(text)
        }
    }

    /// Accepts a merchant suggestion and re-parses.
    func acceptSuggestion(_ suggestion: String) {
        // Replace the payee portion or append to input
        inputText = suggestion
        showSuggestions = false
        parseTask?.cancel()
        parseInput(suggestion)
        Self.logger.info("Accepted suggestion: \(suggestion, privacy: .public)")
    }

    /// Dismisses the suggestions dropdown.
    func dismissSuggestions() {
        showSuggestions = false
    }

    /// Selects a recent entry for re-use.
    func selectRecentEntry(_ entry: RecentNlpEntry) {
        inputText = entry.text
        showSuggestions = false
        parseTask?.cancel()
        parseInput(entry.text)
        Self.logger.info("Selected recent NLP entry")
    }

    /// Removes a recent entry from history.
    func removeRecentEntry(_ entry: RecentNlpEntry) {
        recentEntries.removeAll { $0.id == entry.id }
        saveRecentEntries()
    }

    /// Clears all recent entries.
    func clearRecentEntries() {
        recentEntries = []
        saveRecentEntries()
    }

    // MARK: - Quick-Fix

    /// Begins editing a specific parsed field for quick correction.
    func startQuickFix(for fieldType: NlpParsedField.FieldType) {
        editingField = fieldType
        // Pre-populate override with current value
        if fieldOverrides[fieldType] == nil {
            if let field = parseResult?.parsedFields.first(where: { $0.id == fieldType }) {
                fieldOverrides[fieldType] = field.value
            } else {
                fieldOverrides[fieldType] = ""
            }
        }
        Self.logger.info("Quick-fix started for field: \(fieldType.rawValue, privacy: .public)")
    }

    /// Commits the quick-fix value for a field.
    func commitQuickFix(for fieldType: NlpParsedField.FieldType, value: String) {
        fieldOverrides[fieldType] = value
        editingField = nil
        Self.logger.info("Quick-fix committed for field: \(fieldType.rawValue, privacy: .public)")
    }

    /// Cancels the quick-fix editing mode.
    func cancelQuickFix() {
        editingField = nil
    }

    // MARK: - Save

    /// Saves the parsed transaction. Returns `true` on success.
    func saveTransaction() async -> Bool {
        guard let result = parseResult, result.isValid else {
            errorMessage = String(localized: "Could not parse a valid transaction. Please include at least an amount.")
            showingError = true
            return false
        }

        isSaving = true
        defer { isSaving = false }

        // Build the transaction from parsed + overridden fields
        let effectivePayee = fieldOverrides[.payee] ?? result.payee ?? ""
        let effectiveCategory = fieldOverrides[.category] ?? result.category ?? ""
        let effectiveAmount = resolveAmount(result: result)
        let effectiveDate = result.date ?? Date()
        let effectiveType = result.transactionType

        let transaction = TransactionItem(
            id: UUID().uuidString,
            payee: effectivePayee,
            category: effectiveCategory,
            amountMinorUnits: effectiveType == .income ? effectiveAmount : -effectiveAmount,
            currencyCode: currencyCodeForLocale(),
            date: effectiveDate,
            type: effectiveType,
            status: .pending,
            notes: String(localized: "Created via NLP: \(result.rawInput)")
        )

        do {
            try await transactionRepository.createTransaction(transaction)

            // Teach the categorization engine
            if !effectivePayee.isEmpty, !effectiveCategory.isEmpty {
                let categoryId = categories.first { $0.name == effectiveCategory }?.id
                if let categoryId {
                    categorizationEngine.learnFromHistory(payee: effectivePayee, categoryId: categoryId)
                }
            }

            // Save to recent entries
            addRecentEntry(text: inputText)

            // Reset state
            isSaved = true
            inputText = ""
            parseResult = nil
            suggestions = []
            fieldOverrides = [:]

            Self.logger.info("NLP transaction saved successfully")
            return true
        } catch {
            Self.logger.error("Failed to save NLP transaction: \(error.localizedDescription, privacy: .public)")
            errorMessage = String(localized: "Failed to save transaction. Please try again.")
            showingError = true
            return false
        }
    }

    /// Resets all input state.
    func reset() {
        parseTask?.cancel()
        inputText = ""
        parseResult = nil
        isParsing = false
        suggestions = []
        showSuggestions = false
        isSaving = false
        isSaved = false
        errorMessage = nil
        showingError = false
        editingField = nil
        fieldOverrides = [:]
    }

    // MARK: - Private — Parsing

    private func parseInput(_ text: String) {
        isParsing = true
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            parseResult = nil
            isParsing = false
            return
        }

        let amount = extractAmount(from: trimmed)
        let date = extractDate(from: trimmed)
        let payee = extractPayee(from: trimmed)
        let category = inferCategory(from: trimmed)
        let type = inferType(from: trimmed)
        let confidence = computeConfidence(
            hasAmount: amount != nil,
            hasPayee: payee != nil,
            hasCategory: category != nil,
            hasDate: date != nil
        )

        let formattedAmount: String? = if let amount {
            formatAmount(amount)
        } else {
            nil
        }

        parseResult = NlpParseResult(
            amount: formattedAmount,
            amountMinorUnits: amount,
            payee: payee,
            category: category,
            date: date,
            transactionType: type,
            confidence: confidence,
            rawInput: trimmed
        )

        isParsing = false
        Self.logger.debug("Parsed NLP input — confidence: \(confidence.rawValue, privacy: .public)")
    }

    // MARK: - Private — Amount Extraction (locale-aware)

    private func extractAmount(from input: String) -> Int64? {
        // Try locale-aware number parsing first
        let numberFormatter = NumberFormatter()
        numberFormatter.locale = userLocale
        numberFormatter.numberStyle = .currency

        // Pattern: currency symbol + digits (e.g., $4.50, €12,50, £100)
        let currencyPatterns = [
            #/[$€£¥]\s?([\d,]+\.?\d{0,2})/#,
            #/([\d,]+\.?\d{0,2})\s?(?:dollars?|usd|eur|gbp)/# ,
            #/([\d]+[.,]\d{2})/#,
            #/([\d]+)/#,
        ]

        for pattern in currencyPatterns {
            if let match = input.firstMatch(of: pattern) {
                let amountStr = String(match.1)
                    .replacingOccurrences(of: ",", with: "")

                if let value = Double(amountStr), value > 0 {
                    return Int64(value * 100)
                }

                // Try locale-aware parsing as fallback
                let localeStr = String(match.1)
                numberFormatter.numberStyle = .decimal
                if let localeValue = numberFormatter.number(from: localeStr)?.doubleValue, localeValue > 0 {
                    return Int64(localeValue * 100)
                }
            }
        }

        return nil
    }

    // MARK: - Private — Date Extraction (locale-aware)

    private func extractDate(from input: String) -> Date? {
        let lower = input.lowercased()

        // Relative dates
        let today = Date()
        let calendar = Calendar.current
        if lower.contains("today") { return today }
        if lower.contains("yesterday") { return calendar.date(byAdding: .day, value: -1, to: today) }
        if lower.contains("day before yesterday") { return calendar.date(byAdding: .day, value: -2, to: today) }

        // Day-of-week references ("last monday")
        let dayNames: [(String, Int)] = [
            ("monday", 2), ("tuesday", 3), ("wednesday", 4),
            ("thursday", 5), ("friday", 6), ("saturday", 7), ("sunday", 1),
        ]
        for (dayName, weekday) in dayNames {
            if lower.contains("last \(dayName)") {
                return findPreviousWeekday(weekday, from: today)
            }
        }

        // ISO date: YYYY-MM-DD
        if let match = input.firstMatch(of: #/(\d{4})-(\d{2})-(\d{2})/#) {
            var components = DateComponents()
            components.year = Int(match.1)
            components.month = Int(match.2)
            components.day = Int(match.3)
            return calendar.date(from: components)
        }

        // US-style: MM/DD or MM/DD/YYYY
        if let match = input.firstMatch(of: #/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/#) {
            var components = DateComponents()
            components.month = Int(match.1)
            components.day = Int(match.2)
            if let yearStr = match.3 {
                var year = Int(yearStr)!
                if year < 100 { year += 2000 }
                components.year = year
            } else {
                components.year = calendar.component(.year, from: today)
            }
            return calendar.date(from: components)
        }

        // Month name: "Jan 15", "January 15"
        let monthNames: [(String, Int)] = [
            ("january", 1), ("jan", 1), ("february", 2), ("feb", 2),
            ("march", 3), ("mar", 3), ("april", 4), ("apr", 4),
            ("may", 5), ("june", 6), ("jun", 6), ("july", 7), ("jul", 7),
            ("august", 8), ("aug", 8), ("september", 9), ("sep", 9),
            ("october", 10), ("oct", 10), ("november", 11), ("nov", 11),
            ("december", 12), ("dec", 12),
        ]
        for (monthName, monthNum) in monthNames {
            let pattern = try! Regex("\(monthName)\\s+(\\d{1,2})")
                .ignoresCase()
            if let match = lower.firstMatch(of: pattern),
               let dayStr = match.output[1].substring,
               let day = Int(dayStr) {
                var components = DateComponents()
                components.month = monthNum
                components.day = day
                components.year = calendar.component(.year, from: today)
                return calendar.date(from: components)
            }
        }

        return nil
    }

    private func findPreviousWeekday(_ weekday: Int, from date: Date) -> Date {
        let calendar = Calendar.current
        var current = calendar.date(byAdding: .day, value: -1, to: date)!
        for _ in 0..<7 {
            if calendar.component(.weekday, from: current) == weekday {
                return current
            }
            current = calendar.date(byAdding: .day, value: -1, to: current)!
        }
        return current
    }

    // MARK: - Private — Payee Extraction

    private func extractPayee(from input: String) -> String? {
        // "at <payee>" pattern
        let prepositions = ["at", "from", "to", "for"]
        for prep in prepositions {
            let pattern = try! Regex("\\b\(prep)\\s+([A-Za-z][\\w\\s&'.,'-]{0,30})")
                .ignoresCase()
            if let match = input.firstMatch(of: pattern),
               let payeeStr = match.output[1].substring {
                let payee = String(payeeStr).trimmingCharacters(in: .whitespaces)
                let stopWords = Set(["today", "yesterday", "the", "a", "an"])
                if !stopWords.contains(payee.lowercased()) && !payee.isEmpty {
                    // Clean trailing amount/date fragments
                    let cleaned = payee
                        .replacingOccurrences(of: #"\s*\$[\d,.]+"#, with: "", options: .regularExpression)
                        .replacingOccurrences(of: #"\s+(today|yesterday|last\s+\w+).*"#, with: "", options: [.regularExpression, .caseInsensitive])
                        .trimmingCharacters(in: .whitespaces)
                    if !cleaned.isEmpty {
                        return cleaned
                    }
                }
            }
        }

        return nil
    }

    // MARK: - Private — Category Inference

    private static let categoryKeywords: [String: String] = [
        "coffee": "Food & Drink", "starbucks": "Food & Drink", "lunch": "Food & Drink",
        "dinner": "Food & Drink", "breakfast": "Food & Drink", "restaurant": "Food & Drink",
        "cafe": "Food & Drink",
        "grocery": "Groceries", "groceries": "Groceries", "supermarket": "Groceries",
        "walmart": "Groceries", "costco": "Groceries",
        "uber": "Transport", "lyft": "Transport", "taxi": "Transport", "gas": "Transport",
        "fuel": "Transport", "parking": "Transport", "bus": "Transport", "train": "Transport",
        "netflix": "Entertainment", "spotify": "Entertainment", "movie": "Entertainment",
        "rent": "Housing", "mortgage": "Housing",
        "electric": "Utilities", "internet": "Utilities", "phone": "Utilities",
        "amazon": "Shopping", "target": "Shopping",
        "doctor": "Health", "pharmacy": "Health", "gym": "Health",
        "salary": "Income", "paycheck": "Income", "freelance": "Income",
        "bonus": "Income", "refund": "Income",
    ]

    private func inferCategory(from input: String) -> String? {
        let lower = input.lowercased()

        // First try KMP categorization engine via payee
        if let payee = extractPayee(from: input),
           let suggested = categorizationEngine.suggest(payee: payee) {
            // Map category ID to name
            if let category = categories.first(where: { $0.id == suggested }) {
                return category.name
            }
        }

        // Fallback to keyword matching (mirrors KMP NaturalLanguageParser)
        for (keyword, category) in Self.categoryKeywords {
            if lower.contains(keyword) {
                return category
            }
        }

        return nil
    }

    // MARK: - Private — Type Inference

    private static let incomeKeywords: Set<String> = [
        "income", "salary", "paycheck", "received", "earned",
        "refund", "bonus", "freelance", "deposit",
    ]

    private static let expenseKeywords: Set<String> = [
        "spent", "paid", "bought", "purchased", "charged", "cost",
    ]

    private func inferType(from input: String) -> TransactionTypeUI {
        let lower = input.lowercased()
        if Self.incomeKeywords.contains(where: { lower.contains($0) }) { return .income }
        if lower.contains("transfer") || lower.contains("move") { return .transfer }
        return .expense
    }

    // MARK: - Private — Confidence

    private func computeConfidence(
        hasAmount: Bool, hasPayee: Bool, hasCategory: Bool, hasDate: Bool
    ) -> NlpConfidence {
        let score = [hasAmount, hasPayee, hasCategory, hasDate].filter(\.self).count
        switch score {
        case 4: return .high
        case 3: return .medium
        case 2: return .low
        default: return .veryLow
        }
    }

    // MARK: - Private — Suggestions

    private func updateSuggestions(for text: String) {
        guard text.count >= 2 else {
            suggestions = []
            showSuggestions = false
            return
        }

        let lower = text.lowercased()
        suggestions = payeeHistory
            .filter { $0.lowercased().contains(lower) }
            .prefix(5)
            .map { $0 }
        showSuggestions = !suggestions.isEmpty
    }

    // MARK: - Private — Formatting

    private func formatAmount(_ minorUnits: Int64) -> String {
        let value = Double(minorUnits) / 100.0
        let formatter = NumberFormatter()
        formatter.locale = userLocale
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCodeForLocale()
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f", value)
    }

    private func currencyCodeForLocale() -> String {
        userLocale.currency?.identifier ?? "USD"
    }

    private func resolveAmount(result: NlpParseResult) -> Int64 {
        if let overrideStr = fieldOverrides[.amount] {
            // Parse the override amount
            let cleaned = overrideStr
                .replacingOccurrences(of: #"[^0-9.]"#, with: "", options: .regularExpression)
            if let value = Double(cleaned), value > 0 {
                return Int64(value * 100)
            }
        }
        return result.amountMinorUnits ?? 0
    }

    // MARK: - Private — Recent Entries

    private func loadRecentEntries() {
        guard let data = UserDefaults.standard.data(forKey: Self.recentEntriesKey),
              let entries = try? JSONDecoder().decode([RecentNlpEntry].self, from: data) else {
            recentEntries = []
            return
        }
        recentEntries = entries
    }

    private func saveRecentEntries() {
        guard let data = try? JSONEncoder().encode(recentEntries) else { return }
        UserDefaults.standard.set(data, forKey: Self.recentEntriesKey)
    }

    private func addRecentEntry(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Remove duplicates
        recentEntries.removeAll { $0.text == trimmed }

        // Add to front
        recentEntries.insert(RecentNlpEntry(text: trimmed), at: 0)

        // Trim to max
        if recentEntries.count > Self.maxRecentEntries {
            recentEntries = Array(recentEntries.prefix(Self.maxRecentEntries))
        }

        saveRecentEntries()
    }
}
