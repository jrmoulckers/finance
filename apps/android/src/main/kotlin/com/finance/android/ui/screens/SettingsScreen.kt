// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens

import android.content.res.Configuration
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import com.finance.android.ui.theme.ThemePreference
import org.koin.compose.viewmodel.koinViewModel
import java.io.File

// ─────────────────────────────────────────────────────────────────────────────
// Root composable
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full-featured Settings screen.
 *
 * Sections: Profile · Appearance · Preferences · Security · Accessibility · Data · About.
 *
 * @param state          Current [SettingsUiState] — typically collected from [SettingsViewModel].
 * @param onNavigateBack Called when the user taps the back button in the top bar.
 * @param onSetThemePreference      Callback when theme preference changes.
 * @param onSetCurrency            Callback when default currency changes.
 * @param onSetNotifications       Callback when notification toggle changes.
 * @param onSetBillReminders       Callback when bill-reminder toggle changes.
 * @param onSetBiometric           Callback when biometric toggle changes.
 * @param onSetAppLockTimeout      Callback when app-lock timeout changes.
 * @param onSetSimplifiedView      Callback when simplified-view toggle changes.
 * @param onSetHighContrast        Callback when high-contrast toggle changes.
 * @param onExportClick            Callback when "Export data" is tapped.
 * @param onDeleteClick            Callback when "Delete account" is tapped.
 * @param onExportFormat           Callback when a format is picked in the export dialog.
 * @param onDismissExportDialog    Dismiss the export dialog.
 * @param onDeleteTextChanged      Callback for the delete-confirmation text field.
 * @param onConfirmDelete          Callback when the user confirms deletion.
 * @param onDismissDeleteDialog    Dismiss the delete dialog.
 * @param onPrivacyPolicyClick     Callback when "Privacy Policy" is tapped.
 * @param onTermsClick             Callback when "Terms of Service" is tapped.
 * @param onLicensesClick          Callback when "Open Source Licenses" is tapped.
 */
@Composable
fun SettingsScreen(
    state: SettingsUiState,
    onNavigateBack: () -> Unit,
    onSignOut: () -> Unit,
    onSetThemePreference: (ThemePreference) -> Unit,
    onSetCurrency: (SupportedCurrency) -> Unit,
    onSetNotifications: (Boolean) -> Unit,
    onSetBillReminders: (Boolean) -> Unit,
    onSetBiometric: (Boolean) -> Unit,
    onSetAppLockTimeout: (AppLockTimeout) -> Unit,
    onSetSimplifiedView: (Boolean) -> Unit,
    onSetHighContrast: (Boolean) -> Unit,
    onExportClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onExportFormat: (ExportFormat) -> Unit,
    onDismissExportDialog: () -> Unit,
    onDeleteTextChanged: (String) -> Unit,
    onConfirmDelete: () -> Unit,
    onDismissDeleteDialog: () -> Unit,
    onPrivacyPolicyClick: () -> Unit = {},
    onTermsClick: () -> Unit = {},
    onLicensesClick: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Profile ──────────────────────────────────────────────────────
        ProfileSection(
            userName = state.userName,
            userEmail = state.userEmail,
            onSignOut = onSignOut,
        )

        // ── Appearance ───────────────────────────────────────────────────
        AppearanceSection(
            themePreference = state.themePreference,
            onThemePreferenceChanged = onSetThemePreference,
        )

        // ── Preferences ──────────────────────────────────────────────────
        PreferencesSection(
            currency = state.defaultCurrency,
            notificationsEnabled = state.notificationsEnabled,
            billRemindersEnabled = state.billRemindersEnabled,
            onCurrencyChanged = onSetCurrency,
            onNotificationsChanged = onSetNotifications,
            onBillRemindersChanged = onSetBillReminders,
        )

        // ── Security ─────────────────────────────────────────────────────
        SecuritySection(
            biometricEnabled = state.biometricEnabled,
            biometricAvailable = state.biometricAvailable,
            appLockTimeout = state.appLockTimeout,
            onBiometricChanged = onSetBiometric,
            onAppLockTimeoutChanged = onSetAppLockTimeout,
        )

        // ── Accessibility ────────────────────────────────────────────────
        AccessibilitySection(
            simplifiedViewEnabled = state.simplifiedViewEnabled,
            highContrastEnabled = state.highContrastEnabled,
            onSimplifiedViewChanged = onSetSimplifiedView,
            onHighContrastChanged = onSetHighContrast,
        )

        // ── Data ─────────────────────────────────────────────────────────
        DataSection(
            onExportClick = onExportClick,
            onDeleteClick = onDeleteClick,
            isExporting = state.isExporting,
        )

        // ── About ────────────────────────────────────────────────────────
        AboutSection(
            appVersion = state.appVersion,
            onPrivacyPolicyClick = onPrivacyPolicyClick,
            onTermsClick = onTermsClick,
            onLicensesClick = onLicensesClick,
        )

        Spacer(modifier = Modifier.height(24.dp))
    }

    // ── Dialogs ──────────────────────────────────────────────────────────────
    if (state.showExportDialog) {
        ExportDataDialog(
            onFormatSelected = onExportFormat,
            onDismiss = onDismissExportDialog,
        )
    }

    if (state.showDeleteDialog) {
        DeleteAccountDialog(
            confirmationText = state.deleteConfirmationText,
            isDeleteEnabled = state.isDeleteEnabled,
            onTextChanged = onDeleteTextChanged,
            onConfirm = onConfirmDelete,
            onDismiss = onDismissDeleteDialog,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section composables
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .padding(top = 8.dp, bottom = 4.dp)
            .semantics {
                heading()
                contentDescription = "$title section"
            },
    )
}


