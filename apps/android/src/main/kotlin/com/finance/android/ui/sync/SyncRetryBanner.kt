// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.sync

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

private val ErrorBg = Color(0xFFFDE8E8)
private val ErrorTxt = Color(0xFFC62828)

@Composable
fun SyncRetryBanner(isVisible: Boolean, errorMessage: String, isRetrying: Boolean, onRetry: () -> Unit, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = isVisible, enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(), exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(), label = "SyncRetryBanner", modifier = modifier) {
        Column(Modifier.fillMaxWidth().background(ErrorBg).padding(horizontal = 16.dp, vertical = 12.dp).semantics(mergeDescendants = true) { contentDescription = "Sync failed: $errorMessage"; liveRegion = LiveRegionMode.Assertive }) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.Warning, null, tint = ErrorTxt, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text(errorMessage, style = MaterialTheme.typography.bodySmall, color = ErrorTxt, modifier = Modifier.weight(1f))
            }
            if (isRetrying) { Spacer(Modifier.height(8.dp)); LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Retrying sync" }) }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onDismiss, modifier = Modifier.semantics { contentDescription = "Dismiss" }) { Text("Dismiss", color = ErrorTxt) }
                Spacer(Modifier.width(8.dp))
                Button(onClick = onRetry, enabled = !isRetrying, colors = ButtonDefaults.buttonColors(containerColor = ErrorTxt), modifier = Modifier.semantics { contentDescription = if (isRetrying) "Retrying" else "Retry sync" }) {
                    Icon(Icons.Outlined.Refresh, null, Modifier.size(16.dp)); Spacer(Modifier.width(4.dp)); Text("Retry")
                }
            }
        }
    }
}

@Composable
fun PendingChangesIndicator(pendingCount: Int, isOffline: Boolean, modifier: Modifier = Modifier) {
    if (pendingCount <= 0) return
    Row(modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer).padding(horizontal = 16.dp, vertical = 8.dp).semantics(mergeDescendants = true) { contentDescription = "$pendingCount changes pending"; liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
        Icon(if (isOffline) Icons.Outlined.CloudOff else Icons.Outlined.Refresh, null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(if (isOffline) "$pendingCount change${if (pendingCount > 1) "s" else ""} saved offline" else "$pendingCount change${if (pendingCount > 1) "s" else ""} syncing...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}