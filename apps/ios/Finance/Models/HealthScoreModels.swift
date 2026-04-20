// SPDX-License-Identifier: BUSL-1.1

// HealthScoreModels.swift
// Finance
//
// Data models for financial health score calculation and benchmarking.
// Computes a composite score from savings rate, budget adherence,
// debt ratio, emergency fund coverage, and goal progress.
//
// References: #299

import SwiftUI

// MARK: - Health Score

/// Composite financial health score with component breakdowns.
struct FinancialHealthScore: Sendable {
    /// Overall score (0–100).
    let overallScore: Int
    /// Individual component scores.
    let components: [HealthScoreComponent]
    /// Actionable tips to improve the score.
    let tips: [HealthTip]
    /// Benchmark comparison data.
    let benchmark: HealthBenchmark
    /// Grade derived from the overall score.
    var grade: HealthGrade { HealthGrade.from(score: overallScore) }
}

// MARK: - Score Component

/// An individual factor contributing to the overall health score.
struct HealthScoreComponent: Identifiable, Sendable {
    let id: String
    let name: String
    let score: Int
    let maxScore: Int
    let weight: Double
    let description: String
    let systemImage: String

    /// Percentage of max score achieved.
    var percentage: Double {
        guard maxScore > 0 else { return 0 }
        return Double(score) / Double(maxScore) * 100
    }

    /// Color indicating component health.
    var color: Color {
        let pct = percentage
        if pct >= 80 { return .green }
        if pct >= 60 { return .yellow }
        if pct >= 40 { return .orange }
        return .red
    }
}

// MARK: - Health Grade

/// Letter grade representation of the health score.
enum HealthGrade: String, Sendable {
    case aPlus = "A+"
    case a = "A"
    case bPlus = "B+"
    case b = "B"
    case cPlus = "C+"
    case c = "C"
    case d = "D"
    case f = "F"

    var color: Color {
        switch self {
        case .aPlus, .a: .green
        case .bPlus, .b: .blue
        case .cPlus, .c: .yellow
        case .d: .orange
        case .f: .red
        }
    }

    var description: String {
        switch self {
        case .aPlus: String(localized: "Excellent financial health")
        case .a: String(localized: "Very strong financial position")
        case .bPlus: String(localized: "Good financial habits")
        case .b: String(localized: "Solid financial foundation")
        case .cPlus: String(localized: "Average financial health")
        case .c: String(localized: "Room for improvement")
        case .d: String(localized: "Needs significant attention")
        case .f: String(localized: "Financial health at risk")
        }
    }

    static func from(score: Int) -> HealthGrade {
        switch score {
        case 95...100: .aPlus
        case 85..<95: .a
        case 78..<85: .bPlus
        case 70..<78: .b
        case 63..<70: .cPlus
        case 55..<63: .c
        case 40..<55: .d
        default: .f
        }
    }
}

// MARK: - Health Tip

/// An actionable recommendation to improve financial health.
struct HealthTip: Identifiable, Sendable {
    let id = UUID()
    let title: String
    let description: String
    let impact: TipImpact
    let systemImage: String
}

/// Expected impact of following a health tip.
enum TipImpact: String, Sendable {
    case low, medium, high

    var displayName: String {
        switch self {
        case .low: String(localized: "Low Impact")
        case .medium: String(localized: "Medium Impact")
        case .high: String(localized: "High Impact")
        }
    }

    var color: Color {
        switch self {
        case .low: .secondary
        case .medium: .blue
        case .high: .green
        }
    }
}

// MARK: - Benchmark

/// Benchmark comparison data showing how the user compares to peers.
struct HealthBenchmark: Sendable {
    /// User's percentile ranking (0–100).
    let percentile: Int
    /// Average score for the benchmark group.
    let averageScore: Int
    /// Median score for the benchmark group.
    let medianScore: Int
    /// Label describing the benchmark group.
    let groupLabel: String
}

// MARK: - Score History

/// A historical snapshot of the health score.
struct HealthScoreSnapshot: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    let score: Int
}
