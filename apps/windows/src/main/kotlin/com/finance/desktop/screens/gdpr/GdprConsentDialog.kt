// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens.gdpr

import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * GDPR consent dialog shown on first application launch.
 *
 * Presents a clear explanation of data processing purposes and allows
 * the user to:
 * - Accept all data processing
 * - Accept only required (functional) data processing
 * - Customize which optional categories to consent to
 *
 * ## Accessibility
 * - All interactive elements have semantic descriptions for Narrator
 * - Heading hierarchy is maintained for screen reader navigation
 * - Focus starts on the consent explanation text
 *
 * @param onAcceptAll Callback when user accepts all processing.
 * @param onAcceptRequired Callback when user accepts only required processing.
 * @param onCustomize Callback with (analytics, crashReporting) booleans.
 */
@Composable
@Suppress("LongMethod") // Dialog composable with consent items
fun GdprConsentDialog(
    onAcceptAll: () -> Unit,
    onAcceptRequired: () -> Unit,
    onCustomize: (analytics: Boolean, crashReporting: Boolean) -> Unit,
) {
    var showCustomize by remember { mutableStateOf(false) }
    var analyticsEnabled by remember { mutableStateOf(false) }
    var crashReportingEnabled by remember { mutableStateOf(false) }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Privacy consent dialog" },
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier
                    .width(560.dp)
                    .padding(FinanceDesktopTheme.spacing.xxl),
            ) {
                Column(
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Shield,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Your Privacy Matters",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Finance processes your financial data locally on this device. " +
                            "We need your consent for certain data processing activities. " +
                            "You can change these preferences at any time in Settings > Privacy.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                    // Required processing (always on)
                    ConsentItem(
                        icon = Icons.Filled.Storage,
                        title = "Essential Data Processing",
                        description = "Required for the app to function. Includes local data storage, " +
                            "encrypted sync, and authentication.",
                        isRequired = true,
                        isEnabled = true,
                        onToggle = {},
                    )

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                    if (showCustomize) {
                        // Optional: Analytics
                        ConsentItem(
                            icon = Icons.Filled.Analytics,
                            title = "Usage Analytics",
                            description = "Help us improve Finance by sharing anonymized usage patterns. " +
                                "No financial data is ever shared.",
                            isRequired = false,
                            isEnabled = analyticsEnabled,
                            onToggle = { analyticsEnabled = it },
                        )

                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                        // Optional: Crash Reporting
                        ConsentItem(
                            icon = Icons.Filled.BugReport,
                            title = "Crash Reporting",
                            description = "Automatically send anonymous crash reports to help us fix bugs faster.",
                            isRequired = false,
                            isEnabled = crashReportingEnabled,
                            onToggle = { crashReportingEnabled = it },
                        )

                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                        Button(
                            onClick = { onCustomize(analyticsEnabled, crashReportingEnabled) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .semantics {
                                    contentDescription = "Save custom privacy preferences"
                                },
                        ) {
                            Text("Save Preferences", fontWeight = FontWeight.SemiBold)
                        }

                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                        TextButton(
                            onClick = { showCustomize = false },
                            modifier = Modifier.semantics {
                                contentDescription = "Go back to simple consent options"
                            },
                        ) {
                            Text("Back")
                        }
                    } else {
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                        // Accept All
                        Button(
                            onClick = onAcceptAll,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .semantics {
                                    contentDescription = "Accept all data processing including analytics and crash reporting"
                                },
                        ) {
                            Text("Accept All", fontWeight = FontWeight.SemiBold)
                        }

                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                        // Accept Required Only
                        OutlinedButton(
                            onClick = onAcceptRequired,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .semantics {
                                    contentDescription = "Accept only essential data processing"
                                },
                        ) {
                            Text("Accept Required Only")
                        }

                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                        // Customize
                        TextButton(
                            onClick = { showCustomize = true },
                            modifier = Modifier.semantics {
                                contentDescription = "Customize which data processing to allow"
                            },
                        ) {
                            Text("Customize Preferences")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConsentItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    description: String,
    isRequired: Boolean,
    isEnabled: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = FinanceDesktopTheme.spacing.xs)
            .semantics {
                contentDescription = "$title: ${if (isRequired) "required" else if (isEnabled) "enabled" else "disabled"}. $description"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                if (isRequired) {
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                    Text(
                        text = "Required",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!isRequired) {
            Switch(
                checked = isEnabled,
                onCheckedChange = onToggle,
            )
        } else {
            Switch(
                checked = true,
                onCheckedChange = {},
                enabled = false,
            )
        }
    }
}
