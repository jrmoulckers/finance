// ProgressRing.swift
// Finance
//
// Circular progress indicator used for budget utilization and goal tracking.

import SwiftUI

struct ProgressRing: View {
    let progress: Double
    let lineWidth: CGFloat
    let progressColor: Color
    let trackColor: Color
    let size: CGFloat
    let label: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        progress: Double,
        lineWidth: CGFloat = 8,
        progressColor: Color = .blue,
        trackColor: Color = .gray.opacity(0.2),
        size: CGFloat = 80,
        label: String? = nil
    ) {
        self.progress = min(max(progress, 0), 1)
        self.lineWidth = lineWidth
        self.progressColor = progressColor
        self.trackColor = trackColor
        self.size = size
        self.label = label
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(trackColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            Circle()
                .trim(from: 0, to: progress)
                .stroke(progressColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.6), value: progress)
            if let label {
                Text(label)
                    .font(.caption).fontWeight(.semibold).foregroundStyle(.primary)
                    .minimumScaleFactor(0.5).lineLimit(1)
            } else {
                Text(percentageText)
                    .font(.caption).fontWeight(.semibold).foregroundStyle(.primary)
                    .minimumScaleFactor(0.5).lineLimit(1)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityDescription)
        .accessibilityValue(percentageText)
    }

    private var percentageText: String {
        "\(Int((progress * 100).rounded()))%"
    }

    private var accessibilityDescription: String {
        if let label {
            return String(localized: "\(label), \(percentageText) complete")
        }
        return String(localized: "\(percentageText) complete")
    }
}

#Preview("25%") { ProgressRing(progress: 0.25, progressColor: .green) }
#Preview("75%") { ProgressRing(progress: 0.75, progressColor: .orange, size: 120) }
#Preview("100%") { ProgressRing(progress: 1.0, progressColor: .blue, label: "Done") }
