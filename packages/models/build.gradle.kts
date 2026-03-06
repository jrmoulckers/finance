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
