// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.di

import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class RepositoryModuleTest {
    @Test
    fun repositoryModule_isNotNull() {
        assertNotNull(repositoryModule)
    }

    @Test
    fun sharedModules_containsRepositoryModule() {
        assertTrue(sharedModules.contains(repositoryModule))
    }
}
