// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.LoginUiState
import com.finance.desktop.viewmodel.LoginViewModel

/**
 * Login/Signup screen for Supabase Auth integration.
 *
 * Provides email/password sign-in and sign-up forms with:
 * - Email validation
 * - Password visibility toggle
 * - Loading state during authentication
 * - Error messages with live region for Narrator
 * - Toggle between sign-in and sign-up modes
 *
 * ## Accessibility
 * - All fields have semantic content descriptions
 * - Error messages use live regions for automatic announcement
 * - Keyboard navigation follows logical tab order
 */
@Composable
@Suppress("LongMethod") // Login form composable
fun LoginScreen(
    onAuthenticated: () -> Unit,
    modifier: Modifier = Modifier,
    onCancel: (() -> Unit)? = null,
) {
    val viewModel = koinGet<LoginViewModel>()
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) onAuthenticated()
    }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Login screen" },
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier
                    .width(420.dp)
                    .padding(FinanceDesktopTheme.spacing.xxl),
            ) {
                Column(
                    modifier = Modifier
                        .padding(FinanceDesktopTheme.spacing.xxl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    // Branding
                    Icon(
                        imageVector = Icons.Filled.AccountBalance,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Finance",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                    Text(
                        text = if (state.isSignUpMode) "Create your account" else "Sign in to continue",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

                    // Email field
                    OutlinedTextField(
                        value = state.email,
                        onValueChange = viewModel::setEmail,
                        label = { Text("Email") },
                        singleLine = true,
                        enabled = !state.isLoading,
                        leadingIcon = {
                            Icon(Icons.Filled.Email, contentDescription = null)
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Email address field" },
                    )

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                    // Password field
                    var passwordVisible by remember { mutableStateOf(false) }
                    OutlinedTextField(
                        value = state.password,
                        onValueChange = viewModel::setPassword,
                        label = { Text("Password") },
                        singleLine = true,
                        enabled = !state.isLoading,
                        visualTransformation = if (passwordVisible) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        leadingIcon = {
                            Icon(Icons.Filled.Lock, contentDescription = null)
                        },
                        trailingIcon = {
                            IconButton(
                                onClick = { passwordVisible = !passwordVisible },
                                modifier = Modifier.semantics {
                                    contentDescription = if (passwordVisible) {
                                        "Hide password"
                                    } else {
                                        "Show password"
                                    }
                                },
                            ) {
                                Icon(
                                    imageVector = if (passwordVisible) {
                                        Icons.Filled.VisibilityOff
                                    } else {
                                        Icons.Filled.Visibility
                                    },
                                    contentDescription = null,
                                )
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Password field" },
                    )

                    // Confirm password for sign-up
                    AnimatedVisibility(visible = state.isSignUpMode) {
                        Column {
                            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                            OutlinedTextField(
                                value = state.confirmPassword,
                                onValueChange = viewModel::setConfirmPassword,
                                label = { Text("Confirm Password") },
                                singleLine = true,
                                enabled = !state.isLoading,
                                visualTransformation = PasswordVisualTransformation(),
                                leadingIcon = {
                                    Icon(Icons.Filled.Lock, contentDescription = null)
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .semantics {
                                        contentDescription = "Confirm password field"
                                    },
                            )
                        }
                    }

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                    // Error message
                    AnimatedVisibility(
                        visible = state.error != null,
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        Text(
                            text = state.error ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = FinanceDesktopTheme.spacing.md)
                                .semantics {
                                    liveRegion = LiveRegionMode.Polite
                                    contentDescription = "Error: ${state.error}"
                                },
                        )
                    }

                    // Submit button
                    Button(
                        onClick = {
                            if (state.isSignUpMode) viewModel.signUp() else viewModel.signIn()
                        },
                        enabled = !state.isLoading && state.email.isNotBlank() && state.password.isNotBlank(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .semantics {
                                contentDescription = if (state.isSignUpMode) {
                                    "Create account button"
                                } else {
                                    "Sign in button"
                                }
                            },
                    ) {
                        if (state.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                        } else {
                            Text(
                                text = if (state.isSignUpMode) "Create Account" else "Sign In",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }

                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                    // Toggle mode
                    TextButton(
                        onClick = viewModel::toggleMode,
                        enabled = !state.isLoading,
                        modifier = Modifier.semantics {
                            contentDescription = if (state.isSignUpMode) {
                                "Switch to sign in"
                            } else {
                                "Switch to create account"
                            }
                        },
                    ) {
                        Text(
                            text = if (state.isSignUpMode) {
                                "Already have an account? Sign in"
                            } else {
                                "Don't have an account? Sign up"
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }

                    if (onCancel != null) {
                        TextButton(
                            onClick = onCancel,
                            enabled = !state.isLoading,
                            modifier = Modifier.semantics {
                                contentDescription = "Cancel sign in"
                            },
                        ) {
                            Text("Cancel")
                        }
                    }
                }
            }
        }
    }
}
