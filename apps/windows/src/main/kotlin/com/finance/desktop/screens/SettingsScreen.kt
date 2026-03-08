// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ColorLens
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import com.finance.desktop.theme.FinanceDesktopTheme

// =============================================================================
// Settings Screen — Form-style layout
// =============================================================================

/**
 * Form-style settings screen for the desktop Finance application.
 *
 * Groups settings into labelled sections:
 * - **Appearance**: Dark mode, accent color, language
 * - **Security**: Windows Hello toggle, auto-lock
 * - **Notifications**: Desktop notification toggles
 * - **Data & Sync**: Currency, sync, export
 * - **About**: Version info
 *
 * Each setting row carries a semantic content description for Narrator.
 * Right-click context menus on dropdowns offer "Reset to default".
 */
@Composable
fun SettingsScreen(modifier: Modifier = Modifier) {
    // Local state for toggles/dropdowns (UI-layer placeholders)
    var darkMode by remember { mutableStateOf(false) }
    var windowsHello by remember { mutableStateOf(true) }
    var autoLock by remember { mutableStateOf(true) }
    var budgetNotifications by remember { mutableStateOf(true) }
    var goalNotifications by remember { mutableStateOf(true) }
    var syncEnabled by remember { mutableStateOf(true) }
    var selectedCurrency by remember { mutableStateOf("USD") }
    var selectedLanguage by remember { mutableStateOf("English") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .verticalScroll(rememberScrollState())
            .semantics { contentDescription = "Settings screen" },
    ) {
        Text(
            text = "Settings",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Settings heading"
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Appearance ──────────────────────────────────────────────
        SettingsSection("Appearance") {
            ToggleSetting(
                icon = Icons.Filled.DarkMode,
                label = "Dark Mode",
                description = "Use dark color scheme",
                checked = darkMode,
                onCheckedChange = { darkMode = it },
            )
            DropdownSetting(
                icon = Icons.Filled.Language,
                label = "Language",
                currentValue = selectedLanguage,
                options = listOf("English", "Spanish", "French", "German", "Japanese"),
                onValueChange = { selectedLanguage = it },
            )
            DropdownSetting(
                icon = Icons.Filled.ColorLens,
                label = "Accent Color",
                currentValue = "Blue",
                options = listOf("Blue", "Teal", "Purple", "Green", "Orange"),
                onValueChange = { /* update accent */ },
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Security ────────────────────────────────────────────────
        SettingsSection("Security") {
            ToggleSetting(
                icon = Icons.Filled.Fingerprint,
                label = "Windows Hello",
                description = "Use biometric or PIN authentication",
                checked = windowsHello,
                onCheckedChange = { windowsHello = it },
            )
            ToggleSetting(
                icon = Icons.Filled.Lock,
                label = "Auto-Lock",
                description = "Lock app after 5 minutes of inactivity",
                checked = autoLock,
                onCheckedChange = { autoLock = it },
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Notifications ───────────────────────────────────────────
        SettingsSection("Notifications") {
            ToggleSetting(
                icon = Icons.Filled.Notifications,
                label = "Budget Alerts",
                description = "Notify when approaching budget limits",
                checked = budgetNotifications,
                onCheckedChange = { budgetNotifications = it },
            )
            ToggleSetting(
                icon = Icons.Filled.Notifications,
                label = "Goal Milestones",
                description = "Notify when reaching savings milestones",
                checked = goalNotifications,
                onCheckedChange = { goalNotifications = it },
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Data & Sync ─────────────────────────────────────────────
        SettingsSection("Data & Sync") {
            DropdownSetting(
                icon = Icons.Filled.CurrencyExchange,
                label = "Default Currency",
                currentValue = selectedCurrency,
                options = listOf("USD", "EUR", "GBP", "JPY", "CAD", "AUD"),
                onValueChange = { selectedCurrency = it },
            )
            ToggleSetting(
                icon = Icons.Filled.Sync,
                label = "Cloud Sync",
                description = "Sync data across devices",
                checked = syncEnabled,
                onCheckedChange = { syncEnabled = it },
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── About ───────────────────────────────────────────────────
        SettingsSection("About") {
            InfoSetting(
                icon = Icons.Filled.Info,
                label = "Version",
                value = "1.0.0",
            )
            InfoSetting(
                icon = Icons.Filled.Info,
                label = "Build",
                value = "2025.03.06",
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.massive))
    }
}

// =============================================================================
// Section composable
// =============================================================================

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .padding(bottom = FinanceDesktopTheme.spacing.sm)
                .semantics {
                    heading()
                    contentDescription = "$title settings section"
                },
        )
        Card(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            ) {
                content()
            }
        }
    }
}

// =============================================================================
// Setting row types
// =============================================================================

/**
 * Toggle setting row: icon + label + description + switch.
 */
@Composable
private fun ToggleSetting(
    icon: ImageVector,
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val stateLabel = if (checked) "enabled" else "disabled"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = FinanceDesktopTheme.spacing.sm)
            .semantics {
                contentDescription = "$label, $stateLabel. $description"
                role = Role.Switch
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(end = FinanceDesktopTheme.spacing.md),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

/**
 * Dropdown setting row: icon + label + button that opens a dropdown menu.
 */
@Composable
private fun DropdownSetting(
    icon: ImageVector,
    label: String,
    currentValue: String,
    options: List<String>,
    onValueChange: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ContextMenuArea(
        items = {
            listOf(ContextMenuItem("Reset to Default") { onValueChange(options.first()) })
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = FinanceDesktopTheme.spacing.sm)
                .semantics {
                    contentDescription = "$label: $currentValue"
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = FinanceDesktopTheme.spacing.md),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = { expanded = true },
                modifier = Modifier.semantics {
                    contentDescription = "$label selector, current value: $currentValue"
                },
            ) {
                Text(currentValue)
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option) },
                        onClick = {
                            onValueChange(option)
                            expanded = false
                        },
                        modifier = Modifier.semantics {
                            contentDescription = "Select $option for $label"
                        },
                    )
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

/**
 * Read-only info row: icon + label + value.
 */
@Composable
private fun InfoSetting(
    icon: ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = FinanceDesktopTheme.spacing.sm)
            .semantics {
                contentDescription = "$label: $value"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = FinanceDesktopTheme.spacing.md),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
        }
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}
