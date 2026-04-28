// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.BudgetNegotiationViewModel
import com.finance.desktop.viewmodel.BudgetProposal
import com.finance.desktop.viewmodel.ProposalComment
import com.finance.desktop.viewmodel.ProposalStatus

// =============================================================================
// Budget Negotiation Screen — Collaborative budget proposals
// =============================================================================

/**
 * Collaborative Budget Negotiation screen for the desktop Finance application.
 *
 * Two-panel layout: proposal list on the left, proposal detail with
 * comments and voting on the right.
 *
 * ```
 * ┌──────────────────┬──────────────────────────┐
 * │  Proposal List    │  Proposal Detail         │
 * │  + New Proposal   │  - Amounts & Change %    │
 * │  - Pending (2)    │  - Vote buttons          │
 * │  - Approved (1)   │  - Comment thread         │
 * │  - Rejected (0)   │  - Add comment            │
 * └──────────────────┴──────────────────────────┘
 * ```
 *
 * Narrator reads proposal status, vote counts, and comment content.
 */
@Composable
fun BudgetNegotiationScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<BudgetNegotiationViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading budget negotiations"
                },
            )
        }
        return
    }

    // Create proposal dialog
    if (state.showCreateDialog) {
        CreateProposalDialog(
            availableCategories = state.availableCategories,
            draftCategory = state.draftCategory,
            draftAmount = state.draftAmount,
            draftReason = state.draftReason,
            onCategoryChanged = viewModel::updateDraftCategory,
            onAmountChanged = viewModel::updateDraftAmount,
            onReasonChanged = viewModel::updateDraftReason,
            onCreate = viewModel::createProposal,
            onDismiss = viewModel::dismissCreateDialog,
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Budget Negotiation screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Budget Negotiation",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Budget Negotiation heading"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "Propose, discuss, and vote on budget changes with your household",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = { viewModel.showCreateDialog() },
                modifier = Modifier.semantics {
                    contentDescription = "Create new budget proposal"
                },
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("New Proposal")
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Two-panel layout ──
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            // Left: proposal list
            ProposalList(
                proposals = state.proposals,
                activeProposalId = state.activeProposalId,
                onSelectProposal = viewModel::setActiveProposal,
                modifier = Modifier.width(360.dp).fillMaxHeight(),
            )

            // Right: proposal detail
            val activeProposal = state.proposals.find { it.id == state.activeProposalId }
            ProposalDetail(
                proposal = activeProposal,
                commentDraft = state.commentDraft,
                onCommentDraftChanged = viewModel::updateCommentDraft,
                onVote = { approve -> activeProposal?.let { viewModel.voteOnProposal(it.id, approve) } },
                onAddComment = { activeProposal?.let { viewModel.addComment(it.id) } },
                onWithdraw = { activeProposal?.let { viewModel.withdrawProposal(it.id) } },
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }
    }
}

// =============================================================================
// Proposal List
// =============================================================================

