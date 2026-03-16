// SPDX-License-Identifier: BUSL-1.1

// OnboardingView.swift
// Finance
//
// First-launch onboarding experience — a 4-page paged TabView that
// introduces core features, offers biometric opt-in, and gates the
// main app behind a completion flag.
// Refs #476

import os
import SwiftUI

// MARK: - OnboardingView

/// A 4-page onboarding experience shown on first launch.
///
/// Pages:
/// 1. **Welcome** — hero icon and tagline.
/// 2. **Features** — highlights of core capabilities.
/// 3. **Security** — biometric opt-in (Face ID / Touch ID).
/// 4. **Get Started** — summary with completion button.
///
/// Navigation is handled by page indicator dots, a "Next" button,
/// and a persistent "Skip" button. All text uses `String(localized:)`
/// and Dynamic Type. VoiceOver labels are provided for every
/// interactive element.
struct OnboardingView: View {

    @State private var viewModel = OnboardingViewModel()
    @Environment(BiometricAuthManager.self) private var biometricManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "OnboardingView"
    )

    var body: some View {
        ZStack(alignment: .top) {
            FinanceColors.backgroundPrimary
                .ignoresSafeArea()

            VStack(spacing: FinanceSpacing.none) {
                // Skip button
                skipButton

                // Paged content
                TabView(selection: $viewModel.currentPage) {
                    WelcomePage()
                        .tag(0)
                    FeaturesPage()
                        .tag(1)
                    SecurityPage(
                        biometricManager: biometricManager,
                        biometricOptIn: $viewModel.biometricOptIn
                    )
                        .tag(2)
                    GetStartedPage(reduceMotion: reduceMotion)
                        .tag(3)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(
                    reduceMotion ? .none : .easeInOut(duration: 0.3),
                    value: viewModel.currentPage
                )

                // Bottom controls: page indicator + action button
                bottomControls
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "Onboarding, page \(viewModel.currentPage + 1) of \(viewModel.totalPages)")
        )
    }

    // MARK: - Skip Button

    private var skipButton: some View {
        HStack {
            Spacer()
            Button {
                viewModel.skip()
                Self.logger.debug("User tapped Skip on page \(viewModel.currentPage)")
            } label: {
                Text(String(localized: "Skip"))
                    .font(FinanceTypography.label)
                    .foregroundStyle(FinanceColors.interactive)
            }
            .accessibilityLabel(String(localized: "Skip onboarding"))
            .accessibilityHint(String(localized: "Skips the introduction and goes to the app"))
            .frame(minWidth: FinanceSpacing.minTapTarget, minHeight: FinanceSpacing.minTapTarget)
        }
        .padding(.horizontal, FinanceSpacing.lg)
        .padding(.top, FinanceSpacing.xs)
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: FinanceSpacing.lg) {
            // Custom page indicator
            pageIndicator

            // Action button
            if viewModel.currentPage == viewModel.totalPages - 1 {
                getStartedButton
            } else {
                nextButton
            }
        }
        .padding(.horizontal, FinanceSpacing.xl)
        .padding(.bottom, FinanceSpacing.xxl)
    }

    // MARK: - Page Indicator

    private var pageIndicator: some View {
        HStack(spacing: FinanceSpacing.xs) {
            ForEach(0..<viewModel.totalPages, id: \.self) { index in
                Capsule()
                    .fill(
                        index == viewModel.currentPage
                            ? FinanceColors.interactive
                            : FinanceColors.interactiveDisabled
                    )
                    .frame(
                        width: index == viewModel.currentPage ? 24 : 8,
                        height: 8
                    )
                    .animation(
                        reduceMotion ? .none : .easeInOut(duration: 0.2),
                        value: viewModel.currentPage
                    )
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            String(localized: "Page \(viewModel.currentPage + 1) of \(viewModel.totalPages)")
        )
        .accessibilityValue(
            String(localized: "\(pageName(for: viewModel.currentPage))")
        )
    }

    // MARK: - Next Button

    private var nextButton: some View {
        Button {
            viewModel.nextPage()
        } label: {
            Text(String(localized: "Next"))
                .font(FinanceTypography.title)
                .foregroundStyle(FinanceColors.textInverse)
                .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
        }
        .buttonStyle(.borderedProminent)
        .tint(FinanceColors.interactive)
        .accessibilityLabel(String(localized: "Next page"))
        .accessibilityHint(
            String(localized: "Moves to the next onboarding page")
        )
    }

    // MARK: - Get Started Button

    private var getStartedButton: some View {
        Button {
            viewModel.completeOnboarding()
        } label: {
            Text(String(localized: "Get Started"))
                .font(FinanceTypography.title)
                .foregroundStyle(FinanceColors.textInverse)
                .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
        }
        .buttonStyle(.borderedProminent)
        .tint(FinanceColors.interactive)
        .accessibilityLabel(String(localized: "Get Started"))
        .accessibilityHint(
            String(localized: "Completes onboarding and opens the app")
        )
    }

    // MARK: - Helpers

    /// Returns a localized name for each onboarding page for VoiceOver.
    private func pageName(for index: Int) -> String {
        switch index {
        case 0: String(localized: "Welcome")
        case 1: String(localized: "Features")
        case 2: String(localized: "Security")
        case 3: String(localized: "Get Started")
        default: ""
        }
    }
}

