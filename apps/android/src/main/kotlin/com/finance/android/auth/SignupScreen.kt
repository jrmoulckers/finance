// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.auth

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Sign-up screen for the Finance app.
 *
 * Displays email, password, and confirm-password fields with
 * inline validation, a "Create Account" action, and a link
 * back to the sign-in screen.
 *
 * **Accessibility:**
 * - All fields have labels and [contentDescription] for TalkBack.
 * - Validation errors appear in [supportingText] and are announced.
 * - The API error banner uses [LiveRegionMode.Assertive].
 * - The loading state has a semantic description for screen readers.
 * - The password visibility toggle provides context-aware descriptions.
 *
 * @param viewModel           The [SignupViewModel] managing sign-up state.
 * @param onNavigateToLogin   Callback to navigate back to the login screen.
 * @param onSignupSuccess     Callback invoked when sign-up succeeds.
 */
@Composable
fun SignupScreen(
    viewModel: SignupViewModel,
    onNavigateToLogin: () -> Unit,
    onSignupSuccess: () -> Unit,
) {
    val uiState by viewModel.uiState.collectAsState()

    // Navigate away on successful sign-up.
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onSignupSuccess()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Create Account",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Create Account"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateToLogin,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back to sign in"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        SignupContent(
            uiState = uiState,
            onEmailChanged = viewModel::onEmailChanged,
            onPasswordChanged = viewModel::onPasswordChanged,
            onConfirmPasswordChanged = viewModel::onConfirmPasswordChanged,
            onTogglePasswordVisibility = viewModel::togglePasswordVisibility,
            onSubmit = viewModel::onSubmit,
            onNavigateToLogin = onNavigateToLogin,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content composable
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun SignupContent(
    uiState: SignupUiState,
    onEmailChanged: (String) -> Unit,
    onPasswordChanged: (String) -> Unit,
    onConfirmPasswordChanged: (String) -> Unit,
    onTogglePasswordVisibility: () -> Unit,
    onSubmit: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusManager = LocalFocusManager.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 32.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        // ── API error banner ────────────────────────────────────────────
        if (uiState.apiError != null) {
            Text(
                text = uiState.apiError,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onError,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .semantics {
                        liveRegion = LiveRegionMode.Assertive
                        contentDescription = uiState.apiError
                    }
                    .then(
                        Modifier.padding(0.dp), // Surface handles background
                    ),
            )
            // Wrap with error-colored background
            Spacer(modifier = Modifier.height(8.dp))
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Create your Finance account to start tracking your finances securely.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics {
                contentDescription =
                    "Create your Finance account to start tracking your finances securely"
            },
        )

        Spacer(modifier = Modifier.height(32.dp))

        // ── Email field ─────────────────────────────────────────────────
        OutlinedTextField(
            value = uiState.email,
            onValueChange = onEmailChanged,
            label = { Text("Email") },
            placeholder = { Text("you@example.com") },
            isError = uiState.emailError != null,
            supportingText = uiState.emailError?.let { error ->
                {
                    Text(
                        text = error,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = error
                        },
                    )
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Email address" },
            enabled = !uiState.isLoading,
        )

        Spacer(modifier = Modifier.height(16.dp))

        // ── Password field ──────────────────────────────────────────────
        OutlinedTextField(
            value = uiState.password,
            onValueChange = onPasswordChanged,
            label = { Text("Password") },
            isError = uiState.passwordError != null,
            supportingText = uiState.passwordError?.let { error ->
                {
                    Text(
                        text = error,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = error
                        },
                    )
                }
            },
            singleLine = true,
            visualTransformation = if (uiState.passwordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            trailingIcon = {
                IconButton(
                    onClick = onTogglePasswordVisibility,
                    modifier = Modifier.semantics {
                        contentDescription = if (uiState.passwordVisible) {
                            "Hide password"
                        } else {
                            "Show password"
                        }
                    },
                ) {
                    Icon(
                        imageVector = if (uiState.passwordVisible) {
                            Icons.Filled.VisibilityOff
                        } else {
                            Icons.Filled.Visibility
                        },
                        contentDescription = null, // button semantics covers this
                    )
                }
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Password" },
            enabled = !uiState.isLoading,
        )

        Spacer(modifier = Modifier.height(16.dp))

        // ── Confirm password field ──────────────────────────────────────
        OutlinedTextField(
            value = uiState.confirmPassword,
            onValueChange = onConfirmPasswordChanged,
            label = { Text("Confirm Password") },
            isError = uiState.confirmPasswordError != null,
            supportingText = uiState.confirmPasswordError?.let { error ->
                {
                    Text(
                        text = error,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Polite
                            contentDescription = error
                        },
                    )
                }
            },
            singleLine = true,
            visualTransformation = if (uiState.passwordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    onSubmit()
                },
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = "Confirm password" },
            enabled = !uiState.isLoading,
        )

        Spacer(modifier = Modifier.height(32.dp))

        // ── Create Account button ───────────────────────────────────────
        Button(
            onClick = onSubmit,
            enabled = !uiState.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics {
                    contentDescription = if (uiState.isLoading) {
                        "Creating account, please wait"
                    } else {
                        "Create Account"
                    }
                },
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(24.dp)
                        .semantics {
                            contentDescription = "Creating account, please wait"
                        },
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
            } else {
                Text(
                    text = "Create Account",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // ── Navigate to login ───────────────────────────────────────────
        TextButton(
            onClick = onNavigateToLogin,
            modifier = Modifier.semantics {
                contentDescription = "Already have an account? Sign in"
            },
            enabled = !uiState.isLoading,
        ) {
            Text(
                text = "Already have an account? Sign in",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Terms ───────────────────────────────────────────────────────
        Text(
            text = "By creating an account, you agree to our Terms of Service and Privacy Policy.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics {
                contentDescription =
                    "By creating an account, you agree to our Terms of Service and Privacy Policy"
            },
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────────────

@Preview(
    name = "Signup – Light",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Composable
private fun SignupScreenPreviewLight() {
    MaterialTheme {
        Surface {
            SignupContent(
                uiState = SignupUiState(),
                onEmailChanged = {},
                onPasswordChanged = {},
                onConfirmPasswordChanged = {},
                onTogglePasswordVisibility = {},
                onSubmit = {},
                onNavigateToLogin = {},
            )
        }
    }
}

@Preview(
    name = "Signup – Dark",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun SignupScreenPreviewDark() {
    MaterialTheme(colorScheme = androidx.compose.material3.darkColorScheme()) {
        Surface {
            SignupContent(
                uiState = SignupUiState(),
                onEmailChanged = {},
                onPasswordChanged = {},
                onConfirmPasswordChanged = {},
                onTogglePasswordVisibility = {},
                onSubmit = {},
                onNavigateToLogin = {},
            )
        }
    }
}

@Preview(name = "Signup – Validation Errors")
@Composable
private fun SignupScreenPreviewErrors() {
    MaterialTheme {
        Surface {
            SignupContent(
                uiState = SignupUiState(
                    email = "bad-email",
                    password = "short",
                    confirmPassword = "nope",
                    emailError = "Enter a valid email address",
                    passwordError = "Password must be at least 8 characters",
                    confirmPasswordError = "Passwords do not match",
                ),
                onEmailChanged = {},
                onPasswordChanged = {},
                onConfirmPasswordChanged = {},
                onTogglePasswordVisibility = {},
                onSubmit = {},
                onNavigateToLogin = {},
            )
        }
    }
}

@Preview(name = "Signup – API Error")
@Composable
private fun SignupScreenPreviewApiError() {
    MaterialTheme {
        Surface {
            SignupContent(
                uiState = SignupUiState(
                    email = "user@example.com",
                    password = "Password1",
                    confirmPassword = "Password1",
                    apiError = "An account with this email already exists",
                ),
                onEmailChanged = {},
                onPasswordChanged = {},
                onConfirmPasswordChanged = {},
                onTogglePasswordVisibility = {},
                onSubmit = {},
                onNavigateToLogin = {},
            )
        }
    }
}

@Preview(name = "Signup – Loading")
@Composable
private fun SignupScreenPreviewLoading() {
    MaterialTheme {
        Surface {
            SignupContent(
                uiState = SignupUiState(
                    email = "user@example.com",
                    password = "Password1",
                    confirmPassword = "Password1",
                    isLoading = true,
                ),
                onEmailChanged = {},
                onPasswordChanged = {},
                onConfirmPasswordChanged = {},
                onTogglePasswordVisibility = {},
                onSubmit = {},
                onNavigateToLogin = {},
            )
        }
    }
}
