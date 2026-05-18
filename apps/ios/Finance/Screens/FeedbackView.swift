// SPDX-License-Identifier: BUSL-1.1

// FeedbackView.swift
// Finance
//
// In-app feedback and bug report sheet. Captures type (Bug, Feedback,
// Suggestion), description, and device context. Stores locally for alpha;
// backend integration planned. Refs #1488

import os
import SwiftUI

// MARK: - Feedback Type

/// The category of feedback being submitted.
enum FeedbackType: String, CaseIterable, Sendable {
    case bug = "Bug"
    case feedback = "Feedback"
    case suggestion = "Suggestion"

    var displayName: String {
        switch self {
        case .bug: String(localized: "Bug Report")
        case .feedback: String(localized: "Feedback")
        case .suggestion: String(localized: "Suggestion")
        }
    }

    var systemImage: String {
        switch self {
        case .bug: "ladybug"
        case .feedback: "bubble.left"
        case .suggestion: "lightbulb"
        }
    }
}

// MARK: - FeedbackViewModel

@Observable
final class FeedbackViewModel {
    var feedbackType: FeedbackType = .bug
    var descriptionText = ""
    var isSaving = false
    var showingConfirmation = false
    var errorMessage: String?

    /// Device info auto-captured for context.
    var deviceInfo: String {
        let device = UIDevice.current
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(device.systemName) \(device.systemVersion), App \(appVersion) (\(buildNumber))"
    }

    var canSubmit: Bool {
        !descriptionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "FeedbackViewModel"
    )

    /// Saves feedback locally. TODO: Integrate with backend API.
    func submit() async -> Bool {
        guard canSubmit else { return false }
        isSaving = true
        defer { isSaving = false }

        let entry = FeedbackEntry(
            id: UUID().uuidString,
            type: feedbackType.rawValue,
            description: descriptionText,
            deviceInfo: deviceInfo,
            createdAt: Date()
        )

        // Store locally for alpha — append to existing feedback
        var existing = Self.loadLocalFeedback()
        existing.append(entry)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(existing) else {
            errorMessage = String(localized: "Failed to save feedback.")
            Self.logger.error("Failed to encode feedback entry")
            return false
        }

        UserDefaults.standard.set(data, forKey: Self.feedbackStorageKey)
        Self.logger.info("Feedback saved locally: type=\(entry.type, privacy: .public)")
        showingConfirmation = true
        return true
    }

    // MARK: - Local Storage

    private static let feedbackStorageKey = "finance_local_feedback"

    private static func loadLocalFeedback() -> [FeedbackEntry] {
        guard let data = UserDefaults.standard.data(forKey: feedbackStorageKey) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([FeedbackEntry].self, from: data)) ?? []
    }
}

// MARK: - FeedbackEntry

/// A locally stored feedback entry.
private struct FeedbackEntry: Codable, Sendable {
    let id: String
    let type: String
    let description: String
    let deviceInfo: String
    let createdAt: Date
}

// MARK: - FeedbackView

/// A sheet for submitting bug reports, feedback, or suggestions.
struct FeedbackView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel = FeedbackViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "Type")) {
                    Picker(String(localized: "Feedback Type"), selection: $viewModel.feedbackType) {
                        ForEach(FeedbackType.allCases, id: \.rawValue) { type in
                            Label(type.displayName, systemImage: type.systemImage)
                                .tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityLabel(String(localized: "Feedback type"))
                    .accessibilityHint(String(localized: "Select whether this is a bug report, feedback, or suggestion"))
                }

                Section(String(localized: "Description")) {
                    TextEditor(text: $viewModel.descriptionText)
                        .frame(minHeight: 120)
                        .accessibilityLabel(String(localized: "Description"))
                        .accessibilityHint(String(localized: "Describe the issue or suggestion in detail"))
                    if viewModel.descriptionText.isEmpty {
                        Text(String(localized: "Please describe what you experienced or what you'd like to see improved."))
                            .foregroundStyle(.tertiary)
                            .font(.subheadline)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                }

                Section(String(localized: "Device Info")) {
                    Text(viewModel.deviceInfo)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(String(localized: "Device information: \(viewModel.deviceInfo)"))
                }
            }
            .navigationTitle(String(localized: "Send Feedback"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Submit")) {
                        Task {
                            if await viewModel.submit() {
                                // Dismiss after brief confirmation
                                try? await Task.sleep(for: .seconds(1))
                                dismiss()
                            }
                        }
                    }
                    .disabled(!viewModel.canSubmit || viewModel.isSaving)
                    .accessibilityLabel(String(localized: "Submit feedback"))
                    .accessibilityHint(String(localized: "Sends your feedback"))
                }
            }
            .alert(String(localized: "Thank You!"), isPresented: $viewModel.showingConfirmation) {
                Button(String(localized: "OK"), role: .cancel) { dismiss() }
            } message: {
                Text(String(localized: "Your feedback has been saved. We'll review it soon."))
            }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                if let msg = viewModel.errorMessage {
                    Text(msg)
                }
            }
        }
    }
}

#Preview {
    FeedbackView()
}
