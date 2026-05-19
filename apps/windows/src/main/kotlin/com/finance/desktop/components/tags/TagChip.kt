// SPDX-License-Identifier: BUSL-1.1

// Multiple public declarations: TagSize enum + TagChip composable
@file:Suppress("MatchingDeclarationName")

package com.finance.desktop.components.tags

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.absoluteValue

/**
 * Tag chip size variants.
 */
enum class TagSize {
    /** Small chip for use in compact list items. */
    SMALL,

    /** Medium chip for detail views. */
    MEDIUM,
}

/**
 * A colored tag chip composable that derives its color deterministically from the tag name.
 *
 * Uses a hash of the tag name to generate a consistent HSL color, ensuring the same tag
 * always appears with the same color across the application. Supports subtags with colon
 * notation (e.g., "travel:flights") — the parent tag determines the hue and the subtag
 * adds a slight lightness shift.
 *
 * @param tag The full tag string, optionally containing a colon for subtag notation.
 * @param size The chip size variant.
 * @param onRemove Optional callback for the remove button — null hides the button.
 * @param modifier Optional Compose modifier.
 */
@Composable
fun TagChip(
    tag: String,
    size: TagSize = TagSize.MEDIUM,
    onRemove: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val (backgroundColor, textColor) = rememberTagColors(tag)
    val displayText = formatTagDisplay(tag)

    val paddingH = if (size == TagSize.SMALL) 8.dp else 12.dp
    val paddingV = if (size == TagSize.SMALL) 2.dp else 4.dp
    val textStyle = if (size == TagSize.SMALL) {
        MaterialTheme.typography.labelSmall
    } else {
        MaterialTheme.typography.labelMedium
    }

    Row(
        modifier = modifier
            .background(backgroundColor, RoundedCornerShape(16.dp))
            .padding(horizontal = paddingH, vertical = paddingV)
            .semantics {
                contentDescription = "Tag: $tag${if (onRemove != null) ", removable" else ""}"
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = displayText,
            style = textStyle,
            fontWeight = FontWeight.Medium,
            color = textColor,
        )

        if (onRemove != null) {
            IconButton(
                onClick = onRemove,
                modifier = Modifier
                    .size(if (size == TagSize.SMALL) 14.dp else 18.dp)
                    .semantics { contentDescription = "Remove tag $tag" },
            ) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = null,
                    modifier = Modifier.size(if (size == TagSize.SMALL) 10.dp else 14.dp),
                    tint = textColor.copy(alpha = 0.7f),
                )
            }
        }
    }
}

/**
 * Formats a tag for display, rendering subtags with a separator.
 *
 * "travel:flights" → "travel › flights"
 */
private fun formatTagDisplay(tag: String): String {
    return if (':' in tag) {
        tag.split(':').joinToString(" › ")
    } else {
        tag
    }
}

/**
 * Derives deterministic background and text colors from a tag name using a hash → HSL approach.
 *
 * The parent portion (before colon) determines the base hue. Subtags get a slight
 * lightness shift to differentiate from the parent while remaining visually related.
 */
@Composable
private fun rememberTagColors(tag: String): Pair<Color, Color> {
    val parts = tag.split(':')
    val baseTag = parts.first()

    // Generate a stable hue from the tag name hash
    val hue = (baseTag.hashCode().absoluteValue % 360).toFloat()

    // Subtags get a slight lightness variation
    val lightnessOffset = if (parts.size > 1) {
        (parts[1].hashCode().absoluteValue % 10) * 0.01f
    } else {
        0f
    }

    val saturation = 0.55f
    val lightness = 0.88f + lightnessOffset

    val backgroundColor = hslToColor(hue, saturation, lightness)
    val textColor = hslToColor(hue, saturation + 0.15f, 0.25f)

    return backgroundColor to textColor
}

/**
 * Converts HSL values to a Compose [Color].
 *
 * @param hue 0–360 degrees
 * @param saturation 0–1
 * @param lightness 0–1
 */
private fun hslToColor(hue: Float, saturation: Float, lightness: Float): Color {
    val s = saturation.coerceIn(0f, 1f)
    val l = lightness.coerceIn(0f, 1f)
    val c = (1f - abs(2f * l - 1f)) * s
    val x = c * (1f - abs((hue / 60f) % 2f - 1f))
    val m = l - c / 2f

    val (r1, g1, b1) = when {
        hue < 60f -> Triple(c, x, 0f)
        hue < 120f -> Triple(x, c, 0f)
        hue < 180f -> Triple(0f, c, x)
        hue < 240f -> Triple(0f, x, c)
        hue < 300f -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }

    return Color(
        red = (r1 + m).coerceIn(0f, 1f),
        green = (g1 + m).coerceIn(0f, 1f),
        blue = (b1 + m).coerceIn(0f, 1f),
    )
}
