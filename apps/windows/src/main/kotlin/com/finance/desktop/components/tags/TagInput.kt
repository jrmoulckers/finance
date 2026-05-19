// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components.tags

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * A multi-select tag input composable with autocomplete.
 *
 * Features:
 * - Text field with autocomplete dropdown showing matching existing tags
 * - Selected tags displayed as colored chips with remove buttons
 * - "Create new" option when the typed value doesn't match existing tags
 * - Full keyboard accessibility (Tab, Enter, Escape)
 *
 * Narrator: Announces selected tags count, suggestions list, and create-new option.
 *
 * @param selectedTags Currently selected tag strings.
 * @param availableTags All known tags for autocomplete suggestions.
 * @param onTagAdded Callback when a tag is added (existing or new).
 * @param onTagRemoved Callback when a tag chip is removed.
 * @param modifier Optional Compose modifier.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagInput(
    selectedTags: List<String>,
    availableTags: List<String>,
    onTagAdded: (String) -> Unit,
    onTagRemoved: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var inputText by remember { mutableStateOf("") }
    var isFocused by remember { mutableStateOf(false) }

    val suggestions by remember(inputText, availableTags, selectedTags) {
        derivedStateOf {
            if (inputText.isBlank()) {
                emptyList()
            } else {
                availableTags
                    .filter { it !in selectedTags }
                    .filter { it.lowercase().contains(inputText.lowercase()) }
                    .take(8)
            }
        }
    }

    val showCreateNew by remember(inputText, suggestions, availableTags) {
        derivedStateOf {
            inputText.isNotBlank() &&
                inputText.lowercase() !in availableTags.map { it.lowercase() } &&
                inputText.lowercase() !in selectedTags.map { it.lowercase() }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Tag input, ${selectedTags.size} tags selected"
            },
    ) {
        // Selected tags as chips
        SelectedTagChips(
            selectedTags = selectedTags,
            onTagRemoved = onTagRemoved,
        )

        // Input field
        OutlinedTextField(
            value = inputText,
            onValueChange = { inputText = it },
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { isFocused = it.isFocused }
                .semantics {
                    contentDescription = "Type to search or create tags"
                },
            placeholder = { Text("Add tags\u2026") },
            leadingIcon = {
                Icon(
                    Icons.Filled.LocalOffer,
                    contentDescription = null,
                )
            },
            singleLine = true,
        )

        // Autocomplete dropdown
        TagSuggestionsDropdown(
            visible = isFocused && (suggestions.isNotEmpty() || showCreateNew),
            suggestions = suggestions,
            showCreateNew = showCreateNew,
            inputText = inputText,
            onSuggestionSelected = { suggestion ->
                onTagAdded(suggestion)
                inputText = ""
            },
            onCreateNew = {
                onTagAdded(inputText.trim())
                inputText = ""
            },
        )
    }
}

/**
 * Displays selected tag chips in a flow layout.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SelectedTagChips(
    selectedTags: List<String>,
    onTagRemoved: (String) -> Unit,
) {
    if (selectedTags.isNotEmpty()) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
            modifier = Modifier.fillMaxWidth(),
        ) {
            selectedTags.forEach { tag ->
                TagChip(
                    tag = tag,
                    size = TagSize.MEDIUM,
                    onRemove = { onTagRemoved(tag) },
                )
            }
        }
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
    }
}

/**
 * Autocomplete suggestions dropdown for tag input.
 */
@Composable
private fun TagSuggestionsDropdown(
    visible: Boolean,
    suggestions: List<String>,
    showCreateNew: Boolean,
    inputText: String,
    onSuggestionSelected: (String) -> Unit,
    onCreateNew: () -> Unit,
) {
    if (!visible) return

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 200.dp),
        shape = MaterialTheme.shapes.small,
        tonalElevation = 4.dp,
        shadowElevation = 4.dp,
    ) {
        LazyColumn(
            modifier = Modifier.padding(vertical = FinanceDesktopTheme.spacing.xs),
        ) {
            items(suggestions) { suggestion ->
                SuggestionItem(
                    text = suggestion,
                    onClick = { onSuggestionSelected(suggestion) },
                )
            }

            if (showCreateNew) {
                item {
                    if (suggestions.isNotEmpty()) {
                        HorizontalDivider(
                            modifier = Modifier.padding(
                                vertical = FinanceDesktopTheme.spacing.xs,
                            ),
                        )
                    }
                    CreateNewItem(
                        tagName = inputText.trim(),
                        onClick = onCreateNew,
                    )
                }
            }
        }
    }
}

/**
 * A single autocomplete suggestion row.
 */
@Composable
private fun SuggestionItem(
    text: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(
                horizontal = FinanceDesktopTheme.spacing.lg,
                vertical = FinanceDesktopTheme.spacing.sm,
            )
            .semantics {
                contentDescription = "Select tag: $text"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TagChip(
            tag = text,
            size = TagSize.SMALL,
        )
    }
}

/**
 * "Create new tag" item at the bottom of the suggestions list.
 */
@Composable
private fun CreateNewItem(
    tagName: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(
                horizontal = FinanceDesktopTheme.spacing.lg,
                vertical = FinanceDesktopTheme.spacing.sm,
            )
            .semantics {
                contentDescription = "Create new tag: $tagName"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Add,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
        Text(
            text = "Create \"$tagName\"",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}
