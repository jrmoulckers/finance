// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.auth

import android.content.Intent
import androidx.activity.ComponentActivity
import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.util.Consumer

/**
 * Login screen for the Finance app.
 *
 * Displays sign-in options (Google OAuth and passkey) and handles
 * the OAuth callback deep link from Custom Tabs.
 *
 * **Accessibility:**
 * - All buttons have [contentDescription] for TalkBack.
 * - Loading and error states use live regions for announcements.
 * - Focus management ensures logical tab/switch-access order.
 *
 * @param viewModel          The [AuthViewModel] managing authentication state.
 * @param onNavigateToSignup Callback to navigate to the sign-up screen.
 */
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToSignup: () -> Unit = {},
) {
    val context = LocalContext.current
    val activity = context as ComponentActivity
    val authState by viewModel.authState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // ── Handle OAuth callback from Custom Tabs ──────────────────────────
    // Check the Activity's launch intent for an auth callback.
    LaunchedEffect(Unit) {
        extractOAuthCode(activity.intent)?.let { code ->
            viewModel.handleOAuthCallback(code)
            // Clear the intent data to prevent re-processing on recomposition.
            activity.intent = Intent()
        }
    }

    // Listen for new intents while the screen is active (app in background
    // when Custom Tabs redirects back).
    DisposableEffect(Unit) {
        val listener = Consumer<Intent> { intent ->
            extractOAuthCode(intent)?.let { code ->
                viewModel.handleOAuthCallback(code)
            }
        }
        activity.addOnNewIntentListener(listener)
        onDispose { activity.removeOnNewIntentListener(listener) }
    }

    // Show error in snackbar
    LaunchedEffect(authState) {
        if (authState is AuthState.Error) {
            snackbarHostState.showSnackbar(
                message = (authState as AuthState.Error).message,
            )
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center,
        ) {
            when (authState) {
                is AuthState.Loading -> {
                    LoadingContent()
                }
                else -> {
                    LoginContent(
                        isError = authState is AuthState.Error,
                        onSignInWithGoogle = { viewModel.signInWithGoogle(context) },
                        onSignInWithPasskey = { viewModel.signInWithPasskey(activity) },
                        onNavigateToSignup = onNavigateToSignup,
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Content composables
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun LoginContent(
    isError: Boolean,
    onSignInWithGoogle: () -> Unit,
    onSignInWithPasskey: () -> Unit,
    onNavigateToSignup: () -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        // ── App branding ────────────────────────────────────────────────
        Icon(
            imageVector = Icons.Filled.Lock,
            contentDescription = null, // decorative, heading below provides context
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(72.dp),
        )

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Welcome to Finance",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Welcome to Finance"
            },
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Sign in to sync your financial data securely across devices.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics {
                contentDescription = "Sign in to sync your financial data securely across devices"
            },
        )

        Spacer(modifier = Modifier.height(48.dp))

        // ── Sign in with Google ─────────────────────────────────────────
        Button(
            onClick = onSignInWithGoogle,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics {
                    contentDescription = "Sign in with Google"
                },
        ) {
            Text(
                text = "Sign in with Google",
                style = MaterialTheme.typography.labelLarge,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Sign in with Passkey ────────────────────────────────────────
        OutlinedButton(
            onClick = onSignInWithPasskey,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics {
                    contentDescription = "Sign in with Passkey"
                },
        ) {
            Icon(
                imageVector = Icons.Filled.Fingerprint,
                contentDescription = null, // button label provides context
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = "Sign in with Passkey",
                style = MaterialTheme.typography.labelLarge,
            )
        }

        // ── Error retry hint ────────────────────────────────────────────
        if (isError) {
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = "Something went wrong. Please try again.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
                    contentDescription = "Sign-in error. Please try again."
                },
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        // ── Sign-up link ────────────────────────────────────────────────
        TextButton(
            onClick = onNavigateToSignup,
            modifier = Modifier.semantics {
                contentDescription = "Don't have an account? Sign up"
            },
        ) {
            Text(
                text = "Don't have an account? Sign up",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── Terms ───────────────────────────────────────────────────────
        Text(
            text = "By signing in, you agree to our Terms of Service and Privacy Policy.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics {
                contentDescription =
                    "By signing in, you agree to our Terms of Service and Privacy Policy"
            },
        )
    }
}

@Composable
private fun LoadingContent() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.semantics {
            liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite
            contentDescription = "Signing in, please wait"
        },
    ) {
        CircularProgressIndicator(
            modifier = Modifier
                .size(48.dp)
                .semantics {
                    contentDescription = "Sign-in progress indicator"
                },
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Signing in…",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the OAuth authorization code from an intent's deep link data.
 *
 * Matches the `https://finance.app/auth/callback?code=…` pattern
 * declared in AndroidManifest.xml.
 *
 * @return The authorization code, or `null` if this intent does not
 *         contain an auth callback.
 */
private fun extractOAuthCode(intent: Intent?): String? {
    val data = intent?.data ?: return null
    if (data.host != "finance.app" || data.path != "/auth/callback") return null
    return data.getQueryParameter("code")
}

// ─────────────────────────────────────────────────────────────────────────────
// Previews
// ─────────────────────────────────────────────────────────────────────────────

@Preview(
    name = "Login – Light",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_NO,
)
@Composable
private fun LoginScreenPreviewLight() {
    MaterialTheme {
        Surface {
            LoginContent(
                isError = false,
                onSignInWithGoogle = {},
                onSignInWithPasskey = {},
                onNavigateToSignup = {},
            )
        }
    }
}

@Preview(
    name = "Login – Dark",
    showBackground = true,
    showSystemUi = true,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
)
@Composable
private fun LoginScreenPreviewDark() {
    MaterialTheme(colorScheme = androidx.compose.material3.darkColorScheme()) {
        Surface {
            LoginContent(
                isError = false,
                onSignInWithGoogle = {},
                onSignInWithPasskey = {},
                onNavigateToSignup = {},
            )
        }
    }
}

@Preview(name = "Login – Error")
@Composable
private fun LoginScreenPreviewError() {
    MaterialTheme {
        Surface {
            LoginContent(
                isError = true,
                onSignInWithGoogle = {},
                onSignInWithPasskey = {},
                onNavigateToSignup = {},
            )
        }
    }
}

@Preview(name = "Login – Loading")
@Composable
private fun LoginScreenPreviewLoading() {
    MaterialTheme {
        Surface {
            LoadingContent()
        }
    }
}
