// SPDX-License-Identifier: BUSL-1.1

// ProtectedCategoriesView.swift
// Finance
//
// Settings screen for managing biometric-protected transaction categories.
// Users can toggle Face ID / Touch ID protection per category to hide
// sensitive transactions behind biometric authentication.
//
// References: #295

import SwiftUI

struct ProtectedCategoriesView: View {
    @State private var viewModel = BiometricCategoryViewModel()
    @Environment(BiometricAuthManager.self) private var biometricAuth

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView(String(localized: "Loading categories…"))
                        .accessibilityLabel(String(localized: "Loading protected categories"))
                } else if !viewModel.isBiometricAvailable {
                    biometricUnavailableView
                } else {
                    categoryList
                }
            }
            .navigationTitle(String(localized: "Protected Categories"))
            .task {
                await viewModel.loadCategories()
            }
            .alert(
                String(localized: "Error"),
                isPresented: .init(
                    get: { viewModel.showError },
                    set: { if !$0 { viewModel.dismissError() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Biometric Unavailable

    private var biometricUnavailableView: some View {
        ContentUnavailableView {
            Label(
                String(localized: "Biometrics Required"),
                systemImage: "faceid"
            )
        } description: {
            Text(String(localized: "Face ID or Touch ID must be set up on your device to protect categories. Enable biometrics in Settings → Face ID & Passcode."))
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Category List

    private var categoryList: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    Image(systemName: biometricAuth.biometricType.systemImage)
                        .font(.title2)
                        .foregroundStyle(FinanceColors.interactive)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(String(localized: "Category Protection"))
                            .font(.subheadline)
                            .fontWeight(.medium)

                        Text(String(localized: "Protected categories require \(biometricAuth.biometricType.displayName) to view their transactions. Protection is per-session — transactions are re-hidden when the app enters background."))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "Category Protection information. Protected categories require \(biometricAuth.biometricType.displayName) to view.")
                )
            }

            Section(String(localized: "Categories")) {
                ForEach(viewModel.categories) { category in
                    categoryRow(category)
                }
            }

            if !viewModel.protectedIds.isEmpty {
                Section {
                    Text(String(localized: "\(viewModel.protectedIds.count) \(viewModel.protectedIds.count == 1 ? "category" : "categories") protected"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Category Row

    private func categoryRow(_ category: CategoryItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: category.icon)
                .font(.body)
                .foregroundStyle(category.color)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(category.name)
                    .font(.body)

                if viewModel.isProtected(categoryId: category.id) {
                    HStack(spacing: 4) {
                        Image(systemName: "lock.fill")
                            .font(.caption2)
                        Text(String(localized: "Protected"))
                            .font(.caption)
                    }
                    .foregroundStyle(FinanceColors.statusPositive)
                    .accessibilityHidden(true) // Included in parent label
                }
            }

            Spacer()

            Toggle(
                String(localized: "Protect \(category.name)"),
                isOn: Binding(
                    get: { viewModel.isProtected(categoryId: category.id) },
                    set: { _ in
                        Task {
                            await viewModel.toggleProtection(for: category.id)
                        }
                    }
                )
            )
            .labelsHidden()
            .tint(FinanceColors.interactive)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            viewModel.isProtected(categoryId: category.id)
                ? String(localized: "\(category.name), protected with \(biometricAuth.biometricType.displayName)")
                : String(localized: "\(category.name), not protected")
        )
        .accessibilityHint(
            viewModel.isProtected(categoryId: category.id)
                ? String(localized: "Double tap to remove \(biometricAuth.biometricType.displayName) protection")
                : String(localized: "Double tap to protect with \(biometricAuth.biometricType.displayName)")
        )
    }
}

// MARK: - Protected Transaction Guard

/// View modifier that gates content behind biometric authentication
/// when the content belongs to a protected category.
///
/// Usage:
/// ```swift
/// TransactionDetailView(transaction: tx)
///     .protectedCategory(
///         categoryId: tx.category,
///         viewModel: biometricCategoryVM
///     )
/// ```
struct ProtectedCategoryModifier: ViewModifier {
    let categoryId: String
    @Bindable var viewModel: BiometricCategoryViewModel

    @State private var hasAttemptedUnlock = false

    func body(content: Content) -> some View {
        if viewModel.isVisible(categoryId: categoryId) {
            content
        } else {
            protectedPlaceholder
                .task {
                    if !hasAttemptedUnlock {
                        hasAttemptedUnlock = true
                        _ = await viewModel.unlockCategory(categoryId)
                    }
                }
        }
    }

    private var protectedPlaceholder: some View {
        ContentUnavailableView {
            Label(
                String(localized: "Protected Category"),
                systemImage: "lock.fill"
            )
        } description: {
            Text(String(localized: "This category is protected. Authenticate to view transactions."))
        } actions: {
            Button {
                Task {
                    _ = await viewModel.unlockCategory(categoryId)
                }
            } label: {
                Label(
                    String(localized: "Unlock with Face ID"),
                    systemImage: "faceid"
                )
            }
            .buttonStyle(.borderedProminent)
            .accessibilityLabel(String(localized: "Unlock protected transactions"))
            .accessibilityHint(String(localized: "Prompts biometric authentication to reveal hidden transactions"))
        }
    }
}

extension View {
    /// Gates this view behind biometric authentication if the category is protected.
    func protectedCategory(
        categoryId: String,
        viewModel: BiometricCategoryViewModel
    ) -> some View {
        modifier(ProtectedCategoryModifier(
            categoryId: categoryId,
            viewModel: viewModel
        ))
    }
}

// MARK: - Preview

#Preview("Protected Categories") {
    ProtectedCategoriesView()
        .environment(BiometricAuthManager())
}
