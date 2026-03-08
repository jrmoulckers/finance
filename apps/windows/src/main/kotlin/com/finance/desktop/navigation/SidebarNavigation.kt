// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.components.KeyboardShortcut
import com.finance.desktop.components.KeyboardShortcutEffect
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Desktop navigation destinations.
 *
 * Each entry carries its icon, label, and keyboard shortcut key (Ctrl+1 … Ctrl+6).
 */
enum class Screen(
    val label: String,
    val icon: ImageVector,
    val shortcutKey: Key,
    val shortcutLabel: String,
) {
    Dashboard("Dashboard", Icons.Filled.Dashboard, Key.One, "Ctrl+1"),
    Accounts("Accounts", Icons.Filled.AccountBalance, Key.Two, "Ctrl+2"),
    Transactions("Transactions", Icons.Filled.Receipt, Key.Three, "Ctrl+3"),
    Budgets("Budgets", Icons.Filled.PieChart, Key.Four, "Ctrl+4"),
    Goals("Goals", Icons.Filled.Star, Key.Five, "Ctrl+5"),
    Settings("Settings", Icons.Filled.Settings, Key.Six, "Ctrl+6"),
}

/** Width of the sidebar when expanded. */
private val SIDEBAR_EXPANDED_WIDTH = 240.dp

/** Width of the sidebar when collapsed (icon-only rail). */
private val SIDEBAR_COLLAPSED_WIDTH = 64.dp

/**
 * Root layout composable that renders a collapsible sidebar together with
 * the currently-selected screen content.
 *
 * Keyboard shortcuts Ctrl+1 through Ctrl+6 navigate between screens.
 * The sidebar can be collapsed via the hamburger button to give more
 * horizontal space to the content area.
 *
 * @param shortcutHandler The [ShortcutHandler] from the application window,
 *   used to register navigation shortcuts.
 * @param content Composable lambda receiving the currently selected [Screen].
 */
@Composable
fun SidebarNavigation(
    shortcutHandler: ShortcutHandler,
    content: @Composable (Screen) -> Unit,
) {
    var currentScreen by rememberSaveable { mutableStateOf(Screen.Dashboard) }
    var isExpanded by rememberSaveable { mutableStateOf(true) }

    // Register keyboard shortcuts (Ctrl+1 … Ctrl+6)
    KeyboardShortcutEffect(shortcutHandler) {
        Screen.entries.map { screen ->
            KeyboardShortcut(
                key = screen.shortcutKey,
                description = "Navigate to ${screen.label}",
            ) { currentScreen = screen }
        }
    }

    Row(modifier = Modifier.fillMaxSize()) {
        SidebarPanel(
            currentScreen = currentScreen,
            isExpanded = isExpanded,
            onScreenSelected = { currentScreen = it },
            onToggleExpanded = { isExpanded = !isExpanded },
        )

        // Content area
        Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
            content(currentScreen)
        }
    }
}

/**
 * The sidebar panel itself — a vertical rail with icons, and optionally labels.
 */
@Composable
private fun SidebarPanel(
    currentScreen: Screen,
    isExpanded: Boolean,
    onScreenSelected: (Screen) -> Unit,
    onToggleExpanded: () -> Unit,
) {
    val sidebarWidth by animateDpAsState(
        targetValue = if (isExpanded) SIDEBAR_EXPANDED_WIDTH else SIDEBAR_COLLAPSED_WIDTH,
        animationSpec = tween(durationMillis = 200),
        label = "sidebar-width",
    )

    Surface(
        modifier = Modifier
            .width(sidebarWidth)
            .fillMaxHeight(),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .padding(vertical = FinanceDesktopTheme.spacing.sm),
        ) {
            // Collapse / expand toggle
            Row(
                modifier = Modifier
                    .padding(horizontal = FinanceDesktopTheme.spacing.sm)
                    .height(48.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = onToggleExpanded,
                    modifier = Modifier.semantics {
                        contentDescription =
                            if (isExpanded) "Collapse sidebar" else "Expand sidebar"
                    },
                ) {
                    Icon(Icons.Filled.Menu, contentDescription = null)
                }
                AnimatedVisibility(visible = isExpanded, enter = fadeIn(), exit = fadeOut()) {
                    Text(
                        text = "Finance",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = FinanceDesktopTheme.spacing.sm),
                    )
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = FinanceDesktopTheme.spacing.sm),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            // Navigation items — all except Settings
            Screen.entries
                .filter { it != Screen.Settings }
                .forEach { screen ->
                    SidebarItem(
                        screen = screen,
                        isSelected = currentScreen == screen,
                        isExpanded = isExpanded,
                        onClick = { onScreenSelected(screen) },
                    )
                }

            Spacer(Modifier.weight(1f))

            // Settings at bottom
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = FinanceDesktopTheme.spacing.sm),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            SidebarItem(
                screen = Screen.Settings,
                isSelected = currentScreen == Screen.Settings,
                isExpanded = isExpanded,
                onClick = { onScreenSelected(Screen.Settings) },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        }
    }
}

/**
 * Single sidebar navigation item. Shows icon + optional label when expanded.
 *
 * Accessibility: exposes [Role.Tab], selection state, and shortcut hint via
 * content description so Narrator reads e.g. "Dashboard, selected, Ctrl+1".
 */
@Composable
private fun SidebarItem(
    screen: Screen,
    isSelected: Boolean,
    isExpanded: Boolean,
    onClick: () -> Unit,
) {
    val backgroundColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }

    val contentColor = if (isSelected) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    val accessibilityLabel = buildString {
        append(screen.label)
        if (isSelected) append(", selected")
        append(", ${screen.shortcutLabel}")
    }

    Row(
        modifier = Modifier
            .padding(horizontal = FinanceDesktopTheme.spacing.sm, vertical = 2.dp)
            .height(44.dp)
            .then(
                if (isExpanded) Modifier.width(SIDEBAR_EXPANDED_WIDTH - FinanceDesktopTheme.spacing.lg)
                else Modifier.width(SIDEBAR_COLLAPSED_WIDTH - FinanceDesktopTheme.spacing.lg),
            )
            .background(backgroundColor, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(),
                onClick = onClick,
            )
            .semantics {
                role = Role.Tab
                selected = isSelected
                contentDescription = accessibilityLabel
            }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Start,
    ) {
        Icon(
            imageVector = screen.icon,
            contentDescription = null, // described by Row semantics
            tint = contentColor,
            modifier = Modifier.size(22.dp),
        )
        AnimatedVisibility(visible = isExpanded, enter = fadeIn(), exit = fadeOut()) {
            Text(
                text = screen.label,
                style = MaterialTheme.typography.labelLarge,
                color = contentColor,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 12.dp),
            )
        }
    }
}
