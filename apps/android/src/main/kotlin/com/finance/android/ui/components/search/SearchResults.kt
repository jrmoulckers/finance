package com.finance.android.ui.components.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Header showing the number of search results.
 *
 * @param resultCount Total number of results matching the current filters.
 * @param query       The search query text (used in the empty-state message).
 * @param modifier    Optional [Modifier].
 */
@Composable
fun SearchResultsHeader(
    resultCount: Int,
    query: String,
    modifier: Modifier = Modifier,
) {
    val headerText = when {
        resultCount == 0 && query.isBlank() -> "No results"
        resultCount == 0 -> "" // handled by EmptySearchState below
        resultCount == 1 -> "1 result"
        else -> "$resultCount results"
    }

    if (resultCount > 0 || query.isBlank()) {
        Text(
            text = headerText,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .semantics {
                    contentDescription = headerText
                    heading()
                },
        )
    }
}

/**
 * Empty state displayed when no results match the query.
 *
 * @param query    The search text that produced zero results.
 * @param modifier Optional [Modifier].
 */
@Composable
fun EmptySearchState(
    query: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp)
            .semantics {
                contentDescription = "No results for $query"
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.SearchOff,
            contentDescription = "No results icon",
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "No results for '$query'",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Try a different search term or adjust your filters.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Wrapper composable that shows the result count header and, when there are
 * zero results, the empty state. When results exist, it invokes [content] to
 * render the list.
 *
 * @param resultCount Number of matching results.
 * @param query       Current search query.
 * @param modifier    Optional [Modifier].
 * @param content     Slot for the results list.
 */
@Composable
fun SearchResults(
    resultCount: Int,
    query: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier = modifier) {
        SearchResultsHeader(resultCount = resultCount, query = query)

        if (resultCount == 0 && query.isNotBlank()) {
            EmptySearchState(query = query)
        } else {
            content()
        }
    }
}

// ---------------------------------------------------------------------------
// Text highlighting helper
// ---------------------------------------------------------------------------

/**
 * Builds an [AnnotatedString] that highlights every occurrence of [query]
 * inside [text] using a bold + primary-color span.
 *
 * @param text  The full text to display.
 * @param query The substring to highlight.
 * @param highlightStyle [SpanStyle] applied to matched segments.
 */
@Composable
fun highlightMatchingText(
    text: String,
    query: String,
    highlightStyle: SpanStyle = SpanStyle(
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
    ),
): AnnotatedString {
    if (query.isBlank() || !text.contains(query, ignoreCase = true)) {
        return AnnotatedString(text)
    }

    return buildAnnotatedString {
        var startIndex = 0
        val lowerText = text.lowercase()
        val lowerQuery = query.lowercase()

        while (startIndex < text.length) {
            val matchIndex = lowerText.indexOf(lowerQuery, startIndex)
            if (matchIndex == -1) {
                append(text.substring(startIndex))
                break
            }
            // Append text before the match
            if (matchIndex > startIndex) {
                append(text.substring(startIndex, matchIndex))
            }
            // Append highlighted match (preserving original casing)
            withStyle(highlightStyle) {
                append(text.substring(matchIndex, matchIndex + query.length))
            }
            startIndex = matchIndex + query.length
        }
    }
}

/**
 * Convenience composable that renders [text] with matching segments of
 * [query] highlighted.
 *
 * @param text  Full text.
 * @param query Substring to highlight.
 * @param modifier Optional [Modifier].
 */
@Composable
fun HighlightedText(
    text: String,
    query: String,
    modifier: Modifier = Modifier,
) {
    Text(
        text = highlightMatchingText(text = text, query = query),
        style = MaterialTheme.typography.bodyLarge,
        modifier = modifier.semantics {
            contentDescription = text
        },
    )
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(name = "SearchResults — with results", showBackground = true)
@Composable
private fun SearchResultsWithResultsPreview() {
    MaterialTheme {
        SearchResults(
            resultCount = 42,
            query = "grocery",
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                HighlightedText(text = "Whole Foods Grocery", query = "grocery")
                HighlightedText(text = "Grocery Outlet", query = "grocery")
                HighlightedText(text = "Amazon Grocery Delivery", query = "grocery")
            }
        }
    }
}

@Preview(name = "SearchResults — empty state", showBackground = true)
@Composable
private fun SearchResultsEmptyPreview() {
    MaterialTheme {
        SearchResults(
            resultCount = 0,
            query = "xyznonexistent",
        ) {
            // No content — empty state is shown automatically.
        }
    }
}

@Preview(name = "SearchResults — no query, no results", showBackground = true)
@Composable
private fun SearchResultsNoQueryPreview() {
    MaterialTheme {
        SearchResults(
            resultCount = 0,
            query = "",
        ) {
            // Placeholder content
        }
    }
}

@Preview(name = "HighlightedText — match", showBackground = true)
@Composable
private fun HighlightedTextPreview() {
    MaterialTheme {
        HighlightedText(
            text = "Whole Foods Grocery Store",
            query = "Grocery",
            modifier = Modifier.padding(16.dp),
        )
    }
}
