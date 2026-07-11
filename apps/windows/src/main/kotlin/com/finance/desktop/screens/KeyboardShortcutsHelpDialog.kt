// SPDX-License-Identifier: BUSL-1.1

// Multiple public declarations: ShortcutHelpEntry data class + KeyboardShortcutsHelpDialog composable
@file:Suppress("MatchingDeclarationName")

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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.components.KeyboardShortcut
import com.finance.desktop.components.ShortcutHandler
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
 * Prefix used by navigation shortcut descriptions registered in
 * `SidebarNavigation` — used to categorise entries in the help dialog.
 */
private const val NAV_PREFIX = "Navigate to "

/**
 * Formats a [KeyboardShortcut]'s key combination into a readable label such as
 * "Ctrl+Shift+N" or "Escape".
 */
fun formatShortcutKeys(shortcut: KeyboardShortcut): String {
    val parts = buildList {
        if (shortcut.ctrl) add("Ctrl")
        if (shortcut.shift) add("Shift")
        add(keyDisplayName(shortcut.key))
    }
    return parts.joinToString("+")
}

/**
 * Maps a Compose [Key] to a short, user-facing display name. Falls back to a
 * cleaned-up form of the key's default string for anything not explicitly
 * handled, so the list never renders raw internal identifiers.
 */
@Suppress("CyclomaticComplexMethod") // Exhaustive key-to-label mapping
fun keyDisplayName(key: Key): String = when (key) {
    Key.Zero -> "0"
    Key.One -> "1"
    Key.Two -> "2"
    Key.Three -> "3"
    Key.Four -> "4"
    Key.Five -> "5"
    Key.Six -> "6"
    Key.Seven -> "7"
    Key.Eight -> "8"
    Key.Nine -> "9"
    Key.A -> "A"
    Key.D -> "D"
    Key.F -> "F"
    Key.H -> "H"
    Key.I -> "I"
    Key.N -> "N"
    Key.Q -> "Q"
    Key.R -> "R"
    Key.T -> "T"
    Key.Escape -> "Escape"
    Key.Enter -> "Enter"
    Key.Spacebar -> "Space"
    Key.F1 -> "F1"
    Key.F2 -> "F2"
    else -> key.toString().substringAfterLast(' ').trimEnd(')')
}

/**
 * Builds the grouped help sections purely from the currently-registered
 * [shortcuts], so the dialog can never advertise a shortcut that isn't real and
 * automatically stays correct as bindings change (#3660).
 *
 * Navigation shortcuts (description prefixed with "Navigate to ") are grouped
 * separately from action/app shortcuts. Each section is sorted for stable,
 * scannable output.
 */
fun buildShortcutHelpSections(
    shortcuts: List<KeyboardShortcut>,
): List<Pair<String, List<ShortcutHelpEntry>>> {
    val (navigation, actions) = shortcuts
        .distinctBy { formatShortcutKeys(it) }
        .partition { it.description.startsWith(NAV_PREFIX) }

    val navEntries = navigation
        .map { ShortcutHelpEntry(formatShortcutKeys(it), "Go to " + it.description.removePrefix(NAV_PREFIX)) }
        .sortedBy { it.description }

    val actionEntries = actions
        .map { ShortcutHelpEntry(formatShortcutKeys(it), it.description) }
        .sortedBy { it.description }

    return buildList {
        if (navEntries.isNotEmpty()) add("Navigation" to navEntries)
        if (actionEntries.isNotEmpty()) add("Actions" to actionEntries)
    }
}

/**
 * Keyboard shortcuts reference dialog.
 *
 * The content is derived from [ShortcutHandler.allShortcuts] — the exact set of
 * shortcuts registered at runtime — rather than a hand-maintained list. This
 * guarantees every listed shortcut is real (no phantom entries) and that the
 * list stays accurate as navigation/global bindings change (#3660).
 *
 * Narrator: each shortcut entry reads as "keys: description". Section headings
 * are marked as headings. The dialog itself is announced with its purpose.
 *
 * @param shortcutHandler The active handler whose registered shortcuts drive the list.
 * @param onDismiss Callback to close the dialog.
 */
@Composable
fun KeyboardShortcutsHelpDialog(
    shortcutHandler: ShortcutHandler,
    onDismiss: () -> Unit,
) {
    val sections = remember(shortcutHandler.allShortcuts()) {
        buildShortcutHelpSections(shortcutHandler.allShortcuts())
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
