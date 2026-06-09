// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components

import android.content.SharedPreferences
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.*
import com.finance.android.R
import com.finance.core.icons.ICON_PACK_PREFERENCE_KEY
import com.finance.core.icons.IconPack
import com.finance.core.icons.IconPacks
import com.finance.core.icons.IconToken
import com.finance.core.icons.MATERIAL_SYMBOLS_OUTLINED
import com.finance.core.icons.MATERIAL_SYMBOLS_ROUNDED
import com.finance.core.icons.MATERIAL_SYMBOLS_SHARP
import com.finance.core.icons.Platform
import com.finance.core.icons.STANDARD_LUCIDE
import com.finance.core.icons.mappings.MaterialSymbolsOutlinedMapping
import com.finance.core.icons.mappings.MaterialSymbolsRoundedMapping
import com.finance.core.icons.mappings.MaterialSymbolsSharpMapping
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

val LocalIconPack = staticCompositionLocalOf { IconPacks.defaultFor(Platform.ANDROID) }

class IconPreferenceManager(private val prefs: SharedPreferences) {
    val availablePacks: List<IconPack> = IconPacks.forPlatform(Platform.ANDROID)

    private val _iconPack = MutableStateFlow(readIconPack())
    val iconPack: StateFlow<IconPack> = _iconPack.asStateFlow()

    fun setIconPack(pack: IconPack) {
        if (pack !in availablePacks) return
        prefs.edit().putString(ICON_PACK_PREFERENCE_KEY, pack.id).apply()
        _iconPack.value = pack
    }

    private fun readIconPack(): IconPack {
        val id = prefs.getString(ICON_PACK_PREFERENCE_KEY, null)
        return availablePacks.firstOrNull { it.id == id } ?: IconPacks.defaultFor(Platform.ANDROID)
    }
}

private val MaterialSymbolsOutlinedFont = FontFamily(Font(R.font.material_symbols_outlined))
private val MaterialSymbolsRoundedFont = FontFamily(Font(R.font.material_symbols_rounded))
private val MaterialSymbolsSharpFont = FontFamily(Font(R.font.material_symbols_sharp))

@Composable
fun IconView(
    token: IconToken,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    size: Dp = 24.dp,
) {
    when (val pack = LocalIconPack.current) {
        IconPacks.StandardLucide -> {
            Icon(
                imageVector = lucideImageVector(token),
                contentDescription = null,
                modifier = modifier.size(size),
                tint = tint,
            )
        }
        IconPacks.MaterialSymbolsOutlined,
        IconPacks.MaterialSymbolsRounded,
        IconPacks.MaterialSymbolsSharp -> {
            val (fontFamily, symbolName) = materialSymbolFontAndName(token, pack.id)
            Box(
                modifier = modifier
                    .size(size)
                    .semantics { contentDescription = token.name.lowercase() },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = symbolName,
                    color = tint,
                    fontFamily = fontFamily,
                    fontSize = size.value.sp,
                    lineHeight = size.value.sp,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                )
            }
        }
        else -> {
            Icon(
                imageVector = lucideImageVector(token),
                contentDescription = null,
                modifier = modifier.size(size),
                tint = tint,
            )
        }
    }
}

private fun materialSymbolFontAndName(token: IconToken, packId: String): Pair<FontFamily, String> = when (packId) {
    MATERIAL_SYMBOLS_OUTLINED -> MaterialSymbolsOutlinedFont to MaterialSymbolsOutlinedMapping.mapping.getValue(token)
    MATERIAL_SYMBOLS_ROUNDED -> MaterialSymbolsRoundedFont to MaterialSymbolsRoundedMapping.mapping.getValue(token)
    MATERIAL_SYMBOLS_SHARP -> MaterialSymbolsSharpFont to MaterialSymbolsSharpMapping.mapping.getValue(token)
    STANDARD_LUCIDE -> error("Standard Lucide does not use Material Symbols fonts")
    else -> MaterialSymbolsRoundedFont to MaterialSymbolsRoundedMapping.mapping.getValue(token)
}

