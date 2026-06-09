// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.finance.core.icons.FLUENT_FILLED
import com.finance.core.icons.FLUENT_REGULAR
import com.finance.core.icons.IconPack
import com.finance.core.icons.IconPacks
import com.finance.core.icons.IconToken
import com.finance.core.icons.Platform
import com.finance.core.icons.STANDARD_LUCIDE
import com.finance.core.icons.mappings.FluentFilledMapping
import com.finance.core.icons.mappings.FluentRegularMapping
import com.finance.core.icons.mappings.LucideMapping

val LocalIconPack = staticCompositionLocalOf { IconPacks.defaultFor(Platform.WINDOWS) }

@Composable
fun IconPackProvider(
    iconPackId: String,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalIconPack provides iconPackForId(iconPackId)) {
        content()
    }
}

@Composable
fun IconView(
    token: IconToken,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    size: Dp = 24.dp,
) {
    val resolved = resolveIconResource(token, LocalIconPack.current)
    if (resolved.exists) {
        Icon(
            painter = painterResource(resolved.resourcePath.removePrefix("/")),
            contentDescription = token.accessibilityLabel(),
            tint = tint,
            modifier = modifier.then(Modifier.size(size)),
        )
    } else {
        Icon(
            imageVector = Icons.Outlined.HelpOutline,
            contentDescription = token.accessibilityLabel(),
            tint = tint,
            modifier = modifier.then(Modifier.size(size)),
        )
    }
}

internal data class ResolvedIconResource(
    val resourcePath: String,
    val exists: Boolean,
)

internal fun resolveIconResource(
    token: IconToken,
    pack: IconPack,
): ResolvedIconResource {
    val resourcePath = resolveIconResourcePath(token, pack.id)
    return ResolvedIconResource(resourcePath, resourceExists(resourcePath))
}

internal fun resolveIconResourcePath(
    token: IconToken,
    packId: String,
): String {
    return when (packId) {
        STANDARD_LUCIDE -> "/icons/lucide/${LucideMapping.mapping.getValue(token)}.svg"
        FLUENT_FILLED -> "/icons/fluent-filled/${FluentFilledMapping.mapping.getValue(token)}.svg"
        FLUENT_REGULAR -> "/icons/fluent-regular/${FluentRegularMapping.mapping.getValue(token)}.svg"
        else -> "/icons/lucide/${LucideMapping.mapping.getValue(token)}.svg"
    }
}

internal fun iconPackForId(iconPackId: String): IconPack {
    return IconPacks.forPlatform(Platform.WINDOWS).firstOrNull { it.id == iconPackId }
        ?: IconPacks.defaultFor(Platform.WINDOWS)
}

internal fun resourceExists(resourcePath: String): Boolean {
    val normalized = resourcePath.removePrefix("/")
    return Thread.currentThread().contextClassLoader.getResource(normalized) != null ||
        IconViewResourceMarker::class.java.classLoader.getResource(normalized) != null
}

private object IconViewResourceMarker

private fun IconToken.accessibilityLabel(): String = name
    .lowercase()
    .split('_')
    .joinToString(" ") { word -> word.replaceFirstChar { it.titlecase() } }
