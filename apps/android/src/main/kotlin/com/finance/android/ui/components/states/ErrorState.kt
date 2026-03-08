// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components.states

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarData
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// ErrorSnackbar
// ---------------------------------------------------------------------------

/**
 * A Material 3 snackbar that displays an error [message] with an optional
 * **Retry** action.
 *
 * Usage: manage a [SnackbarHostState] at the screen level and place a
 * [SnackbarHost] in the [Scaffold]. Call [SnackbarHostState.showSnackbar]
 * to display the message; use this composable as the `snackbarHost` slot
 * to render the themed version.
 *
 * @param message The error message to display.
 * @param onRetry Callback invoked when the user taps **Retry**.
 * @param modifier Additional [Modifier].
 */
@Composable
fun ErrorSnackbar(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val hostState = remember { SnackbarHostState() }

    LaunchedEffect(message) {
        val result = hostState.showSnackbar(
            message = message,
            actionLabel = "Retry",
            duration = SnackbarDuration.Long,
        )
        if (result == SnackbarResult.ActionPerformed) {
            onRetry()
        }
    }

    SnackbarHost(
        hostState = hostState,
        modifier = modifier,
    ) { data: SnackbarData ->
        Snackbar(
            snackbarData = data,
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
            actionColor = MaterialTheme.colorScheme.onErrorContainer,
        )
    }
}

// ---------------------------------------------------------------------------
// NetworkErrorBanner
// ---------------------------------------------------------------------------

/**
 * A persistent banner indicating that the device is offline.
 *
 * Displays the message **"Working offline — changes sync when connected"**
 * so that users are not alarmed and understand their data is safe.
 *
 * @param modifier Additional [Modifier].
 */
@Composable
fun NetworkErrorBanner(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.secondaryContainer,
        tonalElevation = 2.dp,
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .semantics(mergeDescendants = true) {
                    contentDescription =
                        "Working offline. Changes will sync when connected."
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Outlined.CloudOff,
                contentDescription = null, // described by parent semantics
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Working offline — changes sync when connected",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

/**
 * Inline validation error text for form fields.
 *
 * @param field The name of the field with the error (used for accessibility).
 * @param message The human-readable error message.
 * @param modifier Additional [Modifier].
 */
@Composable
fun ValidationError(
    field: String,
    message: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
        modifier = modifier
            .padding(start = 16.dp, top = 4.dp)
            .semantics {
                contentDescription = "$field error: $message"
            },
    )
}

// ---------------------------------------------------------------------------
// SyncErrorDialog
// ---------------------------------------------------------------------------

/**
 * A dialog shown when a sync conflict is detected.
 *
 * Offers the user two choices:
 * - **Resolve** — attempt to merge or pick a resolution strategy.
 * - **Dismiss** — close the dialog and handle later.
 *
 * @param onResolve Called when the user taps **Resolve**.
 * @param onDismiss Called when the user taps **Dismiss** or taps outside.
 * @param modifier Additional [Modifier].
 */
@Composable
fun SyncErrorDialog(
    onResolve: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = modifier.semantics {
            contentDescription = "Sync conflict dialog"
        },
        title = {
            Text(
                text = "Sync conflict detected",
                style = MaterialTheme.typography.headlineSmall,
            )
        },
        text = {
            Text(
                text = "Some of your local changes conflict with data on the server. " +
                    "You can resolve the conflict now or dismiss and handle it later.",
                style = MaterialTheme.typography.bodyMedium,
            )
        },
        confirmButton = {
            TextButton(onClick = onResolve) {
                Text(text = "Resolve")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(text = "Dismiss")
            }
        },
    )
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(showBackground = true, name = "ErrorSnackbar")
@Composable
private fun ErrorSnackbarPreview() {
    MaterialTheme {
        ErrorSnackbar(
            message = "Failed to load transactions",
            onRetry = {},
        )
    }
}

@Preview(showBackground = true, name = "NetworkErrorBanner")
@Composable
private fun NetworkErrorBannerPreview() {
    MaterialTheme {
        NetworkErrorBanner()
    }
}

@Preview(showBackground = true, name = "ValidationError")
@Composable
private fun ValidationErrorPreview() {
    MaterialTheme {
        ValidationError(
            field = "Amount",
            message = "Amount must be greater than zero",
        )
    }
}

@Preview(showBackground = true, name = "SyncErrorDialog")
@Composable
private fun SyncErrorDialogPreview() {
    MaterialTheme {
        SyncErrorDialog(
            onResolve = {},
            onDismiss = {},
        )
    }
}
