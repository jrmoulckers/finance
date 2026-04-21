// SPDX-License-Identifier: BUSL-1.1

// AchievementsView.swift
// Finance
//
// Gamification screen showing achievements, badges, streaks, level
// progress, and milestone tracking.
//
// Uses @Observable, Swift haptics, and full accessibility support.
//
// References: #242

import SwiftUI

struct AchievementsView: View {
    @State private var viewModel = GamificationViewModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 20) {
                    profileHeader
                    streakSection
                    categoryFilter
                    achievementsGrid
                }
                .padding()
            }
            .navigationTitle(String(localized: "Achievements"))
            .task {
                await viewModel.loadProfile()
            }
            .refreshable {
                await viewModel.loadProfile()
            }
            .overlay {
                if viewModel.showUnlockAnimation, let achievement = viewModel.newlyUnlocked {
                    achievementUnlockOverlay(achievement)
                }
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

    // MARK: - Profile Header

    private var profileHeader: some View {
        VStack(spacing: 16) {
            // Level badge
            ZStack {
                Circle()
                    .fill(FinanceColors.interactive.gradient)
                    .frame(width: 80, height: 80)

                Text("\(viewModel.profile.level)")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
            }
            .accessibilityHidden(true)

            Text(String(localized: "Level \(viewModel.profile.level)"))
                .font(.title2)
                .fontWeight(.bold)

            // Points and progress
            VStack(spacing: 8) {
                ProgressView(value: viewModel.profile.levelProgress) {
                    HStack {
                        Text(String(localized: "\(viewModel.profile.totalPoints) points"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(String(localized: "\(viewModel.profile.pointsForNextLevel) to next level"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(FinanceColors.interactive)
            }

            // Stats row
            HStack(spacing: 24) {
                statPill(
                    value: "\(viewModel.profile.unlockedAchievements.count)",
                    label: String(localized: "Unlocked")
                )
                statPill(
                    value: String(format: "%.0f%%", viewModel.completionPercent),
                    label: String(localized: "Complete")
                )
                statPill(
                    value: "\(viewModel.profile.streak.currentDays)",
                    label: String(localized: "Day Streak")
                )
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.06), radius: 4, y: 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Level \(viewModel.profile.level), \(viewModel.profile.totalPoints) points, \(viewModel.profile.unlockedAchievements.count) achievements unlocked, \(viewModel.profile.streak.currentDays) day streak")
        )
    }

    private func statPill(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.headline)
                .fontWeight(.bold)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: - Streak Section

    private var streakSection: some View {
        HStack(spacing: 16) {
            Image(systemName: "flame.fill")
                .font(.title2)
                .foregroundStyle(
                    viewModel.profile.streak.currentDays > 0
                        ? FinanceColors.statusWarning
                        : .secondary
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "Current Streak"))
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(String(localized: "\(viewModel.profile.streak.currentDays) days"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(String(localized: "Best"))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(String(localized: "\(viewModel.profile.streak.longestDays) days"))
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Streak: \(viewModel.profile.streak.currentDays) days current, \(viewModel.profile.streak.longestDays) days best")
        )
    }

    // MARK: - Category Filter

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(
                    label: String(localized: "All"),
                    isSelected: viewModel.selectedCategory == nil
                ) {
                    viewModel.selectedCategory = nil
                }

                ForEach(AchievementCategory.allCases, id: \.self) { category in
                    filterChip(
                        label: category.displayName,
                        icon: category.systemImage,
                        isSelected: viewModel.selectedCategory == category
                    ) {
                        viewModel.selectedCategory = category
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .accessibilityLabel(String(localized: "Achievement category filter"))
    }

    private func filterChip(
        label: String,
        icon: String? = nil,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption2)
                }
                Text(label)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? FinanceColors.interactive : FinanceColors.backgroundSecondary)
            .foregroundStyle(isSelected ? .white : FinanceColors.textPrimary)
            .clipShape(Capsule())
        }
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Achievements Grid

    private var achievementsGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: 12) {
            ForEach(viewModel.filteredAchievements) { achievement in
                achievementCard(achievement)
            }
        }
    }

    private func achievementCard(_ achievement: Achievement) -> some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(
                        achievement.isUnlocked
                            ? achievement.tier.color.gradient
                            : Color.secondary.opacity(0.2).gradient
                    )
                    .frame(width: 56, height: 56)

                Image(systemName: achievement.systemImage)
                    .font(.title3)
                    .foregroundStyle(
                        achievement.isUnlocked ? .white : .secondary
                    )
            }
            .accessibilityHidden(true)

            Text(achievement.title)
                .font(.caption)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            Text(achievement.description)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            if !achievement.isUnlocked {
                ProgressView(value: achievement.progress)
                    .tint(achievement.category.color)

                Text(String(localized: "\(achievement.currentCount)/\(achievement.requiredCount)"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption2)
                    Text(achievement.tier.displayName)
                        .font(.caption2)
                        .fontWeight(.medium)
                }
                .foregroundStyle(achievement.tier.color)
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
        .opacity(achievement.isUnlocked ? 1.0 : 0.7)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            achievement.isUnlocked
                ? String(localized: "\(achievement.title), unlocked, \(achievement.tier.displayName) tier")
                : String(localized: "\(achievement.title), locked, \(achievement.currentCount) of \(achievement.requiredCount) complete")
        )
        .accessibilityHint(achievement.description)
    }

    // MARK: - Unlock Overlay

    private func achievementUnlockOverlay(_ achievement: Achievement) -> some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture {
                    viewModel.showUnlockAnimation = false
                }

            VStack(spacing: 20) {
                Image(systemName: "trophy.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(achievement.tier.color)

                Text(String(localized: "Achievement Unlocked!"))
                    .font(.title2)
                    .fontWeight(.bold)

                Text(achievement.title)
                    .font(.headline)

                Text(achievement.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Text(String(localized: "+\(achievement.tier.points) points"))
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundStyle(FinanceColors.interactive)

                Button(String(localized: "Awesome!")) {
                    viewModel.showUnlockAnimation = false
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel(String(localized: "Dismiss achievement notification"))
            }
            .padding(32)
            .background(FinanceColors.backgroundElevated)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(radius: 20)
            .padding(40)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "Achievement unlocked: \(achievement.title). \(achievement.description). Plus \(achievement.tier.points) points.")
        )
        .accessibilityAddTraits(.isModal)
    }
}

// MARK: - Preview

#Preview("Achievements") {
    AchievementsView()
}
