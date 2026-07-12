// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.share

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** A win rendered for the picker list. */
data class ShareableWinUi(
    val id: String,
    val emoji: String,
    val title: String,
    val subtitle: String,
)

data class ShareWinUiState(
    val isLoading: Boolean = true,
    val wins: List<ShareableWinUi> = emptyList(),
    val selectedWinId: String? = null,
    val options: ShareCardOptions = ShareCardOptions(),
    val previewCaption: String = "",
    val isFullyPrivate: Boolean = true,
)

/**
 * ViewModel for teen privacy-safe sharing of savings wins and badge unlocks
 * (#2210).
 *
 * Produces celebratory share cards while guaranteeing that no private dollar
 * balance leaves the device unless the teen explicitly turns amounts on.
 */
class ShareWinViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(ShareWinUiState())
    val uiState: StateFlow<ShareWinUiState> = _uiState.asStateFlow()

    private val wins: List<ShareableWin> = sampleWins()

    init {
        val first = wins.first()
        _uiState.update {
            it.copy(
                isLoading = false,
                wins = wins.map { w -> w.toUi() },
                selectedWinId = first.id,
                previewCaption = ShareCardBuilder.caption(first, it.options),
                isFullyPrivate = ShareCardBuilder.isFullyPrivate(it.options),
            )
        }
    }

    fun selectWin(id: String) {
        _uiState.update { state ->
            val win = wins.first { it.id == id }
            state.copy(
                selectedWinId = id,
                previewCaption = ShareCardBuilder.caption(win, state.options),
            )
        }
    }

    fun setHideAmounts(hide: Boolean) = updateOptions { it.copy(hideAmounts = hide) }

    fun setShowPercentOnly(percentOnly: Boolean) = updateOptions { it.copy(showPercentOnly = percentOnly) }

    /** Build the privacy-safe payload for the Android Sharesheet (#2210). */
    fun shareText(): String {
        val state = _uiState.value
        val win = wins.first { it.id == state.selectedWinId }
        val text = ShareCardBuilder.shareText(win, state.options)
        Timber.d("Sharing win %s (private=%b)", win.type.name, state.options.hideAmounts)
        return text
    }

    private fun updateOptions(transform: (ShareCardOptions) -> ShareCardOptions) {
        _uiState.update { state ->
            val options = transform(state.options)
            val win = wins.first { it.id == state.selectedWinId }
            state.copy(
                options = options,
                previewCaption = ShareCardBuilder.caption(win, options),
                isFullyPrivate = ShareCardBuilder.isFullyPrivate(options),
            )
        }
    }

    private fun ShareableWin.toUi(): ShareableWinUi = ShareableWinUi(
        id = id,
        emoji = type.emoji,
        title = when (type) {
            WinType.GOAL_MILESTONE -> "$percentComplete% to $title"
            WinType.GOAL_COMPLETE -> "$title complete"
            WinType.BADGE_UNLOCK -> "$title badge"
            WinType.STREAK_MILESTONE -> "$streakDays-day streak"
        },
        subtitle = type.label,
    )

    private fun sampleWins(): List<ShareableWin> = listOf(
        ShareableWin("w1", WinType.GOAL_MILESTONE, "new headphones", percentComplete = 75,
            savedAmount = com.finance.models.types.Cents.fromDollars(150.0),
            goalAmount = com.finance.models.types.Cents.fromDollars(200.0)),
        ShareableWin("w2", WinType.GOAL_COMPLETE, "concert tickets",
            savedAmount = com.finance.models.types.Cents.fromDollars(120.0),
            goalAmount = com.finance.models.types.Cents.fromDollars(120.0)),
        ShareableWin("w3", WinType.BADGE_UNLOCK, "Super Saver"),
        ShareableWin("w4", WinType.STREAK_MILESTONE, "weekly saving", streakDays = 30),
    )
}
