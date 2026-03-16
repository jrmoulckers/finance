// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.snapshot

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.finance.android.ui.theme.FinanceTheme
import java.io.File

/** Shared theme and file helpers for Roborazzi snapshot tests. */
@Composable
internal fun SnapshotTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    FinanceTheme(darkTheme = darkTheme, dynamicColor = false) {
        Surface(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}

/** Resolves a stable module-relative snapshot path and creates parent directories. */
internal fun snapshotFilePath(relativePath: String): String {
    val file = File("src/test/snapshots", relativePath)
    file.parentFile?.mkdirs()
    return file.path.replace(File.separatorChar, '/')
}
