// SPDX-License-Identifier: BUSL-1.1

@file:Suppress("MatchingDeclarationName") // File contains Screen enum + SidebarNavigation composable

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CurrencyExchange
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import com.finance.desktop.data.repository.AuthAccount
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.components.KeyboardShortcutEffect
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.di.koinGet
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
    Upgrade("Upgrade", Icons.Filled.WorkspacePremium, Key.Six, "Ctrl+6"),
    Tips("Tips", Icons.Filled.Lightbulb, Key.T, "Ctrl+T"),
    Investments("Investments", Icons.AutoMirrored.Filled.ShowChart, Key.F1, "Ctrl+F1"),
    Household("Household", Icons.Filled.Group, Key.H, "Ctrl+H"),
    Widgets("Widgets", Icons.Filled.Widgets, Key.Seven, "Ctrl+7"),
    HealthScore("Health Score", Icons.Filled.Favorite, Key.Eight, "Ctrl+8"),
    Reports("Reports", Icons.Filled.Assessment, Key.Nine, "Ctrl+9"),
    QuickAdd("Quick Add", Icons.Filled.AutoAwesome, Key.Q, "Ctrl+Q"),
    Import("Import", Icons.Filled.FileUpload, Key.I, "Ctrl+I"),
    Referral("Referral", Icons.Filled.Share, Key.R, "Ctrl+R"),
    Negotiate("Negotiate", Icons.Filled.Groups, Key.N, "Ctrl+N"),
    Currency("Currency", Icons.Filled.CurrencyExchange, Key.F2, "Ctrl+F2"),
    Diagnostics("Diagnostics", Icons.Filled.Speed, Key.D, "Ctrl+D"),
    Achievements("Achievements", Icons.Filled.EmojiEvents, Key.A, "Ctrl+A"),
    Settings("Settings", Icons.Filled.Settings, Key.Zero, "Ctrl+0"),
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
    onAccountSelected: () -> Unit = {},
    content: @Composable (Screen) -> Unit,
) {
    var currentScreen by rememberSaveable { mutableStateOf(Screen.Dashboard) }
    var isExpanded by rememberSaveable { mutableStateOf(true) }
    val authRepository = koinGet<AuthRepository>()
    val account by authRepository.currentAccount.collectAsState()
    val isSignedIn by authRepository.isAuthenticated.collectAsState()

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
            account = account,
            isSignedIn = isSignedIn,
            onScreenSelected = { currentScreen = it },
            onAccountSelected = {
                currentScreen = Screen.Settings
                onAccountSelected()
            },
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
    account: AuthAccount?,
    isSignedIn: Boolean,
    onScreenSelected: (Screen) -> Unit,
    onAccountSelected: () -> Unit,
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

            // Account status and settings at bottom
            AccountStatusItem(
                account = account,
                isSignedIn = isSignedIn,
                isExpanded = isExpanded,
                onClick = onAccountSelected,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
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

@Composable
private fun AccountStatusItem(
    account: AuthAccount?,
    isSignedIn: Boolean,
    isExpanded: Boolean,
    onClick: () -> Unit,
) {
    val title = if (isSignedIn) account?.email ?: account?.userId ?: "Signed in" else "Not signed in"
    val subtitle = if (isSignedIn) "Account" else "Local-only"
    val initial = account?.email?.firstOrNull()?.uppercase() ?: "?"
    val accessibilityLabel = if (isSignedIn) {
        "Account, $title, signed in. Opens Settings account section"
    } else {
        "Not signed in. Opens Settings account section"
    }

    Row(
        modifier = Modifier
            .padding(horizontal = FinanceDesktopTheme.spacing.sm, vertical = 2.dp)
            .height(48.dp)
            .then(
                if (isExpanded) Modifier.width(SIDEBAR_EXPANDED_WIDTH - FinanceDesktopTheme.spacing.lg)
                else Modifier.width(SIDEBAR_COLLAPSED_WIDTH - FinanceDesktopTheme.spacing.lg),
            )
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(),
                onClick = onClick,
            )
            .semantics {
                role = Role.Button
                contentDescription = accessibilityLabel
            }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .background(
                    color = if (isSignedIn) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.errorContainer
                    },
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initial,
                style = MaterialTheme.typography.labelMedium,
                color = if (isSignedIn) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onErrorContainer
                },
                fontWeight = FontWeight.SemiBold,
            )
        }
        AnimatedVisibility(visible = isExpanded, enter = fadeIn(), exit = fadeOut()) {
            Column(modifier = Modifier.padding(start = 12.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
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
