// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.finance.core.icons.IconPacks
import com.finance.core.icons.IconToken
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class IconViewTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun rendersHomeIconForEachAndroidPack() {
        val packs = listOf(
            IconPacks.StandardLucide,
            IconPacks.MaterialSymbolsOutlined,
            IconPacks.MaterialSymbolsRounded,
            IconPacks.MaterialSymbolsSharp,
        )

        packs.forEach { pack ->
            composeRule.setContent {
                CompositionLocalProvider(LocalIconPack provides pack) {
                    IconView(
                        token = IconToken.HOME,
                        modifier = Modifier.testTag(pack.id),
                    )
                }
            }

            composeRule.onNodeWithTag(pack.id).assertExists()
        }
    }
}