@Composable
private fun ProposalList(
    proposals: List<BudgetProposal>,
    activeProposalId: String?,
    onSelectProposal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
        ) {
            // Status summary
            val pendingCount = proposals.count { it.status == ProposalStatus.PENDING }
            val approvedCount = proposals.count { it.status == ProposalStatus.APPROVED }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
            ) {
                StatusBadge("Pending", pendingCount, MaterialTheme.colorScheme.tertiary)
                StatusBadge("Approved", approvedCount, Color(0xFF2E7D32))
                StatusBadge(
                    "Rejected",
                    proposals.count { it.status == ProposalStatus.REJECTED },
                    MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

            if (proposals.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Filled.Groups,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = "No proposals yet",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.semantics {
                                contentDescription = "No budget proposals yet"
                            },
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                        Text(
                            text = "Create one to start negotiating",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    items(proposals, key = { it.id }) { proposal ->
                        ProposalListItem(
                            proposal = proposal,
                            isActive = proposal.id == activeProposalId,
                            onClick = { onSelectProposal(proposal.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusBadge(label: String, count: Int, color: Color) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = color.copy(alpha = 0.12f),
    ) {
        Text(
            text = "$count $label",
            modifier = Modifier.padding(
                horizontal = FinanceDesktopTheme.spacing.sm,
                vertical = FinanceDesktopTheme.spacing.xs,
            ),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = color,
        )
    }
}

@Composable
private fun ProposalListItem(
    proposal: BudgetProposal,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    val statusColor = when (proposal.status) {
        ProposalStatus.PENDING -> MaterialTheme.colorScheme.tertiary
        ProposalStatus.APPROVED -> Color(0xFF2E7D32)
        ProposalStatus.REJECTED -> MaterialTheme.colorScheme.error
        ProposalStatus.WITHDRAWN -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Details") { onClick() },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = buildString {
                        append("${proposal.categoryName} proposal by ${proposal.proposedBy}, ")
                        append("${proposal.status.displayName}, ")
                        append("change from ${proposal.currentAmountFormatted} to ${proposal.proposedAmountFormatted}")
                    }
                },
            colors = CardDefaults.cardColors(
                containerColor = if (isActive) {
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                } else {
                    MaterialTheme.colorScheme.surface
                },
            ),
            onClick = onClick,
        ) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.md)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = proposal.categoryName,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = statusColor.copy(alpha = 0.12f),
                    ) {
                        Text(
                            text = proposal.status.displayName,
                            modifier = Modifier.padding(
                                horizontal = FinanceDesktopTheme.spacing.sm,
                                vertical = 2.dp,
                            ),
                            style = MaterialTheme.typography.labelSmall,
                            color = statusColor,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Row {
                    Text(
                        text = "${proposal.currentAmountFormatted} → ${proposal.proposedAmountFormatted}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val sign = if (proposal.changePercent >= 0) "+" else ""
                    Text(
                        text = " ($sign${proposal.changePercent}%)",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = if (proposal.changePercent > 0) Color(0xFF2E7D32)
                        else MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    text = "by ${proposal.proposedBy} · ${proposal.createdAt}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// =============================================================================
// Proposal Detail
// =============================================================================

@Composable
private fun ProposalDetail(
    proposal: BudgetProposal?,
    commentDraft: String,
    onCommentDraftChanged: (String) -> Unit,
    onVote: (Boolean) -> Unit,
    onAddComment: () -> Unit,
    onWithdraw: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        if (proposal == null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Filled.Chat,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text(
                        text = "Select a proposal to view details",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            contentDescription = "No proposal selected"
                        },
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(FinanceDesktopTheme.spacing.lg)
                    .verticalScroll(rememberScrollState()),
            ) {
                // Header
                ProposalDetailHeader(proposal)

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Vote section
                if (proposal.status == ProposalStatus.PENDING) {
                    VoteSection(
                        votes = proposal.votes,
                        onVote = onVote,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                }

                // Withdraw button
                if (proposal.status == ProposalStatus.PENDING && proposal.proposedBy == "You") {
                    OutlinedButton(
                        onClick = onWithdraw,
                        modifier = Modifier.semantics {
                            contentDescription = "Withdraw this proposal"
                        },
                    ) {
                        Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                        Text("Withdraw Proposal")
                    }
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Comments section
                Text(
                    text = "Discussion (${proposal.comments.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Discussion section, ${proposal.comments.size} comments"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                proposal.comments.forEach { comment ->
                    CommentBubble(comment)
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                }

                if (proposal.comments.isEmpty()) {
                    Text(
                        text = "No comments yet. Start the discussion!",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                }

                // Add comment
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedTextField(
                        value = commentDraft,
                        onValueChange = onCommentDraftChanged,
                        modifier = Modifier
                            .weight(1f)
                            .semantics { contentDescription = "Type a comment" },
                        placeholder = { Text("Add a comment…") },
                        singleLine = true,
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    IconButton(
                        onClick = onAddComment,
                        enabled = commentDraft.isNotBlank(),
                        modifier = Modifier.semantics {
                            contentDescription = "Send comment"
                        },
                    ) {
                        Icon(
                            Icons.Filled.Send,
                            contentDescription = null,
                            tint = if (commentDraft.isNotBlank()) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProposalDetailHeader(proposal: BudgetProposal) {
    val changeColor = if (proposal.changePercent >= 0) Color(0xFF2E7D32)
    else MaterialTheme.colorScheme.error
    val sign = if (proposal.changePercent >= 0) "+" else ""

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${proposal.categoryName}: ${proposal.currentAmountFormatted} to " +
                    "${proposal.proposedAmountFormatted} ($sign${proposal.changePercent}%)"
            },
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = proposal.categoryName,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
            ) {
                Column {
                    Text("Current", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(proposal.currentAmountFormatted, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Column {
                    Text("Proposed", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(proposal.proposedAmountFormatted, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
                Column {
                    Text("Change", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("$sign${proposal.changePercent}%", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = changeColor)
                }
            }

            if (proposal.reason.isNotBlank()) {
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Text(
                        text = "\"${proposal.reason}\"",
                        modifier = Modifier.padding(FinanceDesktopTheme.spacing.md),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}

@Composable
private fun VoteSection(
    votes: List<com.finance.desktop.viewmodel.ProposalVote>,
    onVote: (Boolean) -> Unit,
) {
    val approveCount = votes.count { it.approve }
    val rejectCount = votes.count { !it.approve }
    val hasVoted = votes.any { it.memberName == "You" }

    Column {
        Text(
            text = "Votes",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            Button(
                onClick = { onVote(true) },
                enabled = !hasVoted,
                modifier = Modifier.semantics {
                    contentDescription = "Vote approve ($approveCount votes)"
                },
            ) {
                Icon(Icons.Filled.ThumbUp, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Approve ($approveCount)")
            }
            OutlinedButton(
                onClick = { onVote(false) },
                enabled = !hasVoted,
                modifier = Modifier.semantics {
                    contentDescription = "Vote reject ($rejectCount votes)"
                },
            ) {
                Icon(Icons.Filled.ThumbDown, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Reject ($rejectCount)")
            }
        }
        if (hasVoted) {
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "You have already voted",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CommentBubble(comment: ProposalComment) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${comment.memberName}: ${comment.text}, at ${comment.timestamp}"
            },
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.md)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = comment.memberName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = comment.timestamp,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Text(
                text = comment.text,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

// =============================================================================
// Create Proposal Dialog
// =============================================================================

@Composable
private fun CreateProposalDialog(
    availableCategories: List<Pair<String, String>>,
    draftCategory: String,
    draftAmount: String,
    draftReason: String,
    onCategoryChanged: (String) -> Unit,
    onAmountChanged: (String) -> Unit,
    onReasonChanged: (String) -> Unit,
    onCreate: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                "New Budget Proposal",
                modifier = Modifier.semantics { heading() },
            )
        },
        text = {
            Column {
                Text("Propose a budget change for household discussion.", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Category dropdown
                Text("Category", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                var expanded by remember { mutableStateOf(false) }
                Box {
                    OutlinedButton(
                        onClick = { expanded = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                contentDescription = "Select category: ${
                                    availableCategories.find { it.first == draftCategory }?.second ?: "none"
                                }"
                            },
                    ) {
                        Text(
                            availableCategories.find { it.first == draftCategory }?.second ?: "Select category",
                            modifier = Modifier.weight(1f),
                        )
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        availableCategories.forEach { (id, name) ->
                            DropdownMenuItem(
                                text = { Text(name) },
                                onClick = {
                                    onCategoryChanged(id)
                                    expanded = false
                                },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Amount
                Text("Proposed Amount ($)", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                OutlinedTextField(
                    value = draftAmount,
                    onValueChange = onAmountChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Proposed amount in dollars" },
                    placeholder = { Text("500.00") },
                    singleLine = true,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Reason
                Text("Reason", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                OutlinedTextField(
                    value = draftReason,
                    onValueChange = onReasonChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = "Reason for the budget change" },
                    placeholder = { Text("Why should we change this budget?") },
                    minLines = 2,
                    maxLines = 4,
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onCreate,
                enabled = draftCategory.isNotBlank() && draftAmount.isNotBlank(),
                modifier = Modifier.semantics { contentDescription = "Submit proposal" },
            ) {
                Text("Submit Proposal")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}