// MARK: - Welcome Page

/// Page 1: Hero icon, title, and tagline.
private struct WelcomePage: View {

    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 80

    var body: some View {
        VStack(spacing: FinanceSpacing.lg) {
            Spacer()

            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.system(size: iconSize))
                .foregroundStyle(FinanceColors.interactive)
                .symbolRenderingMode(.hierarchical)
                .accessibilityHidden(true)

            Text(String(localized: "Welcome to Finance"))
                .font(FinanceTypography.display)
                .foregroundStyle(FinanceColors.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "Your personal financial tracker — private, secure, and always with you."))
                .font(FinanceTypography.body)
                .foregroundStyle(FinanceColors.textSecondary)
                .multilineTextAlignment(.center)

            // Decorative illustration cluster
            decorativeIcons
                .padding(.top, FinanceSpacing.md)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, FinanceSpacing.xl)
    }

    @ScaledMetric(relativeTo: .title3) private var decorativeSize: CGFloat = 28

    private var decorativeIcons: some View {
        HStack(spacing: FinanceSpacing.xl) {
            Image(systemName: "banknote")
                .font(.system(size: decorativeSize))
                .foregroundStyle(FinanceColors.statusPositive)
            Image(systemName: "creditcard")
                .font(.system(size: decorativeSize))
                .foregroundStyle(FinanceColors.interactive)
            Image(systemName: "chart.pie")
                .font(.system(size: decorativeSize))
                .foregroundStyle(FinanceColors.statusWarning)
        }
        .symbolRenderingMode(.hierarchical)
        .accessibilityHidden(true)
    }
}

// MARK: - Features Page

/// Page 2: Grid of feature highlights with icons.
private struct FeaturesPage: View {

    var body: some View {
        VStack(spacing: FinanceSpacing.lg) {
            Spacer()

            Text(String(localized: "Everything You Need"))
                .font(FinanceTypography.headline)
                .foregroundStyle(FinanceColors.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

            VStack(alignment: .leading, spacing: FinanceSpacing.lg) {
                FeatureRow(
                    icon: "chart.bar.fill",
                    iconColor: FinanceColors.interactive,
                    title: String(localized: "Track Spending"),
                    subtitle: String(localized: "See where your money goes with automatic categorization.")
                )

                FeatureRow(
                    icon: "target",
                    iconColor: FinanceColors.statusPositive,
                    title: String(localized: "Set Goals"),
                    subtitle: String(localized: "Save for what matters with visual progress tracking.")
                )

                FeatureRow(
                    icon: "gauge.with.needle",
                    iconColor: FinanceColors.statusWarning,
                    title: String(localized: "Budget Smart"),
                    subtitle: String(localized: "Create budgets that adapt to your spending patterns.")
                )

                FeatureRow(
                    icon: "lock.shield",
                    iconColor: FinanceColors.statusInfo,
                    title: String(localized: "Private by Design"),
                    subtitle: String(localized: "Your data is encrypted and never shared.")
                )
            }
            .padding(.horizontal, FinanceSpacing.md)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, FinanceSpacing.xl)
    }
}

// MARK: - Feature Row

/// A single feature highlight with icon, title, and subtitle.
private struct FeatureRow: View {

    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String

    @ScaledMetric(relativeTo: .title3) private var iconSize: CGFloat = 40

