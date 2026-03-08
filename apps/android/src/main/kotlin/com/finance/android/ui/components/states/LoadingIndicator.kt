// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.components.states

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// FinanceLoadingIndicator
// ---------------------------------------------------------------------------

/**
 * A centered circular progress indicator used as a full-screen loading state.
 *
 * Announced as **"Loading"** by TalkBack.
 *
 * @param modifier Additional [Modifier].
 */
@Composable
fun FinanceLoadingIndicator(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.semantics {
                contentDescription = "Loading"
            },
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

// ---------------------------------------------------------------------------
// PullToRefreshWrapper
// ---------------------------------------------------------------------------

/**
 * Wraps arbitrary [content] with Material 3 pull-to-refresh behaviour.
 *
 * @param isRefreshing Whether a refresh operation is currently in progress.
 * @param onRefresh Callback invoked when the user triggers a refresh.
 * @param modifier Additional [Modifier].
 * @param content The screen content to display inside the refreshable area.
 */
@Composable
fun PullToRefreshWrapper(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier
            .fillMaxSize()
            .semantics {
                contentDescription = if (isRefreshing) "Refreshing" else "Pull down to refresh"
            },
    ) {
        content()
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(showBackground = true, name = "FinanceLoadingIndicator")
@Composable
private fun FinanceLoadingIndicatorPreview() {
    MaterialTheme {
        FinanceLoadingIndicator()
    }
}

@Preview(showBackground = true, name = "PullToRefreshWrapper")
@Composable
private fun PullToRefreshWrapperPreview() {
    MaterialTheme {
        PullToRefreshWrapper(
            isRefreshing = false,
            onRefresh = {},
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Screen content goes here",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}
