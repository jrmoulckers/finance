// SPDX-License-Identifier: BUSL-1.1

plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.sqldelight) apply false
    alias(libs.plugins.detekt)
    alias(libs.plugins.compose.multiplatform) apply false
    alias(libs.plugins.kotlin.jvm) apply false
}

// Force all transitive io.netty dependencies to the latest patched version.
// Fixes 21 Dependabot security alerts (HTTP/2 attacks, request smuggling, DoS,
// decompression bombs, CRLF injection) across Ktor, Compose Desktop, and
// Gradle Develocity transitive dependency trees.
val nettyVersion = libs.versions.netty.get()
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency {
            if (requested.group == "io.netty") {
                useVersion(nettyVersion)
                because("Fix Dependabot security alerts for Netty CVEs (#1292)")
            }
        }
    }
}

// Configure detekt for all Kotlin files in the project
detekt {
    basePath = projectDir.absolutePath
    config.setFrom("$rootDir/config/detekt/detekt.yml")
    source.setFrom("$rootDir/build-logic", "$rootDir/packages", "$rootDir/apps")
    parallel = true
    ignoreFailures = true
    buildUponDefaultConfig = true
}