// ── Appearance ─────────────────────────────────────────────────────────────

@Composable
private fun AppearanceSection(
    themePreference: ThemePreference,
    onThemePreferenceChanged: (ThemePreference) -> Unit,
) {
    SectionHeader("Appearance")
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Appearance settings card" },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            ThemePreferenceDropdown(
                selected = themePreference,
                onSelected = onThemePreferenceChanged,
            )
        }
    }
}

@Composable
private fun ThemePreferenceDropdown(
    selected: ThemePreference,
    onSelected: (ThemePreference) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.semantics { contentDescription = "Theme mode selector" },
    ) {
        OutlinedTextField(
            value = selected.label,
            onValueChange = {},
            readOnly = true,
            label = { Text("Theme") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            ThemePreference.entries.forEach { preference ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = preference.label,
                            modifier = Modifier.semantics {
                                contentDescription = "Select ${preference.label} theme"
                            },
                        )
                    },
                    onClick = {
                        onSelected(preference)
                        expanded = false
                    },
                )
            }
        }
    }
}
// ── Profile ──────────────────────────────────────────────────────────────────

@Composable
private fun ProfileSection(userName: String, userEmail: String, onSignOut: () -> Unit) {
    SectionHeader("Profile")
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Profile information card" },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar placeholder
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .semantics { contentDescription = "User avatar placeholder" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null, // decorative; parent has description
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(32.dp),
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column {
                Text(
                    text = userName.ifBlank { "User Name" },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        contentDescription = "User name: ${userName.ifBlank { "not set" }}"
                    },
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = userEmail.ifBlank { "user@example.com" },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Email: ${userEmail.ifBlank { "not set" }}"
                    },
                )
            }
        }

        HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

        TextButton(
            onClick = onSignOut,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .semantics { contentDescription = "Sign out of your account" },
        ) {
            Text(
                text = "Sign out",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}

// ── Preferences ──────────────────────────────────────────────────────────────

@Composable
private fun PreferencesSection(
    currency: SupportedCurrency,
    notificationsEnabled: Boolean,
    billRemindersEnabled: Boolean,
    onCurrencyChanged: (SupportedCurrency) -> Unit,
    onNotificationsChanged: (Boolean) -> Unit,
    onBillRemindersChanged: (Boolean) -> Unit,
) {
    SectionHeader("Preferences")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Currency dropdown
            CurrencyDropdown(
                selected = currency,
                onCurrencySelected = onCurrencyChanged,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Notification toggle
            SettingsToggleRow(
                label = "Budget alert notifications",
                description = "Receive alerts when nearing budget limits",
                checked = notificationsEnabled,
                onCheckedChange = onNotificationsChanged,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            // Bill reminders toggle
            SettingsToggleRow(
                label = "Bill reminders",
                description = "Get reminded before upcoming bill due dates",
                checked = billRemindersEnabled,
                onCheckedChange = onBillRemindersChanged,
            )
        }
    }
}

@Composable
private fun CurrencyDropdown(
    selected: SupportedCurrency,
    onCurrencySelected: (SupportedCurrency) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.semantics { contentDescription = "Default currency selector" },
    ) {
        OutlinedTextField(
            value = "${selected.code} — ${selected.displayName}",
            onValueChange = {},
            readOnly = true,
            label = { Text("Default currency") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            SupportedCurrency.entries.forEach { currency ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "${currency.code} — ${currency.displayName}",
                            modifier = Modifier.semantics {
                                contentDescription = "Select ${currency.displayName}"
                            },
                        )
                    },
                    onClick = {
                        onCurrencySelected(currency)
                        expanded = false
                    },
                )
            }
        }
    }
}

