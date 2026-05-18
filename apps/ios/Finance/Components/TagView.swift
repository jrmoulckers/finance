// SPDX-License-Identifier: BUSL-1.1

// TagView.swift
// Finance
// References: #1487
//
// A capsule-shaped chip for displaying tags with deterministic color coding.
// Supports subtags (e.g., "travel:flights" displayed as "travel › flights").

import SwiftUI

// MARK: - Tag Model

/// Represents a single tag that can be attached to a transaction.
struct Tag: Identifiable, Hashable, Sendable {
    let id: String
    let name: String

    /// Returns the display name with subtag separator rendered as " › ".
    var displayName: String {
        name.replacingOccurrences(of: ":", with: " › ")
    }

    /// The parent portion of the tag (before ":"), or the full name if no subtag.
    var parentName: String {
        if let colonIndex = name.firstIndex(of: ":") {
            return String(name[name.startIndex..<colonIndex])
        }
        return name
    }

    /// The child portion of the tag (after ":"), or nil if no subtag.
    var childName: String? {
        guard let colonIndex = name.firstIndex(of: ":") else { return nil }
        let afterColon = name.index(after: colonIndex)
        guard afterColon < name.endIndex else { return nil }
        return String(name[afterColon...])
    }

    /// Deterministic color derived from the tag name hash.
    /// Uses a curated palette that works well in both light and dark mode.
    var color: Color {
        let palette: [Color] = [
            .blue, .purple, .pink, .orange, .teal,
            .indigo, .mint, .cyan, .brown, .green,
        ]
        let hash = abs(name.hashValue)
        return palette[hash % palette.count]
    }

    init(id: String = UUID().uuidString, name: String) {
        self.id = id
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

// MARK: - TagView

/// Displays a single tag as a capsule-shaped chip with colored background.
struct TagView: View {
    let tag: Tag
    var isRemovable: Bool = false
    var onTap: (() -> Void)?
    var onRemove: (() -> Void)?

    var body: some View {
        HStack(spacing: 4) {
            if tag.childName != nil {
                Text(tag.parentName)
                    .fontWeight(.medium)
                Image(systemName: "chevron.right")
                    .font(.system(size: 8, weight: .bold))
                Text(tag.childName ?? "")
            } else {
                Text(tag.name)
                    .fontWeight(.medium)
            }

            if isRemovable {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.primary.opacity(0.7))
                    .accessibilityLabel(String(localized: "Remove tag"))
            }
        }
        .font(.caption)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(.white)
        .background(tag.color.opacity(0.85), in: Capsule())
        .contentShape(Capsule())
        .onTapGesture {
            if isRemovable {
                onRemove?()
            } else {
                onTap?()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(tagAccessibilityLabel)
        .accessibilityHint(tagAccessibilityHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityRemoveTraits(.isImage)
    }

    private var tagAccessibilityLabel: String {
        if tag.childName != nil {
            return String(localized: "Tag: \(tag.parentName), \(tag.childName ?? "")")
        }
        return String(localized: "Tag: \(tag.name)")
    }

    private var tagAccessibilityHint: String {
        if isRemovable {
            return String(localized: "Tap to remove this tag")
        }
        return String(localized: "Tap to filter by this tag")
    }
}

// MARK: - TagsRow

/// Displays a horizontal row of tag chips, limited to a maximum count with overflow indicator.
struct TagsRow: View {
    let tags: [Tag]
    var maxVisible: Int = 2
    var onTagTap: ((Tag) -> Void)?

    var body: some View {
        if tags.isEmpty { EmptyView() } else {
            HStack(spacing: 4) {
                ForEach(Array(tags.prefix(maxVisible))) { tag in
                    TagView(tag: tag, onTap: { onTagTap?(tag) })
                }
                if tags.count > maxVisible {
                    Text("+\(tags.count - maxVisible)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.quaternary, in: Capsule())
                        .accessibilityLabel(String(localized: "\(tags.count - maxVisible) more tags"))
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Single Tag") {
    VStack(spacing: 12) {
        TagView(tag: Tag(name: "groceries"))
        TagView(tag: Tag(name: "travel:flights"))
        TagView(tag: Tag(name: "subscriptions"), isRemovable: true)
        TagView(tag: Tag(name: "work:expenses"))
    }
    .padding()
}

#Preview("Tags Row") {
    TagsRow(tags: [
        Tag(name: "groceries"),
        Tag(name: "travel:flights"),
        Tag(name: "essential"),
    ], maxVisible: 2)
    .padding()
}
