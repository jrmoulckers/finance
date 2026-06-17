// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.icons

enum class IconToken {
    HOME,
    DASHBOARD,
    ACCOUNTS,
    TRANSACTIONS,
    BUDGETS,
    GOALS,
    REPORTS,
    INSIGHTS,
    SETTINGS,
    SEARCH,
    NOTIFICATIONS,
    PROFILE,
    WALLET,
    CASH,
    BANK,
    CREDIT_CARD,
    DEBIT_CARD,
    SAVINGS,
    INVESTMENT,
    LOAN,
    MORTGAGE,
    NET_WORTH,
    BALANCE,
    INCOME,
    EXPENSE,
    TRANSFER,
    RECURRING,
    BILL,
    BUDGET,
    GOAL,
    PIGGY_BANK,
    CHART_LINE,
    CHART_BAR,
    CHART_PIE,
    ADD,
    EDIT,
    DELETE,
    SAVE,
    CANCEL,
    CLOSE,
    CHECK,
    REFRESH,
    SYNC,
    DOWNLOAD,
    UPLOAD,
    EXPORT,
    IMPORT,
    FILTER,
    SORT,
    SCAN,
    COPY,
    SHARE,
    SUCCESS,
    WARNING,
    ERROR,
    INFO,
    PENDING,
    LOCKED,
    UNLOCKED,
    ONLINE,
    OFFLINE,
    SECURE,
    CHECKING_ACCOUNT,
    SAVINGS_ACCOUNT,
    CASH_ACCOUNT,
    CREDIT_ACCOUNT,
    INVESTMENT_ACCOUNT,
    LOAN_ACCOUNT,
    MORTGAGE_ACCOUNT,
    RETIREMENT_ACCOUNT,
    CATEGORY_FOOD,
    CATEGORY_GROCERIES,
    CATEGORY_RESTAURANTS,
    CATEGORY_TRANSPORT,
    CATEGORY_FUEL,
    CATEGORY_SHOPPING,
    CATEGORY_ENTERTAINMENT,
    CATEGORY_TRAVEL,
    CATEGORY_HEALTH,
    CATEGORY_FITNESS,
    CATEGORY_HOME,
    CATEGORY_UTILITIES,
    CATEGORY_EDUCATION,
    CATEGORY_GIFTS,
    CATEGORY_TAXES,
    CATEGORY_INSURANCE,
    CATEGORY_SUBSCRIPTIONS,
    CATEGORY_SALARY,
}

enum class Platform {
    IOS,
    MACOS,
    ANDROID,
    WINDOWS,
    WEB,
}

data class IconPack(
    val id: String,
    val displayName: String,
    val platforms: Set<Platform>,
)

interface IconResolver {
    fun resolve(token: IconToken, pack: IconPack): String
}

const val STANDARD_LUCIDE = "standard_lucide"
const val IOS_SF_SYMBOLS = "ios_sf_symbols"
const val MATERIAL_SYMBOLS_OUTLINED = "material_symbols_outlined"
const val MATERIAL_SYMBOLS_ROUNDED = "material_symbols_rounded"
const val MATERIAL_SYMBOLS_SHARP = "material_symbols_sharp"
const val FLUENT_REGULAR = "fluent_regular"
const val FLUENT_FILLED = "fluent_filled"

const val ICON_PACK_PREFERENCE_KEY = "icon_pack_id"

object IconPacks {
    val StandardLucide = IconPack(
        id = STANDARD_LUCIDE,
        displayName = "Standard (Lucide)",
        platforms = Platform.entries.toSet(),
    )

    val SfSymbols = IconPack(
        id = IOS_SF_SYMBOLS,
        displayName = "SF Symbols",
        platforms = setOf(Platform.IOS, Platform.MACOS),
    )

    val MaterialSymbolsOutlined = IconPack(
        id = MATERIAL_SYMBOLS_OUTLINED,
        displayName = "Material Symbols Outlined",
        platforms = setOf(Platform.ANDROID, Platform.WEB),
    )

    val MaterialSymbolsRounded = IconPack(
        id = MATERIAL_SYMBOLS_ROUNDED,
        displayName = "Material Symbols Rounded",
        platforms = setOf(Platform.ANDROID, Platform.WEB),
    )

    val MaterialSymbolsSharp = IconPack(
        id = MATERIAL_SYMBOLS_SHARP,
        displayName = "Material Symbols Sharp",
        platforms = setOf(Platform.ANDROID, Platform.WEB),
    )

    val FluentRegular = IconPack(
        id = FLUENT_REGULAR,
        displayName = "Fluent Regular",
        platforms = setOf(Platform.WINDOWS, Platform.WEB),
    )

    val FluentFilled = IconPack(
        id = FLUENT_FILLED,
        displayName = "Fluent Filled",
        platforms = setOf(Platform.WINDOWS, Platform.WEB),
    )

    val All = setOf(
        StandardLucide,
        SfSymbols,
        MaterialSymbolsOutlined,
        MaterialSymbolsRounded,
        MaterialSymbolsSharp,
        FluentRegular,
        FluentFilled,
    )

    fun forPlatform(platform: Platform): List<IconPack> = All.filter { platform in it.platforms }

    fun defaultFor(platform: Platform): IconPack = when (platform) {
        Platform.IOS, Platform.MACOS -> SfSymbols
        Platform.ANDROID -> MaterialSymbolsRounded
        Platform.WINDOWS -> FluentRegular
        Platform.WEB -> StandardLucide
    }
}
