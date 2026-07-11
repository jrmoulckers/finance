// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("MatchingDeclarationName") // File hosts several list-state composables

package com.finance.desktop.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Full-screen error state with a human-readable message and a Retry action
 * (#3685). Screens should render this when a repository load fails, instead of
 * leaving a permanent spinner or a misleading empty state.
 *
 * The message is exposed as a polite live region so Narrator announces the
 * failure, and the Retry button is keyboard reachable and labeled.
 *
 * @param message Human-readable description of what went wrong.
 * @param onRetry Invoked when the user activates Retry; should re-trigger the load.
 * @param title Short heading shown above the message.
 */
@Composable
fun ListErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    title: String = "Something went wrong",
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = "$title. $message"
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(FinanceDesktopTheme.spacing.xxl),
        ) {
            Icon(
                imageVector = Icons.Filled.ErrorOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(56.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xl))
            Button(
                onClick = onRetry,
                modifier = Modifier.semantics { contentDescription = "Retry loading" },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.height(0.dp))
                Text(
                    text = "Retry",
                    modifier = Modifier.padding(start = FinanceDesktopTheme.spacing.sm),
                )
            }
        }
    }
}

/**
 * Full-screen empty state with an optional primary call-to-action (#3677).
 *
 * Empty list screens are dead-ends without a way forward; providing a primary
 * CTA (e.g. "Create goal") makes the primary task discoverable on first run.
 *
 * @param icon Decorative illustration icon.
 * @param title Short heading (e.g. "No savings goals yet").
 * @param message Supporting sentence describing what to do.
 * @param ctaLabel Label for the primary action button; when null no CTA renders.
 * @param onCta Invoked when the CTA is activated.
 * @param ctaIcon Leading icon for the CTA button.
 */
@Composable
fun ListEmptyState(
    icon: ImageVector,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    ctaLabel: String? = null,
    onCta: () -> Unit = {},
    ctaIcon: ImageVector = Icons.Filled.Add,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(FinanceDesktopTheme.spacing.xxl),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { contentDescription = title },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            if (ctaLabel != null) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xl))
                Button(
                    onClick = onCta,
                    modifier = Modifier.semantics { contentDescription = ctaLabel },
                ) {
                    Icon(ctaIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        text = ctaLabel,
                        modifier = Modifier.padding(start = FinanceDesktopTheme.spacing.sm),
                    )
                }
            }
        }
    }
}
