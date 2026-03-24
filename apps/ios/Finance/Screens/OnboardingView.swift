// SPDX-License-Identifier: BUSL-1.1

// OnboardingView.swift
// Finance
//
// Welcome flow shown on first launch. Introduces core features, the
// privacy commitment, and guides the user into the main app.
// References: #476

import os
import SwiftUI

// MARK: - View

/// A swipeable onboarding flow displayed only on the user's first launch.
///
/// Pages:
/// 1. **Welcome** — app introduction with logo
/// 2. **Features** — core financial tracking capabilities
/// 3. **Privacy** — privacy commitment and offline-first architecture
/// 4. **Get Started** — CTA to enter the main app
///
/// The completion state is persisted to `UserDefaults` (non-sensitive
/// boolean) so the flow is never shown again after dismissal.
struct OnboardingView: View {
    @State private var currentPage = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Callback invoked when the user completes or skips onboarding.
    let onComplete: () -> Void

    /// `UserDefaults` key for tracking onboarding completion.
    static let hasCompletedOnboardingKey = "hasCompletedOnboarding"

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "OnboardingView"
    )

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            systemImage: "chart.line.uptrend.xyaxis",
            title: String(localized: "Welcome to Finance"),
            description: String(localized: "Take control of your money with a powerful, privacy-first financial tracker built for Apple devices."),
            accentColor: .blue
        ),
        OnboardingPage(
            systemImage: "building.columns",
            title: String(localized: "Track Everything"),
            description: String(localized: "Manage accounts, budgets, goals, and transactions — all in one place with real-time insights and charts."),
            accentColor: .green
        ),
        OnboardingPage(
            systemImage: "lock.shield",
            title: String(localized: "Your Data, Your Device"),
            description: String(localized: "Finance works offline-first. Your data stays on your device, protected by Face ID and Apple Keychain encryption."),
            accentColor: .purple
        ),
        OnboardingPage(
            systemImage: "arrow.right.circle",
            title: String(localized: "Let's Get Started"),
            description: String(localized: "Add your first account and start tracking your financial journey today."),
            accentColor: .orange
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Skip button
            HStack {
                Spacer()
                if currentPage < pages.count - 1 {
                    Button {
                        completeOnboarding()
                    } label: {
                        Text(String(localized: "Skip"))
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("onboarding_skip")
                    .accessibilityLabel(String(localized: "Skip onboarding"))
                    .accessibilityHint(String(localized: "Skips the introduction and enters the app"))
                }
            }
            .padding(.horizontal, FinanceSpacing.lg)
            .padding(.top, FinanceSpacing.sm)
            .frame(height: FinanceSpacing.minTapTarget)

            // Paged content
            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
                    onboardingPageView(page)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeInOut, value: currentPage)

            // Page indicator + action button
            VStack(spacing: FinanceSpacing.xl) {
                pageIndicator

                if currentPage == pages.count - 1 {
                    Button {
                        completeOnboarding()
                    } label: {
                        Text(String(localized: "Get Started"))
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("onboarding_get_started")
                    .accessibilityLabel(String(localized: "Get Started"))
                    .accessibilityHint(String(localized: "Completes onboarding and enters the app"))
                } else {
                    Button {
                        withAnimation(reduceMotion ? nil : .easeInOut) {
                            currentPage += 1
                        }
                    } label: {
                        Text(String(localized: "Continue"))
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("onboarding_continue")
                    .accessibilityLabel(String(localized: "Continue"))
                    .accessibilityHint(String(localized: "Advances to the next onboarding page"))
                }
            }
            .padding(.horizontal, FinanceSpacing.xl)
            .padding(.bottom, FinanceSpacing.xxl)
        }
        .background(FinanceColors.backgroundPrimary.ignoresSafeArea())
        .accessibilityIdentifier("onboarding_view")
        .accessibilityLabel(String(localized: "Onboarding"))
    }

    // MARK: - Page View

    private func onboardingPageView(_ page: OnboardingPage) -> some View {
        VStack(spacing: FinanceSpacing.xl) {
            Spacer()

            Image(systemName: page.systemImage)
                .font(.system(size: 80))
                .foregroundStyle(page.accentColor)
                .symbolRenderingMode(.hierarchical)
                .accessibilityHidden(true)

            VStack(spacing: FinanceSpacing.sm) {
                Text(page.title)
                    .font(.title)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(FinanceColors.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                Text(page.description)
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(FinanceColors.textSecondary)
                    .padding(.horizontal, FinanceSpacing.md)
            }

            Spacer()
        }
        .padding(.horizontal, FinanceSpacing.xl)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(page.title). \(page.description)")
    }

    // MARK: - Page Indicator

    private var pageIndicator: some View {
        HStack(spacing: FinanceSpacing.xs) {
            ForEach(0..<pages.count, id: \.self) { index in
                Circle()
                    .fill(index == currentPage ? Color.accentColor : Color.gray.opacity(0.3))
                    .frame(width: 8, height: 8)
                    .scaleEffect(index == currentPage ? 1.2 : 1.0)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: currentPage)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Page \(currentPage + 1) of \(pages.count)"))
        .accessibilityValue(pages[currentPage].title)
    }

    // MARK: - Completion

    private func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: Self.hasCompletedOnboardingKey)
        Self.logger.info("Onboarding completed")
        onComplete()
    }
}

// MARK: - Data Model

/// Data model for a single onboarding page.
private struct OnboardingPage {
    let systemImage: String
    let title: String
    let description: String
    let accentColor: Color
}

// MARK: - Previews

#Preview("Onboarding Flow") {
    OnboardingView(onComplete: {})
}
