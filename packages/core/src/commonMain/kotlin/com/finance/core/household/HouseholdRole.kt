// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.household

/**
 * Re-export [com.finance.models.HouseholdRole] so that callers working within
 * the `core.household` package don't need a separate models import.
 *
 * Canonical definition: [com.finance.models.HouseholdRole]
 * Values: OWNER, PARTNER, MEMBER, VIEWER
 */
typealias HouseholdRole = com.finance.models.HouseholdRole
