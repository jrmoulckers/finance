# Native per-OS icon system

## Rationale

Finance should feel native on each platform without fragmenting app code. The app owns a stable semantic vocabulary (`IconToken`) and each platform maps tokens to its preferred icon source. This keeps accessibility labels and product semantics consistent while letting iOS/macOS use SF Symbols, Android use Material Symbols, Windows use Fluent UI System Icons, and web use a predictable cross-platform default.

Lucide is the Standard pack because it is open source, modern, developer-friendly, broad enough for finance workflows, available through official framework packages, and designed for tree-shaking so web bundles only ship used icons. The evaluated alternatives remain good secondary candidates: Phosphor offers many weights, Tabler is very large, and Heroicons is polished but intentionally narrower and Tailwind-oriented.

## Research summary

- **Standard / cross-platform web:** Lucide provides 1600+ SVG icons, official packages for web frameworks, and tree-shakeable imports. Its license is ISC, with Feather-derived icons under MIT, so it is safe for open-source and commercial usage.
- **iOS and macOS:** SF Symbols 6 is the baseline native pack for current supported Apple releases. SF Symbols is bundled with Apple platforms, deeply integrated with SwiftUI/UIKit/AppKit symbol APIs, and supports weights, scales, rendering modes, localization, and animations. Use the system-provided symbols only; do not redistribute SF Symbols on web.
- **Android:** Material Symbols is Google's current icon system. It consolidates thousands of glyphs into variable fonts and offers Outlined, Rounded, and Sharp styles plus fill, weight, grade, and optical-size axes. Legacy Material Icons should only be used for gaps or older UI surfaces.
- **Windows:** Fluent UI System Icons are Microsoft's official modern icon set and expose Regular and Filled variants aligned with Windows 11 visual language.
- **Web native packs:** Web can render Standard Lucide, Material Symbols via Google Fonts/self-hosted font subsetting, and Fluent via Microsoft packages. SF Symbols is intentionally not offered on web because Apple's symbols are not redistributable for general web use.

## Decision matrix

| Platform | Default                  | Offered packs                                                                                                                 | Notes                                                                                             |
| -------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| iOS      | SF Symbols               | Standard (Lucide), SF Symbols                                                                                                 | Prefer system names and SwiftUI `Image(systemName:)`.                                             |
| macOS    | SF Symbols               | Standard (Lucide), SF Symbols                                                                                                 | Same token mapping as iOS unless AppKit-specific adjustments are needed.                          |
| Android  | Material Symbols Rounded | Standard (Lucide), Material Symbols Outlined, Material Symbols Rounded, Material Symbols Sharp                                | Rounded is the friendliest Material 3 default; expose all native variants.                        |
| Windows  | Fluent Regular           | Standard (Lucide), Fluent Regular, Fluent Filled                                                                              | Regular is default; Filled is useful for selected/active states.                                  |
| Web      | Standard (Lucide)        | Standard (Lucide), Material Symbols Outlined, Material Symbols Rounded, Material Symbols Sharp, Fluent Regular, Fluent Filled | Do not offer SF Symbols on web. Use font subsetting for Material and per-icon imports for Fluent. |

## Native pack offerings

- **iOS:** Standard (Lucide), SF Symbols 6.
- **macOS:** Standard (Lucide), SF Symbols 6.
- **Android:** Standard (Lucide), Material Symbols Outlined, Material Symbols Rounded, Material Symbols Sharp.
- **Windows:** Standard (Lucide), Fluent UI System Icons Regular, Fluent UI System Icons Filled.

## Web pack offerings

- Standard (Lucide) is the web default.
- Material Symbols Outlined, Rounded, and Sharp are web-renderable via Google Fonts or self-hosted subset fonts.
- Fluent Regular and Fluent Filled are web-renderable via Microsoft Fluent icon packages.
- SF Symbols is not offered on web because the symbols are system-provided Apple assets, not a general web font to redistribute.

## IconToken vocabulary

