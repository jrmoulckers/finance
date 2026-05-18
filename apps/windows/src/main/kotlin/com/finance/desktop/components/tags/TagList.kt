// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components.tags

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Displays a list of tags as colored chips.
 *
 * Used in transaction list items (showing first 1-2 tags) and in detail views
 * (showing all tags). The [maxVisible] parameter controls how many are shown
 * before truncating with a "+N more" indicator.
 *
 * @param tags The full list of tag strings.
 * @param size The chip size variant.
 * @param maxVisible Maximum number of tags to display before truncating. Null = show all.
 * @param onRemove Optional callback for tag removal (null hides remove buttons).
 * @param modifier Optional Compose modifier.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagList(
    tags: List<String>,
    size: TagSize = TagSize.MEDIUM,
    maxVisible: Int? = null,
    onRemove: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    if (tags.isEmpty()) return

    val visibleTags = if (maxVisible != null) tags.take(maxVisible) else tags
    val hiddenCount = if (maxVisible != null) (tags.size - maxVisible).coerceAtLeast(0) else 0

    FlowRow(
        modifier = modifier.semantics {
            contentDescription = "${tags.size} tags: ${tags.joinToString(", ")}"
        },
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
    ) {
        visibleTags.forEach { tag ->
            TagChip(
                tag = tag,
                size = size,
                onRemove = if (onRemove != null) {
                    { onRemove(tag) }
                } else {
                    null
                },
            )
        }

        if (hiddenCount > 0) {
            TagChip(
                tag = "+$hiddenCount more",
                size = size,
            )
        }
    }
}
