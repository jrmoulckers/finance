// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * A single keyboard shortcut entry for display in the help dialog.
 *
 * @param keys Human-readable key combination (e.g., "Ctrl+N").
 * @param description What the shortcut does.
 */
data class ShortcutHelpEntry(
    val keys: String,
    val description: String,
)

/**
 * Keyboard shortcuts reference dialog.
 *
 * Shows all available keyboard shortcuts grouped by category.
 * Accessible via F1 or Ctrl+? (Ctrl+Shift+/).
 *
 * Narrator: each shortcut entry reads as "keys: description".
 * Section headings are marked as headings. The dialog itself
 * is announced with its purpose.
 *
 * @param onDismiss Callback to close the dialog.
 */
@Composable
fun KeyboardShortcutsHelpDialog(onDismiss: () -> Unit) {
    val sections = remember {
        listOf(
            "Navigation" to listOf(
                ShortcutHelpEntry("Ctrl+1", "Go to Dashboard"),
                ShortcutHelpEntry("Ctrl+2", "Go to Accounts"),
                ShortcutHelpEntry("Ctrl+3", "Go to Transactions"),
                ShortcutHelpEntry("Ctrl+4", "Go to Budgets"),
                ShortcutHelpEntry("Ctrl+5", "Go to Goals"),
            ),
            "Actions" to listOf(
                ShortcutHelpEntry("Ctrl+Shift+N", "New transaction"),
                ShortcutHelpEntry("Ctrl+F", "Focus search"),
                ShortcutHelpEntry("/", "Focus search (alternative)"),
                ShortcutHelpEntry("Delete", "Delete selected item"),
                ShortcutHelpEntry("Enter", "Open selected item"),
                ShortcutHelpEntry("Escape", "Close dialog / go back"),
            ),
            "App" to listOf(
                ShortcutHelpEntry("F1", "Show keyboard shortcuts"),
                ShortcutHelpEntry("Ctrl+Shift+F", "Report bug / send feedback"),
                ShortcutHelpEntry("Ctrl+Shift+V", "Voice transaction entry"),
            ),
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Keyboard Shortcuts",
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(420.dp)
                    .semantics {
                        contentDescription = "Keyboard shortcuts reference list"
                    },
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                sections.forEach { (sectionTitle, entries) ->
                    item {
                        Text(
                            text = sectionTitle,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .padding(top = FinanceDesktopTheme.spacing.md)
                                .semantics { heading() },
                        )
                    }
                    items(entries) { entry ->
                        ShortcutRow(entry)
                    }
                    item {
                        HorizontalDivider(
                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
        modifier = Modifier
            .width(520.dp)
            .semantics {
                contentDescription = "Keyboard shortcuts help dialog. " +
                    "Lists all available keyboard shortcuts. Press Escape to close."
            },
    )
}

/**
 * A single row displaying a keyboard shortcut and its description.
 */
@Composable
private fun ShortcutRow(entry: ShortcutHelpEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .semantics {
                contentDescription = "${entry.keys}: ${entry.description}"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = entry.description,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Surface(
            shape = RoundedCornerShape(4.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
        ) {
            Text(
                text = entry.keys,
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}