`HOME`, `DASHBOARD`, `ACCOUNTS`, `TRANSACTIONS`, `BUDGETS`, `GOALS`, `REPORTS`, `INSIGHTS`, `SETTINGS`, `SEARCH`, `NOTIFICATIONS`, `PROFILE`, `WALLET`, `CASH`, `BANK`, `CREDIT_CARD`, `DEBIT_CARD`, `SAVINGS`, `INVESTMENT`, `LOAN`, `MORTGAGE`, `NET_WORTH`, `BALANCE`, `INCOME`, `EXPENSE`, `TRANSFER`, `RECURRING`, `BILL`, `BUDGET`, `GOAL`, `PIGGY_BANK`, `CHART_LINE`, `CHART_BAR`, `CHART_PIE`, `ADD`, `EDIT`, `DELETE`, `SAVE`, `CANCEL`, `CLOSE`, `CHECK`, `REFRESH`, `SYNC`, `DOWNLOAD`, `UPLOAD`, `EXPORT`, `IMPORT`, `FILTER`, `SORT`, `SCAN`, `COPY`, `SHARE`, `SUCCESS`, `WARNING`, `ERROR`, `INFO`, `PENDING`, `LOCKED`, `UNLOCKED`, `ONLINE`, `OFFLINE`, `SECURE`, `CHECKING_ACCOUNT`, `SAVINGS_ACCOUNT`, `CASH_ACCOUNT`, `CREDIT_ACCOUNT`, `INVESTMENT_ACCOUNT`, `LOAN_ACCOUNT`, `MORTGAGE_ACCOUNT`, `RETIREMENT_ACCOUNT`, `CATEGORY_FOOD`, `CATEGORY_GROCERIES`, `CATEGORY_RESTAURANTS`, `CATEGORY_TRANSPORT`, `CATEGORY_FUEL`, `CATEGORY_SHOPPING`, `CATEGORY_ENTERTAINMENT`, `CATEGORY_TRAVEL`, `CATEGORY_HEALTH`, `CATEGORY_FITNESS`, `CATEGORY_HOME`, `CATEGORY_UTILITIES`, `CATEGORY_EDUCATION`, `CATEGORY_GIFTS`, `CATEGORY_TAXES`, `CATEGORY_INSURANCE`, `CATEGORY_SUBSCRIPTIONS`, `CATEGORY_SALARY`

## Mapping table

