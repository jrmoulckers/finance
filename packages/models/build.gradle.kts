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
        val jvmMain by getting {
            dependencies {
                implementation(libs.sqldelight.jvm.driver)
            }
        }
        if (project.extra["androidSdkAvailable"] as Boolean) {
            val androidMain by getting {
                dependencies {
                    implementation(libs.sqldelight.android.driver)
                    implementation(libs.sqlcipher.android)
                }
            }
        }
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