    var body: some View {
        HStack(alignment: .top, spacing: FinanceSpacing.md) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(iconColor)
                .symbolRenderingMode(.hierarchical)
                .frame(width: iconSize, height: iconSize)
                .background(
                    iconColor.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.md)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: FinanceSpacing.xxs) {
                Text(title)
                    .font(FinanceTypography.title)
                    .foregroundStyle(FinanceColors.textPrimary)

                Text(subtitle)
                    .font(FinanceTypography.caption)
                    .foregroundStyle(FinanceColors.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Security Page

/// Page 3: Biometric opt-in toggle with device-appropriate icon.
private struct SecurityPage: View {

    let biometricManager: BiometricAuthManager
    @Binding var biometricOptIn: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 64

    var body: some View {
        VStack(spacing: FinanceSpacing.lg) {
            Spacer()

            Image(systemName: biometricManager.biometricType.systemImage)
                .font(.system(size: iconSize))
                .foregroundStyle(FinanceColors.interactive)
                .symbolRenderingMode(.hierarchical)
                .accessibilityHidden(true)

            Text(String(localized: "Protect Your Finances"))
                .font(FinanceTypography.headline)
                .foregroundStyle(FinanceColors.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

            Text(biometricDescription)
                .font(FinanceTypography.body)
                .foregroundStyle(FinanceColors.textSecondary)
                .multilineTextAlignment(.center)

            if biometricManager.isAvailable {
                biometricToggle
            } else {
                biometricUnavailableNotice
            }

            Text(String(localized: "You can change this later in Settings."))
                .font(FinanceTypography.caption)
                .foregroundStyle(FinanceColors.textDisabled)
                .multilineTextAlignment(.center)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, FinanceSpacing.xl)
    }

    /// Description text matching the device biometric type.
    private var biometricDescription: String {
        switch biometricManager.biometricType {
        case .faceID:
            String(localized: "Use Face ID to quickly and securely unlock the app and protect your financial data.")
        case .touchID:
            String(localized: "Use Touch ID to quickly and securely unlock the app and protect your financial data.")
        case .opticID:
            String(localized: "Use Optic ID to quickly and securely unlock the app and protect your financial data.")
        case .none:
            String(localized: "Enable biometric authentication to secure access to your financial data.")
        }
    }

    private var biometricToggle: some View {
        Toggle(isOn: $biometricOptIn) {
            Label(
                String(localized: "Enable \(biometricManager.biometricType.displayName)"),
                systemImage: biometricManager.biometricType.systemImage
            )
            .font(FinanceTypography.title)
            .foregroundStyle(FinanceColors.textPrimary)
        }
        .tint(FinanceColors.interactive)
        .padding(FinanceSpacing.md)
        .background(
            FinanceColors.backgroundSecondary,
            in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.lg)
        )
        .accessibilityLabel(
            String(localized: "Enable \(biometricManager.biometricType.displayName)")
        )
        .accessibilityHint(
            String(localized: "Enables biometric authentication to lock the app")
        )
        .accessibilityValue(
            biometricOptIn
                ? String(localized: "Enabled")
                : String(localized: "Disabled")
        )
    }

    private var biometricUnavailableNotice: some View {
        HStack(spacing: FinanceSpacing.sm) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(FinanceColors.statusWarning)
                .accessibilityHidden(true)
            Text(String(localized: "Biometric authentication is not available on this device. You can enable a passcode lock in Settings."))
                .font(FinanceTypography.caption)
                .foregroundStyle(FinanceColors.textSecondary)
        }
        .padding(FinanceSpacing.md)
        .background(
            FinanceColors.backgroundSecondary,
            in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.lg)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Biometric authentication is not available on this device.")
        )
    }
}

// MARK: - Get Started Page

/// Page 4: Summary and completion call-to-action.
private struct GetStartedPage: View {

    let reduceMotion: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 72
    @State private var showCheckmark = false

    var body: some View {
        VStack(spacing: FinanceSpacing.lg) {
            Spacer()

            ZStack {
                Circle()
                    .fill(FinanceColors.statusPositive.opacity(0.15))
                    .frame(width: iconSize * 1.5, height: iconSize * 1.5)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: iconSize))
                    .foregroundStyle(FinanceColors.statusPositive)
                    .symbolRenderingMode(.hierarchical)
                    .scaleEffect(showCheckmark ? 1.0 : 0.5)
                    .opacity(showCheckmark ? 1.0 : 0.0)
            }
            .accessibilityHidden(true)
            .onAppear {
                if reduceMotion {
                    showCheckmark = true
                } else {
                    withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                        showCheckmark = true
                    }
                }
            }

            Text(String(localized: "You're All Set!"))
                .font(FinanceTypography.display)
                .foregroundStyle(FinanceColors.textPrimary)
                .multilineTextAlignment(.center)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "Here's what you can do first:"))
                .font(FinanceTypography.body)
                .foregroundStyle(FinanceColors.textSecondary)
                .multilineTextAlignment(.center)

            VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
                SummaryRow(
                    icon: "plus.circle",
                    text: String(localized: "Add your first account")
                )
                SummaryRow(
                    icon: "arrow.left.arrow.right",
                    text: String(localized: "Record a transaction")
                )
                SummaryRow(
                    icon: "target",
                    text: String(localized: "Set a savings goal")
                )
            }
            .padding(FinanceSpacing.md)
            .background(
                FinanceColors.backgroundSecondary,
                in: RoundedRectangle(cornerRadius: FinanceSpacing.Radius.lg)
            )

            Spacer()
            Spacer()
        }
        .padding(.horizontal, FinanceSpacing.xl)
    }
}

// MARK: - Summary Row

/// A single summary item on the "Get Started" page.
private struct SummaryRow: View {

    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: FinanceSpacing.sm) {
            Image(systemName: icon)
                .foregroundStyle(FinanceColors.interactive)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            Text(text)
                .font(FinanceTypography.body)
                .foregroundStyle(FinanceColors.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview("Onboarding") {
    OnboardingView()
        .environment(BiometricAuthManager())
}
