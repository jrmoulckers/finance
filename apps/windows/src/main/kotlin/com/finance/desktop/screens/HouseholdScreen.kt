// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.HouseholdMemberUi
import com.finance.desktop.viewmodel.HouseholdRole
import com.finance.desktop.viewmodel.HouseholdUiState
import com.finance.desktop.viewmodel.HouseholdViewModel
import com.finance.desktop.viewmodel.SharedBudgetUi

// =============================================================================
// Household / Family Plan Screen — Sprint 18 (#339)
// =============================================================================

/**
 * Family / Household Plan screen for multi-user shared finances.
 *
 * Features:
 * - Household creation and join-by-code flows
 * - Member list with role badges (Owner / Admin / Member / Viewer)
 * - Shared budget progress indicators
 * - Invite code display with clipboard copy
 *
 * Narrator reads household name, member roles, budget utilisation.
 * High contrast colours adapt via [MaterialTheme.colorScheme].
 */
@Composable
fun HouseholdScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<HouseholdViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading household data" },
            )
        }
        return
    }

    // Dialogs
    if (state.showCreateDialog) {
        CreateHouseholdDialog(
            nameInput = state.createNameInput,
            error = state.errorMessage,
            onNameChange = viewModel::updateCreateName,
            onConfirm = viewModel::createHousehold,
            onDismiss = viewModel::dismissCreateDialog,
        )
    }
    if (state.showJoinDialog) {
        JoinHouseholdDialog(
            codeInput = state.joinCodeInput,
            error = state.errorMessage,
            onCodeChange = viewModel::updateJoinCode,
            onConfirm = viewModel::joinHousehold,
            onDismiss = viewModel::dismissJoinDialog,
        )
    }
    if (state.showInviteDialog) {
        InviteDialog(
            inviteCode = state.inviteCode,
            onDismiss = viewModel::dismissInviteDialog,
        )
    }

    if (state.householdId == null) {
        // No household — show create / join options
        NoHouseholdView(
            onCreateClick = viewModel::showCreateDialog,
            onJoinClick = viewModel::showJoinDialog,
            modifier = modifier,
        )
    } else {
        HouseholdContent(
            state = state,
            onInvite = viewModel::showInviteDialog,
            onRemoveMember = viewModel::removeMember,
            modifier = modifier,
        )
    }
}

// ─── No-household empty state ────────────────────────────────────────────────

@Composable
private fun NoHouseholdView(
    onCreateClick: () -> Unit,
    onJoinClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(FinanceDesktopTheme.spacing.xxl)
                .semantics { contentDescription = "Household setup" },
        ) {
            Icon(
                imageVector = Icons.Filled.Group,
                contentDescription = null,
                modifier = Modifier.size(72.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
            Text(
                text = "Family & Household",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Share budgets and track spending together",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxxl))
            Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg)) {
                Button(
                    onClick = onCreateClick,
                    modifier = Modifier.semantics {
                        contentDescription = "Create a new household"
                    },
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Create Household")
                }
                OutlinedButton(
                    onClick = onJoinClick,
                    modifier = Modifier.semantics {
                        contentDescription = "Join an existing household with invite code"
                    },
                ) {
                    Icon(Icons.Filled.GroupAdd, contentDescription = null)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Join Household")
                }
            }
        }
    }
}

// ─── Household content ───────────────────────────────────────────────────────

@Composable
private fun HouseholdContent(
    state: HouseholdUiState,
    onInvite: () -> Unit,
    onRemoveMember: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Household screen" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
    ) {
        // Header
        item {
            HouseholdHeader(
                name = state.householdName,
                memberCount = state.members.size,
                totalBalance = state.totalSharedBalanceFormatted,
                onInvite = onInvite,
            )
        }

        // Members section
        item {
            Text(
                text = "Members",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Household members"
                },
            )
        }
        items(state.members, key = { it.id }) { member ->
            MemberCard(
                member = member,
                isOwner = state.isOwner,
                onRemove = { onRemoveMember(member.id) },
            )
        }

        // Shared Budgets section
        item {
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Shared Budgets",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Shared budgets"
                },
            )
        }
        items(state.sharedBudgets, key = { it.id }) { budget ->
            SharedBudgetCard(budget)
        }
    }
}

// ─── Household header card ───────────────────────────────────────────────────

