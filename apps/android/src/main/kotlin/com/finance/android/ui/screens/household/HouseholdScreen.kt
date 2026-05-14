// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.household

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.models.HouseholdRole
import org.koin.compose.viewmodel.koinViewModel

/**
 * Family/Household Plan screen (#1114).
 *
 * Provides household creation, member invitation with deep link support,
 * role management (Owner/Partner/Member/Viewer), and shared vs personal
 * budget toggling. Full TalkBack accessibility.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
fun HouseholdScreen(
    onBack: () -> Unit = {},
    onShareInvite: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: HouseholdViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.successMessage) {
        state.successMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Household",
                        modifier = Modifier.semantics {
                            contentDescription = "Household management"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = modifier,
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .semantics { contentDescription = "Loading household data" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading indicator" },
                )
            }
            return@Scaffold
        }

        HouseholdContent(
            state = state,
            onCreateHousehold = viewModel::showCreateDialog,
            onInviteMember = viewModel::showInviteDialog,
            onToggleSharedBudget = viewModel::toggleSharedBudget,
            onShowRoleDialog = viewModel::showRoleDialog,
            onRemoveMember = viewModel::removeMember,
            onShareInvite = onShareInvite,
            modifier = Modifier.padding(padding),
        )

        // Create Household Dialog
        if (state.showCreateDialog) {
            CreateHouseholdDialog(
                name = state.newHouseholdName,
                onNameChange = viewModel::updateNewHouseholdName,
                onConfirm = viewModel::createHousehold,
                onDismiss = viewModel::dismissCreateDialog,
                isCreating = state.isCreating,
            )
        }

        // Invite Member Dialog
        if (state.showInviteDialog) {
            InviteMemberDialog(
                email = state.inviteEmail,
                role = state.inviteRole,
                inviteCode = state.inviteCode,
                onEmailChange = viewModel::updateInviteEmail,
                onRoleChange = viewModel::updateInviteRole,
                onSendInvite = viewModel::sendInvite,
                onDismiss = viewModel::dismissInviteDialog,
                onShareInvite = onShareInvite,
                isSaving = state.isSaving,
                errorMessage = state.errorMessage,
            )
        }

        // Role Change Dialog
        if (state.showRoleDialog && state.selectedMember != null) {
            RoleChangeDialog(
                member = state.selectedMember!!,
                onRoleSelected = { role ->
                    viewModel.updateMemberRole(state.selectedMember!!.id, role)
                },
                onDismiss = viewModel::dismissRoleDialog,
            )
        }
    }
}

@Composable
@Suppress("UnusedParameter") // Reserved for future implementation
internal fun HouseholdContent(
    state: HouseholdUiState,
    onCreateHousehold: () -> Unit,
    onInviteMember: () -> Unit,
    onToggleSharedBudget: (Boolean) -> Unit,
    onShowRoleDialog: (HouseholdMemberUi) -> Unit,
    onRemoveMember: (com.finance.models.types.SyncId) -> Unit,
    onShareInvite: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Household header card
        item(key = "header") {
            if (state.householdName.isNotEmpty()) {
                HouseholdHeaderCard(
                    name = state.householdName,
                    memberCount = state.members.size,
                    role = state.currentUserRole,
                )
            } else {
                CreateHouseholdCard(onClick = onCreateHousehold)
            }
        }

        // Shared budget toggle
        if (state.householdName.isNotEmpty()) {
            item(key = "budget-toggle") {
                SharedBudgetToggle(
                    isShared = state.useSharedBudget,
                    onToggle = onToggleSharedBudget,
                    enabled = state.isOwner,
                )
            }

            // Members section
            item(key = "members-header") {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Members",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Members section"
                        },
                    )
                    if (state.isOwner) {
                        FilledTonalButton(
                            onClick = onInviteMember,
                            modifier = Modifier.semantics {
                                contentDescription = "Invite a new member"
                            },
                        ) {
                            Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Invite")
                        }
                    }
                }
            }

            items(state.members, key = { it.id.value }) { member ->
                MemberCard(
                    member = member,
                    canManage = state.isOwner && member.role != HouseholdRole.OWNER,
                    onEditRole = { onShowRoleDialog(member) },
                    onRemove = { onRemoveMember(member.id) },
                )
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun HouseholdHeaderCard(
    name: String,
    memberCount: Int,
    role: HouseholdRole,
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Household: $name, $memberCount members, your role: ${role.name}"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Group,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        "$memberCount member${if (memberCount != 1) "s" else ""} · ${role.name}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                    )
                }
            }
        }
    }
}

@Composable
private fun CreateHouseholdCard(onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Create a new household. Tap to get started."
            },
    ) {
        Column(
            Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Filled.Group,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "Create a Household",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Share budgets and track finances together with family or partners",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SharedBudgetToggle(
    isShared: Boolean,
    onToggle: (Boolean) -> Unit,
    enabled: Boolean,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = if (isShared) {
                    "Shared budget is enabled. All members see the same budgets."
                } else {
                    "Personal budgets are enabled. Each member has their own budgets."
                }
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Shared Budget", style = MaterialTheme.typography.titleSmall)
                Text(
                    if (isShared) "All members share the same budgets"
                    else "Each member manages personal budgets",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(
                checked = isShared,
                onCheckedChange = onToggle,
                enabled = enabled,
                modifier = Modifier.semantics {
                    contentDescription = "Toggle shared budget"
                },
            )
        }
    }
}

@Composable
private fun MemberCard(
    member: HouseholdMemberUi,
    canManage: Boolean,
    onEditRole: () -> Unit,
    onRemove: () -> Unit,
) {
    val statusText = if (member.isPending) "Pending" else member.role.name
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${member.displayName}, ${member.email}, role: $statusText"
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (member.isPending) Icons.Filled.Mail else Icons.Filled.Person,
                contentDescription = null,
                tint = if (member.isPending) MaterialTheme.colorScheme.tertiary
                else MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(40.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(member.displayName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                Text(member.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                AssistChip(
                    onClick = {},
                    label = { Text(statusText, style = MaterialTheme.typography.labelSmall) },
                    leadingIcon = {
                        Icon(Icons.Filled.Security, contentDescription = null, modifier = Modifier.size(14.dp))
                    },
                    modifier = Modifier.semantics { contentDescription = "Role: $statusText" },
                )
            }
            if (canManage) {
                IconButton(
                    onClick = onEditRole,
                    modifier = Modifier.semantics { contentDescription = "Edit role for ${member.displayName}" },
                ) {
                    Icon(Icons.Filled.Edit, contentDescription = null)
                }
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier.semantics { contentDescription = "Remove ${member.displayName}" },
                ) {
                    Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Composable
private fun CreateHouseholdDialog(
    name: String,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    isCreating: Boolean,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Create Household",
                modifier = Modifier.semantics { contentDescription = "Create Household dialog" },
            )
        },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                label = { Text("Household name") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Enter household name" },
            )
        },
        confirmButton = {
            FilledTonalButton(
                onClick = onConfirm,
                enabled = !isCreating && name.isNotBlank(),
                modifier = Modifier.semantics { contentDescription = "Create household" },
            ) {
                if (isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp))
                } else {
                    Text("Create")
                }
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Cancel" },
            ) {
                Text("Cancel")
            }
        },
    )
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun InviteMemberDialog(
    email: String,
    role: HouseholdRole,
    inviteCode: String?,
    onEmailChange: (String) -> Unit,
    onRoleChange: (HouseholdRole) -> Unit,
    onSendInvite: () -> Unit,
    onDismiss: () -> Unit,
    onShareInvite: (String) -> Unit,
    isSaving: Boolean,
    errorMessage: String?,
) {
    var roleExpanded by remember { mutableStateOf(false) }
    val availableRoles = listOf(HouseholdRole.PARTNER, HouseholdRole.MEMBER, HouseholdRole.VIEWER)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Invite Member",
                modifier = Modifier.semantics { contentDescription = "Invite member dialog" },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = email,
                    onValueChange = onEmailChange,
                    label = { Text("Email address") },
                    singleLine = true,
                    isError = errorMessage != null,
                    supportingText = errorMessage?.let { { Text(it) } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Enter member email address" },
                )

                // Role selector
                Box {
                    FilledTonalButton(
                        onClick = { roleExpanded = true },
                        modifier = Modifier.semantics {
                            contentDescription = "Select role: ${role.name}"
                        },
                    ) {
                        Text("Role: ${role.name}")
                    }
                    DropdownMenu(
                        expanded = roleExpanded,
                        onDismissRequest = { roleExpanded = false },
                    ) {
                        availableRoles.forEach { r ->
                            DropdownMenuItem(
                                text = { Text(r.name) },
                                onClick = {
                                    onRoleChange(r)
                                    roleExpanded = false
                                },
                                modifier = Modifier.semantics {
                                    contentDescription = "Set role to ${r.name}"
                                },
                            )
                        }
                    }
                }

                // Show invite code after sending
                AnimatedVisibility(visible = inviteCode != null, enter = fadeIn(), exit = fadeOut()) {
                    if (inviteCode != null) {
                        val deepLink = "https://finance.app/invite/$inviteCode"
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .semantics {
                                    contentDescription = "Invite link generated. Tap share to send."
                                },
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text("Invite Link", style = MaterialTheme.typography.labelMedium)
                                Text(deepLink, style = MaterialTheme.typography.bodySmall)
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilledTonalButton(
                                        onClick = { onShareInvite(deepLink) },
                                        modifier = Modifier.semantics {
                                            contentDescription = "Share invite link"
                                        },
                                    ) {
                                        Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("Share")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            if (inviteCode == null) {
                FilledTonalButton(
                    onClick = onSendInvite,
                    enabled = !isSaving,
                    modifier = Modifier.semantics { contentDescription = "Send invitation" },
                ) {
                    if (isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp))
                    } else {
                        Text("Send Invite")
                    }
                }
            } else {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.semantics { contentDescription = "Done" },
                ) {
                    Text("Done")
                }
            }
        },
        dismissButton = {
            if (inviteCode == null) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.semantics { contentDescription = "Cancel" },
                ) {
                    Text("Cancel")
                }
            }
        },
    )
}

@Composable
private fun RoleChangeDialog(
    member: HouseholdMemberUi,
    onRoleSelected: (HouseholdRole) -> Unit,
    onDismiss: () -> Unit,
) {
    val roles = listOf(HouseholdRole.PARTNER, HouseholdRole.MEMBER, HouseholdRole.VIEWER)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "Change Role",
                modifier = Modifier.semantics { contentDescription = "Change role for ${member.displayName}" },
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Select a new role for ${member.displayName}:")
                roles.forEach { role ->
                    FilledTonalButton(
                        onClick = { onRoleSelected(role) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Set role to ${role.name}" },
                    ) {
                        Text(role.name)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.semantics { contentDescription = "Cancel" },
            ) {
                Text("Cancel")
            }
        },
    )
}

// ── Previews ─────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Household - With Members - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Household - With Members - Dark")
@Composable
private fun HouseholdWithMembersPreview() {
    FinanceTheme(dynamicColor = false) {
        HouseholdContent(
            state = HouseholdUiState(
                isLoading = false,
                householdName = "Smith Family",
                isOwner = true,
                currentUserRole = HouseholdRole.OWNER,
                members = listOf(
                    HouseholdMemberUi(
                        id = com.finance.models.types.SyncId("1"),
                        displayName = "John Smith",
                        email = "john@example.com",
                        role = HouseholdRole.OWNER,
                    ),
                    HouseholdMemberUi(
                        id = com.finance.models.types.SyncId("2"),
                        displayName = "Jane Smith",
                        email = "jane@example.com",
                        role = HouseholdRole.PARTNER,
                    ),
                    HouseholdMemberUi(
                        id = com.finance.models.types.SyncId("3"),
                        displayName = "Alex",
                        email = "alex@example.com",
                        role = HouseholdRole.MEMBER,
                        isPending = true,
                    ),
                ),
                useSharedBudget = true,
            ),
            onCreateHousehold = {},
            onInviteMember = {},
            onToggleSharedBudget = {},
            onShowRoleDialog = {},
            onRemoveMember = {},
            onShareInvite = {},
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Household - Empty - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Household - Empty - Dark")
@Composable
private fun HouseholdEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        HouseholdContent(
            state = HouseholdUiState(isLoading = false),
            onCreateHousehold = {},
            onInviteMember = {},
            onToggleSharedBudget = {},
            onShowRoleDialog = {},
            onRemoveMember = {},
            onShareInvite = {},
        )
    }
}
