// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.migration.migrations

object MigrationInitializer {
    private var initialized = false

    fun initialize() {
        if (initialized) return
        initialized = true
        registerV001()
        registerV002()
        registerV003()
    }
}
