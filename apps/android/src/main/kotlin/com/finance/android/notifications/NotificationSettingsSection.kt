// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Notification settings section for the Settings screen.
 *
 * Displays each [NotificationType] as an opt-in toggle with clear
 * descriptions. All toggles default to off — the user must actively
 * choose to enable notifications.
 *
 * Design principles:
 * - No pre-checked toggles or "enable all" dark patterns
 * - Clear description of what each notification contains
 * - Each toggle has full TalkBack semantics
 *
 * @param viewModel The [NotificationSettingsViewModel] providing state.
 * @param modifier Modifier applied to the section container.
 */
@Composable
fun NotificationSettingsSection(
    viewModel: NotificationSettingsViewModel,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()

    NotificationSettingsSectionContent(
        state = state,
        onToggle = { type, enabled ->
            viewModel.setNotificationEnabled(type, enabled)
        },
        modifier = modifier,
    )
}

/**
 * Stateless notification settings content — useful for previews and testing.
 */
@Composable
fun NotificationSettingsSectionContent(
    state: NotificationSettingsUiState,
    onToggle: (NotificationType, Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = "Notifications",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .padding(bottom = 8.dp)
                .semantics { heading() },
        )

        Text(
            text = "Choose which updates you'd like to receive. All are optional.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .padding(bottom = 16.dp)
                .semantics {
                    contentDescription = "Choose which updates you'd like to receive. All are optional."
                },
        )

        NotificationToggleCard(
            type = NotificationType.DAILY_SNAPSHOT,
            isEnabled = state.dailySnapshotEnabled,
            onToggle = { enabled -> onToggle(NotificationType.DAILY_SNAPSHOT, enabled) },
        )

        Spacer(modifier = Modifier.height(8.dp))

        NotificationToggleCard(
            type = NotificationType.WEEKLY_INSIGHT,
            isEnabled = state.weeklyInsightEnabled,
            onToggle = { enabled -> onToggle(NotificationType.WEEKLY_INSIGHT, enabled) },
        )

        Spacer(modifier = Modifier.height(8.dp))

        NotificationToggleCard(
            type = NotificationType.MONTHLY_REFLECTION,
            isEnabled = state.monthlyReflectionEnabled,
            onToggle = { enabled -> onToggle(NotificationType.MONTHLY_REFLECTION, enabled) },
        )
    }
}

/**
 * A single notification type toggle card.
 *
 * Shows the notification name, description, and an opt-in switch.
 */
@Composable
private fun NotificationToggleCard(
    type: NotificationType,
    isEnabled: Boolean,
    onToggle: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    text = type.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.semantics {
                        contentDescription = type.displayName
                    },
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = type.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = type.description
                    },
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Switch(
                checked = isEnabled,
                onCheckedChange = onToggle,
                modifier = Modifier.semantics {
                    contentDescription = "${type.displayName} notifications"
                    stateDescription = if (isEnabled) "Enabled" else "Disabled"
                },
            )
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Notifications — All Off (default)")
@Composable
private fun NotificationSettingsAllOffPreview() {
    MaterialTheme {
        NotificationSettingsSectionContent(
            state = NotificationSettingsUiState(),
            onToggle = { _, _ -> },
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Notifications — Mixed")
@Composable
private fun NotificationSettingsMixedPreview() {
    MaterialTheme {
        NotificationSettingsSectionContent(
            state = NotificationSettingsUiState(
                dailySnapshotEnabled = true,
                weeklyInsightEnabled = false,
                monthlyReflectionEnabled = true,
            ),
            onToggle = { _, _ -> },
            modifier = Modifier.padding(16.dp),
        )
    }
}
