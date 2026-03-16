// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import timber.log.Timber

/**
 * Observes device network connectivity using [ConnectivityManager].
 *
 * Emits `true` when the device has an active network with internet capability,
 * `false` otherwise. The flow is distinct-until-changed to avoid redundant
 * emissions when the underlying connectivity state hasn't meaningfully changed.
 *
 * Uses [ConnectivityManager.NetworkCallback] (API 21+) — **not** the
 * deprecated `NetworkInfo` API.
 *
 * @property context Application context for accessing system services.
 */
class ConnectivityObserver(private val context: Context) {

    /**
     * Returns a cold [Flow] that emits the current online/offline state
     * and subsequent changes.
     *
     * - `true`  → device has internet-capable connectivity
     * - `false` → device is offline
     *
     * The flow never completes under normal operation; it remains active
     * until the collector cancels.
     */
    fun observe(): Flow<Boolean> = callbackFlow {
        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        // Emit the current state immediately.
        val currentlyConnected = connectivityManager.isCurrentlyConnected()
        trySend(currentlyConnected)
        Timber.d("ConnectivityObserver started — initial state: online=%s", currentlyConnected)

        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            .build()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                Timber.d("Network available")
                trySend(true)
            }

            override fun onLost(network: Network) {
                Timber.d("Network lost")
                trySend(false)
            }

            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities,
            ) {
                val hasInternet =
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                Timber.d("Network capabilities changed — validated=%s", hasInternet)
                trySend(hasInternet)
            }
        }

        connectivityManager.registerNetworkCallback(networkRequest, callback)

        awaitClose {
            Timber.d("ConnectivityObserver stopped — unregistering callback")
            connectivityManager.unregisterNetworkCallback(callback)
        }
    }.distinctUntilChanged()

    companion object {
        /**
         * Snapshot check of current connectivity.
         *
         * Uses [ConnectivityManager.getActiveNetwork] + [NetworkCapabilities] —
         * the non-deprecated path for API 23+.
         */
        private fun ConnectivityManager.isCurrentlyConnected(): Boolean {
            val activeNetwork = activeNetwork ?: return false
            val capabilities = getNetworkCapabilities(activeNetwork) ?: return false
            return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        }
    }
}