| IconToken                | Lucide               | SF Symbols                          | Material Symbols         | Fluent UI System Icons |
| ------------------------ | -------------------- | ----------------------------------- | ------------------------ | ---------------------- |
| `HOME`                   | `home`               | `house`                             | `home`                   | `Home`                 |
| `DASHBOARD`              | `layout-dashboard`   | `gauge.with.dots.needle.67percent`  | `dashboard`              | `Board`                |
| `ACCOUNTS`               | `users`              | `person.2`                          | `groups`                 | `People`               |
| `TRANSACTIONS`           | `receipt-text`       | `list.bullet.rectangle`             | `receipt_long`           | `Receipt`              |
| `BUDGETS`                | `calculator`         | `chart.pie`                         | `account_balance_wallet` | `Calculator`           |
| `GOALS`                  | `target`             | `target`                            | `track_changes`          | `TargetArrow`          |
| `REPORTS`                | `chart-column`       | `doc.text.magnifyingglass`          | `analytics`              | `DocumentData`         |
| `INSIGHTS`               | `lightbulb`          | `lightbulb`                         | `tips_and_updates`       | `Lightbulb`            |
| `SETTINGS`               | `settings`           | `gearshape`                         | `settings`               | `Settings`             |
| `SEARCH`                 | `search`             | `magnifyingglass`                   | `search`                 | `Search`               |
| `NOTIFICATIONS`          | `bell`               | `bell`                              | `notifications`          | `Alert`                |
| `PROFILE`                | `circle-user-round`  | `person.crop.circle`                | `account_circle`         | `PersonCircle`         |
| `WALLET`                 | `wallet`             | `wallet.pass`                       | `account_balance_wallet` | `Wallet`               |
| `CASH`                   | `banknote`           | `banknote`                          | `payments`               | `Money`                |
| `BANK`                   | `landmark`           | `building.columns`                  | `account_balance`        | `BuildingBank`         |
| `CREDIT_CARD`            | `credit-card`        | `creditcard`                        | `credit_card`            | `Payment`              |
| `DEBIT_CARD`             | `credit-card`        | `creditcard`                        | `credit_card`            | `Payment`              |
| `SAVINGS`                | `piggy-bank`         | `dollarsign.bank.building`          | `savings`                | `Savings`              |
| `INVESTMENT`             | `trending-up`        | `chart.line.uptrend.xyaxis`         | `trending_up`            | `ArrowTrending`        |
| `LOAN`                   | `hand-coins`         | `hand.raised`                       | `request_quote`          | `MoneyHand`            |
| `MORTGAGE`               | `house-plus`         | `house.and.flag`                    | `real_estate_agent`      | `HomePerson`           |
| `NET_WORTH`              | `scale`              | `scale.3d`                          | `account_balance`        | `ScaleFit`             |
| `BALANCE`                | `scale`              | `scale.3d`                          | `balance`                | `ScaleFit`             |
| `INCOME`                 | `arrow-down-to-line` | `arrow.down.circle`                 | `add_card`               | `ArrowDownload`        |
| `EXPENSE`                | `arrow-up-from-line` | `arrow.up.circle`                   | `paid`                   | `ArrowUpload`          |
| `TRANSFER`               | `arrow-left-right`   | `arrow.left.arrow.right`            | `swap_horiz`             | `ArrowSwap`            |
| `RECURRING`              | `repeat`             | `arrow.triangle.2.circlepath`       | `repeat`                 | `ArrowRepeatAll`       |
| `BILL`                   | `file-text`          | `doc.text`                          | `receipt`                | `DocumentText`         |
| `BUDGET`                 | `calculator`         | `calendar.badge.clock`              | `savings`                | `Calculator`           |
| `GOAL`                   | `flag`               | `flag`                              | `flag`                   | `Flag`                 |
| `PIGGY_BANK`             | `piggy-bank`         | `banknote`                          | `savings`                | `PiggyBank`            |
| `CHART_LINE`             | `chart-line`         | `chart.line.uptrend.xyaxis`         | `show_chart`             | `DataLine`             |
| `CHART_BAR`              | `chart-bar`          | `chart.bar`                         | `bar_chart`              | `DataBarVertical`      |
| `CHART_PIE`              | `chart-pie`          | `chart.pie`                         | `pie_chart`              | `DataPie`              |
| `ADD`                    | `plus`               | `plus`                              | `add`                    | `Add`                  |
| `EDIT`                   | `pencil`             | `pencil`                            | `edit`                   | `Edit`                 |
| `DELETE`                 | `trash-2`            | `trash`                             | `delete`                 | `Delete`               |
| `SAVE`                   | `save`               | `square.and.arrow.down`             | `save`                   | `Save`                 |
| `CANCEL`                 | `circle-x`           | `xmark.circle`                      | `cancel`                 | `DismissCircle`        |
| `CLOSE`                  | `x`                  | `xmark`                             | `close`                  | `Dismiss`              |
| `CHECK`                  | `check`              | `checkmark`                         | `check`                  | `Checkmark`            |
| `REFRESH`                | `refresh-cw`         | `arrow.clockwise`                   | `refresh`                | `ArrowClockwise`       |
| `SYNC`                   | `refresh-ccw`        | `arrow.triangle.2.circlepath`       | `sync`                   | `ArrowSync`            |
| `DOWNLOAD`               | `download`           | `arrow.down.to.line`                | `download`               | `ArrowDownload`        |
| `UPLOAD`                 | `upload`             | `arrow.up.to.line`                  | `upload`                 | `ArrowUpload`          |
| `EXPORT`                 | `file-up`            | `square.and.arrow.up`               | `ios_share`              | `Share`                |
| `IMPORT`                 | `file-down`          | `tray.and.arrow.down`               | `file_download`          | `DocumentArrowDown`    |
| `FILTER`                 | `funnel`             | `line.3.horizontal.decrease.circle` | `filter_list`            | `Filter`               |
| `SORT`                   | `arrow-up-down`      | `arrow.up.arrow.down`               | `sort`                   | `ArrowSort`            |
| `SCAN`                   | `scan-line`          | `viewfinder`                        | `document_scanner`       | `Scan`                 |
| `COPY`                   | `copy`               | `doc.on.doc`                        | `content_copy`           | `Copy`                 |
| `SHARE`                  | `share-2`            | `square.and.arrow.up`               | `share`                  | `Share`                |
| `SUCCESS`                | `circle-check`       | `checkmark.circle`                  | `check_circle`           | `CheckmarkCircle`      |
| `WARNING`                | `triangle-alert`     | `exclamationmark.triangle`          | `warning`                | `Warning`              |
| `ERROR`                  | `circle-alert`       | `exclamationmark.circle`            | `error`                  | `ErrorCircle`          |
| `INFO`                   | `info`               | `info.circle`                       | `info`                   | `Info`                 |
| `PENDING`                | `clock`              | `clock`                             | `schedule`               | `Clock`                |
| `LOCKED`                 | `lock`               | `lock`                              | `lock`                   | `LockClosed`           |
| `UNLOCKED`               | `lock-open`          | `lock.open`                         | `lock_open`              | `LockOpen`             |
| `ONLINE`                 | `wifi`               | `wifi`                              | `wifi`                   | `Wifi1`                |
| `OFFLINE`                | `wifi-off`           | `wifi.slash`                        | `wifi_off`               | `WifiOff`              |
| `SECURE`                 | `shield-check`       | `checkmark.shield`                  | `security`               | `ShieldCheckmark`      |
| `CHECKING_ACCOUNT`       | `landmark`           | `building.columns`                  | `account_balance`        | `BuildingBank`         |
| `SAVINGS_ACCOUNT`        | `piggy-bank`         | `dollarsign.bank.building`          | `savings`                | `Savings`              |
| `CASH_ACCOUNT`           | `wallet`             | `wallet.pass`                       | `payments`               | `Wallet`               |
| `CREDIT_ACCOUNT`         | `credit-card`        | `creditcard`                        | `credit_card`            | `Payment`              |
| `INVESTMENT_ACCOUNT`     | `chart-line`         | `chart.line.uptrend.xyaxis`         | `monitoring`             | `DataLine`             |
| `LOAN_ACCOUNT`           | `hand-coins`         | `hand.raised`                       | `request_quote`          | `MoneyHand`            |
| `MORTGAGE_ACCOUNT`       | `house`              | `house`                             | `real_estate_agent`      | `Home`                 |
| `RETIREMENT_ACCOUNT`     | `palm-tree`          | `figure.walk`                       | `elderly`                | `Umbrella`             |
| `CATEGORY_FOOD`          | `utensils`           | `fork.knife`                        | `restaurant`             | `Food`                 |
| `CATEGORY_GROCERIES`     | `shopping-basket`    | `basket`                            | `grocery`                | `FoodApple`            |
| `CATEGORY_RESTAURANTS`   | `chef-hat`           | `fork.knife.circle`                 | `restaurant_menu`        | `FoodPizza`            |
| `CATEGORY_TRANSPORT`     | `car`                | `car`                               | `directions_car`         | `VehicleCar`           |
| `CATEGORY_FUEL`          | `fuel`               | `fuelpump`                          | `local_gas_station`      | `Gas`                  |
| `CATEGORY_SHOPPING`      | `shopping-bag`       | `bag`                               | `shopping_bag`           | `ShoppingBag`          |
| `CATEGORY_ENTERTAINMENT` | `popcorn`            | `popcorn`                           | `local_movies`           | `MoviesAndTv`          |
| `CATEGORY_TRAVEL`        | `plane`              | `airplane`                          | `flight`                 | `Airplane`             |
| `CATEGORY_HEALTH`        | `heart-pulse`        | `heart.text.square`                 | `health_and_safety`      | `HeartPulse`           |
| `CATEGORY_FITNESS`       | `dumbbell`           | `dumbbell`                          | `fitness_center`         | `Dumbbell`             |
| `CATEGORY_HOME`          | `house`              | `house`                             | `home`                   | `Home`                 |
| `CATEGORY_UTILITIES`     | `plug`               | `powerplug`                         | `electrical_services`    | `PlugConnected`        |
| `CATEGORY_EDUCATION`     | `graduation-cap`     | `graduationcap`                     | `school`                 | `HatGraduation`        |
| `CATEGORY_GIFTS`         | `gift`               | `gift`                              | `redeem`                 | `Gift`                 |
| `CATEGORY_TAXES`         | `receipt`            | `doc.text`                          | `receipt_long`           | `ReceiptMoney`         |
| `CATEGORY_INSURANCE`     | `shield`             | `shield`                            | `verified_user`          | `Shield`               |
| `CATEGORY_SUBSCRIPTIONS` | `repeat`             | `arrow.triangle.2.circlepath`       | `subscriptions`          | `ArrowRepeatAll`       |
| `CATEGORY_SALARY`        | `badge-dollar-sign`  | `dollarsign.circle`                 | `payments`               | `Money`                |

