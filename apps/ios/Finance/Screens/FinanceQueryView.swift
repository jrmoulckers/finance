// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryView.swift
// Finance
//
// Natural-language finance query screen (#2386). Lets the user ask questions
// like "how much did I spend on groceries this week" by typing (and, once the
// Speech capability is wired up, by voice). Answers are grounded in local data,
// shown typed, and can be read aloud — with explicit confirmation required
// before speaking sensitive balances.

import SwiftUI

struct FinanceQueryView: View {
    @State private var viewModel: FinanceQueryViewModel

    init(viewModel: FinanceQueryViewModel = FinanceQueryViewModel(
        transactions: RepositoryProvider.shared.transactions,
        accounts: RepositoryProvider.shared.accounts,
        categories: RepositoryProvider.shared.categories
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    inputSection
                    outcomeSection
                    examplesSection
                }
                .padding()
            }
            .navigationTitle(String(localized: "Ask Finance"))
            .alert(
                String(localized: "Read balance aloud?"),
                isPresented: Binding(
                    get: { viewModel.pendingSpokenConfirmation != nil },
                    set: { if !$0 { viewModel.cancelSpeak() } }
                )
            ) {
                Button(String(localized: "Read Aloud")) { viewModel.confirmSpeak() }
                Button(String(localized: "Cancel"), role: .cancel) { viewModel.cancelSpeak() }
            } message: {
                Text(String(localized: "This will speak your balance out loud. Make sure no one is listening."))
            }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "OK"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Input

    private var inputSection: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                TextField(
                    String(localized: "Ask about your money…"),
                    text: $viewModel.inputText
                )
                .textFieldStyle(.roundedBorder)
                .submitLabel(.search)
                .onSubmit { Task { await viewModel.submit() } }
                .accessibilityLabel(String(localized: "Finance question"))
                .accessibilityHint(String(localized: "Type a question such as how much did I spend on groceries this week"))

                micButton
            }

            Button {
                Task { await viewModel.submit() }
            } label: {
                Text(String(localized: "Ask"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.inputText.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityLabel(String(localized: "Ask question"))
        }
    }

    private var micButton: some View {
        Button {
            // TODO(human): Wire up live dictation once the Speech capability,
            // microphone entitlement, and usage-description Info.plist keys are
            // added in Xcode. Until then the button is disabled.
        } label: {
            Image(systemName: "mic.fill")
                .imageScale(.large)
        }
        .disabled(!viewModel.isSpeechInputAvailable)
        .accessibilityLabel(String(localized: "Ask by voice"))
        .accessibilityHint(
            viewModel.isSpeechInputAvailable
                ? String(localized: "Starts voice dictation")
                : String(localized: "Voice input is not available yet")
        )
    }

    // MARK: - Outcome

    @ViewBuilder
    private var outcomeSection: some View {
        switch viewModel.phase {
        case .idle:
            EmptyView()
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity)
                .accessibilityLabel(String(localized: "Finding your answer"))
        case .answered(let result):
            answerCard(result)
        case .clarifying(let clarification):
            clarificationCard(clarification)
        case .unrecognized:
            unrecognizedCard
        }
    }

    private func answerCard(_ result: FinanceQueryResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(result.typedSummary)
                .font(.title3)
                .fontWeight(.semibold)
                .accessibilityLabel(result.spokenSummary)

            Button {
                viewModel.requestSpeak()
            } label: {
                Label(
                    result.requiresSpokenConfirmation
                        ? String(localized: "Read aloud (confirm)")
                        : String(localized: "Read aloud"),
                    systemImage: "speaker.wave.2.fill"
                )
            }
            .buttonStyle(.bordered)
            .accessibilityHint(
                result.requiresSpokenConfirmation
                    ? String(localized: "Asks for confirmation before speaking sensitive balances")
                    : String(localized: "Speaks the answer aloud")
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func clarificationCard(_ clarification: FinanceQueryClarification) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            switch clarification {
            case .ambiguousDate(let phrase, let options):
                Text(String(localized: "Which period did you mean by \"\(phrase)\"?"))
                    .font(.headline)
                FlowChips(labels: options.map(\.displayName)) { index in
                    Task { await viewModel.resolveDate(options[index]) }
                }
            case .ambiguousCategory(let phrase, let options):
                Text(String(localized: "Which category did you mean by \"\(phrase)\"?"))
                    .font(.headline)
                FlowChips(labels: options) { index in
                    Task { await viewModel.resolveCategory(options[index]) }
                }
            case .missingSubject:
                Text(String(localized: "What would you like to know? Try a category, merchant, account, or time period."))
                    .font(.headline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private var unrecognizedCard: some View {
        Text(String(localized: "Sorry, I can only answer questions about your spending and balances right now."))
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Examples

    private var examplesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Try asking"))
                .font(.footnote)
                .foregroundStyle(.secondary)
            ForEach(Self.examplePrompts, id: \.self) { prompt in
                Button {
                    viewModel.inputText = prompt
                    Task { await viewModel.submit() }
                } label: {
                    Text(verbatim: "“\(prompt)”")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "Example question: \(prompt)"))
            }
        }
    }

    private static let examplePrompts: [String] = [
        String(localized: "How much did I spend on groceries this week?"),
        String(localized: "How much did I spend at Netflix?"),
        String(localized: "How much did I spend last month?"),
    ]
}

// MARK: - Flow Chips

/// A simple wrapping row of tappable chips used for clarification options.
private struct FlowChips: View {
    let labels: [String]
    let onTap: (Int) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack { chips }
            VStack(alignment: .leading) { chips }
        }
    }

    private var chips: some View {
        ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
            Button {
                onTap(index)
            } label: {
                Text(label)
                    .font(.subheadline)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.tint.opacity(0.15), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "Choose \(label)"))
        }
    }
}
