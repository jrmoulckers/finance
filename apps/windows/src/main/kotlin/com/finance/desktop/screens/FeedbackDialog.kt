// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Type of feedback being submitted.
 */
enum class FeedbackType(val label: String) {
    BUG("Bug Report"),
    FEEDBACK("Feedback"),
    SUGGESTION("Suggestion"),
}

/**
 * Data captured when user submits feedback.
 *
 * @param type The kind of feedback (bug, feedback, suggestion).
 * @param description User-provided description text.
 * @param appVersion The current application version string.
 * @param osVersion Windows version info captured automatically.
 */
data class FeedbackSubmission(
    val type: FeedbackType,
    val description: String,
    val appVersion: String,
    val osVersion: String,
)

/**
 * Feedback / Report Bug dialog.
 *
 * Provides a type dropdown (Bug, Feedback, Suggestion), a multi-line
 * description field, and auto-captured context (app version, OS version).
 * Submitted feedback is stored locally for alpha builds.
 *
 * Accessible via Ctrl+Shift+F or the Help menu icon in the top bar.
 *
 * Narrator: type dropdown announces current selection; description field
 * has a label; system info is read-only and described.
 *
 * @param onDismiss Callback when the dialog is closed without submitting.
 * @param onSubmit Callback with the completed [FeedbackSubmission].
 * @param appVersion Current app version string (injected from build config).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("LongMethod") // Dialog with multiple form fields
fun FeedbackDialog(
    onDismiss: () -> Unit,
    onSubmit: (FeedbackSubmission) -> Unit,
    appVersion: String = "1.0.0",
) {
    var feedbackType by remember { mutableStateOf(FeedbackType.BUG) }
    var description by remember { mutableStateOf("") }
    var typeExpanded by remember { mutableStateOf(false) }

    val osVersion = remember {
        "${System.getProperty("os.name")} ${System.getProperty("os.version")}"
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Report Bug / Send Feedback",
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Feedback form. " +
                            "Select a type and describe your issue or suggestion."
                    },
            ) {
                // ── Type dropdown ──
                ExposedDropdownMenuBox(
                    expanded = typeExpanded,
                    onExpandedChange = { typeExpanded = it },
                    modifier = Modifier.semantics {
                        contentDescription = "Feedback type: ${feedbackType.label}"
                    },
                ) {
                    OutlinedTextField(
                        value = feedbackType.label,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Type") },
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable),
                    )
                    ExposedDropdownMenu(
                        expanded = typeExpanded,
                        onDismissRequest = { typeExpanded = false },
                    ) {
                        FeedbackType.entries.forEach { type ->
                            DropdownMenuItem(
                                text = { Text(type.label) },
                                onClick = {
                                    feedbackType = type
                                    typeExpanded = false
                                },
                                modifier = Modifier.semantics {
                                    contentDescription = "Set type to ${type.label}"
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Description field ──
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    placeholder = { Text("Describe the issue or suggestion…") },
                    minLines = 4,
                    maxLines = 8,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Feedback description. " +
                                "Describe the bug, feedback, or suggestion in detail."
                        },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // ── Auto-captured context ──
                Text(
                    text = "System Information (auto-captured)",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "App Version: $appVersion",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "App version $appVersion"
                    },
                )
                Text(
                    text = "OS: $osVersion",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Operating system $osVersion"
                    },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSubmit(
                        FeedbackSubmission(
                            type = feedbackType,
                            description = description,
                            appVersion = appVersion,
                            osVersion = osVersion,
                        ),
                    )
                },
                enabled = description.isNotBlank(),
            ) {
                Text("Submit")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
        modifier = Modifier
            .width(520.dp)
            .semantics {
                contentDescription = "Feedback dialog. " +
                    "Report a bug or send feedback. Press Escape to close."
            },
    )
}
