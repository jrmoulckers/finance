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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.accessibility.focusVisible
import com.finance.desktop.components.KeyboardShortcut
import com.finance.desktop.data.repository.AuthAccount
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.components.KeyboardShortcutEffect
import com.finance.desktop.components.ShortcutHandler
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme

/**
 * Logical grouping for sidebar destinations (#3655).
 *
 * Grouping a flat 19+ item list into a small set of labelled sections reduces
 * cognitive load and surfaces the primary tasks. [PRIMARY] has no visible
 * header (it is the default landing set); the others render a group header with
 * proper Narrator heading semantics.
 *
 * @param header Visible/Narrator section label, or empty for [PRIMARY].
 */
enum class NavGroup(val header: String) {
    PRIMARY(""),
    INSIGHTS("Insights"),
    TOOLS("Tools"),
    MORE("More"),
}

/**
 * Desktop navigation destinations.
 *
 * Each entry carries its icon, label, keyboard shortcut key, and the
 * [NavGroup] it belongs to in the grouped sidebar information architecture.
 */
enum class Screen(
    val label: String,
    val icon: ImageVector,
    val shortcutKey: Key,
    val shortcutLabel: String,
    val group: NavGroup,
) {
    Dashboard("Dashboard", Icons.Filled.Dashboard, Key.One, "Ctrl+1", NavGroup.PRIMARY),
    Accounts("Accounts", Icons.Filled.AccountBalance, Key.Two, "Ctrl+2", NavGroup.PRIMARY),
    Transactions("Transactions", Icons.Filled.Receipt, Key.Three, "Ctrl+3", NavGroup.PRIMARY),
    Budgets("Budgets", Icons.Filled.PieChart, Key.Four, "Ctrl+4", NavGroup.PRIMARY),
    Goals("Goals", Icons.Filled.Star, Key.Five, "Ctrl+5", NavGroup.PRIMARY),
    Reports("Reports", Icons.Filled.Assessment, Key.Nine, "Ctrl+9", NavGroup.PRIMARY),
    HealthScore("Health Score", Icons.Filled.Favorite, Key.Eight, "Ctrl+8", NavGroup.INSIGHTS),
    Investments("Investments", Icons.AutoMirrored.Filled.ShowChart, Key.F1, "Ctrl+F1", NavGroup.INSIGHTS),
    Achievements("Achievements", Icons.Filled.EmojiEvents, Key.A, "Ctrl+A", NavGroup.INSIGHTS),
    Tips("Tips", Icons.Filled.Lightbulb, Key.T, "Ctrl+T", NavGroup.INSIGHTS),
    Household("Household", Icons.Filled.Group, Key.H, "Ctrl+H", NavGroup.TOOLS),
    Import("Import", Icons.Filled.FileUpload, Key.I, "Ctrl+I", NavGroup.TOOLS),
    Widgets("Widgets", Icons.Filled.Widgets, Key.Seven, "Ctrl+7", NavGroup.TOOLS),
    Currency("Currency", Icons.Filled.CurrencyExchange, Key.F2, "Ctrl+F2", NavGroup.TOOLS),
    Negotiate("Negotiate", Icons.Filled.Groups, Key.N, "Ctrl+N", NavGroup.TOOLS),
    QuickAdd("Quick Add", Icons.Filled.AutoAwesome, Key.Q, "Ctrl+Q", NavGroup.TOOLS),
    Upgrade("Upgrade", Icons.Filled.WorkspacePremium, Key.Six, "Ctrl+6", NavGroup.MORE),
    Referral("Referral", Icons.Filled.Share, Key.R, "Ctrl+R", NavGroup.MORE),
    Diagnostics("Diagnostics", Icons.Filled.Speed, Key.D, "Ctrl+D", NavGroup.MORE),
    Settings("Settings", Icons.Filled.Settings, Key.Zero, "Ctrl+0", NavGroup.MORE),
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
    onScreenChange: (Screen) -> Unit = {},
    content: @Composable (Screen) -> Unit,
) {
    var currentScreen by rememberSaveable { mutableStateOf(Screen.Dashboard) }
    var isExpanded by rememberSaveable { mutableStateOf(true) }
    val authRepository = koinGet<AuthRepository>()
    val account by authRepository.currentAccount.collectAsState()
    val isSignedIn by authRepository.isAuthenticated.collectAsState()

    // Notify the host (window title, etc.) of the active screen (#3693).
    LaunchedEffect(currentScreen) { onScreenChange(currentScreen) }

    // Register keyboard shortcuts (one per destination)
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

            // Scrollable navigation list (#3592) — takes remaining height so the
            // account row + Settings stay pinned and reachable on short windows /
            // high DPI. Destinations are grouped by NavGroup (#3655) with
            // Narrator heading semantics on each section label.
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .semantics { contentDescription = "Primary navigation" },
            ) {
                val grouped = Screen.entries
                    .filter { it != Screen.Settings }
                    .groupBy { it.group }
                NavGroup.entries.forEach { group ->
                    val screens = grouped[group].orEmpty()
                    if (screens.isEmpty()) return@forEach
                    if (group != NavGroup.PRIMARY) {
                        SidebarGroupHeader(title = group.header, isExpanded = isExpanded)
                    }
                    screens.forEach { screen ->
                        SidebarItem(
                            screen = screen,
                            isSelected = currentScreen == screen,
                            isExpanded = isExpanded,
                            onClick = { onScreenSelected(screen) },
                        )
                    }
                }
            }

            // Account status and settings pinned at bottom
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            HorizontalDivider(
                modifier = Modifier.padding(horizontal = FinanceDesktopTheme.spacing.sm),
                color = MaterialTheme.colorScheme.outlineVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            AccountStatusItem(
                account = account,
                isSignedIn = isSignedIn,
                isExpanded = isExpanded,
                onClick = onAccountSelected,
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
 * Section header for a [NavGroup] in the sidebar (#3655).
 *
 * When expanded it shows the group label with a Narrator heading role. When
 * collapsed to the icon rail it renders a thin divider so the grouping is still
 * visually communicated without labels.
 */
@Composable
private fun SidebarGroupHeader(title: String, isExpanded: Boolean) {
    if (isExpanded) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .padding(
                    start = FinanceDesktopTheme.spacing.lg,
                    end = FinanceDesktopTheme.spacing.sm,
                    top = FinanceDesktopTheme.spacing.md,
                    bottom = FinanceDesktopTheme.spacing.xs,
                )
                .semantics {
                    heading()
                    contentDescription = "$title section"
                },
        )
    } else {
        HorizontalDivider(
            modifier = Modifier.padding(
                horizontal = FinanceDesktopTheme.spacing.md,
                vertical = FinanceDesktopTheme.spacing.xs,
            ),
            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
        )
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
            .focusVisible(shape = RoundedCornerShape(8.dp))
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
            .focusVisible(shape = RoundedCornerShape(8.dp))
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
