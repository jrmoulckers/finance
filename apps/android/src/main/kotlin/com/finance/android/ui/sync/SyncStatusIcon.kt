package com.finance.android.ui.sync

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Possible visual states for the sync status indicator.
 *
 * Maps directly to the [com.finance.sync.SyncStatus] sealed class from the
 * shared KMP sync module, but decoupled for UI-level concerns (icon, label).
 */
enum class SyncIconState {
    SYNCED,
    SYNCING,
    OFFLINE,
    ERROR,
}

/**
 * Top-bar sync status indicator icon.
 *
 * Displays an animated Material icon representing the current sync state
 * and navigates to the [SyncStatusScreen] on tap.
 *
 * @param state The current sync state to visualise.
 * @param onClick Callback invoked when the icon is tapped (typically navigates
 *   to the sync detail screen).
 * @param modifier Optional [Modifier] for layout customisation.
 */
@Composable
fun SyncStatusIcon(
    state: SyncIconState,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accessibilityLabel = when (state) {
        SyncIconState.SYNCED -> "Sync status: synced"
        SyncIconState.SYNCING -> "Sync status: syncing"
        SyncIconState.OFFLINE -> "Sync status: offline"
        SyncIconState.ERROR -> "Sync status: error"
    }

    IconButton(
        onClick = onClick,
        modifier = modifier.semantics {
            contentDescription = accessibilityLabel
        },
    ) {
        AnimatedContent(
            targetState = state,
            transitionSpec = {
                fadeIn(animationSpec = tween(durationMillis = 300)) togetherWith
                    fadeOut(animationSpec = tween(durationMillis = 300))
            },
            label = "SyncIconTransition",
        ) { targetState ->
            when (targetState) {
                SyncIconState.SYNCING -> SyncingIcon()
                else -> StaticSyncIcon(state = targetState)
            }
        }
    }
}

/**
 * Continuously rotating cloud-sync icon shown while a sync cycle is active.
 */
@Composable
private fun SyncingIcon() {
    val infiniteTransition = rememberInfiniteTransition(label = "SyncRotation")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "SyncIconRotation",
    )

    Icon(
        imageVector = Icons.Outlined.CloudSync,
        contentDescription = null, // parent IconButton carries the semantics
        tint = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .size(24.dp)
            .rotate(rotation),
    )
}

/**
 * Non-animated sync icon for synced, offline, and error states.
 */
@Composable
private fun StaticSyncIcon(state: SyncIconState) {
    val (icon: ImageVector, tint) = when (state) {
        SyncIconState.SYNCED -> Icons.Outlined.CloudDone to MaterialTheme.colorScheme.primary
        SyncIconState.OFFLINE -> Icons.Outlined.CloudOff to MaterialTheme.colorScheme.onSurfaceVariant
        SyncIconState.ERROR -> Icons.Outlined.Cloud to MaterialTheme.colorScheme.error
        SyncIconState.SYNCING -> Icons.Outlined.CloudSync to MaterialTheme.colorScheme.primary
    }

    Icon(
        imageVector = icon,
        contentDescription = null, // parent IconButton carries the semantics
        tint = tint,
        modifier = Modifier.size(24.dp),
    )
}

// region Previews

@Preview(name = "Synced", showBackground = true)
@Composable
private fun SyncStatusIconSyncedPreview() {
    MaterialTheme {
        SyncStatusIcon(
            state = SyncIconState.SYNCED,
            onClick = {},
        )
    }
}

@Preview(name = "Syncing", showBackground = true)
@Composable
private fun SyncStatusIconSyncingPreview() {
    MaterialTheme {
        SyncStatusIcon(
            state = SyncIconState.SYNCING,
            onClick = {},
        )
    }
}

@Preview(name = "Offline", showBackground = true)
@Composable
private fun SyncStatusIconOfflinePreview() {
    MaterialTheme {
        SyncStatusIcon(
            state = SyncIconState.OFFLINE,
            onClick = {},
        )
    }
}

@Preview(name = "Error", showBackground = true)
@Composable
private fun SyncStatusIconErrorPreview() {
    MaterialTheme {
        SyncStatusIcon(
            state = SyncIconState.ERROR,
            onClick = {},
        )
    }
}

// endregion
