// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Lock screen displayed when the application requires authentication.
 *
 * Shows a Windows Hello authentication prompt with:
 * - App branding (lock icon + title)
 * - Primary "Unlock with Windows Hello" button (biometric/PIN)
 * - Loading spinner during authentication
 * - Error message on failure with retry
 * - Local-only fallback only when Windows Hello is unavailable
 *
 * ## Accessibility
 *
 * - All elements have semantic content descriptions for Narrator
 * - Error messages use live regions for automatic announcement
 * - Keyboard focus starts on the unlock button
 * - The lock icon is decorative (contentDescription = null on icon)
 *
 * @param isAuthenticating Whether an authentication attempt is in progress.
 * @param isWindowsHelloAvailable Whether the device supports Windows Hello.
 * @param authError Error message from the last failed attempt, if any.
 * @param onAuthenticate Callback to initiate Windows Hello authentication.
 * @param onContinueWithoutAuthentication Optional local-only fallback when Windows Hello is unavailable.
 */
@Composable
@Suppress("LongMethod") // Lock screen composable with biometric prompt
fun LockScreen(
    isAuthenticating: Boolean,
    isWindowsHelloAvailable: Boolean,
    authError: String?,
    onAuthenticate: () -> Unit,
    onContinueWithoutAuthentication: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Lock screen. Authenticate to access Finance." },
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.massive),
            ) {
                // App branding
                Icon(
                    imageVector = Icons.Filled.Lock,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.primary,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                Text(
                    text = "Finance",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics { heading() },
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                Text(
                    text = "Authenticate to access your financial data",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxxl))

                // Error message (live region for Narrator)
                AnimatedVisibility(
                    visible = authError != null,
                    enter = fadeIn(),
                    exit = fadeOut(),
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .padding(bottom = FinanceDesktopTheme.spacing.lg)
                            .semantics {
                                liveRegion = LiveRegionMode.Polite
                                contentDescription = authError ?: ""
                            },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                        Text(
                            text = authError ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                // Authentication button or loading indicator
                if (isAuthenticating) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(48.dp)
                            .semantics {
                                contentDescription = "Authenticating with Windows Hello"
                            },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Verifying your identity\u2026",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (isWindowsHelloAvailable) {
                    Button(
                        onClick = onAuthenticate,
                        modifier = Modifier
                            .width(280.dp)
                            .height(48.dp)
                            .semantics {
                                contentDescription =
                                    "Unlock with Windows Hello. Uses fingerprint, face recognition, or PIN."
                            },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Fingerprint,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp),
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text(
                            text = "Unlock with Windows Hello",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                } else {
                    // Windows Hello not available — show enter/skip
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "Windows Hello is not configured on this device.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                        if (onContinueWithoutAuthentication != null) {
                            OutlinedButton(
                                onClick = onContinueWithoutAuthentication,
                                modifier = Modifier
                                    .width(280.dp)
                                    .height(48.dp)
                                    .semantics {
                                        contentDescription =
                                            "Continue without authentication. Windows Hello is not configured."
                                    },
                            ) {
                                Text(
                                    text = "Continue without authentication",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                            }

                            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                        }

                        Text(
                            text = "Set up Windows Hello in Windows Settings to enable\nbiometric or PIN authentication for Finance.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}
