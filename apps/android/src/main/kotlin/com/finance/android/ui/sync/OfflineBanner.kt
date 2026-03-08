// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.sync

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Amber / yellow colour tokens used by [OfflineBanner].
 *
 * Material 3 does not ship a first-class amber role, so we define explicit
 * colours that work on both light and dark themes. When the project adopts
 * a full colour palette from design-tokens these can be replaced.
 */
private val BannerBackground = Color(0xFFFFF3E0) // Orange-50
private val BannerOnBackground = Color(0xFFE65100) // Orange-900
private val BannerIconTint = Color(0xFFF57C00) // Orange-700

/**
 * Persistent offline indicator displayed at the top of a screen.
 *
 * Uses a Material 3 banner pattern with an amber/yellow colour scheme.
 * The banner is dismissible but the caller should re-show it if the device
 * is still offline (by resetting [isDismissed] to `false`).
 *
 * TalkBack announces the banner when it appears thanks to the
 * [LiveRegionMode.Polite] semantics property.
 *
 * @param isOffline Whether the device is currently offline.
 * @param isDismissed Whether the user has dismissed this banner instance.
 * @param onDismiss Callback to set [isDismissed] = `true`.
 * @param modifier Optional [Modifier] for layout customisation.
 */
@Composable
fun OfflineBanner(
    isOffline: Boolean,
    isDismissed: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val visible = isOffline && !isDismissed

    // Force TalkBack to re-announce when banner reappears
    @Suppress("UNUSED_VARIABLE")
    val accessibilityManager = LocalAccessibilityManager.current

    AnimatedVisibility(
        visible = visible,
        enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
        exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
        label = "OfflineBannerVisibility",
        modifier = modifier,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Start,
            modifier = Modifier
                .fillMaxWidth()
                .background(BannerBackground)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .semantics(mergeDescendants = true) {
                    contentDescription =
                        "Working offline. Changes will sync when connected."
                    liveRegion = LiveRegionMode.Polite
                },
        ) {
            Icon(
                imageVector = Icons.Outlined.CloudOff,
                contentDescription = null,
                tint = BannerIconTint,
                modifier = Modifier.size(20.dp),
            )

            Spacer(modifier = Modifier.width(12.dp))

            Text(
                text = "Working offline — changes will sync when connected",
                style = MaterialTheme.typography.bodySmall,
                color = BannerOnBackground,
                modifier = Modifier.weight(1f),
            )

            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .size(32.dp)
                    .semantics {
                        contentDescription = "Dismiss offline banner"
                    },
            ) {
                Icon(
                    imageVector = Icons.Outlined.Close,
                    contentDescription = null,
                    tint = BannerOnBackground,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(name = "Visible", showBackground = true)
@Composable
private fun OfflineBannerVisiblePreview() {
    MaterialTheme {
        OfflineBanner(
            isOffline = true,
            isDismissed = false,
            onDismiss = {},
        )
    }
}

@Preview(name = "Dismissed", showBackground = true)
@Composable
private fun OfflineBannerDismissedPreview() {
    MaterialTheme {
        OfflineBanner(
            isOffline = true,
            isDismissed = true,
            onDismiss = {},
        )
    }
}

@Preview(name = "Online (hidden)", showBackground = true)
@Composable
private fun OfflineBannerOnlinePreview() {
    MaterialTheme {
        OfflineBanner(
            isOffline = false,
            isDismissed = false,
            onDismiss = {},
        )
    }
}
