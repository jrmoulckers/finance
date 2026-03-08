// SPDX-License-Identifier: BUSL-1.1

import com.android.build.gradle.LibraryExtension

plugins {
    id("org.jetbrains.kotlin.multiplatform")
    id("com.android.library")
    id("org.jetbrains.kotlinx.kover")
}

kotlin {
    // Auto-provision JDK 21 — no manual JAVA_HOME setup needed
    jvmToolchain(21)

    // JVM target (Desktop / server)
    jvm()

    // Android target
    androidTarget()

    // iOS targets
    iosArm64()
    iosSimulatorArm64()
    iosX64()

    // JS target (browser)
    js(IR) {
        browser()
    }

    // Hierarchical source set structure
    applyDefaultHierarchyTemplate()

    sourceSets {
        commonMain.dependencies {
            implementation(libs.findLibrary("kotlinx-coroutines-core").get())
        }

        commonTest.dependencies {
            implementation(libs.findLibrary("kotlin-test").get())
        }
    }
}

extensions.configure<LibraryExtension> {
    val androidCompileSdk = libs.findVersion("android-compileSdk").get().toString().toInt()
    val androidMinSdk = libs.findVersion("android-minSdk").get().toString().toInt()

    compileSdk = androidCompileSdk
    namespace = "com.finance.${project.name}"

    defaultConfig {
        minSdk = androidMinSdk
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

private val libs: VersionCatalog
    get() = project.extensions
        .getByType<VersionCatalogsExtension>()
        .named("libs")