## Pack ids

- `standard_lucide`
- `ios_sf_symbols`
- `material_symbols_outlined`
- `material_symbols_rounded`
- `material_symbols_sharp`
- `fluent_regular`
- `fluent_filled`

The user preference key is `icon_pack_id`.

## Versioning and extensibility rules

1. `IconToken` names are semantic API and must be append-only after release. Do not rename or repurpose a token; add a new token and migrate usages instead.
2. Every new token must update this document, the KMP enum, the web mirror, Lucide mapping, SF Symbols mapping, and completeness tests in the same PR.
3. Platform-specific mappings may intentionally alias multiple tokens to the same glyph when the native set lacks a perfect match, but the alias should be documented in this table.
4. Resolver implementations must return icon identifiers only. Accessibility labels stay with the calling UI and should describe semantic meaning, not visual glyph names.
5. Web implementations must keep native packs optional and lazy/subsetted. Material Symbols should request only required ligatures; Fluent should import only used glyphs.
6. SF Symbols must remain Apple-platform-only unless Apple changes redistribution terms.
7. Native defaults can change only through a design-system version bump and migration note; user-selected `icon_pack_id` preferences should be preserved when the pack still exists.

## Phase 1 implementation contract

Phase 1 defines the vocabulary, canonical pack ids, and complete Standard/Lucide plus SF Symbols mappings. Platform UI and native resolvers will follow in platform-specific PRs.
