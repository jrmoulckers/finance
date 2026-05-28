// SPDX-License-Identifier: BUSL-1.1

plugins {
    id("finance.kmp.library")
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.sqldelight)
}

kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.kotlinx.datetime)
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.coroutines)
        }
        commonTest.dependencies {
            implementation(libs.kotlin.test)
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.turbine)
        }
        @Suppress("UnusedPrivateProperty")
        val jvmMain by getting {
            dependencies {
                implementation(libs.sqldelight.jvm.driver)
                implementation(libs.sqlite.jdbc.crypt)
            }
        }
        if (project.extra["androidSdkAvailable"] as Boolean) {
            @Suppress("UnusedPrivateProperty")
            val androidMain by getting {
                dependencies {
                    implementation(libs.sqldelight.android.driver)
                    implementation(libs.sqlcipher.android)
                }
            }
        }
        @Suppress("UnusedPrivateProperty")
        val iosMain by getting {
            dependencies {
                implementation(libs.sqldelight.native.driver)
            }
        }
        @Suppress("UnusedPrivateProperty")
        val jsMain by getting {
            dependencies {
                implementation(libs.sqldelight.js.driver)
                implementation(npm("@cashapp/sqldelight-sqljs-worker", "2.0.2"))
                implementation(devNpm("copy-webpack-plugin", "9.1.0"))
            }
        }
    }
}

sqldelight {
    databases {
        create("FinanceDatabase") {
            packageName.set("com.finance.db")
            generateAsync.set(true)
        }
    }
}

// SQLDelight's sqlite-driver pulls in xerial's `org.xerial:sqlite-jdbc`, which
// SILENTLY drops the `cipher`/`key` JDBC properties — leaving the on-disk DB
// plaintext (see #1894). The Willena fork `io.github.willena:sqlite-jdbc` is a
// drop-in replacement that honors SQLCipher properties; we add it above and
// strip xerial from every JVM-side configuration here. Excluding from all JVM
// configurations (not just runtimeClasspath) ensures the kapt/test/etc. paths
// can't accidentally pull xerial back in via another transitive route.
configurations.matching { it.name.startsWith("jvm") }.configureEach {
    exclude(group = "org.xerial", module = "sqlite-jdbc")
}
