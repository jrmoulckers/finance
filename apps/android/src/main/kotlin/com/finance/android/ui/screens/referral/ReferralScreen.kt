// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.referral

import android.content.res.Configuration
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.referral.ReferralStatus
import org.koin.compose.viewmodel.koinViewModel
import kotlin.random.Random

/**
 * Referral Program screen (#1116).
 *
 * Shows referral code, share button (Android Sharesheet), tracking stats,
 * referral history list, and animated celebration on rewards. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReferralScreen(
    onBack: () -> Unit = {},
    onShare: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ReferralViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Referral Program",
                        modifier = Modifier.semantics {
                            contentDescription = "Referral Program"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .semantics { contentDescription = "Loading referral data" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading indicator" },
                )
            }
            return@Scaffold
        }

        Box(Modifier.fillMaxSize()) {
            ReferralContent(
                state = state,
                onShare = { onShare(viewModel.getShareText()) },
                onGenerateNew = viewModel::generateNewCode,
                modifier = Modifier.padding(padding),
            )

            // Celebration overlay
            AnimatedVisibility(
                visible = state.showCelebration,
                enter = fadeIn() + scaleIn(),
                modifier = Modifier.fillMaxSize(),
            ) {
                CelebrationOverlay(onDismiss = viewModel::dismissCelebration)
            }
        }
    }
}

@Composable
internal fun ReferralContent(
    state: ReferralUiState,
    onShare: () -> Unit,
    onGenerateNew: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Rewards summary card
        item(key = "rewards") {
            RewardsSummaryCard(totalRewards = state.totalRewardsFormatted)
        }

        // Referral code card
        item(key = "code") {
            ReferralCodeCard(
                code = state.referralCode,
                onShare = onShare,
                onGenerateNew = onGenerateNew,
            )
        }

        // Stats row
        item(key = "stats") {
            StatsRow(
                pending = state.pendingCount,
                accepted = state.acceptedCount,
                rewarded = state.rewardedCount,
            )
        }

        // History header
        if (state.referrals.isNotEmpty()) {
            item(key = "history-header") {
                Text(
                    "Referral History",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Referral History section"
                    },
                )
            }

            items(state.referrals, key = { it.id }) { referral ->
                ReferralHistoryItem(referral)
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun RewardsSummaryCard(totalRewards: String) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Total rewards earned: $totalRewards"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            Modifier.padding(24.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Filled.CardGiftcard,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(40.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Total Rewards Earned",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                totalRewards,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}

@Composable
private fun ReferralCodeCard(
    code: String,
    onShare: () -> Unit,
    onGenerateNew: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Your referral code: $code. Tap share to send to friends."
            },
    ) {
        Column(Modifier.padding(20.dp)) {
            Text("Your Referral Code", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                code,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                FilledTonalButton(
                    onClick = onShare,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Share referral code" },
                ) {
                    Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Share")
                }
                FilledTonalButton(
                    onClick = onGenerateNew,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Generate new referral code" },
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("New Code")
                }
            }
        }
    }
}

@Composable
private fun StatsRow(pending: Int, accepted: Int, rewarded: Int) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StatCard("Pending", pending, Icons.Filled.HourglassEmpty, Modifier.weight(1f))
        StatCard("Accepted", accepted, Icons.Filled.ThumbUp, Modifier.weight(1f))
        StatCard("Rewarded", rewarded, Icons.Filled.Star, Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(label: String, count: Int, icon: ImageVector, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier.semantics {
            contentDescription = "$label referrals: $count"
        },
    ) {
        Column(
            Modifier.padding(12.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(4.dp))
            Text(count.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ReferralHistoryItem(referral: ReferralItemUi) {
    val statusColor = when (referral.status) {
        ReferralStatus.REWARDED -> Color(0xFF2E7D32)
        ReferralStatus.ACCEPTED -> MaterialTheme.colorScheme.primary
        ReferralStatus.SENT -> MaterialTheme.colorScheme.tertiary
        ReferralStatus.EXPIRED -> MaterialTheme.colorScheme.onSurfaceVariant
        ReferralStatus.CANCELLED -> MaterialTheme.colorScheme.error
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Referral to ${referral.refereeEmail}, status: ${referral.statusLabel}, reward: ${referral.rewardFormatted}"
            },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.PersonAdd,
                contentDescription = null,
                tint = statusColor,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(referral.refereeEmail, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Text(
                    referral.statusLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(referral.rewardFormatted, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(referral.dateLabel, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
@Suppress("UnusedParameter") // Reserved for future implementation
private fun CelebrationOverlay(onDismiss: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "celebration")
    val particleProgress by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(2000), RepeatMode.Restart),
        label = "particles",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .semantics { contentDescription = "Celebration! You earned a reward!" },
        contentAlignment = Alignment.Center,
    ) {
        // Particle effect
        Canvas(Modifier.fillMaxSize()) {
            val colors = listOf(Color(0xFFFFD700), Color(0xFF4CAF50), Color(0xFF2196F3), Color(0xFFFF5722))
            repeat(30) { i ->
                val seed = i * 1234L
                val random = Random(seed)
                val x = random.nextFloat() * size.width
                val baseY = random.nextFloat() * size.height
                val y = (baseY + particleProgress * size.height) % size.height
                val color = colors[i % colors.size]
                drawCircle(color.copy(alpha = 1f - particleProgress), radius = 6f, center = Offset(x, y))
            }
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Filled.Celebration,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(64.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                "Reward Earned!",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Your friend signed up and you both got rewarded!",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// ── Previews ─────────────────────────────────────────────────────────

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Referral - Light")
@Preview(showBackground = true, uiMode = Configuration.UI_MODE_NIGHT_YES, name = "Referral - Dark")
@Composable
private fun ReferralScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        ReferralContent(
            state = ReferralUiState(
                isLoading = false,
                referralCode = "ABCD1234",
                referralLink = "https://finance.app/refer/ABCD1234",
                totalRewardsFormatted = "$15.00",
                pendingCount = 2,
                acceptedCount = 1,
                rewardedCount = 3,
                referrals = listOf(
                    ReferralItemUi("1", "alice@example.com", ReferralStatus.REWARDED, "Rewarded", "$5.00", "2 days ago"),
                    ReferralItemUi("2", "bob@example.com", ReferralStatus.ACCEPTED, "Accepted", "$5.00", "5 days ago"),
                    ReferralItemUi("3", "Pending", ReferralStatus.SENT, "Sent", "$5.00", "1 week ago"),
                ),
            ),
            onShare = {},
            onGenerateNew = {},
        )
    }
}
