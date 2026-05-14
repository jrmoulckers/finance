// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens.gdpr

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.GdprConsentViewModel

/**
 * Privacy settings screen for managing GDPR consent, data export, and account deletion.
 *
 * Accessible from Settings > Privacy. Provides:
 * - Toggle analytics consent
 * - Toggle crash reporting consent
 * - Export all user data to JSON
 * - Delete account with confirmation
 *
 * ## Accessibility
 * - All controls have semantic content descriptions for Narrator
 * - Destructive actions require confirmation
 * - Live regions for status messages
 */
@Composable
@Suppress("LongMethod") // Settings screen composable
fun PrivacySettingsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<GdprConsentViewModel>()
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .verticalScroll(rememberScrollState())
            .semantics { contentDescription = "Privacy settings screen" },
    ) {
        Text(
            text = "Privacy & Data",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Privacy and data settings heading"
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Consent Preferences ──
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
                Text(
                    text = "Data Processing Consent",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // Analytics toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = FinanceDesktopTheme.spacing.sm)
                        .semantics {
                            contentDescription = "Usage analytics: ${if (state.consent.analyticsConsent) "enabled" else "disabled"}"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Analytics, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Usage Analytics", fontWeight = FontWeight.Medium)
                        Text(
                            "Share anonymized usage patterns",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = state.consent.analyticsConsent,
                        onCheckedChange = viewModel::setAnalyticsConsent,
                    )
                }
                HorizontalDivider()

                // Crash reporting toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = FinanceDesktopTheme.spacing.sm)
                        .semantics {
                            contentDescription = "Crash reporting: ${if (state.consent.crashReportingConsent) "enabled" else "disabled"}"
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.BugReport, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Crash Reporting", fontWeight = FontWeight.Medium)
                        Text(
                            "Send anonymous crash reports",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(
                        checked = state.consent.crashReportingConsent,
                        onCheckedChange = viewModel::setCrashReportingConsent,
                    )
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Data Export ──
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
                Text(
                    text = "Your Data",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                Text(
                    text = "You have the right to access, export, and delete your personal data " +
                        "at any time in compliance with GDPR regulations.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                OutlinedButton(
                    onClick = {
                        val home = System.getProperty("user.home")
                        val downloads = "$home\\Downloads"
                        viewModel.exportData(downloads)
                    },
                    enabled = !state.isExporting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Export all your data to a JSON file"
                        },
                ) {
                    if (state.isExporting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    }
                    Icon(Icons.Filled.Download, contentDescription = null)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(if (state.isExporting) "Exporting…" else "Export My Data")
                }

                state.exportPath?.let { path ->
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = "✓ Data exported to: $path",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Account Deletion ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
            ),
        ) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
                Text(
                    text = "Danger Zone",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                Text(
                    text = "Permanently delete your account and all associated data. " +
                        "This action cannot be undone.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                if (state.showDeleteConfirmation) {
                    Text(
                        text = "Are you sure? This will permanently delete all your data.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md)) {
                        OutlinedButton(
                            onClick = viewModel::cancelAccountDeletion,
                            modifier = Modifier.semantics {
                                contentDescription = "Cancel account deletion"
                            },
                        ) {
                            Text("Cancel")
                        }
                        Button(
                            onClick = viewModel::confirmAccountDeletion,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.error,
                            ),
                            enabled = !state.isDeletingAccount,
                            modifier = Modifier.semantics {
                                contentDescription = "Confirm permanent account deletion"
                            },
                        ) {
                            if (state.isDeletingAccount) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onError,
                                )
                                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                            }
                            Text("Delete Everything")
                        }
                    }
                } else {
                    Button(
                        onClick = viewModel::requestAccountDeletion,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                contentDescription = "Delete my account and all data"
                            },
                    ) {
                        Icon(Icons.Filled.DeleteForever, contentDescription = null)
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text("Delete My Account")
                    }
                }
            }
        }

        // Error message
        state.error?.let { error ->
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            Snackbar(
                action = {
                    TextButton(onClick = viewModel::clearError) { Text("Dismiss") }
                },
            ) {
                Text(error)
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.massive))
    }
}