@Composable
private fun HouseholdHeader(
    name: String,
    memberCount: Int,
    totalBalance: String,
    onInvite: () -> Unit,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "$name household, $memberCount members, shared balance $totalBalance"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Group,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Column {
                        Text(
                            text = name,
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            text = "$memberCount members",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                        )
                    }
                }
                FilledTonalButton(
                    onClick = onInvite,
                    modifier = Modifier.semantics {
                        contentDescription = "Invite new member"
                    },
                ) {
                    Icon(Icons.Filled.PersonAdd, contentDescription = null)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text("Invite")
                }
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
            HorizontalDivider(
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.2f),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            Column {
                Text(
                    text = "Total Shared Balance",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                )
                Text(
                    text = totalBalance,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}

// ─── Member card ─────────────────────────────────────────────────────────────

@Composable
private fun MemberCard(
    member: HouseholdMemberUi,
    isOwner: Boolean,
    onRemove: () -> Unit,
) {
    val roleBadgeColor = when (member.role) {
        HouseholdRole.OWNER -> MaterialTheme.colorScheme.primary
        HouseholdRole.ADMIN -> MaterialTheme.colorScheme.tertiary
        HouseholdRole.MEMBER -> MaterialTheme.colorScheme.secondary
        HouseholdRole.VIEWER -> MaterialTheme.colorScheme.outline
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${member.displayName}, ${member.role.name.lowercase()}, joined ${member.joinedDate}"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Avatar circle
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = member.avatarInitials,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.lg))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = member.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = member.email,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            // Role badge
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = roleBadgeColor.copy(alpha = 0.15f),
                modifier = Modifier.semantics {
                    contentDescription = "Role: ${member.role.name.lowercase()}"
                },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (member.role == HouseholdRole.OWNER) {
                        Icon(
                            Icons.Filled.Shield,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = roleBadgeColor,
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = member.role.name.lowercase().replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = roleBadgeColor,
                    )
                }
            }
            // Remove button (owner only, can't remove self)
            if (isOwner && member.role != HouseholdRole.OWNER) {
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier.semantics {
                        contentDescription = "Remove ${member.displayName}"
                        role = Role.Button
                    },
                ) {
                    Icon(
                        Icons.Filled.PersonRemove,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

// ─── Shared budget card ──────────────────────────────────────────────────────

@Composable
private fun SharedBudgetCard(budget: SharedBudgetUi) {
    val progressColor = when {
        budget.utilization >= 0.90f -> MaterialTheme.colorScheme.error
        budget.utilization >= 0.75f -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }
    val pct = (budget.utilization * 100).toInt()

    val animatedProgress by animateFloatAsState(
        targetValue = budget.utilization.coerceIn(0f, 1f),
        animationSpec = tween(800),
        label = "shared-budget-progress",
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${budget.name} shared budget: ${budget.spentFormatted} of ${budget.limitFormatted}, $pct percent used"
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = budget.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "$pct%",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = progressColor,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
                color = progressColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = budget.spentFormatted,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = budget.limitFormatted,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

@Composable
private fun CreateHouseholdDialog(
    nameInput: String,
    error: String?,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Create Household",
                modifier = Modifier.semantics { heading() },
            )
        },
        text = {
            Column {
                Text("Give your household a name to get started.")
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                OutlinedTextField(
                    value = nameInput,
                    onValueChange = onNameChange,
                    label = { Text("Household name") },
                    singleLine = true,
                    isError = error != null,
                    supportingText = error?.let { { Text(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Household name input" },
                )
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) { Text("Create") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        modifier = Modifier.semantics { contentDescription = "Create household dialog" },
    )
}

@Composable
private fun JoinHouseholdDialog(
    codeInput: String,
    error: String?,
    onCodeChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Join Household",
                modifier = Modifier.semantics { heading() },
            )
        },
        text = {
            Column {
                Text("Enter the invite code shared by your household owner.")
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                OutlinedTextField(
                    value = codeInput,
                    onValueChange = onCodeChange,
                    label = { Text("Invite code") },
                    singleLine = true,
                    isError = error != null,
                    supportingText = error?.let { { Text(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Invite code input" },
                )
            }
        },
        confirmButton = {
            Button(onClick = onConfirm) { Text("Join") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        modifier = Modifier.semantics { contentDescription = "Join household dialog" },
    )
}

@Composable
private fun InviteDialog(
    inviteCode: String,
    onDismiss: () -> Unit,
) {
    val clipboardManager = LocalClipboardManager.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Invite Members",
                modifier = Modifier.semantics { heading() },
            )
        },
        text = {
            Column {
                Text("Share this code with family members to join your household.")
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = inviteCode,
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = MaterialTheme.typography.headlineLarge.fontSize * 0.1f,
                            modifier = Modifier.semantics {
                                contentDescription = "Invite code: $inviteCode"
                            },
                        )
                        IconButton(
                            onClick = { clipboardManager.setText(AnnotatedString(inviteCode)) },
                            modifier = Modifier.semantics {
                                contentDescription = "Copy invite code to clipboard"
                                role = Role.Button
                            },
                        ) {
                            Icon(Icons.Filled.ContentCopy, contentDescription = null)
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = onDismiss) { Text("Done") }
        },
        modifier = Modifier.semantics { contentDescription = "Invite members dialog" },
    )
}