private fun lucideImageVector(token: IconToken): ImageVector = when (token) {
        IconToken.HOME -> Lucide.House
        IconToken.DASHBOARD -> Lucide.LayoutDashboard
        IconToken.ACCOUNTS -> Lucide.Users
        IconToken.TRANSACTIONS -> Lucide.ReceiptText
        IconToken.BUDGETS -> Lucide.Calculator
        IconToken.GOALS -> Lucide.Target
        IconToken.REPORTS -> Lucide.ChartColumn
        IconToken.INSIGHTS -> Lucide.Lightbulb
        IconToken.SETTINGS -> Lucide.Settings
        IconToken.SEARCH -> Lucide.Search
        IconToken.NOTIFICATIONS -> Lucide.Bell
        IconToken.PROFILE -> Lucide.CircleUserRound
        IconToken.WALLET -> Lucide.Wallet
        IconToken.CASH -> Lucide.Banknote
        IconToken.BANK -> Lucide.Landmark
        IconToken.CREDIT_CARD -> Lucide.CreditCard
        IconToken.DEBIT_CARD -> Lucide.CreditCard
        IconToken.SAVINGS -> Lucide.PiggyBank
        IconToken.INVESTMENT -> Lucide.TrendingUp
        IconToken.LOAN -> Lucide.HandCoins
        IconToken.MORTGAGE -> Lucide.HousePlus
        IconToken.NET_WORTH -> Lucide.Scale
        IconToken.BALANCE -> Lucide.Scale
        IconToken.INCOME -> Lucide.ArrowDownToLine
        IconToken.EXPENSE -> Lucide.ArrowUpFromLine
        IconToken.TRANSFER -> Lucide.ArrowLeftRight
        IconToken.RECURRING -> Lucide.Repeat
        IconToken.BILL -> Lucide.FileText
        IconToken.BUDGET -> Lucide.Calculator
        IconToken.GOAL -> Lucide.Flag
        IconToken.PIGGY_BANK -> Lucide.PiggyBank
        IconToken.CHART_LINE -> Lucide.ChartLine
        IconToken.CHART_BAR -> Lucide.ChartBar
        IconToken.CHART_PIE -> Lucide.ChartPie
        IconToken.ADD -> Lucide.Plus
        IconToken.EDIT -> Lucide.Pencil
        IconToken.DELETE -> Lucide.Trash2
        IconToken.SAVE -> Lucide.Save
        IconToken.CANCEL -> Lucide.CircleX
        IconToken.CLOSE -> Lucide.X
        IconToken.CHECK -> Lucide.Check
        IconToken.REFRESH -> Lucide.RefreshCw
        IconToken.SYNC -> Lucide.RefreshCcw
        IconToken.DOWNLOAD -> Lucide.Download
        IconToken.UPLOAD -> Lucide.Upload
        IconToken.EXPORT -> Lucide.FileUp
        IconToken.IMPORT -> Lucide.FileDown
        IconToken.FILTER -> Lucide.Filter
        IconToken.SORT -> Lucide.ArrowUpDown
        IconToken.SCAN -> Lucide.ScanLine
        IconToken.COPY -> Lucide.Copy
        IconToken.SHARE -> Lucide.Share2
        IconToken.SUCCESS -> Lucide.CircleCheck
        IconToken.WARNING -> Lucide.TriangleAlert
        IconToken.ERROR -> Lucide.CircleAlert
        IconToken.INFO -> Lucide.Info
        IconToken.PENDING -> Lucide.Clock
        IconToken.LOCKED -> Lucide.Lock
        IconToken.UNLOCKED -> Lucide.LockOpen
        IconToken.ONLINE -> Lucide.Wifi
        IconToken.OFFLINE -> Lucide.WifiOff
        IconToken.SECURE -> Lucide.ShieldCheck
        IconToken.CHECKING_ACCOUNT -> Lucide.Landmark
        IconToken.SAVINGS_ACCOUNT -> Lucide.PiggyBank
        IconToken.CASH_ACCOUNT -> Lucide.Wallet
        IconToken.CREDIT_ACCOUNT -> Lucide.CreditCard
        IconToken.INVESTMENT_ACCOUNT -> Lucide.ChartLine
        IconToken.LOAN_ACCOUNT -> Lucide.HandCoins
        IconToken.MORTGAGE_ACCOUNT -> Lucide.House
        IconToken.RETIREMENT_ACCOUNT -> Lucide.TreePalm
        IconToken.CATEGORY_FOOD -> Lucide.Utensils
        IconToken.CATEGORY_GROCERIES -> Lucide.ShoppingBasket
        IconToken.CATEGORY_RESTAURANTS -> Lucide.ChefHat
        IconToken.CATEGORY_TRANSPORT -> Lucide.Car
        IconToken.CATEGORY_FUEL -> Lucide.Fuel
        IconToken.CATEGORY_SHOPPING -> Lucide.ShoppingBag
        IconToken.CATEGORY_ENTERTAINMENT -> Lucide.Popcorn
        IconToken.CATEGORY_TRAVEL -> Lucide.Plane
        IconToken.CATEGORY_HEALTH -> Lucide.HeartPulse
        IconToken.CATEGORY_FITNESS -> Lucide.Dumbbell
        IconToken.CATEGORY_HOME -> Lucide.House
        IconToken.CATEGORY_UTILITIES -> Lucide.Plug
        IconToken.CATEGORY_EDUCATION -> Lucide.GraduationCap
        IconToken.CATEGORY_GIFTS -> Lucide.Gift
        IconToken.CATEGORY_TAXES -> Lucide.Receipt
        IconToken.CATEGORY_INSURANCE -> Lucide.Shield
        IconToken.CATEGORY_SUBSCRIPTIONS -> Lucide.Repeat
        IconToken.CATEGORY_SALARY -> Lucide.BadgeDollarSign
}
