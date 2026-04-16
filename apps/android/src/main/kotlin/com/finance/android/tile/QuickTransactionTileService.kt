// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.tile

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.finance.android.MainActivity
import timber.log.Timber

/**
 * Quick Settings tile for fast transaction entry (#381).
 *
 * When the user taps the "Finance" tile in the Quick Settings panel, the
 * app launches directly to the transaction creation screen.
 *
 * ## Setup
 * The tile is registered in AndroidManifest.xml as a [TileService] with:
 * - Label: "Add Transaction"
 * - Icon: ic_add (from Material icons, provided via drawable resource)
 *
 * ## Behavior
 * - **Active state:** Tile is always available (no toggle state)
 * - **Tap action:** Launches [MainActivity] with a deep link intent to
 *   the transaction creation route
 * - **Long press:** Opens the Finance app to the Dashboard
 *
 * ## Security
 * - No sensitive data is displayed on the tile
 * - The tile only triggers navigation; actual transaction creation
 *   requires authentication within the app
 *
 * ## Accessibility
 * - Tile label is descriptive: "Add Transaction"
 * - State description updates on tile state changes
 *
 * @see <a href="https://developer.android.com/develop/ui/views/quicksettings-tiles">
 *   Quick Settings Tiles guide</a>
 */
class QuickTransactionTileService : TileService() {

    override fun onStartListening() {
        super.onStartListening()
        Timber.d("QuickTransactionTile: onStartListening")
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        Timber.d("QuickTransactionTile: onClick — launching transaction create")

        val intent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            // Deep link to transaction creation. The NavHost will route this
            // to TransactionCreateScreen.
            data = android.net.Uri.parse("https://finance.app/transaction/create")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(
                android.app.PendingIntent.getActivity(
                    this,
                    0,
                    intent,
                    android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    /**
     * Updates the tile to show it as active and available.
     */
    private fun updateTileState() {
        val tile = qsTile ?: return
        tile.state = Tile.STATE_INACTIVE
        tile.label = "Add Transaction"
        tile.contentDescription = "Tap to add a new transaction in Finance"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = "Finance"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            tile.stateDescription = "Tap to open quick transaction entry"
        }

        tile.updateTile()
        Timber.d("QuickTransactionTile: tile state updated")
    }
}