// ── Security ─────────────────────────────────────────────────────────────────

@Composable
private fun SecuritySection(
    biometricEnabled: Boolean,
    biometricAvailable: Boolean,
    appLockTimeout: AppLockTimeout,
    onBiometricChanged: (Boolean) -> Unit,
    onAppLockTimeoutChanged: (AppLockTimeout) -> Unit,
) {
    SectionHeader("Security")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            SettingsToggleRow(
                label = "Biometric authentication",
                description = if (biometricAvailable) {
                    "Use fingerprint or face to unlock the app"
                } else {
                    "Biometric authentication is not available on this device"
                },
                checked = biometricEnabled,
                onCheckedChange = onBiometricChanged,
                enabled = biometricAvailable,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            AppLockTimeoutSelector(
                selected = appLockTimeout,
                onSelected = onAppLockTimeoutChanged,
            )
        }
    }
}

@Composable
private fun AppLockTimeoutSelector(
    selected: AppLockTimeout,
    onSelected: (AppLockTimeout) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = Modifier.semantics { contentDescription = "App lock timeout selector" },
    ) {
        OutlinedTextField(
            value = selected.label,
            onValueChange = {},
            readOnly = true,
            label = { Text("App lock timeout") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )

        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            AppLockTimeout.entries.forEach { timeout ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = timeout.label,
                            modifier = Modifier.semantics {
                                contentDescription = "Lock after ${timeout.label}"
                            },
                        )
                    },
                    onClick = {
                        onSelected(timeout)
                        expanded = false
                    },
                )
            }
        }
    }
}

// ── Accessibility ────────────────────────────────────────────────────────────

@Composable
private fun AccessibilitySection(
    simplifiedViewEnabled: Boolean,
    highContrastEnabled: Boolean,
    onSimplifiedViewChanged: (Boolean) -> Unit,
    onHighContrastChanged: (Boolean) -> Unit,
) {
    SectionHeader("Accessibility")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            SettingsToggleRow(
                label = "Simplified view",
                description = "Reduce visual complexity for easier reading",
                checked = simplifiedViewEnabled,
                onCheckedChange = onSimplifiedViewChanged,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            SettingsToggleRow(
                label = "High contrast mode",
                description = "Increase contrast for better visibility",
                checked = highContrastEnabled,
                onCheckedChange = onHighContrastChanged,
            )
        }
    }
}

// ── Data ─────────────────────────────────────────────────────────────────────

@Composable
private fun DataSection(
    onExportClick: () -> Unit,
    onDeleteClick: () -> Unit,
    isExporting: Boolean = false,
) {
    SectionHeader("Data")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            OutlinedButton(
                onClick = onExportClick,
                enabled = !isExporting,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Export your financial data" },
            ) {
                if (isExporting) {
                    androidx.compose.material3.CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Exporting…")
                } else {
                    Text("Export data")
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = onDeleteClick,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Delete your account permanently" },
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = null, // button label provides context
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Delete account")
            }
        }
    }
}

// ── About ────────────────────────────────────────────────────────────────────

@Composable
private fun AboutSection(
    appVersion: String,
    onPrivacyPolicyClick: () -> Unit,
    onTermsClick: () -> Unit,
    onLicensesClick: () -> Unit,
) {
    SectionHeader("About")
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "App version $appVersion" },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("App version", style = MaterialTheme.typography.bodyLarge)
                Text(
                    text = appVersion,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            AboutLinkRow(
                label = "Privacy Policy",
                description = "View privacy policy",
                onClick = onPrivacyPolicyClick,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            AboutLinkRow(
                label = "Terms of Service",
                description = "View terms of service",
                onClick = onTermsClick,
            )

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

            AboutLinkRow(
                label = "Open Source Licenses",
                description = "View open source licenses",
                onClick = onLicensesClick,
            )
        }
    }
}

