// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components.search

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SearchBar
import androidx.compose.material3.SearchBarDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Material 3 expandable [SearchBar] with 300 ms debounce.
 *
 * @param query Current query text (controlled).
 * @param onQueryChange Callback fired on every keystroke (updates the
 *   controlled value immediately for a responsive feel).
 * @param onSearch Debounced callback fired 300 ms after the user stops
 *   typing **or** when the keyboard search action is pressed.
 * @param placeholder Placeholder shown when [query] is empty.
 * @param accessibilityLabel TalkBack label (e.g. "Search transactions").
 * @param modifier Optional [Modifier] for the outer container.
 */
@OptIn(ExperimentalMaterial3Api::class, FlowPreview::class)
@Composable
fun FinanceSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: (String) -> Unit,
    placeholder: String = "Search",
    accessibilityLabel: String = "Search transactions",
    modifier: Modifier = Modifier,
) {
    val keyboardController = LocalSoftwareKeyboardController.current

    // --- 300 ms debounce via snapshotFlow ----------------------------------
    LaunchedEffect(Unit) {
        snapshotFlow { query }
            .distinctUntilChanged()
            .debounce(300L)
            .collectLatest { debouncedQuery -> onSearch(debouncedQuery) }
    }

    // --- Expansion state (local, not hoisted) ------------------------------
    var expanded by remember { mutableStateOf(false) }

    SearchBar(
        inputField = {
            SearchBarDefaults.InputField(
                query = query,
                onQueryChange = onQueryChange,
                onSearch = { submittedQuery ->
                    onSearch(submittedQuery)
                    keyboardController?.hide()
                    expanded = false
                },
                expanded = expanded,
                onExpandedChange = { expanded = it },
                placeholder = {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search icon",
                    )
                },
                trailingIcon = {
                    AnimatedVisibility(
                        visible = query.isNotEmpty(),
                        enter = fadeIn(),
                        exit = fadeOut(),
                    ) {
                        IconButton(
                            onClick = {
                                onQueryChange("")
                                onSearch("")
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Clear search"
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Clear search",
                            )
                        }
                    }
                },
                modifier = Modifier.semantics {
                    contentDescription = accessibilityLabel
                },
                keyboardOptions = KeyboardOptions.Default.copy(
                    imeAction = ImeAction.Search,
                ),
                keyboardActions = KeyboardActions(
                    onSearch = {
                        onSearch(query)
                        keyboardController?.hide()
                        expanded = false
                    },
                ),
            )
        },
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    ) {
        // Search suggestions / recent searches could go here.
    }
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(name = "SearchBar — empty", showBackground = true)
@Composable
private fun FinanceSearchBarEmptyPreview() {
    MaterialTheme {
        FinanceSearchBar(
            query = "",
            onQueryChange = {},
            onSearch = {},
            placeholder = "Search transactions",
            accessibilityLabel = "Search transactions",
        )
    }
}

@Preview(name = "SearchBar — with text", showBackground = true)
@Composable
private fun FinanceSearchBarWithTextPreview() {
    MaterialTheme {
        FinanceSearchBar(
            query = "Grocery",
            onQueryChange = {},
            onSearch = {},
            placeholder = "Search transactions",
            accessibilityLabel = "Search transactions",
        )
    }
}