@Composable
private fun AboutLinkRow(label: String, description: String, onClick: () -> Unit) {
    Text(
        text = label,
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp)
            .semantics { contentDescription = description },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared components
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SettingsToggleRow(
    label: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = "$label, ${if (checked) "enabled" else "disabled"}. $description"
            },
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
                color = if (enabled) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                },
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = if (enabled) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
                },
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun ExportDataDialog(
    onFormatSelected: (ExportFormat) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Export Data",
                modifier = Modifier.semantics { contentDescription = "Export data dialog" },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Choose an export format:",
                    modifier = Modifier.semantics { contentDescription = "Choose an export format" },
                )
                ExportFormat.entries.forEach { format ->
                    OutlinedButton(
                        onClick = { onFormatSelected(format) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Export as ${format.label}" },
                    ) {
                        Text(format.label)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Cancel export" },
            ) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun DeleteAccountDialog(
    confirmationText: String,
    isDeleteEnabled: Boolean,
    onTextChanged: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Delete Account",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { contentDescription = "Delete account confirmation dialog" },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "This action is permanent and cannot be undone. All your financial data will be deleted.",
                    modifier = Modifier.semantics {
                        contentDescription = "Warning: this action is permanent and cannot be undone"
                    },
                )
                Text(
                    text = "Type DELETE to confirm:",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        contentDescription = "Type the word DELETE to confirm account deletion"
                    },
                )
                OutlinedTextField(
                    value = confirmationText,
                    onValueChange = onTextChanged,
                    singleLine = true,
                    placeholder = { Text("DELETE") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Deletion confirmation text input" },
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = isDeleteEnabled,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
                modifier = Modifier.semantics {
                    contentDescription = if (isDeleteEnabled) {
                        "Confirm account deletion"
                    } else {
                        "Type DELETE to enable account deletion"
                    }
                },
            ) {
                Text("Delete Account")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Cancel account deletion" },
            ) {
                Text("Cancel")
            }
        },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stateful wrapper (used by navigation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stateful entry-point for the Settings screen, intended for use by
 * [FinanceNavHost].
 *
 * Creates the [SettingsViewModel] via Koin, collects its state & one-shot events,
 * and wires everything into the stateless [SettingsScreen] composable.
 *
 * Export events are handled here so the ViewModel stays platform-agnostic:
 * - [SettingsEvent.ExportReady] → writes the file to cache dir and opens
 *   the Android share sheet via [Intent.ACTION_SEND].
 * - [SettingsEvent.ExportFailed] → shows a Toast with the error message.
 * - [SettingsEvent.ShowToast] → shows a regular Toast.
 * - [SettingsEvent.NavigateToLogin] → invokes [onNavigateToLogin] to clear
 *   the back stack and return to the initial screen after logout / account deletion.
 *
 * @param onNavigateBack Called when the user taps the back arrow in the top bar.
 * @param onNavigateToLogin Called after logout or account deletion to navigate
 *   to the initial screen (e.g. Dashboard) with a cleared back stack.
 */
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLogin: () -> Unit,
) {
    val context = LocalContext.current
    val viewModel: SettingsViewModel = koinViewModel()
    val state by viewModel.uiState.collectAsState()

    // Collect one-shot events
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is SettingsEvent.ShowToast -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_SHORT).show()
                }
                is SettingsEvent.NavigateToLogin -> {
                    onNavigateToLogin()
                }
                is SettingsEvent.ExportStarted -> {
                    // Progress is shown via state.isExporting — no action needed
                }
                is SettingsEvent.ExportReady -> {
                    shareExportFile(context, event.fileName, event.mimeType, event.content)
                }
                is SettingsEvent.ExportFailed -> {
                    Toast.makeText(context, event.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    SettingsScreen(
        state = state,
        onNavigateBack = onNavigateBack,
        onSignOut = viewModel::signOut,
        onSetThemePreference = viewModel::setThemePreference,
        onSetCurrency = viewModel::setDefaultCurrency,
        onSetNotifications = viewModel::setNotificationsEnabled,
        onSetBillReminders = viewModel::setBillRemindersEnabled,
        onSetBiometric = viewModel::setBiometricEnabled,
        onSetAppLockTimeout = viewModel::setAppLockTimeout,
        onSetSimplifiedView = viewModel::setSimplifiedViewEnabled,
        onSetHighContrast = viewModel::setHighContrastEnabled,
        onExportClick = viewModel::showExportDialog,
        onDeleteClick = viewModel::showDeleteDialog,
        onExportFormat = viewModel::exportData,
        onDismissExportDialog = viewModel::dismissExportDialog,
        onDeleteTextChanged = viewModel::onDeleteConfirmationTextChanged,
        onConfirmDelete = viewModel::confirmDeleteAccount,
        onDismissDeleteDialog = viewModel::dismissDeleteDialog,
    )
}

/**
 * Writes export content to a temporary file in the app's cache directory
 * and opens the Android share sheet so the user can save or send it.
 *
 * Uses [FileProvider] for secure file access across app boundaries.
 * The content itself is never logged to avoid leaking financial data.
 */
private fun shareExportFile(
    context: Context,
    fileName: String,
    mimeType: String,
    content: String,
) {
    try {
        // Write to cache dir (auto-cleaned by the OS)
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, fileName)
        file.writeText(content)

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "Finance Data Export")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        val chooser = Intent.createChooser(shareIntent, "Share export file")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    } catch (_: Exception) {
        Toast.makeText(context, "Could not share the export file", Toast.LENGTH_LONG).show()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────────────

@Preview(
    name = "Settings – Light",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Composable
private fun SettingsScreenPreviewLight() {
    MaterialTheme {
        Surface {
            SettingsScreen(
                state = previewState(),
                onNavigateBack = {},
                onSignOut = {},
                onSetThemePreference = {},
                onSetCurrency = {},
                onSetNotifications = {},
                onSetBillReminders = {},
                onSetBiometric = {},
                onSetAppLockTimeout = {},
                onSetSimplifiedView = {},
                onSetHighContrast = {},
                onExportClick = {},
                onDeleteClick = {},
                onExportFormat = {},
                onDismissExportDialog = {},
                onDeleteTextChanged = {},
                onConfirmDelete = {},
                onDismissDeleteDialog = {},
            )
        }
    }
}

@Preview(
    name = "Settings – Dark",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun SettingsScreenPreviewDark() {
    MaterialTheme(
        colorScheme = androidx.compose.material3.darkColorScheme(),
    ) {
        Surface {
            SettingsScreen(
                state = previewState(),
                onNavigateBack = {},
                onSignOut = {},
                onSetThemePreference = {},
                onSetCurrency = {},
                onSetNotifications = {},
                onSetBillReminders = {},
                onSetBiometric = {},
                onSetAppLockTimeout = {},
                onSetSimplifiedView = {},
                onSetHighContrast = {},
                onExportClick = {},
                onDeleteClick = {},
                onExportFormat = {},
                onDismissExportDialog = {},
                onDeleteTextChanged = {},
                onConfirmDelete = {},
                onDismissDeleteDialog = {},
            )
        }
    }
}

@Preview(name = "Export Dialog")
@Composable
private fun ExportDialogPreview() {
    MaterialTheme {
        ExportDataDialog(
            onFormatSelected = {},
            onDismiss = {},
        )
    }
}

@Preview(name = "Delete Dialog")
@Composable
private fun DeleteDialogPreview() {
    MaterialTheme {
        DeleteAccountDialog(
            confirmationText = "DELE",
            isDeleteEnabled = false,
            onTextChanged = {},
            onConfirm = {},
            onDismiss = {},
        )
    }
}

/** Stable sample state for Compose previews. */
private fun previewState() = SettingsUiState(
    userName = "Alex Johnson",
    userEmail = "alex@example.com",
    themePreference = ThemePreference.SYSTEM,
    defaultCurrency = SupportedCurrency.USD,
    notificationsEnabled = true,
    billRemindersEnabled = false,
    biometricEnabled = true,
    biometricAvailable = true,
    appLockTimeout = AppLockTimeout.ONE_MINUTE,
    simplifiedViewEnabled = false,
    highContrastEnabled = false,
    appVersion = "1.0.0",
)
